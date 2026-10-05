"""In-memory family-protection store (safe words, trust circle, verification pings)."""
import time
import uuid
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class TrustContact(BaseModel):
    id: str
    owner: str
    name: str
    telegram_username: str = ""


class VerificationPing(BaseModel):
    id: str
    owner: str
    claim: str
    status: str = "pending"  # pending | confirmed | impostor
    created_at: float = Field(default_factory=time.time)


class SafetyStore:
    def __init__(self) -> None:
        self._safe_words: Dict[str, str] = {}
        self._contacts: Dict[str, Dict[str, TrustContact]] = {}
        self._pings: Dict[str, VerificationPing] = {}

    def set_safe_word(self, owner: str, word: str) -> None:
        self._safe_words[owner] = word

    def get_safe_word(self, owner: str) -> Optional[str]:
        return self._safe_words.get(owner)

    def add_contact(self, owner: str, name: str, telegram_username: str = "") -> TrustContact:
        contact = TrustContact(
            id=uuid.uuid4().hex[:12], owner=owner, name=name, telegram_username=telegram_username
        )
        self._contacts.setdefault(owner, {})[contact.id] = contact
        return contact

    def list_contacts(self, owner: str) -> List[TrustContact]:
        return list(self._contacts.get(owner, {}).values())

    def remove_contact(self, owner: str, contact_id: str) -> bool:
        bucket = self._contacts.get(owner)
        if not bucket or contact_id not in bucket:
            return False
        del bucket[contact_id]
        return True

    def create_ping(self, owner: str, claim: str) -> VerificationPing:
        ping = VerificationPing(id=uuid.uuid4().hex[:12], owner=owner, claim=claim)
        self._pings[ping.id] = ping
        return ping

    def get_ping(self, ping_id: str) -> Optional[VerificationPing]:
        return self._pings.get(ping_id)

    def list_pings(self, owner: str) -> List[VerificationPing]:
        return [p for p in self._pings.values() if p.owner == owner]

    def respond(self, ping_id: str, confirmed_identity: bool) -> Optional[VerificationPing]:
        ping = self._pings.get(ping_id)
        if not ping:
            return None
        ping.status = "confirmed" if confirmed_identity else "impostor"
        return ping


store = SafetyStore()