import os
import sys
import math
import numpy as np
import cv2
import torch
import torch.nn.functional as F
import imageio_ffmpeg
import subprocess

def Generate_KingSejong_Style_KimKoo(image_path, audio_path, sejong_video_path, output_mp4_path, mouth_cx_ratio=0.4684, mouth_cy_ratio=0.4809):
    print(f"[King Sejong Style Matcher] Transferring natural facial fluidity from: {os.path.basename(sejong_video_path)}")

    if not torch.cuda.is_available():
        print("Error: CUDA not available")
        return False

    device = torch.device('cuda:0')
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        img_bgr = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)

    if img_bgr is None:
        print(f"Error: Cannot read image {image_path}")
        return False

    target_size = 720
    img_bgr = cv2.resize(img_bgr, (target_size, target_size))
    h, w, _ = img_bgr.shape

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_tensor = torch.from_numpy(img_rgb).permute(2, 0, 1).unsqueeze(0).float().to(device) / 255.0

    # Extract lip & eye motion trajectory from King Sejong video
    cap_sj = cv2.VideoCapture(sejong_video_path)
    sj_openings = []

    while cap_sj.isOpened():
        ret, frame = cap_sj.read()
        if not ret:
            break
        
        h_f, w_f, _ = frame.shape
        mouth_crop = frame[int(h_f*0.44):int(h_f*0.58), int(w_f*0.35):int(w_f*0.65)]
        gray = cv2.cvtColor(mouth_crop, cv2.COLOR_BGR2GRAY)
        
        dark_pixels = np.sum(gray < 80)
        sj_openings.append(dark_pixels / float(gray.size))

    cap_sj.release()

    if len(sj_openings) == 0:
        sj_openings = [0.1] * 100

    sj_openings = np.array(sj_openings)
    norm_op = (sj_openings - np.min(sj_openings)) / (np.max(sj_openings) - np.min(sj_openings) + 1e-5)
    norm_op = cv2.GaussianBlur(norm_op.reshape(-1, 1), (11, 1), 0).flatten()

    fps = 25
    duration = 5.0
    total_frames = int(duration * fps)
    print(f"   Rendering {total_frames} frames matching King Sejong natural fluidity...")

    grid_y, grid_x = torch.meshgrid(
        torch.linspace(-1, 1, h, device=device),
        torch.linspace(-1, 1, w, device=device),
        indexing='ij'
    )
    base_grid = torch.stack((grid_x, grid_y), dim=-1).unsqueeze(0)

    target_cx = (mouth_cx_ratio * 2.0) - 1.0
    target_cy = (mouth_cy_ratio * 2.0) - 1.0

    frames = []

    with torch.no_grad():
        for frame_idx in range(total_frames):
            sj_idx = int((frame_idx / float(total_frames)) * len(norm_op))
            sj_idx = min(sj_idx, len(norm_op) - 1)

            # Natural King Sejong mouth open trajectory (amplitude 0.15)
            lip_open = norm_op[sj_idx] * 0.15

            disp_x = torch.zeros_like(grid_x)
            disp_y = torch.zeros_like(grid_y)

            # Generous Gaussian mask centered PRECISELY on user's marked red box
            dist = torch.sqrt(((grid_x - target_cx) / 0.28)**2 + ((grid_y - target_cy) / 0.14)**2)
            mouth_mask = torch.exp(-dist * 3.8)

            y_diff = grid_y - target_cy
            smooth_direction = torch.tanh(y_diff * 25.0)

            # Natural facial deformation matching King Sejong's exact motion fluidity
            disp_y += mouth_mask * smooth_direction * lip_open

            deformed_grid = base_grid + torch.stack((disp_x, disp_y), dim=-1).unsqueeze(0)

            # PyTorch CUDA Tensor Warping (0% Shaking, 0% Ellipse Drawing)
            warped_tensor = F.grid_sample(
                img_tensor,
                deformed_grid,
                mode='bilinear',
                padding_mode='border',
                align_corners=True
            )

            out_img = (warped_tensor.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
            out_bgr = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)

            frames.append(out_bgr)

    temp_video = output_mp4_path + ".temp.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(temp_video, fourcc, fps, (w, h))

    for frame in frames:
        writer.write(frame)
    writer.release()

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
        print(f"SUCCESS: Created King Sejong Style Video: {output_mp4_path} ({os.path.getsize(output_mp4_path)} bytes)")
        return True
    else:
        print(f"FAILED to encode video.")
        return False

if __name__ == '__main__':
    base_dir = "c:/Users/301/Desktop/NEXUS-master/NEXUS-master"
    img_path = os.path.join(base_dir, "client/public/images/kim-koo.webp")
    audio_path = os.path.join(base_dir, "client/public/audio/kim-koo_speech.webm")
    sejong_video = os.path.join(base_dir, "client/public/videos/king-sejong_talking_avatar.mp4")

    out1 = os.path.join(base_dir, "client/public/videos/kim-koo_talking_avatar.mp4")
    out2 = os.path.join(base_dir, "server/data/output_videos/kim-koo_talking_avatar.mp4")

    Generate_KingSejong_Style_KimKoo(img_path, audio_path, sejong_video, out1)
    Generate_KingSejong_Style_KimKoo(img_path, audio_path, sejong_video, out2)

    doc1_audio = os.path.join(base_dir, "server/data/audio/kim-koo_doc-kim-01.mp3")
    doc1_video = os.path.join(base_dir, "server/data/output_videos/kim-koo_doc-kim-01.mp4")
    doc1_public = os.path.join(base_dir, "client/public/videos/kim-koo_doc-kim-01.mp4")
    if os.path.exists(doc1_audio):
        Generate_KingSejong_Style_KimKoo(img_path, doc1_audio, sejong_video, doc1_video)
        Generate_KingSejong_Style_KimKoo(img_path, doc1_audio, sejong_video, doc1_public)
