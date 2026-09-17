import os
import sys

sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.stderr.reconfigure(encoding='utf-8', line_buffering=True)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json
import asyncio
import io
import time
import numpy as np
import torch
import av
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer
from avatar_stream_tracks import AvatarVideoStreamTrack, AvatarAudioStreamTrack

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, '../..'))
FIGURES_PATH = os.path.join(PROJECT_ROOT, 'server/data/figures.json')
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'client/public')

# Load figures metadata
figures_map = {}
if os.path.exists(FIGURES_PATH):
    with open(FIGURES_PATH, 'r', encoding='utf-8') as f:
        fig_list = json.load(f)
        for fig in fig_list:
            fig_id = fig['id']
            # Find local portrait image
            img_rel = fig.get('portraitUrl', '').lstrip('/')
            img_abs = os.path.join(PUBLIC_DIR, img_rel)
            if not os.path.exists(img_abs):
                # Fallback to jpg or png if webp not directly matched
                candidate = os.path.join(PUBLIC_DIR, f"images/{fig_id}.webp")
                if os.path.exists(candidate):
                    img_abs = candidate

            # Normalize mouth coordinates: 0.0 top to 1.0 bottom -> map to -1.0 to 1.0
            ratio_y = fig.get('mouthCenterRatioY', 0.45)
            ratio_x = fig.get('mouthCenterRatioX', 0.50)
            norm_cy = (ratio_y - 0.5) * 2.0 # range approx -0.5 to 0.5
            norm_cx = (ratio_x - 0.5) * 2.0

            # Normalize eye coordinates [-1.0, 1.0]
            l_ex = (fig.get('leftEyeRatioX', 0.45) - 0.5) * 2.0
            l_ey = (fig.get('leftEyeRatioY', 0.30) - 0.5) * 2.0
            r_ex = (fig.get('rightEyeRatioX', 0.55) - 0.5) * 2.0
            r_ey = (fig.get('rightEyeRatioY', 0.30) - 0.5) * 2.0
            eye_scale = fig.get('eyeScaleRatio', 0.04) * 2.0
            blink_str = fig.get('blinkStrength', 0.018)

            figures_map[fig_id] = {
                'id': fig_id,
                'name': fig.get('name', fig_id),
                'image_path': img_abs,
                'mouth_cy': norm_cy,
                'mouth_cx': norm_cx,
                'mouth_scale': fig.get('mouthScaleRatio', 0.05) * 2.0,
                'left_eye': (l_ex, l_ey),
                'right_eye': (r_ex, r_ey),
                'eye_scale': eye_scale,
                'blink_strength': blink_str,
                'voiceProfile': fig.get('voiceProfile', {})
            }

print(f"[WebRTC Server] Loaded {len(figures_map)} historical figures from database.")

# Global state for peer connections and active tracks
pcs = set()
active_video_tracks = []
active_audio_tracks = []

current_figure_id = 'kim-koo'
if 'kim-koo' not in figures_map and figures_map:
    current_figure_id = list(figures_map.keys())[0]

async def synthesize_speech_edge_tts(text, voice_name="ko-KR-InJoonNeural", pitch="-15Hz", rate="-5%"):
    """
    Synthesize high quality TTS audio into 48kHz int16 PCM array using edge-tts.
    """
    import edge_tts
    communicate = edge_tts.Communicate(text, voice=voice_name, pitch=pitch, rate=rate)
    
    mp3_bytes = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            mp3_bytes.write(chunk["data"])
    
    mp3_bytes.seek(0)

    # Decode MP3 to 48kHz mono PCM using PyAV
    container = av.open(mp3_bytes, format='mp3')
    resampler = av.AudioResampler(format='s16', layout='mono', rate=48000)

    pcm_frames = []
    for frame in container.decode(audio=0):
        resampled_frames = resampler.resample(frame)
        for rf in resampled_frames:
            pcm_frames.append(rf.to_ndarray().flatten())

    if not pcm_frames:
        return np.zeros(48000, dtype=np.int16)

    pcm_int16 = np.concatenate(pcm_frames).astype(np.int16)
    return pcm_int16


# --- HTTP Handler Endpoints ---

async def handle_health(request):
    cuda_avail = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if cuda_avail else "CPU Only"
    vram_alloc = torch.cuda.memory_allocated(0) / (1024**2) if cuda_avail else 0.0
    return web.json_response({
        "status": "online",
        "service": "NEXUS Open-Source Local GPU WebRTC Engine",
        "device": gpu_name,
        "cuda": cuda_avail,
        "vram_mb": round(vram_alloc, 1),
        "active_peers": len(pcs),
        "current_figure": current_figure_id
    })


async def handle_offer(request):
    """
    WebRTC Signaling: Handle browser SDP offer and respond with SDP answer.
    """
    try:
        params = await request.json()
    except Exception:
        try:
            raw = await request.text()
            params = json.loads(raw)
        except Exception:
            params = {}

    offer = RTCSessionDescription(sdp=params.get("sdp", ""), type=params.get("type", "offer"))
    req_figure_id = params.get("figureId", current_figure_id)

    # WebRTC Peer Connection
    pc = RTCPeerConnection()
    pcs.add(pc)

    print(f"[SIGNALING] New PeerConnection requested for figure '{req_figure_id}'")

    # Create video and audio stream tracks
    video_track = AvatarVideoStreamTrack(figures_map, initial_figure_id=req_figure_id, fps=25)
    audio_track = AvatarAudioStreamTrack(sample_rate=48000, frame_duration_ms=20)

    pc.addTrack(video_track)
    pc.addTrack(audio_track)

    active_video_tracks.append(video_track)
    active_audio_tracks.append(audio_track)

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        print(f"[STATE] Connection state changed: {pc.connectionState}")
        if pc.connectionState in ["failed", "closed"]:
            await pc.close()
            pcs.discard(pc)
            if video_track in active_video_tracks:
                active_video_tracks.remove(video_track)
            if audio_track in active_audio_tracks:
                active_audio_tracks.remove(audio_track)
            print(f"[CLEANUP] Peer removed. Remaining: {len(pcs)}")

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.json_response({
        "sdp": pc.localDescription.sdp,
        "type": pc.localDescription.type
    })


