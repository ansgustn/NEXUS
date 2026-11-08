import os
import sys
import json
import time
import shutil
import argparse
import urllib.request
import urllib.parse
import subprocess
import imageio_ffmpeg

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inject_blinks_to_video import inject_eye_blinks

COMFY_HOST = os.environ.get("COMFYUI_URL", "http://20.30.22.101:8188")
COMFY_DIR = r"C:\Users\user\Desktop\ComfyUI_windows_portable\ComfyUI"
COMFY_INPUT = os.path.join(COMFY_DIR, "input")
COMFY_OUTPUT = os.path.join(COMFY_DIR, "output")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CLIENT_PUBLIC_VIDEOS = os.path.join(ROOT_DIR, "client", "public", "videos")
CLIENT_PUBLIC_AUDIO = os.path.join(ROOT_DIR, "client", "public", "audio")
CLIENT_PUBLIC_IMAGES = os.path.join(ROOT_DIR, "client", "public", "images")
CLIENT_DIST_VIDEOS = os.path.join(ROOT_DIR, "client", "dist", "videos")

os.makedirs(CLIENT_PUBLIC_VIDEOS, exist_ok=True)
os.makedirs(CLIENT_DIST_VIDEOS, exist_ok=True)
os.makedirs(COMFY_INPUT, exist_ok=True)
os.makedirs(COMFY_OUTPUT, exist_ok=True)

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()


def build_all_tasks():
    tasks = []
    figures = ["kim-koo", "king-sejong", "yi-sun-sin", "yu-gwan-sun", "shin-saimdang"]

    # 1. Thinking & Refusal (10 videos)
    for fig in figures:
        tasks.append({
            "id": f"{fig}_thinking",
            "figure": fig,
            "image": f"{fig}.webp",
            "audio": f"{fig}_thinking.mp3",
            "output": f"{fig}_thinking.mp4"
        })
        tasks.append({
            "id": f"{fig}_refusal",
            "figure": fig,
            "image": f"{fig}.webp",
            "audio": f"{fig}_refusal.mp3",
            "output": f"{fig}_refusal.mp4"
        })

    # 2. All 32 Historical Q&A Presets from historical_docs.json
    docs_path = os.path.join(ROOT_DIR, "server", "data", "historical_docs.json")
    with open(docs_path, encoding="utf-8") as f:
        docs = json.load(f)

    for doc in docs:
        fig = doc["figureId"]
        audio_rel = doc.get("audioUrl", "")
        video_rel = doc.get("videoUrl", "")
        if not audio_rel or not video_rel:
            continue
        tasks.append({
            "id": doc["id"],
            "figure": fig,
            "image": f"{fig}.webp",
            "audio": os.path.basename(audio_rel),
            "output": os.path.basename(video_rel)
        })

    return tasks


def upload_to_comfyui(local_path, filename=None):
    """Upload image or audio file to remote ComfyUI server via HTTP multipart POST /upload/image."""
    if not filename:
        filename = os.path.basename(local_path)
    boundary = f"----NexusComfyBoundary{int(time.time()*1000)}"
    with open(local_path, "rb") as f:
        file_bytes = f.read()

    ext = os.path.splitext(filename)[1].lower()
    mime = "application/octet-stream"
    if ext == ".webp":
        mime = "image/webp"
    elif ext == ".png":
        mime = "image/png"
    elif ext in (".jpg", ".jpeg"):
        mime = "image/jpeg"
    elif ext == ".mp3":
        mime = "audio/mpeg"
    elif ext == ".wav":
        mime = "audio/wav"

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + file_bytes + (
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="overwrite"\r\n\r\n'
        f"true\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")

    req = urllib.request.Request(
        f"{COMFY_HOST}/upload/image",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body))
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        return res_data.get("name", filename)


