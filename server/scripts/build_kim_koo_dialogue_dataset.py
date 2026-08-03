import os
import sys
import json
import subprocess
from gtts import gTTS
import imageio_ffmpeg
import cv2

def generate_video_from_image_and_audio(image_path, audio_path, output_mp4_path):
    print(f"[Creating Video] {os.path.basename(output_mp4_path)}...")
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    if not os.path.exists(image_path) or not os.path.exists(audio_path):
        print(f"Error: Missing image ({image_path}) or audio ({audio_path})")
        return False

    base_img = cv2.imread(image_path)
    if base_img is None:
        print(f"Error: Cannot read image {image_path}")
        return False

    target_dim = 720
    base_img = cv2.resize(base_img, (target_dim, target_dim))
    height, width, _ = base_img.shape

    duration = 5.0
    try:
        cmd = [ffmpeg_exe, '-i', audio_path]
        p = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, errors='ignore')
        for line in p.stderr.split('\n'):
            if 'Duration:' in line:
                parts = line.split('Duration:')[1].split(',')[0].strip().split(':')
                duration = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
                break
    except Exception as e:
        print(f"Duration parsing note: {e}")

    fps = 25
    total_frames = max(25, int(duration * fps))

    temp_video = output_mp4_path + ".temp.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_video, fourcc, fps, (width, height))

    for _ in range(total_frames):
        out.write(base_img)

    out.release()

    os.makedirs(os.path.dirname(output_mp4_path), exist_ok=True)
    if os.path.exists(output_mp4_path):
        try:
            os.remove(output_mp4_path)
        except:
            pass

    cmd = [
        ffmpeg_exe, '-y',
        '-i', temp_video,
        '-i', audio_path,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        output_mp4_path
    ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if os.path.exists(temp_video):
        try:
            os.remove(temp_video)
        except:
            pass

    if os.path.exists(output_mp4_path):
        print(f"SUCCESS: {output_mp4_path} ({os.path.getsize(output_mp4_path)} bytes)")
        return True
    else:
        print(f"FAILED: {output_mp4_path}")
        return False

def main():
    base_dir = "c:/Users/301/Desktop/NEXUS-master/NEXUS-master"
    image_path = os.path.join(base_dir, "client/public/images/kim-koo.webp")
    
    docs_json_path = os.path.join(base_dir, "server/data/historical_docs.json")
    figures_json_path = os.path.join(base_dir, "server/data/figures.json")

    audio_dir = os.path.join(base_dir, "server/data/audio")
    output_video_dir = os.path.join(base_dir, "server/data/output_videos")
    public_video_dir = os.path.join(base_dir, "client/public/videos")

    os.makedirs(audio_dir, exist_ok=True)
    os.makedirs(output_video_dir, exist_ok=True)
    os.makedirs(public_video_dir, exist_ok=True)

    with open(docs_json_path, 'r', encoding='utf-8') as f:
        docs = json.load(f)

    with open(figures_json_path, 'r', encoding='utf-8') as f:
        figures = json.load(f)

    kim_docs = [d for d in docs if d.get('figureId') == 'kim-koo']
    kim_figure = next((f for f in figures if f.get('id') == 'kim-koo'), None)

    print("=========================================================")
    print("Kim Koo Backend Historical Dialogue Audio & Video Dataset Builder")
    print("=========================================================")

    # 1. Generate for doc-kim-01 & doc-kim-02 stored in backend
    for idx, doc in enumerate(kim_docs):
        doc_id = doc.get('id', f'kim-{idx+1}')
        topic = doc.get('topic', '대사')
        speech_text = doc.get('speechTemplate', doc.get('sourceText'))

        print(f"\n[Dialogue {idx+1}] Topic: {topic}")

        # Synthesize Audio
        audio_filename = f"kim-koo_{doc_id}.mp3"
        audio_path = os.path.join(audio_dir, audio_filename)
        tts = gTTS(text=speech_text, lang='ko')
        tts.save(audio_path)
        print(f"Audio generated: {audio_path}")

        # Synthesize Video
        video_filename = f"kim-koo_{doc_id}.mp4"
        out_video_path = os.path.join(output_video_dir, video_filename)
        public_video_path = os.path.join(public_video_dir, video_filename)

        success = generate_video_from_image_and_audio(image_path, audio_path, out_video_path)
        if success:
            generate_video_from_image_and_audio(image_path, audio_path, public_video_path)

    # 2. Generate for figure description (오직 한없이 가지고 싶은 것은 높은 문화의 힘이다)
    if kim_figure and kim_figure.get('description'):
        desc_text = kim_figure.get('description')
        print(f"\n[Quote Dialogue] Text: {desc_text}")
        audio_path = os.path.join(audio_dir, "kim-koo_culture_power.mp3")
        tts = gTTS(text=desc_text, lang='ko')
        tts.save(audio_path)

        out_video_path = os.path.join(output_video_dir, "kim-koo_culture_power.mp4")
        public_video_path = os.path.join(public_video_dir, "kim-koo_culture_power.mp4")

        generate_video_from_image_and_audio(image_path, audio_path, out_video_path)
        generate_video_from_image_and_audio(image_path, audio_path, public_video_path)

        main_avatar_video = os.path.join(public_video_dir, "kim-koo_talking_avatar.mp4")
        generate_video_from_image_and_audio(image_path, audio_path, main_avatar_video)

    # 3. Process YouTube Shorts extracted reference audio
    yt_audio = os.path.join(base_dir, "client/public/audio/kim-koo_speech.webm")
    if os.path.exists(yt_audio):
        print(f"\n[YouTube Reference Audio Video]")
        out_yt_video = os.path.join(output_video_dir, "kim-koo_youtube_speech.mp4")
        public_yt_video = os.path.join(public_video_dir, "kim-koo_youtube_speech.mp4")
        generate_video_from_image_and_audio(image_path, yt_audio, out_yt_video)
        generate_video_from_image_and_audio(image_path, yt_audio, public_yt_video)

    print("\n=========================================================")
    print("FINISHED: Kim Koo Dialogue Dataset Generation Complete!")
    print(f"Output Directory: {output_video_dir}")
    print("=========================================================")

if __name__ == '__main__':
    main()
