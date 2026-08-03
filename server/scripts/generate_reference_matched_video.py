import os
import sys
import math
import numpy as np
import cv2
import torch
import torch.nn.functional as F
import imageio_ffmpeg
import subprocess

def Generate_YouTube_Reference_Matched_Video(image_path, audio_path, ref_video_path, output_mp4_path, mouth_cx_ratio=0.4684, mouth_cy_ratio=0.4809):
    print(f"[YouTube Reference Matched Engine] Matching motion from: {os.path.basename(ref_video_path)}")

    if not torch.cuda.is_available():
        print("Error: CUDA not available")
        return False

    device = torch.device('cuda:0')
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    # Load source portrait
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

    # Extract lip opening profile from reference video
    cap_ref = cv2.VideoCapture(ref_video_path)
    ref_frames_count = int(cap_ref.get(cv2.CAP_PROP_FRAME_COUNT))
    ref_fps = cap_ref.get(cv2.CAP_PROP_FPS) or 30.0

    ref_openings = []

    while cap_ref.isOpened():
        ret, frame = cap_ref.read()
        if not ret:
            break
        
        h_f, w_f, _ = frame.shape
        # Analyze center mouth darkness in reference frame
        mouth_crop = frame[int(h_f*0.43):int(h_f*0.57), int(w_f*0.35):int(w_f*0.65)]
        gray = cv2.cvtColor(mouth_crop, cv2.COLOR_BGR2GRAY)
        
        # Calculate dark mouth opening intensity ratio
        dark_pixels = np.sum(gray < 75)
        total_pixels = gray.size
        opening_ratio = dark_pixels / float(total_pixels)
        ref_openings.append(opening_ratio)

    cap_ref.release()

    # Normalize opening profile [0.0, 1.0]
    ref_openings = np.array(ref_openings)
    min_op = np.min(ref_openings)
    max_op = np.max(ref_openings)
    norm_openings = (ref_openings - min_op) / (max_op - min_op + 1e-5)
    
    # Smooth signal with Gaussian filter
    norm_openings = cv2.GaussianBlur(norm_openings.reshape(-1, 1), (15, 1), 0).flatten()

    fps = 25
    duration = len(norm_openings) / ref_fps
    total_frames = int(duration * fps)
    print(f"   Rendering {total_frames} frames matching YouTube reference motion ({duration:.2f}s)...")

    # Grid [-1, 1]
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
            ref_idx = int((frame_idx / float(total_frames)) * len(norm_openings))
            ref_idx = min(ref_idx, len(norm_openings) - 1)

            # Get lip opening factor directly from YouTube Shorts reference video
            lip_open = norm_openings[ref_idx] * 0.18

            disp_x = torch.zeros_like(grid_x)
            disp_y = torch.zeros_like(grid_y)

            # Gaussian mask centered PRECISELY on user's marked red box
            dist = torch.sqrt(((grid_x - target_cx) / 0.28)**2 + ((grid_y - target_cy) / 0.14)**2)
            mouth_mask = torch.exp(-dist * 3.8)

            y_diff = grid_y - target_cy
            smooth_direction = torch.tanh(y_diff * 26.0)

            # Deform lip photo pixels naturally matching YouTube reference video
            disp_y += mouth_mask * smooth_direction * lip_open

            deformed_grid = base_grid + torch.stack((disp_x, disp_y), dim=-1).unsqueeze(0)

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
        print(f"SUCCESS: Created YouTube Matched Video: {output_mp4_path} ({os.path.getsize(output_mp4_path)} bytes)")
        return True
    else:
        print(f"FAILED to encode video.")
        return False

if __name__ == '__main__':
    base_dir = "c:/Users/301/Desktop/NEXUS-master/NEXUS-master"
    img_path = os.path.join(base_dir, "client/public/images/kim-koo.webp")
    audio_path = os.path.join(base_dir, "client/public/audio/kim-koo_speech.webm")
    ref_path = os.path.join(base_dir, "server/data/reference_kim_koo_short.mp4")

    out1 = os.path.join(base_dir, "client/public/videos/kim-koo_talking_avatar.mp4")
    out2 = os.path.join(base_dir, "server/data/output_videos/kim-koo_talking_avatar.mp4")

    Generate_YouTube_Reference_Matched_Video(img_path, audio_path, ref_path, out1)
    Generate_YouTube_Reference_Matched_Video(img_path, audio_path, ref_path, out2)
