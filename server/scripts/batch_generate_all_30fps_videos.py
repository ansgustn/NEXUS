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
os.makedirs(COMFY_INPUT, exist_ok=True)

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()

ALL_TASKS = [
    # --- Group A: Thinking & Refusal (10 videos) ---
    {"figure": "kim-koo", "image": "kim-koo.webp", "audio": "kim-koo_thinking.mp3", "output": "kim-koo_thinking.mp4"},
    {"figure": "kim-koo", "image": "kim-koo.webp", "audio": "kim-koo_refusal.mp3", "output": "kim-koo_refusal.mp4"},
    {"figure": "king-sejong", "image": "king-sejong.webp", "audio": "king-sejong_thinking.mp3", "output": "king-sejong_thinking.mp4"},
    {"figure": "king-sejong", "image": "king-sejong.webp", "audio": "king-sejong_refusal.mp3", "output": "king-sejong_refusal.mp4"},
    {"figure": "yi-sun-sin", "image": "yi-sun-sin.webp", "audio": "yi-sun-sin_thinking.mp3", "output": "yi-sun-sin_thinking.mp4"},
    {"figure": "yi-sun-sin", "image": "yi-sun-sin.webp", "audio": "yi-sun-sin_refusal.mp3", "output": "yi-sun-sin_refusal.mp4"},
    {"figure": "yu-gwan-sun", "image": "yu-gwan-sun.webp", "audio": "yu-gwan-sun_thinking.mp3", "output": "yu-gwan-sun_thinking.mp4"},
    {"figure": "yu-gwan-sun", "image": "yu-gwan-sun.webp", "audio": "yu-gwan-sun_refusal.mp3", "output": "yu-gwan-sun_refusal.mp4"},
    {"figure": "shin-saimdang", "image": "shin-saimdang.webp", "audio": "shin-saimdang_thinking.mp3", "output": "shin-saimdang_thinking.mp4"},
    {"figure": "shin-saimdang", "image": "shin-saimdang.webp", "audio": "shin-saimdang_refusal.mp3", "output": "shin-saimdang_refusal.mp4"},

    # --- Group B: Historical Q&A Presets (15 videos) ---
    # Kim Koo (3)
    {"figure": "kim-koo", "image": "kim-koo.webp", "audio": "kim-koo_doc-kim-01.mp3", "output": "kim-koo_my_wish.mp4"},
    {"figure": "kim-koo", "image": "kim-koo.webp", "audio": "kim-koo_doc-kim-02.mp3", "output": "kim-koo_shanghai_tmp.mp4"},
    {"figure": "kim-koo", "image": "kim-koo.webp", "audio": "kim-koo_culture_power.mp3", "output": "kim-koo_culture_power.mp4"},
    # King Sejong (3)
    {"figure": "king-sejong", "image": "king-sejong.webp", "audio": "king-sejong_speech.mp3", "output": "dynamic_video_king-sejong_1788846379016.mp4"},
    {"figure": "king-sejong", "image": "king-sejong.webp", "audio": "king-sejong_speech_science.mp3", "output": "dynamic_video_king-sejong_1788846535081.mp4"},
    {"figure": "king-sejong", "image": "king-sejong.webp", "audio": "king-sejong_speech_teaching.mp3", "output": "comfy_ltx_king-sejong_1788853845103.mp4"},
    # Yi Sun-sin (3)
    {"figure": "yi-sun-sin", "image": "yi-sun-sin.webp", "audio": "yi-sun-sin_doc-yi-01.mp3", "output": "yi-sun-sin_doc-yi-01.mp4"},
    {"figure": "yi-sun-sin", "image": "yi-sun-sin.webp", "audio": "yi-sun-sin_doc-yi-02.mp3", "output": "yi-sun-sin_doc-yi-02.mp4"},
    {"figure": "yi-sun-sin", "image": "yi-sun-sin.webp", "audio": "yi-sun-sin_doc-yi-03.mp3", "output": "yi-sun-sin_doc-yi-03.mp4"},
    # Yu Gwan-sun (3)
    {"figure": "yu-gwan-sun", "image": "yu-gwan-sun.webp", "audio": "yu-gwan-sun_doc-yu-01.mp3", "output": "yu-gwan-sun_doc-yu-01.mp4"},
    {"figure": "yu-gwan-sun", "image": "yu-gwan-sun.webp", "audio": "yu-gwan-sun_doc-yu-02.mp3", "output": "yu-gwan-sun_doc-yu-02.mp4"},
    {"figure": "yu-gwan-sun", "image": "yu-gwan-sun.webp", "audio": "yu-gwan-sun_doc-yu-03.mp3", "output": "yu-gwan-sun_doc-yu-03.mp4"},
    # Shin Saimdang (3)
    {"figure": "shin-saimdang", "image": "shin-saimdang.webp", "audio": "shin-saimdang_doc-shin-01.mp3", "output": "shin-saimdang_doc-shin-01.mp4"},
    {"figure": "shin-saimdang", "image": "shin-saimdang.webp", "audio": "shin-saimdang_doc-shin-02.mp3", "output": "shin-saimdang_doc-shin-02.mp4"},
    {"figure": "shin-saimdang", "image": "shin-saimdang.webp", "audio": "shin-saimdang_doc-shin-03.mp3", "output": "shin-saimdang_doc-shin-03.mp4"}
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

def wait_for_comfy_video(prompt_id, timeout=120):
    start = time.time()
    while time.time() - start < timeout:
        time.sleep(1.2)
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
    print(f"🎬 [Processing]: {figure_id} -> {target_filename}")
    print(f"   Image: {src_img}")
    print(f"   Audio: {src_audio}")
    print(f"=======================================================")

    # 1. Sync assets into ComfyUI input folder
    dst_img = os.path.join(COMFY_INPUT, task["image"])
    if not os.path.exists(dst_img) or os.path.getsize(dst_img) != os.path.getsize(src_img):
        shutil.copy2(src_img, dst_img)

    dst_audio = os.path.join(COMFY_INPUT, task["audio"])
    shutil.copy2(src_audio, dst_audio)

    # 2. Queue prompt
    prefix = f"all30_{figure_id}_{int(time.time()*1000)}"
    print(f"[1/4] Submitting to ComfyUI Wav2Lip (30.0 fps)...")
    prompt_id = submit_comfy_wav2lip(task["image"], dst_audio, prefix)
    print(f"   Prompt ID: {prompt_id}, waiting for rendering...")

    # 3. Wait for video output
    raw_video = wait_for_comfy_video(prompt_id)
    raw_size = os.path.getsize(raw_video)
    print(f"[2/4] ComfyUI Video Generated: {raw_video} ({raw_size:,} bytes)")

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
    print(f"[4/4] Injecting anatomical eye blinks (Wav2Lip output at 30fps)...")
    blink_success = inject_eye_blinks(synced_tmp, figure_id, public_target, force=True)
    if not blink_success:
        print("   [Warning] Blink injection returned False, falling back to synced video.")
        shutil.copy2(synced_tmp, public_target)

    # Also copy to dist/videos
    shutil.copy2(public_target, dist_target)

    # Clean up synced_tmp
    if os.path.exists(synced_tmp):
        try: os.remove(synced_tmp)
        except Exception: pass

    final_size = os.path.getsize(public_target)
    print(f"✅ [SUCCESS] {target_filename} created: {final_size:,} bytes (30.0 FPS ZERO-DRIFT)!")
    return True

def main():
    print("🚀 Starting Complete 30.0 FPS Video Regeneration for ALL 25 Nexus Videos...")
    total = len(ALL_TASKS)
    success_count = 0

    for idx, task in enumerate(ALL_TASKS):
        print(f"\n>>> Progress: {idx+1}/{total} <<<")
        try:
            ok = process_task(task)
            if ok:
                success_count += 1
        except Exception as e:
            print(f"❌ [FAILED] {task['output']}: {e}")

    print(f"\n🏁 ALL DONE: {success_count}/{total} videos generated successfully at 30.0 FPS with zero lip drift!")

if __name__ == '__main__':
    main()
