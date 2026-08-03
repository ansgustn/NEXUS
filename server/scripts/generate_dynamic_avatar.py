import sys
import os
import asyncio
import subprocess
import shutil
import uuid
import edge_tts

# Paths
BASE_DIR = r"c:\Users\user\Desktop\넥서스"
PUBLIC_IMAGES = os.path.join(BASE_DIR, "client", "public", "images")
PUBLIC_AUDIO = os.path.join(BASE_DIR, "client", "public", "audio")
PUBLIC_VIDEOS = os.path.join(BASE_DIR, "client", "public", "videos")
SADTALKER_DIR = os.path.join(BASE_DIR, "SadTalker")
FFMPEG_EXE = r"C:\Users\user\AppData\Roaming\Python\Python311\site-packages\static_ffmpeg\bin\win32\ffmpeg.exe"
PYTHON_311 = r"C:\Users\user\AppData\Local\Programs\Python\Python311\python.exe"

os.makedirs(PUBLIC_AUDIO, exist_ok=True)
os.makedirs(PUBLIC_VIDEOS, exist_ok=True)

async def generate_tts(text, audio_path, pitch="-16Hz", rate="-12%"):
    """Generate high-quality Korean TTS using edge-tts"""
    communicate = edge_tts.Communicate(
        text=text,
        voice="ko-KR-InJoonNeural",
        pitch=pitch,
        rate=rate
    )
    await communicate.save(audio_path)
    print(f"[TTS Success] Saved audio to: {audio_path}")

def generate_dynamic_lip_sync(figure_id, text, output_video_filename):
    session_id = str(uuid.uuid4())[:8]
    temp_audio_path = os.path.join(PUBLIC_AUDIO, f"temp_{figure_id}_{session_id}.mp3")
    
    # Figure portrait mapping
    portrait_map = {
        "king-sejong": os.path.join(PUBLIC_IMAGES, "king-sejong.webp"),
        "kim-koo": os.path.join(PUBLIC_IMAGES, "kim-koo.webp"),
        "yi-sun-sin": os.path.join(PUBLIC_IMAGES, "yi-sun-sin.webp")
    }
    
    portrait_path = portrait_map.get(figure_id, os.path.join(PUBLIC_IMAGES, "king-sejong.webp"))
    if not os.path.exists(portrait_path):
        print(f"Error: Portrait not found: {portrait_path}")
        return False

    # Step 1: TTS Generation
    print(f"Step 1: Synthesizing TTS Audio for '{text[:20]}...'")
    asyncio.run(generate_tts(text, temp_audio_path))

    # Step 2: SadTalker 3D Lip-Sync on RTX 4050 GPU
    print(f"Step 2: Running SadTalker 3D Lip-Sync Inference on RTX 4050 GPU...")
    temp_res_dir = os.path.join(PUBLIC_VIDEOS, f"temp_res_{session_id}")
    
    cmd = [
        PYTHON_311,
        os.path.join(SADTALKER_DIR, "inference.py"),
        "--source_image", portrait_path,
        "--driven_audio", temp_audio_path,
        "--result_dir", temp_res_dir,
        "--still",
        "--preprocess", "full",
        "--size", "256",
        "--batch_size", "2"
    ]
    
    res = subprocess.run(cmd, cwd=SADTALKER_DIR, capture_output=True, text=True)
    print(f"SadTalker Output:\n{res.stdout}")
    if res.returncode != 0:
        print(f"SadTalker Error:\n{res.stderr}")
    
    # Locate generated MP4
    generated_mp4 = None
    if os.path.exists(temp_res_dir + ".mp4"):
        generated_mp4 = temp_res_dir + ".mp4"
    else:
        # Search inside temp_res_dir
        for root, dirs, files in os.walk(temp_res_dir):
            for f in files:
                if f.endswith(".mp4"):
                    generated_mp4 = os.path.join(root, f)
                    break
    
    if not generated_mp4 or not os.path.exists(generated_mp4):
        print(f"Error: Failed to locate generated MP4 video!")
        return False

    # Step 3: Convert to H.264 + AAC Web Standard
    final_output_path = os.path.join(PUBLIC_VIDEOS, output_video_filename)
    print(f"Step 3: Encoding to Web Standard H.264 + AAC -> {final_output_path}")
    
    convert_cmd = [
        FFMPEG_EXE, "-y",
        "-i", generated_mp4,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        final_output_path
    ]
    
    subprocess.run(convert_cmd, check=True)
    print(f"======================================================================")
    print(f"DYNAMIC AVATAR GENERATION SUCCESSFUL!")
    print(f" -> Output File: {final_output_path}")
    print(f" -> File Size: {os.path.getsize(final_output_path):,} bytes")
    print(f"======================================================================")
    
    # Clean up temp files
    try:
        if os.path.exists(temp_audio_path): os.remove(temp_audio_path)
        if os.path.exists(temp_res_dir): shutil.rmtree(temp_res_dir, ignore_errors=True)
        if os.path.exists(temp_res_dir + ".mp4"): os.remove(temp_res_dir + ".mp4")
    except Exception as e:
        print(f"Cleanup Note: {e}")
        
    return True

if __name__ == "__main__":
    fig_id = sys.argv[1] if len(sys.argv) > 1 else "king-sejong"
    dlg_text = sys.argv[2] if len(sys.argv) > 2 else "훈민정음은 백성을 가엾이 여겨 새로 스물여덟 자를 만든 글자이니라."
    out_name = sys.argv[3] if len(sys.argv) > 3 else "king-sejong_talking_avatar.mp4"
    
    generate_dynamic_lip_sync(fig_id, dlg_text, out_name)
