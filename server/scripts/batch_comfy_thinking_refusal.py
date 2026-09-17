import os
import sys
import json
import time
import shutil
import urllib.request
import subprocess
import imageio_ffmpeg

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inject_blinks_to_video import inject_eye_blinks

COMFY_HOST = "http://127.0.0.1:8188"
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

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()

FIGURES = [
    "kim-koo",
    "king-sejong",
    "yi-sun-sin",
    "yu-gwan-sun",
    "shin-saimdang"
]

CATEGORIES = [
    "thinking",
    "refusal"
]

def submit_comfy_wav2lip(image_name, audio_abs_path, prefix):
    prompt = {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_name
            }
        },
        "2": {
            "class_type": "VHS_LoadAudio",
            "inputs": {
                "audio_file": audio_abs_path.replace("\\", "/"),
                "seek_seconds": 0,
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

    req_data = json.dumps({"prompt": prompt}).encode('utf-8')
    req = urllib.request.Request(f"{COMFY_HOST}/prompt", data=req_data, headers={'Content-Type': 'application/json'})

    with urllib.request.urlopen(req) as resp:
        res_json = json.loads(resp.read().decode('utf-8'))
        return res_json['prompt_id']

def wait_for_comfy_video(prompt_id, timeout=90):
    start = time.time()
    while time.time() - start < timeout:
        time.sleep(1.5)
        h_url = f"{COMFY_HOST}/history/{prompt_id}"
        try:
            with urllib.request.urlopen(h_url) as h_resp:
                h_data = json.loads(h_resp.read().decode('utf-8'))
                if prompt_id in h_data:
                    hist = h_data[prompt_id]
                    status = hist.get("status", {})
                    if status.get("status_str") == "error":
                        raise RuntimeError(f"ComfyUI Error: {status.get('messages')}")
                    outputs = hist.get("outputs", {})
                    for node_id, node_out in outputs.items():
                        items = node_out.get("gifs") or node_out.get("videos")
                        if items and len(items) > 0:
                            filename = items[0]['filename']
                            full_path = os.path.join(COMFY_OUTPUT, filename)
                            if os.path.exists(full_path) and os.path.getsize(full_path) > 10000:
                                return full_path
        except Exception as e:
            if "ComfyUI Error" in str(e):
                raise
            # Connection glitch or still rendering, continue polling
            pass
    raise TimeoutError(f"ComfyUI rendering timed out for prompt {prompt_id}")

def process_figure_category(figure_id, category):
    target_filename = f"{figure_id}_{category}.mp4"
    public_target = os.path.join(CLIENT_PUBLIC_VIDEOS, target_filename)
    dist_target = os.path.join(CLIENT_DIST_VIDEOS, target_filename)

    src_img = os.path.join(CLIENT_PUBLIC_IMAGES, f"{figure_id}.webp")
    src_audio = os.path.join(CLIENT_PUBLIC_AUDIO, f"{figure_id}_{category}.mp3")

    if not os.path.exists(src_img):
        print(f"[ERROR] Image missing: {src_img}")
        return False
    if not os.path.exists(src_audio):
        print(f"[ERROR] Audio missing: {src_audio}")
        return False

    print(f"\n=======================================================")
    print(f"🎬 [Processing]: {figure_id} -> {category.upper()}")
    print(f"   Image: {src_img}")
    print(f"   Audio: {src_audio}")
    print(f"=======================================================")

    # 1. Ensure assets copied to ComfyUI input
    comfy_img_name = f"{figure_id}.webp"
    comfy_audio_name = f"{figure_id}_{category}.mp3"
    comfy_img_path = os.path.join(COMFY_INPUT, comfy_img_name)
    comfy_audio_path = os.path.join(COMFY_INPUT, comfy_audio_name)

    shutil.copy2(src_img, comfy_img_path)
    shutil.copy2(src_audio, comfy_audio_path)

    # 2. Submit prompt to ComfyUI
    prefix = f"gen_{figure_id}_{category}"
    print(f"[1/4] Submitting to ComfyUI Wav2Lip...")
    prompt_id = submit_comfy_wav2lip(comfy_img_name, comfy_audio_path, prefix)
    print(f"   Prompt ID: {prompt_id}, waiting for rendering...")

    # 3. Wait for generated video
    raw_video = wait_for_comfy_video(prompt_id)
    print(f"[2/4] ComfyUI Video Generated: {raw_video} ({os.path.getsize(raw_video):,} bytes)")

    # 4. Precision Lip-Sync Lock with original audio using FFmpeg
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

    # 5. Inject calm biological eye blinks
    print(f"[4/4] Injecting anatomical eye blinks (Wav2Lip output)...")
    blink_success = inject_eye_blinks(synced_tmp, figure_id, public_target, force=True)
    if not blink_success:
        print("   [Warning] Blink injection returned False, falling back to synced video.")
        shutil.copy2(synced_tmp, public_target)

    # Also copy to dist/videos for production build
    shutil.copy2(public_target, dist_target)

    # Clean up synced_tmp
    if os.path.exists(synced_tmp):
        try: os.remove(synced_tmp)
        except Exception: pass

    final_size = os.path.getsize(public_target)
    print(f"✅ [SUCCESS] {target_filename} created: {final_size:,} bytes!")
    return True

def main():
    print("🚀 Starting Batch ComfyUI Wav2Lip + Blink Injection for Thinking & Refusal Videos...")
    total = len(FIGURES) * len(CATEGORIES)
    count = 0
    success_count = 0

    for figure_id in FIGURES:
        for category in CATEGORIES:
            count += 1
            print(f"\n>>> Progress: {count}/{total} <<<")
            try:
                ok = process_figure_category(figure_id, category)
                if ok:
                    success_count += 1
            except Exception as e:
                print(f"❌ [FAILED] {figure_id}_{category}: {e}")

    print(f"\n🏁 ALL DONE: {success_count}/{total} videos generated successfully with genuine ComfyUI Wav2Lip & blinks!")

if __name__ == '__main__':
    main()
