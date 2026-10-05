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
        return TrustContact(id=cid, owner=owner, name=name, telegram_username=telegram_username)

    def list_contacts(self, owner: str) -> List[TrustContact]:
        conn = get_conn()
        rows = conn.execute(
            "SELECT id, owner, name, telegram_username FROM trust_circle WHERE owner = ? ORDER BY created_at ASC",
            (owner,),
        ).fetchall()
        return [
            TrustContact(
                id=r["id"],
                owner=r["owner"],
                name=r["name"],
                telegram_username=r["telegram_username"],
            )
            for r in rows
        ]

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

    def respond(self, ping_id: str, confirmed_identity: bool) -> Optional[VerificationPing]:
        status = "verified_real" if confirmed_identity else "impostor_alert"
        now = time.time()
        with transaction() as conn:
            # Don't update if already expired
            cur = conn.execute(
                """
                UPDATE verification_pings
                SET status = ?
                WHERE id = ? AND status = 'pending' AND (created_at + ttl_seconds) >= ?
                """,
                (status, ping_id, now),
            )
            if cur.rowcount == 0:
                # Either missing or expired/already answered; fetch to see
                row = conn.execute(
                    "SELECT id, owner, claim, status, created_at FROM verification_pings WHERE id = ?",
                    (ping_id,),
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


# Global singleton instance
store = FamilyStore()