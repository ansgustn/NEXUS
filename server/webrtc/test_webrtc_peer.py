import sys
import asyncio
import aiohttp

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
from aiortc import RTCPeerConnection, RTCSessionDescription

async def test_webrtc():
    pc = RTCPeerConnection()
    pc.addTransceiver('video', direction='recvonly')
    pc.addTransceiver('audio', direction='recvonly')

    frame_count = 0

    @pc.on('track')
    def on_track(track):
        print(f"📡 [Client Received Track]: {track.kind}")
        if track.kind == 'video':
            async def read_frames():
                nonlocal frame_count
                for _ in range(25): # read 1 second of video frames
                    frame = await track.recv()
                    frame_count += 1
                print(f"✅ Successfully received {frame_count} video frames over WebRTC! (Resolution: {frame.width}x{frame.height})")
            asyncio.ensure_future(read_frames())

    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    async with aiohttp.ClientSession() as session:
        async with session.post('http://localhost:8010/offer', json={
            'sdp': pc.localDescription.sdp,
            'type': pc.localDescription.type,
            'figureId': 'kim-koo'
        }) as resp:
            answer_data = await resp.json()

    await pc.setRemoteDescription(RTCSessionDescription(
        sdp=answer_data['sdp'],
        type=answer_data['type']
    ))

    print("🤝 WebRTC Handshake Complete! Waiting for video stream frames...")
    await asyncio.sleep(2.5)
    await pc.close()
    print("🔌 Test Completed and PeerConnection closed cleanly.")

if __name__ == '__main__':
    asyncio.run(test_webrtc())
