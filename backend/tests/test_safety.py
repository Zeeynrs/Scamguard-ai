"""
Tests for the Family Protection layer (safe word, trust circle, reply scripts).

Written before the implementation (TDD): every test here must fail with
ModuleNotFoundError until app.safety exists.
"""
import pytest


# ---------------------------------------------------------------------------
# Reply-script engine
# ---------------------------------------------------------------------------

def test_build_guidance_returns_one_script_per_tactic():
    from app.safety.scripts import build_guidance

    guidance = build_guidance(
        tactics=["urgency", "credential_harvest"],
        risk_level="critical",
        language="en",
    )

    assert len(guidance["reply_scripts"]) == 2
    tactics = {s["tactic"] for s in guidance["reply_scripts"]}
    assert tactics == {"urgency", "credential_harvest"}
    for script in guidance["reply_scripts"]:
        assert script["say"].strip()
        assert script["avoid"].strip()
        assert script["why"].strip()


def test_build_guidance_falls_back_when_no_tactics_fired():
    from app.safety.scripts import build_guidance

    guidance = build_guidance(tactics=[], risk_level="low", language="en")

    assert len(guidance["reply_scripts"]) == 1
    assert guidance["reply_scripts"][0]["tactic"] == "general"
    assert guidance["reply_scripts"][0]["say"].strip()


def test_build_guidance_speaks_indonesian_when_requested():
    from app.safety.scripts import build_guidance

    guidance = build_guidance(tactics=["financial_demand"], risk_level="high", language="id")
    script = guidance["reply_scripts"][0]
    assert "telepon balik" in script["say"].lower() or "transfer" in script["say"].lower()


def test_build_guidance_escalates_verify_actions_for_critical():
    from app.safety.scripts import build_guidance

    low = build_guidance(tactics=["urgency"], risk_level="low", language="en")
    critical = build_guidance(tactics=["urgency"], risk_level="critical", language="en")

    assert len(critical["verify_actions"]) > len(low["verify_actions"])
    assert any("call" in a.lower() for a in critical["verify_actions"])


def test_build_guidance_carries_safe_word_challenge():
    from app.safety.scripts import build_guidance

    guidance = build_guidance(
        tactics=["family_emergency"],
        risk_level="critical",
        language="id",
        safe_word_challenge="Sebutkan kata sandi keluarga.",
    )

    assert guidance["safe_word_challenge"] == "Sebutkan kata sandi keluarga."


# ---------------------------------------------------------------------------
# Safe word
# ---------------------------------------------------------------------------

def test_evaluate_answer_accepts_normalized_match():
    from app.safety.safeword import evaluate_answer

    assert evaluate_answer("  Bunga Melati  ", "bunga melati") is True
    assert evaluate_answer("BUNGA   MELATI", "bunga melati") is True


def test_evaluate_answer_rejects_wrong_or_empty():
    from app.safety.safeword import evaluate_answer

    assert evaluate_answer("bunga mawar", "bunga melati") is False
    assert evaluate_answer("", "bunga melati") is False
    assert evaluate_answer("bunga melati", "") is False


def test_new_challenge_returns_a_prompt():
    from app.safety.safeword import new_challenge

    challenge = new_challenge("id")
    assert isinstance(challenge, str)
    assert len(challenge.strip()) > 0


# ---------------------------------------------------------------------------
# Store — safe word (hash) + trust circle + verification pings
# ---------------------------------------------------------------------------

@pytest.fixture
def fresh_store(tmp_path, monkeypatch):
    """Provide a FamilyStore pointing at a temporary SQLite file."""
    import app.safety.db as dbmod
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(dbmod, "_DB_PATH", db_file)
    if hasattr(dbmod._local, "conn"):
        try:
            dbmod._local.conn.close()
        except Exception:
            pass
        delattr(dbmod._local, "conn")
    from app.safety.store import FamilyStore
    return FamilyStore()


def test_safe_word_is_hashed(fresh_store):
    s = fresh_store
    s.set_safe_word("user-a", "bunga melati")

    # get_safe_word should NOT return the plaintext
    marker = s.get_safe_word("user-a")
    assert marker is not None
    assert "bunga" not in str(marker).lower()

    # has_safe_word must be True
    assert s.has_safe_word("user-a") is True
    assert s.has_safe_word("user-unknown") is False


def test_safe_word_verify_roundtrip(fresh_store):
    s = fresh_store
    s.set_safe_word("user-a", "Bunga Melati")

    assert s.verify_safe_word_attempt("user-a", "bunga melati") is True
    assert s.verify_safe_word_attempt("user-a", "BUNGA MELATI") is True
    assert s.verify_safe_word_attempt("user-a", "bunga mawar") is False
    assert s.verify_safe_word_attempt("user-unknown", "bunga melati") is False


def test_trust_circle_add_and_list(fresh_store):
    s = fresh_store
    contact = s.add_contact("user-b", name="Anak", telegram_username="@anak")
    contacts = s.list_contacts("user-b")

    assert len(contacts) == 1
    assert contacts[0].name == "Anak"
    assert contacts[0].telegram_username == "@anak"
    assert contacts[0].id == contact.id


def test_trust_circle_remove(fresh_store):
    s = fresh_store
    contact = s.add_contact("user-c", name="Ibu", telegram_username="@ibu")
    assert s.remove_contact("user-c", contact.id) is True
    assert s.list_contacts("user-c") == []
    # Removing again is a no-op, not an error.
    assert s.remove_contact("user-c", contact.id) is False


def test_ping_lifecycle_starts_pending_then_confirms(fresh_store):
    s = fresh_store
    ping = s.create_ping("user-d", claim="Mengaku anak sedang diculik")
    assert ping.status == "pending"
    assert ping.claim == "Mengaku anak sedang diculik"

    resolved = s.respond(ping.id, confirmed_identity=True)
    assert resolved.status == "verified_real"


def test_ping_response_can_flag_impostor(fresh_store):
    s = fresh_store
    ping = s.create_ping("user-e", claim="Mengaku istri butuh uang")
    resolved = s.respond(ping.id, confirmed_identity=False)

    assert resolved.status == "impostor_alert"
    assert any(p.id == ping.id and p.status == "impostor_alert" for p in s.list_pings("user-e"))


def test_respond_to_unknown_ping_returns_none(fresh_store):
    s = fresh_store
    assert s.respond("does-not-exist", confirmed_identity=True) is None


def test_respond_cannot_touch_another_owners_ping(fresh_store):
    """Owner scoping on respond: bob must not be able to answer alice's ping."""
    s = fresh_store
    ping = s.create_ping("alice", claim="Anak diculik")

    # Bob tries to answer alice's ping → rejected, nothing changes.
    assert s.respond(ping.id, confirmed_identity=True, owner="bob") is None
    alice_view = s.list_pings("alice")
    assert alice_view[0].status == "pending"

    # Alice (the real owner) can answer.
    resolved = s.respond(ping.id, confirmed_identity=True, owner="alice")
    assert resolved is not None
    assert resolved.status == "verified_real"
