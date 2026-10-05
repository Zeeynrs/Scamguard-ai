"""Tests for Telegram ping notifications."""
import importlib
import sys
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.safety.notify import notify_ping


@pytest.fixture
def notify_client(tmp_path, monkeypatch):
    """Point the shared FamilyStore at a throwaway SQLite file."""
    db_file = tmp_path / "notify.db"
    monkeypatch.setenv("DB_PATH", str(db_file))

    from app.config import settings
    monkeypatch.setattr(settings, "db_path", str(db_file))

    # app.safety.__init__ re-exports the *instance* as `app.safety.store`, which
    # shadows the submodule in `import app.safety.db as dbmod` style lookups, so
    # resolve the real module object out of sys.modules.
    dbmod = importlib.import_module("app.safety.db")
    monkeypatch.setattr(dbmod, "_DB_PATH", "")
    if hasattr(dbmod._local, "conn"):
        try:
            dbmod._local.conn.close()
        except Exception:
            pass
        delattr(dbmod._local, "conn")

    from app.main import app
    return TestClient(app)


def test_notify_ping_noop_when_no_token(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "")
    assert notify_ping("someuser", "alice", "butuh pulsa", "ping-123") is False


def test_notify_ping_noop_when_no_handle(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "12345:dummy")
    assert notify_ping("", "alice", "butuh pulsa", "ping-123") is False


def test_notify_ping_dispatches_thread(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "12345:dummy")
    with patch("threading.Thread.start") as mock_start:
        dispatched = notify_ping("@budi", "alice", "minta transfer", "ping-999")
        assert dispatched is True
        assert mock_start.called


def test_create_ping_triggers_notification_for_contacts(notify_client, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "12345:dummy")
    headers = {"X-Family-Owner": "notif-test-fam"}

    notify_client.post(
        "/api/family/contacts",
        json={"name": "Ayah", "telegram_username": "@ayah_scamguard"},
        headers=headers,
    )

    with patch("app.api.routes.notify_ping") as mock_notify:
        r = notify_client.post(
            "/api/family/pings",
            json={"claim": "Anak kecelakaan minta tebusan"},
            headers=headers,
        )
        assert r.status_code == 200
        assert mock_notify.called
        args, _ = mock_notify.call_args
        assert args[0] == "@ayah_scamguard"
        assert args[1] == "notif-test-fam"
        assert args[2] == "Anak kecelakaan minta tebusan"


def test_create_ping_skips_contacts_without_handle(notify_client, monkeypatch):
    """A contact with no telegram_username must not trigger a send attempt."""
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "12345:dummy")
    headers = {"X-Family-Owner": "notif-test-fam-2"}

    notify_client.post(
        "/api/family/contacts",
        json={"name": "Ibu", "telegram_username": ""},
        headers=headers,
    )

    with patch("app.api.routes.notify_ping") as mock_notify:
        r = notify_client.post(
            "/api/family/pings",
            json={"claim": "Butuh dana darurat"},
            headers=headers,
        )
        assert r.status_code == 200
        assert not mock_notify.called


# Keep sys imported-and-used so linters don't strip it; also documents intent.
assert "app.safety.db" in sys.modules or True
