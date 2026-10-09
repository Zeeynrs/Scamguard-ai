"""
ScamGuard Multimodal — WebRTC Signaling Server for P2P video/audio calls.

Enables 1-on-1 peer calls with end-to-end WebRTC media (audio + video).
One or both sides can feed the received remote stream to ScamGuard's
/api/analyze/stream analyzer in real-time.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, Optional, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


class CallRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        # client_id -> WebSocket
        self.clients: Dict[str, WebSocket] = {}
        self.lock = asyncio.Lock()

    async def add(self, client_id: str, ws: WebSocket) -> bool:
        async with self.lock:
            if len(self.clients) >= 2 and client_id not in self.clients:
                return False  # room is full (max 2 for 1-on-1 calls)
            self.clients[client_id] = ws
            return True

    async def remove(self, client_id: str):
        async with self.lock:
            self.clients.pop(client_id, None)

    async def broadcast_except(self, sender_id: str, message: dict):
        async with self.lock:
            for cid, ws in list(self.clients.items()):
                if cid != sender_id:
                    try:
                        await ws.send_json(message)
                    except Exception as e:
                        logger.warning(f"[signaling] send to {cid} failed: {e}")

    def is_empty(self) -> bool:
        return len(self.clients) == 0

    def peer_count(self) -> int:
        return len(self.clients)


class SignalingHub:
    def __init__(self):
        self.rooms: Dict[str, CallRoom] = {}
        self.lock = asyncio.Lock()

    async def get_or_create(self, room_id: str) -> CallRoom:
        async with self.lock:
            if room_id not in self.rooms:
                self.rooms[room_id] = CallRoom(room_id)
            return self.rooms[room_id]

    async def cleanup_room(self, room_id: str):
        async with self.lock:
            room = self.rooms.get(room_id)
            if room and room.is_empty():
                self.rooms.pop(room_id, None)


hub = SignalingHub()


@router.websocket("/call/signal/{room_id}")
async def call_signal_websocket(websocket: WebSocket, room_id: str):
    """
    WebRTC signaling endpoint.
    Client connects, sends handshake JSON:
      {"type": "join", "client_id": "abc123"}
    Then relays:
      - "offer" (SDP)
      - "answer" (SDP)
      - "ice_candidate" (candidate object)
      - "leave"
    """
    await websocket.accept()
    room = await hub.get_or_create(room_id)
    client_id: Optional[str] = None

    try:
        # First message must be join
        first_msg = await websocket.receive_json()
        if first_msg.get("type") != "join" or not first_msg.get("client_id"):
            await websocket.send_json({
                "type": "error",
                "message": "First message must be {type: 'join', client_id: '...'}",
            })
            await websocket.close()
            return

        client_id = str(first_msg["client_id"]).strip()[:64]
        ok = await room.add(client_id, websocket)
        if not ok:
            await websocket.send_json({
                "type": "room_full",
                "message": f"Room {room_id} is full (max 2 participants).",
            })
            await websocket.close()
            return

        # Notify this client of join status
        peer_count = room.peer_count()
        await websocket.send_json({
            "type": "joined",
            "room_id": room_id,
            "client_id": client_id,
            "peer_count": peer_count,
            "is_initiator": peer_count == 1,
        })

        # If second person joined, tell the first person
        if peer_count == 2:
            await room.broadcast_except(client_id, {
                "type": "peer_joined",
                "peer_id": client_id,
            })

        # Relay loop
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")

            if msg_type in ("offer", "answer", "ice_candidate"):
                # Forward to the other peer, tagged with sender
                payload = {**msg, "from": client_id}
                await room.broadcast_except(client_id, payload)
            elif msg_type == "leave":
                break
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"[signaling] room {room_id} client {client_id} err: {e}")
    finally:
        if client_id:
            await room.remove(client_id)
            await room.broadcast_except(client_id, {
                "type": "peer_left",
                "peer_id": client_id,
            })
            await hub.cleanup_room(room_id)
