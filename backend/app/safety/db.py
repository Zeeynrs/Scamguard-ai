"""
SQLite-backed persistence for Family Protection data.

Replaces the in-memory dict store with a durable, connection-pooled
SQLite database. Uses WAL mode for concurrent reads and automatic
connection management.

Database file: configurable via DB_PATH env, defaults to backend/data/scamguard.db.
Tables are created on first use; migrations are idempotent.
"""
import os
import sqlite3
import threading
from contextlib import contextmanager

from app.config import settings

_DB_PATH: str = ""
_lock = threading.Lock()

# Thread-local connections so every thread reuses its own handle.
_local = threading.local()


def _db_path() -> str:
    global _DB_PATH
    if _DB_PATH:
        return _DB_PATH
    with _lock:
        if not _DB_PATH:
            candidate = getattr(settings, "db_path", "") or os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                "data",
                "scamguard.db",
            )
            os.makedirs(os.path.dirname(candidate), exist_ok=True)
            _DB_PATH = candidate
        return _DB_PATH


def get_conn() -> sqlite3.Connection:
    """Return a thread-local SQLite connection, creating one on first call."""
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = _new_connection()
    return _local.conn


def _new_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    _migrate(conn)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Idempotent schema: create tables if they don't exist."""
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS safe_words (
        owner       TEXT PRIMARY KEY,
        hash        TEXT NOT NULL,
        salt        TEXT NOT NULL,
        updated_at  REAL NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS trust_circle (
        id               TEXT PRIMARY KEY,
        owner            TEXT NOT NULL,
        name             TEXT NOT NULL,
        telegram_username TEXT NOT NULL DEFAULT '',
        telegram_chat_id TEXT NOT NULL DEFAULT '',
        created_at       REAL NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trust_owner ON trust_circle(owner);

    -- Telegram identities captured when a user runs /start on the bot.
    -- A bot can only message a chat_id it has seen before; @username alone
    -- is NOT deliverable (Telegram returns "chat not found").
    CREATE TABLE IF NOT EXISTS telegram_users (
        chat_id    TEXT PRIMARY KEY,
        username   TEXT NOT NULL DEFAULT '',
        first_name TEXT NOT NULL DEFAULT '',
        last_name  TEXT NOT NULL DEFAULT '',
        updated_at REAL NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tg_username ON telegram_users(username);

    CREATE TABLE IF NOT EXISTS verification_pings (
        id          TEXT PRIMARY KEY,
        owner       TEXT NOT NULL,
        claim       TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        ttl_seconds INTEGER NOT NULL DEFAULT 3600,
        created_at  REAL NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pings_owner ON verification_pings(owner);

    CREATE TABLE IF NOT EXISTS feedback (
        id           TEXT PRIMARY KEY,
        excerpt      TEXT NOT NULL,
        is_scam      INTEGER NOT NULL,          -- 0 = benign, 1 = scam
        comment      TEXT NOT NULL DEFAULT '',
        status       TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
        created_at   REAL NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
    """)

    # --- Idempotent column additions for pre-existing databases ---
    # CREATE TABLE IF NOT EXISTS does not add columns to a table that already
    # exists, so new columns need an explicit ALTER TABLE guarded by a check.
    existing = {
        row[1] for row in conn.execute("PRAGMA table_info(trust_circle)").fetchall()
    }
    if "telegram_chat_id" not in existing:
        conn.execute(
            "ALTER TABLE trust_circle ADD COLUMN telegram_chat_id TEXT NOT NULL DEFAULT ''"
        )

    conn.commit()


@contextmanager
def transaction():
    """Commit on success, rollback on exception."""
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


# ---------------------------------------------------------------------------
# Safe-word helpers (hash + verify — PBKDF2, no extra deps)
# ---------------------------------------------------------------------------
import hashlib
import secrets


def hash_safe_word(plain: str, *, salt: str = "") -> tuple[str, str]:
    """Return (hash_hex, salt_hex). If salt is empty, generate a new one."""
    if not salt:
        salt = secrets.token_hex(16)
    raw = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), iterations=600_000)
    return raw.hex(), salt


def verify_safe_word(plain: str, stored_hash: str, stored_salt: str) -> bool:
    """Compare a plaintext attempt against the stored hash+salt."""
    candidate, _ = hash_safe_word(plain, salt=stored_salt)
    return secrets.compare_digest(candidate, stored_hash)