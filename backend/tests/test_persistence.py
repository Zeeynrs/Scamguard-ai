"""
Persistence + owner-isolation tests for the SQLite Family Protection store.

These codify the Phase-1 guarantees:
  1. Safe words survive (durable), are never stored in plaintext.
  2. Owners are isolated — one owner cannot see or modify another's data.
  3. Ping TTL expires automatically.
  4. API-level: owner comes from the X-Family-Owner header, never the body.
"""
import os
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures: point the store at a throwaway SQLite file per test.
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    db_file = tmp_path / "fam.db"
    monkeypatch.setenv("DB_PATH", str(db_file))
    from app.config import settings
    monkeypatch.setattr(settings, "db_path", str(db_file))
    # Reset the cached path + thread-local connections so each test starts clean.
    import app.safety.db as dbmod
    monkeypatch.setattr(dbmod, "_DB_PATH", "")
    if hasattr(dbmod._local, "conn"):
        try:
            dbmod._local.conn.close()
        except Exception:
            pass
        delattr(dbmod._local, "conn")
    from app.safety.store import FamilyStore
    return FamilyStore()


# ---------------------------------------------------------------------------
# Safe-word hashing
# ---------------------------------------------------------------------------

def test_safe_word_is_hashed_not_plaintext(tmp_db):
    tmp_db.set_safe_word("owner-a", "bunga melati")

    from app.safety.db import get_conn
    row = get_conn().execute(
        "SELECT hash, salt FROM safe_words WHERE owner = ?",
        ("owner-a",),
    ).fetchone()

    assert row is not None
    assert row["hash"] != "bunga melati"
    assert len(row["salt"]) >= 16
    # Same word for a different owner gets a different hash (unique salt).
    tmp_db.set_safe_word("owner-b", "bunga melati")
    row_b = get_conn().execute(
        "SELECT hash FROM safe_words WHERE owner = ?",
        ("owner-b",),
    ).fetchone()
    assert row_b["hash"] != row["hash"]


def test_safe_word_verify_roundtrip(tmp_db):
    tmp_db.set_safe_word("owner-a", "Bunga Melati")

    assert tmp_db.verify_safe_word_attempt("owner-a", "bunga melati") is True
    assert tmp_db.verify_safe_word_attempt("owner-a", "BUNGA MELATI") is True
    assert tmp_db.verify_safe_word_attempt("owner-a", "bunga mawar") is False
    assert tmp_db.verify_safe_word_attempt("owner-unknown", "bunga melati") is False


def test_get_safe_word_never_returns_plaintext(tmp_db):
    tmp_db.set_safe_word("owner-a", "bunga melati")

    marker = tmp_db.get_safe_word("owner-a")
    assert marker is not None
    assert "bunga" not in str(marker).lower()
    assert tmp_db.get_safe_word("owner-unknown") is None


# ---------------------------------------------------------------------------
# Owner isolation at the store layer
# ---------------------------------------------------------------------------

def test_trust_circle_isolated_per_owner(tmp_db):
    tmp_db.add_contact("alice", name="Anak", telegram_username="@anak")

    assert len(tmp_db.list_contacts("alice")) == 1
    assert tmp_db.list_contacts("bob") == []

    # Bob cannot delete Alice's contact.
    alice_contact = tmp_db.list_contacts("alice")[0]
    assert tmp_db.remove_contact("bob", alice_contact.id) is False
    assert len(tmp_db.list_contacts("alice")) == 1


def test_pings_isolated_per_owner(tmp_db):
    ping = tmp_db.create_ping("alice", claim="Anak diculik")

    assert len(tmp_db.list_pings("alice")) == 1
    assert tmp_db.list_pings("bob") == []


def test_ping_expires_after_ttl(tmp_db):
    short = tmp_db.create_ping("alice", claim="Butuh transfer", ttl_seconds=0)
    time.sleep(0.05)

    pings = tmp_db.list_pings("alice")
    assert pings[0].status == "expired"

    # Expired pings cannot be answered anymore.
    answered = tmp_db.respond(short.id, confirmed_identity=True)
    assert answered is not None
    assert answered.status == "expired"


def test_ping_respond_marks_status(tmp_db):
    ok = tmp_db.create_ping("alice", claim="Klaim A")
    bad = tmp_db.create_ping("alice", claim="Klaim B")

    assert tmp_db.respond(ok.id, confirmed_identity=True).status == "verified_real"
    assert tmp_db.respond(bad.id, confirmed_identity=False).status == "impostor_alert"
    assert tmp_db.respond("does-not-exist", confirmed_identity=True) is None


# ---------------------------------------------------------------------------
# API-level owner isolation (header, not body)
# ---------------------------------------------------------------------------

