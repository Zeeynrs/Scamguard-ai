"""
Family Protection persistence layer.

Replaces the pure in-memory dictionary with a durable SQLite store.
Safe words are salted and PBKDF2-hashed (plain text is NEVER stored).
Verification pings include a TTL and automatic expiration checks.
"""
import time
import uuid
from typing import List, Optional

from app.core.schemas import TrustContact, VerificationPing
from app.safety.db import (
    get_conn,
    hash_safe_word,
    transaction,
    verify_safe_word,
)
from app.safety.safeword import evaluate_answer


class FamilyStore:
    """Thread-safe, SQLite-backed store for Family Protection data."""

    # -----------------------------------------------------------------------
    # Safe Word
    # -----------------------------------------------------------------------

    def set_safe_word(self, owner: str, word: str) -> None:
        """Store salted PBKDF2 hash of the safe word. Plaintext is discarded."""
        clean = word.strip().lower()
        h, salt = hash_safe_word(clean)
        with transaction() as conn:
            conn.execute(
                """
                INSERT INTO safe_words (owner, hash, salt, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(owner) DO UPDATE SET
                    hash=excluded.hash,
                    salt=excluded.salt,
                    updated_at=excluded.updated_at
                """,
                (owner, h, salt, time.time()),
            )

    def has_safe_word(self, owner: str) -> bool:
        """Check whether this owner has configured a safe word."""
        conn = get_conn()
        row = conn.execute(
            "SELECT 1 FROM safe_words WHERE owner = ?",
            (owner,),
        ).fetchone()
        return row is not None

    def verify_safe_word_attempt(self, owner: str, attempt: str) -> bool:
        """
        Verify an answer against the stored hash.

        Evaluates normalized variations (spaces, punctuation) so voice STT
        minor mishearings still match safely.
        """
        conn = get_conn()
        row = conn.execute(
            "SELECT hash, salt FROM safe_words WHERE owner = ?",
            (owner,),
        ).fetchone()
        if not row:
            return False

        stored_hash = row["hash"]
        stored_salt = row["salt"]

        # 1. Direct verify
        clean = attempt.strip().lower()
        if verify_safe_word(clean, stored_hash, stored_salt):
            return True

        # 2. Levenshtein / loose match against candidates is NOT done against
        # hash directly; instead we use exact verification on cleaned forms:
        import re
        tokens = re.findall(r"\w+", clean)
        if len(tokens) > 1:
            joined = "".join(tokens)
            if verify_safe_word(joined, stored_hash, stored_salt):
                return True
        return False

    # Backwards-compat helper: returning boolean whether configured,
    # or the raw string IF legacy code expects string truthiness.
    def get_safe_word(self, owner: str) -> Optional[str]:
        """
        For legacy callers that did `if store.get_safe_word(owner): ...`
        Returns a non-empty marker string if configured, None otherwise.
        NEVER returns the actual plaintext.
        """
        return "__CONFIGURED__" if self.has_safe_word(owner) else None

    # -----------------------------------------------------------------------
    # Trust Circle Contacts
    # -----------------------------------------------------------------------

    def add_contact(self, owner: str, name: str, telegram_username: str = "") -> TrustContact:
        cid = str(uuid.uuid4())[:8]
        with transaction() as conn:
            conn.execute(
                """
                INSERT INTO trust_circle (id, owner, name, telegram_username, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (cid, owner, name, telegram_username, time.time()),
            )
            # If user already started bot, fetch their chat_id for future pings.
            if telegram_username:
                row = conn.execute(
                    "SELECT chat_id FROM telegram_users WHERE username = ?",
                    (telegram_username.lstrip('@'),),
                ).fetchone()
                if row:
                    conn.execute(
                        "UPDATE trust_circle SET telegram_chat_id = ? WHERE id = ?",
                        (row["chat_id"], cid),
                    )
        return TrustContact(id=cid, owner=owner, name=name, telegram_username=telegram_username)

    def list_contacts(self, owner: str) -> List[TrustContact]:
        conn = get_conn()
        rows = conn.execute(
            "SELECT id, owner, name, telegram_username, telegram_chat_id FROM trust_circle WHERE owner = ? ORDER BY created_at ASC",
            (owner,),
        ).fetchall()
        out: List[TrustContact] = []
        for r in rows:
            uname = r["telegram_username"] or ""
            chat_id = r["telegram_chat_id"] or ""
            # Fall back to the telegram_users registry so readiness is accurate
            # even for contacts added before the user started the bot.
            if not chat_id and uname:
                hit = conn.execute(
                    "SELECT chat_id FROM telegram_users WHERE username = ?",
                    (uname.lstrip("@"),),
                ).fetchone()
                if hit:
                    chat_id = hit["chat_id"]
            out.append(
                TrustContact(
                    id=r["id"],
                    owner=r["owner"],
                    name=r["name"],
                    telegram_username=uname,
                    ping_ready=bool(chat_id),
                )
            )
        return out

    def remove_contact(self, owner: str, contact_id: str) -> bool:
        with transaction() as conn:
            cur = conn.execute(
                "DELETE FROM trust_circle WHERE owner = ? AND id = ?",
                (owner, contact_id),
            )
            return cur.rowcount > 0

    # -----------------------------------------------------------------------
    # Verification Pings
    # -----------------------------------------------------------------------

    def create_ping(self, owner: str, claim: str, ttl_seconds: int = 3600) -> VerificationPing:
        pid = str(uuid.uuid4())[:8]
        now = time.time()
        with transaction() as conn:
            conn.execute(
                """
                INSERT INTO verification_pings (id, owner, claim, status, ttl_seconds, created_at)
                VALUES (?, ?, ?, 'pending', ?, ?)
                """,
                (pid, owner, claim, ttl_seconds, now),
            )
        return VerificationPing(id=pid, owner=owner, claim=claim, status="pending", created_at=now)

    def list_pings(self, owner: str) -> List[VerificationPing]:
        """List pings, automatically marking expired ones."""
        now = time.time()
        with transaction() as conn:
            # Mark expired
            conn.execute(
                """
                UPDATE verification_pings
                SET status = 'expired'
                WHERE status = 'pending' AND (created_at + ttl_seconds) < ?
                """,
                (now,),
            )
            rows = conn.execute(
                """
                SELECT id, owner, claim, status, created_at
                FROM verification_pings
                WHERE owner = ?
                ORDER BY created_at DESC
                """,
                (owner,),
            ).fetchall()
        return [
            VerificationPing(
                id=r["id"],
                owner=r["owner"],
                claim=r["claim"],
                status=r["status"],
                created_at=r["created_at"],
            )
            for r in rows
        ]

    def respond(
        self,
        ping_id: str,
        confirmed_identity: bool,
        owner: Optional[str] = None,
    ) -> Optional[VerificationPing]:
        """
        Answer a verification ping.

        When `owner` is given, the ping must belong to that owner — otherwise
        another family could answer someone else's ping and flip its status.
        """
        status = "verified_real" if confirmed_identity else "impostor_alert"
        now = time.time()
        with transaction() as conn:
            # Don't update if already expired
            cur = conn.execute(
                """
                UPDATE verification_pings
                SET status = ?
                WHERE id = ? AND status = 'pending' AND (created_at + ttl_seconds) >= ?
                  AND (? IS NULL OR owner = ?)
                """,
                (status, ping_id, now, owner, owner),
            )
            if cur.rowcount == 0:
                # Either missing, expired/already answered, or not owned by
                # the caller. Only return the row if the caller owns it.
                row = conn.execute(
                    """
                    SELECT id, owner, claim, status, created_at
                    FROM verification_pings
                    WHERE id = ? AND (? IS NULL OR owner = ?)
                    """,
                    (ping_id, owner, owner),
                ).fetchone()
                if not row:
                    return None
                return VerificationPing(
                    id=row["id"],
                    owner=row["owner"],
                    claim=row["claim"],
                    status=row["status"],
                    created_at=row["created_at"],
                )

            row = conn.execute(
                "SELECT id, owner, claim, status, created_at FROM verification_pings WHERE id = ?",
                (ping_id,),
            ).fetchone()
            return VerificationPing(
                id=row["id"],
                owner=row["owner"],
                claim=row["claim"],
                status=row["status"],
                created_at=row["created_at"],
            )


# -----------------------------------------------------------------------
    # Feedback / Report Correction
    # -----------------------------------------------------------------------

    def add_feedback(
        self,
        excerpt: str,
        is_scam: bool,
        comment: str = "",
        max_excerpt_chars: int = 280,
    ) -> dict:
        """
        Record a user correction of a false positive / false negative.

        Anti-abuse guards:
          - excerpt is truncated (bounded storage, no transcript dumping)
          - one pending report per excerpt per hour, to blunt spam
        """
        clean_excerpt = " ".join(excerpt.strip().split())[:max_excerpt_chars]
        if not clean_excerpt:
            raise ValueError("excerpt cannot be empty")

        now = time.time()
        fid = str(uuid.uuid4())[:12]
        with transaction() as conn:
            # Anti-spam: reject if an identical excerpt is already pending.
            dupe = conn.execute(
                """
                SELECT 1 FROM feedback
                WHERE excerpt = ? AND status = 'pending' AND created_at > ?
                LIMIT 1
                """,
                (clean_excerpt, now - 3600),
            ).fetchone()
            if dupe:
                return {"status": "duplicate", "id": None}

            conn.execute(
                """
                INSERT INTO feedback (id, excerpt, is_scam, comment, status, created_at)
                VALUES (?, ?, ?, ?, 'pending', ?)
                """,
                (fid, clean_excerpt, 1 if is_scam else 0, comment.strip()[:500], now),
            )
        return {"status": "recorded", "id": fid}

    def list_feedback(self, status: str = "pending", limit: int = 100) -> List[dict]:
        """List reports for moderation triage (newest first)."""
        conn = get_conn()
        rows = conn.execute(
            """
            SELECT id, excerpt, is_scam, comment, status, created_at
            FROM feedback
            WHERE status = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (status, max(1, min(limit, 500))),
        ).fetchall()
        return [dict(r) for r in rows]

    def moderate_feedback(self, feedback_id: str, status: str) -> bool:
        """Accept or reject a report. Unknown ids and bad statuses return False."""
        if status not in ("accepted", "rejected"):
            return False
        with transaction() as conn:
            cur = conn.execute(
                "UPDATE feedback SET status = ? WHERE id = ?",
                (status, feedback_id),
            )
            return cur.rowcount > 0

    def feedback_counts(self) -> dict:
        """Counts per status — feeds the calibration dashboard."""
        conn = get_conn()
        rows = conn.execute(
            "SELECT status, COUNT(*) AS n FROM feedback GROUP BY status"
        ).fetchall()
        counts = {"pending": 0, "accepted": 0, "rejected": 0}
        for r in rows:
            counts[r["status"]] = r["n"]
        return counts

    # -----------------------------------------------------------------------
    # Data retention
    # -----------------------------------------------------------------------

    def purge_expired_pings(self, older_than_seconds: int = 86400 * 7) -> int:
        """Delete answered/expired pings older than the retention window."""
        cutoff = time.time() - older_than_seconds
        with transaction() as conn:
            cur = conn.execute(
                """
                DELETE FROM verification_pings
                WHERE status != 'pending' AND created_at < ?
                """,
                (cutoff,),
            )
            return cur.rowcount

    def export_owner_data(self, owner: str) -> dict:
        """Full export of one owner's data (portability / GDPR-style access)."""
        conn = get_conn()
        return {
            "safe_word_configured": self.has_safe_word(owner),
            "trust_circle": [
                {
                    "name": c.name,
                    "telegram_username": c.telegram_username,
                }
                for c in self.list_contacts(owner)
            ],
            "verification_pings": [
                {"claim": p.claim, "status": p.status, "created_at": p.created_at}
                for p in self.list_pings(owner)
            ],
        }


# Global singleton instance
store = FamilyStore()