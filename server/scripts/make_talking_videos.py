import os
import sys
import numpy as np
import cv2
import imageio_ffmpeg
import subprocess

def create_clean_avatar_video(image_path, audio_path, output_mp4_path):
    print(f"[Generating Clean Video] Image: {os.path.basename(image_path)} | Audio: {os.path.basename(audio_path if audio_path else 'None')}")

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    if not os.path.exists(image_path):
        print(f"Error: Image not found {image_path}")
        return False

    base_img = cv2.imread(image_path)
    if base_img is None:
        print(f"Error: Failed to read image {image_path}")
        return False

    target_dim = 720
    base_img = cv2.resize(base_img, (target_dim, target_dim))
    height, width, _ = base_img.shape

    duration = 10.0
    if audio_path and os.path.exists(audio_path):
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
    total_frames = int(duration * fps)

    temp_video = output_mp4_path + ".temp.mp4"

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_video, fourcc, fps, (width, height))

    # Write 100% clean portrait frames (Zero shaking, zero mouth ellipse drawing)
    for _ in range(total_frames):
        out.write(base_img)

    out.release()

    os.makedirs(os.path.dirname(output_mp4_path), exist_ok=True)
    if os.path.exists(output_mp4_path):
        try:
            os.remove(output_mp4_path)
        except:
            pass

    if audio_path and os.path.exists(audio_path):
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
    else:
        cmd = [
            ffmpeg_exe, '-y',
            '-i', temp_video,
            '-c:v', 'libx264',
            output_mp4_path
        ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if os.path.exists(temp_video):
        try:
            os.remove(temp_video)
        except:
            pass

    if os.path.exists(output_mp4_path):
        print(f"SUCCESS: Created clean video {output_mp4_path} ({os.path.getsize(output_mp4_path)} bytes)")
        return True
    else:
        print(f"FAILED to create video.")
        return False

if __name__ == '__main__':
    base_dir = "c:/Users/301/Desktop/NEXUS-master/NEXUS-master"
    
    figures_config = [
        {"id": "kim-koo", "audio": "client/public/audio/kim-koo_speech.webm"},
        {"id": "king-sejong", "audio": "client/public/audio/king-sejong_speech.mp3"},
        {"id": "yi-sun-sin", "audio": None},
        {"id": "yu-gwan-sun", "audio": None},
        {"id": "shin-saimdang", "audio": None}
    ]

    for fig in figures_config:
        img_path = os.path.join(base_dir, f"client/public/images/{fig['id']}.webp")
        audio_path = os.path.join(base_dir, fig['audio']) if fig['audio'] else None
        output_path = os.path.join(base_dir, f"client/public/videos/{fig['id']}_talking_avatar.mp4")
        create_clean_avatar_video(img_path, audio_path, output_path)