def submit_comfy_latentsync(image_name, audio_name, prefix):
    """Submit 30.0 FPS ComfyUI Latent Sync-Net (Wav2Lip + VHS_LoadAudioUpload + VHS_VideoCombine) workflow."""
    prompt = {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_name
            }
        },
        "2": {
            "class_type": "VHS_LoadAudioUpload",
            "inputs": {
                "audio": audio_name,
                "start_time": 0,
                "duration": 0
            }
        },
        "3": {
            "class_type": "Wav2Lip",
            "inputs": {
                "mode": "repetitive",
                "face_detect_batch": 16,
                "images": ["1", 0],
                "audio": ["2", 0]
            }
        },
        "4": {
            "class_type": "VHS_VideoCombine",
            "inputs": {
                "frame_rate": 30.0,
                "loop_count": 0,
                "filename_prefix": prefix,
                "format": "video/h264-mp4",
                "pingpong": False,
                "save_output": True,
                "pix_fmt": "yuv420p",
                "crf": 19,
                "trim_to_audio": True,
                "save_metadata": True,
                "images": ["3", 0],
                "audio": ["3", 1]
            }
        }
    }

    req_data = json.dumps({"prompt": prompt}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFY_HOST}/prompt",
        data=req_data,
        headers={"Content-Type": "application/json"}
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        res_json = json.loads(resp.read().decode("utf-8"))
        return res_json["prompt_id"]


def wait_for_comfy_video(prompt_id, prefix, timeout=180):
    start = time.time()
    while time.time() - start < timeout:
        time.sleep(1.0)
        h_url = f"{COMFY_HOST}/history/{prompt_id}"
        try:
            with urllib.request.urlopen(h_url, timeout=10) as h_resp:
                h_data = json.loads(h_resp.read().decode("utf-8"))
                if prompt_id in h_data:
                    hist = h_data[prompt_id]
                    status = hist.get("status", {})
                    if status.get("status_str") == "error":
                        raise RuntimeError(f"ComfyUI Error: {status.get('messages')}")
                    outputs = hist.get("outputs", {})
                    for node_id, node_out in outputs.items():
                        items = node_out.get("gifs") or node_out.get("videos")
                        if items and len(items) > 0:
                            item = items[0]
                            filename = item["filename"]
                            subfolder = item.get("subfolder", "")
                            ftype = item.get("type", "output")

                            # 1. Check local disk first
                            local_candidate = os.path.join(COMFY_OUTPUT, subfolder, filename)
                            if os.path.exists(local_candidate) and os.path.getsize(local_candidate) > 10000:
                                return local_candidate

                            # 2. Download over HTTP from remote ComfyUI server
                            q = urllib.parse.urlencode({
                                "filename": filename,
                                "subfolder": subfolder,
                                "type": ftype
                            })
                            view_url = f"{COMFY_HOST}/view?{q}"
                            dl_path = os.path.join(COMFY_OUTPUT, f"{prefix}_raw.mp4")
                            with urllib.request.urlopen(view_url, timeout=30) as v_resp:
                                data = v_resp.read()
                                if len(data) > 10000:
                                    with open(dl_path, "wb") as out_f:
                                        out_f.write(data)
                                    return dl_path
        except Exception as e:
            if "ComfyUI Error" in str(e):
                raise
            pass
    raise TimeoutError(f"ComfyUI rendering timed out for prompt {prompt_id}")