async def handle_speak(request):
    """
    Trigger speech & lip-sync for active WebRTC stream tracks.
    """
    try:
        body = await request.json()
    except Exception:
        try:
            raw = await request.text()
            body = json.loads(raw)
        except Exception:
            body = {}

    text = body.get("text", "").strip()
    fig_id = body.get("figureId", current_figure_id)
    voice_info = body.get("voiceProfile", {})

    if not text:
        return web.json_response({"success": False, "error": "Text is empty"}, status=400)

    # Select voice params
    fig_meta = figures_map.get(fig_id, {})
    default_vp = fig_meta.get("voiceProfile", {})

    voice_name = voice_info.get("voiceName") or default_vp.get("voiceName") or "ko-KR-InJoonNeural"
    pitch = voice_info.get("pitch") or default_vp.get("pitch") or "+0Hz"
    rate = voice_info.get("rate") or default_vp.get("rate") or "+0%"

    print(f"[SPEAK] Synthesizing speech for '{fig_id}': \"{text[:30]}...\" (Voice: {voice_name})")

    start_t = time.time()
    try:
        pcm_audio = await synthesize_speech_edge_tts(text, voice_name=voice_name, pitch=pitch, rate=rate)
    except Exception as e:
        print(f"[Edge TTS Error]: {e}, falling back to silence")
        pcm_audio = np.zeros(48000 * 2, dtype=np.int16)

    duration_sec = len(pcm_audio) / 48000.0
    synth_time = time.time() - start_t
    print(f"[AUDIO READY] Duration: {duration_sec:.2f}s (Synth took {synth_time:.3f}s)")

    # Compute per-video-frame RMS energy (25 fps = 1920 audio samples per frame at 48kHz)
    frame_step = int(48000 / 25) # 1920
    energy_list = []
    
    # Normalize audio
    audio_float = pcm_audio.astype(np.float32) / 32768.0
    for i in range(0, len(audio_float), frame_step):
        chunk = audio_float[i:i + frame_step]
        if len(chunk) == 0:
            energy_list.append(0.0)
            continue
        # RMS amplitude
        rms = np.sqrt(np.mean(chunk ** 2))
        # Non-linear boost for clearer mouth movements
        norm_energy = float(np.clip(rms * 4.5, 0.0, 1.0))
        energy_list.append(norm_energy)

    # Enqueue to all active audio and video tracks
    for a_track in active_audio_tracks:
        a_track.queue_audio_pcm(pcm_audio)

    for v_track in active_video_tracks:
        v_track.queue_audio_energy(energy_list)

    return web.json_response({
        "success": True,
        "duration": duration_sec,
        "frames": len(energy_list),
        "synth_time": round(synth_time, 3),
        "active_peers": len(pcs)
    })


async def handle_switch_figure(request):
    """Switch active figure portrait."""
    global current_figure_id
    try:
        body = await request.json()
    except Exception:
        body = {}
    fig_id = body.get("figureId")
    if fig_id in figures_map:
        current_figure_id = fig_id
        for v_track in active_video_tracks:
            v_track.load_figure(fig_id)
        print(f"[FIGURE SWITCH] Switched to figure: {fig_id}")
        return web.json_response({"success": True, "figureId": fig_id})
    return web.json_response({"success": False, "error": "Figure not found"}, status=404)


async def on_shutdown(app):
    print("[SHUTDOWN] [WebRTC Server] Closing peer connections...")
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()


# CORS middleware to allow cross-origin requests from Vite (5173), Express (3001), etc.
@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        response = web.Response(status=200)
    else:
        try:
            response = await handler(request)
        except web.HTTPException as ex:
            response = ex
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept"
    return response


def create_app():
    app = web.Application(middlewares=[cors_middleware])
    app.on_shutdown.append(on_shutdown)

    # Add routes
    app.router.add_get("/health", handle_health)
    app.router.add_post("/offer", handle_offer)
    app.router.add_post("/speak", handle_speak)
    app.router.add_post("/figure", handle_switch_figure)

    return app


def free_port_if_in_use(port):
    """Automatically terminate any old zombie process holding the port."""
    try:
        import subprocess
        cmd = f'netstat -ano | findstr :{port}'
        out = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL)
        for line in out.strip().splitlines():
            if 'LISTENING' in line:
                parts = line.strip().split()
                if len(parts) >= 5:
                    pid = int(parts[-1])
                    if pid != os.getpid() and pid > 0:
                        print(f"[PORT AUTO-CLEANUP] Freeing port {port} held by previous process (PID: {pid})...")
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        time.sleep(0.5)
    except Exception:
        pass


if __name__ == "__main__":
    port = int(os.environ.get("WEBRTC_PORT", 8010))
    free_port_if_in_use(port)

    print("=" * 65)
    print(f"[START] NEXUS Local GPU WebRTC Real-Time Avatar Server on port {port}")
    print(f" - CUDA Available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f" - GPU: {torch.cuda.get_device_name(0)}")
    print(f" - WebRTC Offer Endpoint: http://localhost:{port}/offer")
    print(f" - Speech Trigger Endpoint: http://localhost:{port}/speak")
    print("=" * 65)

    app = create_app()
    web.run_app(app, host="0.0.0.0", port=port)

