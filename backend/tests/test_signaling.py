"""
Tests for WebRTC signaling server.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app


def test_signaling_join_flow():
    client = TestClient(app)

    with client.websocket_connect("/api/call/signal/test-room-1") as ws1:
        # Client 1 joins
        ws1.send_json({"type": "join", "client_id": "alice"})
        msg1 = ws1.receive_json()
        assert msg1["type"] == "joined"
        assert msg1["is_initiator"] is True
        assert msg1["peer_count"] == 1

        # Client 2 joins
        with client.websocket_connect("/api/call/signal/test-room-1") as ws2:
            ws2.send_json({"type": "join", "client_id": "bob"})
            msg2 = ws2.receive_json()
            assert msg2["type"] == "joined"
            assert msg2["is_initiator"] is False
            assert msg2["peer_count"] == 2

            # Alice should receive peer_joined notification
            peer_joined = ws1.receive_json()
            assert peer_joined["type"] == "peer_joined"
            assert peer_joined["peer_id"] == "bob"

            # Alice sends offer
            ws1.send_json({"type": "offer", "sdp": "fake-sdp-offer"})
            offer_rcv = ws2.receive_json()
            assert offer_rcv["type"] == "offer"
            assert offer_rcv["sdp"] == "fake-sdp-offer"
            assert offer_rcv["from"] == "alice"

            # Bob sends answer
            ws2.send_json({"type": "answer", "sdp": "fake-sdp-answer"})
            ans_rcv = ws1.receive_json()
            assert ans_rcv["type"] == "answer"
            assert ans_rcv["sdp"] == "fake-sdp-answer"
            assert ans_rcv["from"] == "bob"

            # ICE candidate relay
            ws1.send_json({"type": "ice_candidate", "candidate": {"candidate": "xyz"}})
            ice_rcv = ws2.receive_json()
            assert ice_rcv["type"] == "ice_candidate"
            assert ice_rcv["candidate"]["candidate"] == "xyz"

        # Bob left -> Alice gets peer_left
        left_msg = ws1.receive_json()
        assert left_msg["type"] == "peer_left"
        assert left_msg["peer_id"] == "bob"


def test_signaling_room_full():
    client = TestClient(app)
    with client.websocket_connect("/api/call/signal/full-room") as ws1:
        ws1.send_json({"type": "join", "client_id": "p1"})
        assert ws1.receive_json()["type"] == "joined"

        with client.websocket_connect("/api/call/signal/full-room") as ws2:
            ws2.send_json({"type": "join", "client_id": "p2"})
            assert ws2.receive_json()["type"] == "joined"

            with client.websocket_connect("/api/call/signal/full-room") as ws3:
                ws3.send_json({"type": "join", "client_id": "p3"})
                res3 = ws3.receive_json()
                assert res3["type"] == "room_full"