def _api_client(tmp_path, monkeypatch) -> TestClient:
    db_file = tmp_path / "api.db"
    monkeypatch.setenv("DB_PATH", str(db_file))
    import app.safety.db as dbmod
    from app.config import settings
    monkeypatch.setattr(settings, "db_path", str(db_file))
    monkeypatch.setattr(dbmod, "_DB_PATH", "")
    if hasattr(dbmod._local, "conn"):
        try:
            dbmod._local.conn.close()
        except Exception:
            pass
        delattr(dbmod._local, "conn")

    app = FastAPI()
    from app.api.routes import router
    app.include_router(router, prefix="/api")
    return TestClient(app)


def test_api_requires_owner_header(tmp_path, monkeypatch):
    client = _api_client(tmp_path, monkeypatch)

    # No header at all → 400, not silent leakage into "default".
    assert client.post("/api/family/contacts", json={"name": "X"}).status_code == 400
    assert client.get("/api/family/contacts").status_code == 400
    assert client.post("/api/family/safe-word", json={"safe_word": "x"}).status_code == 400


def test_api_ignores_owner_in_body(tmp_path, monkeypatch):
    client = _api_client(tmp_path, monkeypatch)

    # Even if the caller sneaks an `owner` field into the JSON body,
    # it is ignored — the header decides.
    r = client.post(
        "/api/family/contacts",
        json={"name": "Anak", "owner": "victim"},
        headers={"X-Family-Owner": "attacker"},
    )
    assert r.status_code == 200

    # The contact landed under "attacker", NOT "victim".
    assert len(client.get("/api/family/contacts", headers={"X-Family-Owner": "attacker"}).json()["contacts"]) == 1
    assert client.get("/api/family/contacts", headers={"X-Family-Owner": "victim"}).json()["contacts"] == []


def test_api_family_data_isolated_between_owners(tmp_path, monkeypatch):
    client = _api_client(tmp_path, monkeypatch)

    client.post("/api/family/safe-word", json={"safe_word": "melati"}, headers={"X-Family-Owner": "alice"})
    client.post("/api/family/contacts", json={"name": "Ibu"}, headers={"X-Family-Owner": "alice"})

    bob_contacts = client.get("/api/family/contacts", headers={"X-Family-Owner": "bob"}).json()["contacts"]
    assert bob_contacts == []
    bob_safe = client.get("/api/family/safe-word", headers={"X-Family-Owner": "bob"}).json()
    assert bob_safe["configured"] is False

    alice_safe = client.get("/api/family/safe-word", headers={"X-Family-Owner": "alice"}).json()
    assert alice_safe["configured"] is True


def test_api_safe_word_verify_uses_hash(tmp_path, monkeypatch):
    client = _api_client(tmp_path, monkeypatch)

    client.post("/api/family/safe-word", json={"safe_word": "melati"}, headers={"X-Family-Owner": "alice"})

    ok = client.post(
        "/api/family/safe-word/verify",
        json={"answer": "Melati"},
        headers={"X-Family-Owner": "alice"},
    )
    assert ok.json()["passed"] is True

    bad = client.post(
        "/api/family/safe-word/verify",
        json={"answer": "mawar"},
        headers={"X-Family-Owner": "alice"},
    )
    assert bad.json()["passed"] is False

    other = client.post(
        "/api/family/safe-word/verify",
        json={"answer": "melati"},
        headers={"X-Family-Owner": "bob"},
    )
    assert other.status_code == 404


def test_api_ping_response_is_owner_scoped(tmp_path, monkeypatch):
    client = _api_client(tmp_path, monkeypatch)
    alice = {"X-Family-Owner": "alice"}
    bob = {"X-Family-Owner": "bob"}

    created = client.post("/api/family/pings", json={"claim": "Emergency"}, headers=alice)
    ping_id = created.json()["ping"]["id"]

    # Bob cannot respond to or even read Alice's ping through the response API.
    denied = client.post(
        f"/api/family/pings/{ping_id}/respond",
        json={"confirmed": True},
        headers=bob,
    )
    assert denied.status_code == 404
    assert client.get("/api/family/pings", headers=alice).json()["pings"][0]["status"] == "pending"

    allowed = client.post(
        f"/api/family/pings/{ping_id}/respond",
        json={"confirmed": True},
        headers=alice,
    )
    assert allowed.status_code == 200
    assert allowed.json()["ping"]["status"] == "verified_real"


def test_feedback_submit_deduplicates_and_moderates(tmp_path, monkeypatch):
    client = _api_client(tmp_path, monkeypatch)
    payload = {"excerpt": "Suspicious transfer now", "is_scam": True, "comment": "possible scam"}

    first = client.post("/api/feedback", json=payload)
    assert first.status_code == 200
    assert first.json()["status"] == "recorded"

    duplicate = client.post("/api/feedback", json=payload)
    assert duplicate.json()["status"] == "duplicate"

    counts = client.get("/api/feedback/counts").json()
    assert counts["pending"] == 1

    feedback_id = first.json()["id"]
    moderated = client.post(f"/api/feedback/{feedback_id}/moderate", json={"status": "accepted"})
    assert moderated.status_code == 200
    assert client.get("/api/feedback/counts").json()["accepted"] == 1
