import os
import sys
import subprocess
import cv2
import torch
import numpy as np
import imageio_ffmpeg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eye_blink_model import FIGURE_EYE_CONFIGS, BLINK_PROFILE, compute_eye_displacement_template

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

print(f"=== Generating Anatomical Biological Idle Blink Videos ===")
print(f"Compute Device: {device}")
print(f"FFmpeg Exe: {ffmpeg_exe}")

os.makedirs('client/public/videos', exist_ok=True)

FPS = 25
TOTAL_FRAMES = 150  # Exactly 6.0 seconds seamless loop

# Build calm, dignified biological blink schedule:
# Exactly 1 gentle natural blink per 6.0 second loop (frame 70, ~2.8s)
# Avoids restless 'dry eye' blinking and maintains majestic historical posture
blink_schedule = [0.0] * TOTAL_FRAMES
for offset, val in enumerate(BLINK_PROFILE):
    if 70 + offset < TOTAL_FRAMES:
        blink_schedule[70 + offset] = val

for fig_id in FIGURE_EYE_CONFIGS.keys():
    img_path = f'client/public/images/{fig_id}.webp'
    if not os.path.exists(img_path):
        print(f"Warning: image {img_path} not found, skipping.")
        continue

    img_bgr = cv2.imread(img_path)
    orig_h, orig_w, _ = img_bgr.shape
    h = orig_h - (orig_h % 2)
    w = orig_w - (orig_w % 2)
    pristine_bgr = img_bgr[:h, :w].copy()
    pristine_rgb = cv2.cvtColor(pristine_bgr, cv2.COLOR_BGR2RGB)

    img_tensor = torch.from_numpy(pristine_rgb).permute(2, 0, 1).unsqueeze(0).float().to(device) / 255.0

    grid_y, grid_x = torch.meshgrid(
        torch.linspace(-1, 1, h, device=device),
        torch.linspace(-1, 1, w, device=device),
        indexing='ij'
    )
    base_grid = torch.stack((grid_x, grid_y), dim=-1).unsqueeze(0)

    # Precompute full anatomical eyelid displacement template once on GPU
    eye_disp_x, eye_disp_y = compute_eye_displacement_template(grid_x, grid_y, fig_id, device)

    out_mp4_path = f'client/public/videos/idle_blink_{fig_id}.mp4'

    # FFmpeg pipe process for ultra-high quality H.264
    cmd = [
        ffmpeg_exe, '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{w}x{h}',
        '-pix_fmt', 'rgb24',
        '-r', str(FPS),
        '-i', '-',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '16',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        out_mp4_path
    ]

    pipe = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    with torch.no_grad():
        for frame_idx in range(TOTAL_FRAMES):
            blink_amount = blink_schedule[frame_idx]
            if blink_amount == 0.0:
                # 100% pristine original untouched portrait: zero interpolation loss
                pipe.stdin.write(pristine_rgb.tobytes())
            else:
                cur_disp_x = eye_disp_x * blink_amount
                cur_disp_y = eye_disp_y * blink_amount
                deformed_grid = base_grid + torch.stack((cur_disp_x, cur_disp_y), dim=-1).unsqueeze(0)
                warped = torch.nn.functional.grid_sample(
                    img_tensor,
                    deformed_grid,
                    mode='bilinear',
                    padding_mode='border',
                    align_corners=True
                )
                out_rgb = (warped.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
                pipe.stdin.write(out_rgb.tobytes())

    stdout, stderr = pipe.communicate()
    if pipe.returncode != 0:
        print(f"Error generating video for {fig_id}: {stderr.decode('utf-8', errors='ignore')}")
    else:
        file_size_kb = os.path.getsize(out_mp4_path) / 1024.0
        print(f"[SUCCESS] Generated: {out_mp4_path} ({w}x{h}, {TOTAL_FRAMES} frames, {file_size_kb:.1f} KB)")

print("\n=== All 5 Anatomical Idle Blink Loop Videos Generated Successfully! ===")
