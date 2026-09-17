import time
import os
import sys
import torch
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from avatar_stream_tracks import AvatarVideoStreamTrack
from avatar_webrtc_server import figures_map

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

print("=" * 60)
print("[BENCHMARK] NEXUS PyTorch CUDA Real-Time Avatar FPS Benchmark")
print("=" * 60)

fig_id = 'kim-koo'
track = AvatarVideoStreamTrack(figures_map, initial_figure_id=fig_id, fps=25)

# Warmup GPU
print("[CUDA] Warming up GPU CUDA kernels...")
for _ in range(10):
    with torch.no_grad():
        deformed = torch.nn.functional.grid_sample(
            track.img_tensor,
            track.base_grid,
            mode='bilinear',
            padding_mode='border',
            align_corners=True
        )
torch.cuda.synchronize()

# Benchmark 1: Idle frame generation
frames_to_test = 100
t0 = time.time()

with torch.no_grad():
    for i in range(frames_to_test):
        # simulate grid deformation
        t = i / 25.0
        blink = max(0.0, np.sin(t * 0.8)) * 0.012
        disp_y = track.base_grid[..., 1] + blink
        disp_x = track.base_grid[..., 0]
        deformed_grid = torch.stack((disp_x, disp_y), dim=-1)
        warped = torch.nn.functional.grid_sample(
            track.img_tensor,
            deformed_grid,
            mode='bilinear',
            padding_mode='border',
            align_corners=True
        )
        out = (warped.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).astype(np.uint8)

torch.cuda.synchronize()
total_sec = time.time() - t0
fps = frames_to_test / total_sec
ms_per_frame = (total_sec / frames_to_test) * 1000.0

print(f"[RESULT] Benchmark for 100 frames on {torch.cuda.get_device_name(0)}:")
print(f" - Total Time: {total_sec:.3f}s")
print(f" - Render Speed: {fps:.1f} FPS (Target is 25 FPS)")
print(f" - Latency per frame: {ms_per_frame:.2f} ms")
print(f" - Real-time Headroom: {fps / 25.0:.1f}x real-time capability!")
print("=" * 60)