def process_task(task):
    figure_id = task["figure"]
    target_filename = task["output"]
    public_target = os.path.join(CLIENT_PUBLIC_VIDEOS, target_filename)
    dist_target = os.path.join(CLIENT_DIST_VIDEOS, target_filename)

    src_img = os.path.join(CLIENT_PUBLIC_IMAGES, task["image"])
    src_audio = os.path.join(CLIENT_PUBLIC_AUDIO, task["audio"])

    if not os.path.exists(src_img):
        print(f"[ERROR] Image missing: {src_img}")
        return False
    if not os.path.exists(src_audio):
        print(f"[ERROR] Audio missing: {src_audio}")
        return False

    print(f"\n=======================================================")
    print(f"🎬 [LatentSync 30fps]: {figure_id} ({task['id']}) -> {target_filename}")
    print(f"   Image: {task['image']} | Audio: {task['audio']}")
    print(f"=======================================================")

    # 1. Upload image and audio to ComfyUI server (remote HTTP + local fallback)
    uploaded_img = upload_to_comfyui(src_img, task["image"])
    uploaded_audio = upload_to_comfyui(src_audio, task["audio"])

    # 2. Queue prompt
    prefix = f"lsync30_{figure_id}_{int(time.time()*1000)}"
    t0 = time.time()
    print(f"[1/4] Submitting to ComfyUI Latent Sync-Net (30.0 fps)...")
    prompt_id = submit_comfy_latentsync(uploaded_img, uploaded_audio, prefix)
    print(f"   Prompt ID: {prompt_id}, waiting for rendering...")

    # 3. Wait for video output
    raw_video = wait_for_comfy_video(prompt_id, prefix)
    raw_size = os.path.getsize(raw_video)
    elapsed = time.time() - t0
    print(f"[2/4] ComfyUI Video Generated in {elapsed:.1f}s: {raw_video} ({raw_size:,} bytes)")

    # 4. Remux with original audio locked with -shortest and 30fps
    synced_tmp = os.path.join(COMFY_OUTPUT, f"{prefix}_synced.mp4")
    cmd_sync = [
        FFMPEG_EXE, "-y",
        "-i", raw_video,
        "-i", src_audio,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        synced_tmp
    ]
    subprocess.run(cmd_sync, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print(f"[3/4] Audio sync locked with -shortest: {synced_tmp}")

    # 5. Inject calm biological eye blinks at 30.0 fps
    print(f"[4/4] Injecting anatomical eye blinks (CUDA tensor grid at 30fps)...")
    blink_success = inject_eye_blinks(synced_tmp, figure_id, public_target, force=True)
    if not blink_success:
        print("   [Warning] Blink injection returned False, falling back to synced video.")
        shutil.copy2(synced_tmp, public_target)

    # Also copy to dist/videos
    shutil.copy2(public_target, dist_target)

    # If this is doc-sejong-01 or doc-yi-01, also update {figure_id}_talking_avatar.mp4
    if task["id"] in ("doc-sejong-01", "doc-yi-01", "doc-kim-01", "doc-yu-01", "doc-shin-01"):
        avatar_vid = os.path.join(CLIENT_PUBLIC_VIDEOS, f"{figure_id}_talking_avatar.mp4")
        dist_avatar_vid = os.path.join(CLIENT_DIST_VIDEOS, f"{figure_id}_talking_avatar.mp4")
        shutil.copy2(public_target, avatar_vid)
        shutil.copy2(public_target, dist_avatar_vid)

    # Clean up temp files
    for tmp_f in (raw_video, synced_tmp):
        if os.path.exists(tmp_f) and "_raw.mp4" in tmp_f or "_synced.mp4" in tmp_f:
            try:
                os.remove(tmp_f)
            except Exception:
                pass

    final_size = os.path.getsize(public_target)
    print(f"✅ [SUCCESS] {target_filename} created: {final_size:,} bytes (30.0 FPS ZERO-DRIFT)!")
    return True


def main():
    parser = argparse.ArgumentParser(description="Batch ComfyUI LatentSync 30FPS Video Generator")
    parser.add_argument("--figure", nargs="*", help="Filter by figureId(s), e.g. king-sejong yi-sun-sin")
    parser.add_argument("--id", nargs="*", help="Filter by specific task id(s), e.g. doc-sejong-01 doc-yi-01")
    args = parser.parse_args()

    all_tasks = build_all_tasks()
    if args.figure:
        all_tasks = [t for t in all_tasks if t["figure"] in args.figure]
    if args.id:
        all_tasks = [t for t in all_tasks if t["id"] in args.id]

    total = len(all_tasks)
    print(f"🚀 Starting ComfyUI Latent Sync-Net 30.0 FPS Video Generation ({total} tasks)...")
    success_count = 0

    for idx, task in enumerate(all_tasks):
        print(f"\n>>> Progress: {idx+1}/{total} <<<")
        try:
            ok = process_task(task)
            if ok:
                success_count += 1
        except Exception as e:
            print(f"❌ [FAILED] {task['output']}: {e}")

    print(f"\n🏁 ALL DONE: {success_count}/{total} videos generated successfully at 30.0 FPS!")


if __name__ == "__main__":
    main()
