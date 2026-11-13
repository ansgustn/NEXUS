#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
====================================================================================================
[NEXUS] 832x1088 Exact Latent-Aligned Portrait & Idle Video Synchronizer
====================================================================================================
- 초상화를 LTX-2.3 생성 비율(832 x 1088, 64의 정확한 배수: 64*13 x 64*17)에 맞춰 미리 재단하여
  원본 초상화(.webp/.jpg), 대기 영상(idle_blink_*.mp4), 말하는 영상(LTX-2.3)이
  1픽셀의 오차나 크롭 변화 없이 완전히 동일한 구도(832 x 1088)를 사용하도록 동기화합니다.
====================================================================================================
"""

import os
import sys
import shutil
import subprocess
import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

if sys.stdout:
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr:
    sys.stderr.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
PUBLIC_DIR = os.path.join(ROOT_DIR, "client", "public")
DIST_DIR = os.path.join(ROOT_DIR, "client", "dist")
SCRATCH_DIR = r"C:\Users\user\.gemini\antigravity\brain\3bbcad96-9b2b-4c0e-afd5-362ec180b9e6\scratch"

try:
    import imageio_ffmpeg
    FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_BIN = "ffmpeg"

TARGET_W, TARGET_H = 832, 1088  # Exact LTX-2.3 64x multiple (416x544 pass 1 -> 832x1088 pass 2)


def crop_to_ratio_and_resize(im_pil, crop_box=None, target_w=TARGET_W, target_h=TARGET_H):
    """Crop image to exact 832:1088 aspect ratio and resize with Lanczos4"""
    if crop_box is not None:
        im_pil = im_pil.crop(crop_box)

    w, h = im_pil.size
    target_ratio = target_w / float(target_h)
    cur_ratio = w / float(h)

    if abs(cur_ratio - target_ratio) > 1e-3:
        if cur_ratio > target_ratio:
            # Slightly wider than 832:1088 -> center-crop width
            new_w = int(round(h * target_ratio))
            x0 = (w - new_w) // 2
            im_pil = im_pil.crop((x0, 0, x0 + new_w, h))
        else:
            # Slightly taller than 832:1088 -> center-crop height
            new_h = int(round(w / target_ratio))
            y0 = (h - new_h) // 2
            im_pil = im_pil.crop((0, y0, w, y0 + new_h))

    arr_bgr = cv2.cvtColor(np.array(im_pil.convert("RGB")), cv2.COLOR_RGB2BGR)
    resized_bgr = cv2.resize(arr_bgr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
    return resized_bgr


# 눈꺼풀 채우기 방식으로 깜빡이는 인물: 832x1088 초상화에서 직접 지정한 눈 (중심 x, y, 반폭, 반높이) 픽셀.
# 김구: 안경 렌즈의 반사광이 눈 바로 위에 있어 피부를 끌어내리는 방식(apply_blink)은 반사광 줄무늬를
# 눈 안으로 끌고 와 일그러졌다. 그래서 눈을 피부로 메운 '감은 눈'을 만들고 눈꺼풀을 위에서부터 덮는다.
EYELID_FILL_PX = {
    "kim-koo": ((323, 338, 36, 10), (460, 336, 30, 9)),
}


def make_closed_eye_base(img, eyes_px):
    h, w = img.shape[:2]
    m = np.zeros((h, w), np.uint8)
    for cx, cy, a, b in eyes_px:
        cv2.ellipse(m, (cx, cy), (a + 2, b + 3), 0, 0, 360, 255, -1)
    base = cv2.inpaint(img, m, 7, cv2.INPAINT_TELEA).astype(np.float32)
    # 매끈한 회색 덩어리처럼 보이지 않도록 눈 바로 위 피부의 잔결을 아래로 옮겨 입힌다
    f = img.astype(np.float32)
    hi = f - cv2.GaussianBlur(f, (0, 0), 2.0)
    tex = np.zeros_like(f)
    for cx, cy, a, b in eyes_px:
        sh = int(2.2 * b)
        tex[cy - b - 4:cy + b + 4, cx - a - 4:cx + a + 4] = hi[cy - b - 4 - sh:cy + b + 4 - sh, cx - a - 4:cx + a + 4]
    # 감은 눈꺼풀은 주변보다 살짝 어둡다
    return np.clip((base + 0.6 * tex) * 0.9, 0, 255).astype(np.uint8)


def apply_lid_blink(img, closed_base, eyes_px, weight):
    if weight <= 1e-3:
        return img
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    out = img.astype(np.float32)
    base = closed_base.astype(np.float32)
    for cx, cy, a, b in eyes_px:
        dx = (xx - cx) / a
        arch = np.sqrt(np.clip(1 - dx ** 2, 0, 1))
        top, bot = cy - b * 1.15 * arch, cy + b * 1.15 * arch
        lid = top + (bot - top) * weight  # 내려오는 눈꺼풀의 아래 끝
        side = np.clip((1 - np.abs(dx)) * 6, 0, 1)
        inside = (np.abs(dx) <= 1) & (yy >= top - 2)
        cover = np.clip((lid - yy) / 2.0 + 0.5, 0, 1) * inside * side
        edge = np.exp(-((yy - lid) / 1.3) ** 2) * inside * np.clip((1 - np.abs(dx)) * 4, 0, 1) * weight  # 속눈썹 선
        out = out * (1 - cover[..., None]) + base * cover[..., None]
        out = out * (1 - 0.45 * edge[..., None])
    return np.clip(out, 0, 255).astype(np.uint8)


def find_eye_centers(frame_bgr, fig_id):
    h, w, _ = frame_bgr.shape
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    windows = {
        "king-sejong":   (0.320, 0.365, 0.38, 0.47, 0.53, 0.62),
        "yi-sun-sin":    (0.305, 0.355, 0.38, 0.47, 0.53, 0.62),
        # 832x1088 초상화에서 실제 눈 위치(왼쪽 x 0.475, 오른쪽 x 0.607, y 0.237). 예전 값은 눈 아래 뺨을 가리켜 깜빡임이 보이지 않았다
        "shin-saimdang": (0.218, 0.258, 0.44, 0.51, 0.575, 0.645),
        "kim-koo":       (0.295, 0.345, 0.36, 0.45, 0.52, 0.61),
        "yu-gwan-sun":   (0.260, 0.310, 0.39, 0.47, 0.53, 0.61),
    }
    y0n, y1n, lx0n, lx1n, rx0n, rx1n = windows.get(fig_id, (0.30, 0.36, 0.38, 0.47, 0.53, 0.62))
    y0, y1 = int(y0n * h), int(y1n * h)
    lx0, lx1 = int(lx0n * w), int(lx1n * w)
    rx0, rx1 = int(rx0n * w), int(rx1n * w)

    def centroid(patch, ox, oy):
        thresh = np.percentile(patch, 8)
        ys, xs = np.where(patch <= thresh)
        return ((ox + float(xs.mean())) / w) * 2.0 - 1.0, ((oy + float(ys.mean())) / h) * 2.0 - 1.0

    lcx, lcy = centroid(gray[y0:y1, lx0:lx1], lx0, y0)
    rcx, rcy = centroid(gray[y0:y1, rx0:rx1], rx0, y0)
    return lcx, lcy, rcx, rcy


@torch.no_grad()
def apply_blink(frame_bgr, lcx, lcy, rcx, rcy, rx, ry, weight):
    if weight <= 1e-3:
        return frame_bgr
    h, w, _ = frame_bgr.shape
    gy, gx = torch.meshgrid(
        torch.linspace(-1.0, 1.0, h, dtype=torch.float32),
        torch.linspace(-1.0, 1.0, w, dtype=torch.float32),
        indexing="ij",
    )
    disp_y = torch.zeros_like(gy)
    delta_travel, above_span = 0.42, 0.22
    for (cx, cy) in [(lcx, lcy), (rcx, rcy)]:
        dx = (gx - cx) / rx
        dy = (gy - cy) / ry
        h_in = dx.abs() <= 1.0
        arch = torch.where(h_in, torch.sqrt(torch.clamp(1.0 - dx ** 2, min=0.0)), torch.zeros_like(dx))
        y_top, y_seam = -0.95 * arch, 0.95 * arch
        fissure_h = y_seam - y_top
        in_ap = h_in & (dy >= y_top) & (dy <= y_seam)
        tau = torch.where(in_ap, (dy - y_top) / (fissure_h + 1e-6), torch.zeros_like(dy))
        y_src = y_top - (delta_travel * arch) * (1.0 - tau)
        dy_in = torch.where(in_ap, (y_src - dy) * ry, torch.zeros_like(dy))
        in_ab = h_in & (dy < y_top) & (dy >= y_top - above_span * arch)
        d_ab = torch.clamp((y_top - dy) / (above_span * arch + 1e-6), 0.0, 1.0)
        dy_ab = torch.where(in_ab, (-delta_travel * arch * (0.5 + 0.5 * torch.cos(torch.pi * d_ab))) * ry, torch.zeros_like(dy))
        disp_y = disp_y + dy_in + dy_ab

    grid = torch.stack([gx, gy + disp_y * float(weight)], dim=-1).unsqueeze(0)
    inp = torch.from_numpy(frame_bgr.astype(np.float32)).permute(2, 0, 1).unsqueeze(0)
    warped = F.grid_sample(inp, grid, mode="bilinear", padding_mode="border", align_corners=True)
    return warped.squeeze(0).permute(1, 2, 0).clamp(0, 255).numpy().astype(np.uint8)


def generate_idle_video_832x1088(portrait_bgr, fig_id, fps=24):
    h, w, _ = portrait_bgr.shape
    lcx, lcy, rcx, rcy = find_eye_centers(portrait_bgr, fig_id)
    rx = 0.048 if fig_id == "shin-saimdang" else 0.065
    lid_eyes = EYELID_FILL_PX.get(fig_id)
    closed_base = make_closed_eye_base(portrait_bgr, lid_eyes) if lid_eyes else None
    ry = 0.020 if fig_id == "king-sejong" else 0.018
    blink_profile = [0.35, 0.85, 1.00, 0.65, 0.22]

    idle_path = os.path.join(PUBLIC_DIR, "videos", f"idle_blink_{fig_id}.mp4")
    tmp_idle = idle_path + ".tmp.mp4"
    cmd = [
        FFMPEG_BIN, "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{w}x{h}", "-pix_fmt", "bgr24", "-r", str(fps), "-i", "-",
        "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp_idle
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    total_frames = int(4.0 * fps)
    blink_start = int(1.8 * fps)
    for fi in range(total_frames):
        b_idx = fi - blink_start
        if 0 <= b_idx < len(blink_profile):
            if lid_eyes:
                fr = apply_lid_blink(portrait_bgr, closed_base, lid_eyes, blink_profile[b_idx])
            else:
                fr = apply_blink(portrait_bgr, lcx, lcy, rcx, rcy, rx, ry, blink_profile[b_idx])
        else:
            fr = portrait_bgr
        proc.stdin.write(fr.tobytes())
    proc.stdin.close()
    proc.wait()
    shutil.move(tmp_idle, idle_path)
    if os.path.exists(DIST_DIR):
        os.makedirs(os.path.join(DIST_DIR, "videos"), exist_ok=True)
        shutil.copy2(idle_path, os.path.join(DIST_DIR, "videos", f"idle_blink_{fig_id}.mp4"))


def main():
    print("=" * 80)
    print(f"🎯 전 인물 초상화 및 대기 영상을 LTX-2.3 생성 비율({TARGET_W}x{TARGET_H})로 정밀 통일")
    print("=" * 80)

    figures = ["kim-koo", "king-sejong", "yi-sun-sin", "yu-gwan-sun", "shin-saimdang"]
    os.makedirs(os.path.join(DIST_DIR, "images"), exist_ok=True)

    for fig_id in figures:
        webp_path = os.path.join(PUBLIC_DIR, "images", f"{fig_id}.webp")
        jpg_path = os.path.join(PUBLIC_DIR, "images", f"{fig_id}.jpg")

        im = Image.open(webp_path).convert("RGB")
        bgr_832x1088 = crop_to_ratio_and_resize(im, crop_box=None, target_w=TARGET_W, target_h=TARGET_H)

        out_pil = Image.fromarray(cv2.cvtColor(bgr_832x1088, cv2.COLOR_BGR2RGB))
        out_pil.save(webp_path, "WEBP", quality=98, method=6)
        out_pil.save(jpg_path, "JPEG", quality=98, subsampling=0)
        shutil.copy2(webp_path, os.path.join(DIST_DIR, "images", f"{fig_id}.webp"))
        shutil.copy2(jpg_path, os.path.join(DIST_DIR, "images", f"{fig_id}.jpg"))

        generate_idle_video_832x1088(bgr_832x1088, fig_id, fps=24)
        print(f"✅ [{fig_id}] 초상화(.webp/.jpg) 및 대기 영상(idle_blink_{fig_id}.mp4) -> {TARGET_W}x{TARGET_H} 동기화 완료")


if __name__ == "__main__":
    main()

