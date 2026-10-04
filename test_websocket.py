#!/usr/bin/env python3
"""Quick test: WebSocket /analyze/stream endpoint.

Usage:
  python3 test_websocket.py

Sends dummy audio + video frames, verifies response structure.
"""
import asyncio
import json
import base64
import sys

try:
    import websockets
except ImportError:
    print("❌ websockets library not found")
    print("Install: pip install websockets")
    sys.exit(1)


async def test_stream():
    uri = "wss://api.parallel-dungeons.site/api/analyze/stream"
    
    print(f"🔌 Connecting to {uri}...")
    try:
        async with websockets.connect(uri, open_timeout=10) as ws:
            print("✅ Connected")
            
            # Send dummy PCM audio chunk (1000 zero bytes)
            pcm_dummy = b"\x00" * 1000
            audio_b64 = base64.b64encode(pcm_dummy).decode()
            
            # Send dummy JPEG frame (minimal valid JPEG: FFD8FFE0...)
            jpeg_dummy = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
            video_b64 = base64.b64encode(jpeg_dummy).decode()
            
            msg = {
                "seq": 1,
                "audio_chunk": audio_b64,
                "video_frame": video_b64,
            }
            
            print("📤 Sending frame #1...")
            await ws.send(json.dumps(msg))
            
            print("⏳ Waiting for response...")
            resp = await asyncio.wait_for(ws.recv(), timeout=15)
            data = json.loads(resp)
            
            print("\n✅ Response received:")
            print(f"   seq: {data.get('seq')}")
            print(f"   transcript_window: '{data.get('transcript_window', '')}'")
            print(f"   risk.level: {data.get('risk', {}).get('level')}")
            print(f"   risk.score: {data.get('risk', {}).get('score')}")
            print(f"   elapsed_seconds: {data.get('elapsed_seconds')}")
            print(f"   vision.blink_rate: {data.get('vision', {}).get('blink_rate')}")
            
            # Verify structure
            assert "risk" in data, "Missing 'risk' key"
            assert "transcript_window" in data, "Missing 'transcript_window'"
            assert "vision" in data, "Missing 'vision'"
            
            print("\n✅ WebSocket endpoint working!")
            return True
            
    except asyncio.TimeoutError:
        print("❌ Timeout waiting for response")
        return False
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {e}")
        return False


if __name__ == "__main__":
    result = asyncio.run(test_stream())
    sys.exit(0 if result else 1)
