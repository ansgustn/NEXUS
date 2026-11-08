#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
====================================================================================================
[NEXUS] AI Deep Learning Super-Resolution (Real-ESRGAN x4 + GFPGAN v1.4) FHD/2K Portrait Upscaler
====================================================================================================
- 기존의 단순 보간(Lanczos)에서 발생하던 픽셀 깨짐(JPEG 깍두기 노이즈, 흐릿한 눈/입/수염/자수 경계)을 완전히 해결하기 위해
  PyTorch + Spandrel 기반의 딥러닝 초해상화 신경망을 결합하여 복원합니다:
  1) RealESRGAN_x4plus_anime_6B.pth : 표준영정(세종대왕, 이순신, 신사임당)의 비단 배경 노이즈, 곤룡포 용보, 흉배, 관모 경계를 선명한 FHD+ 화질로 복원
  2) RealESRGAN_x4plus.pth          : 인물 얼굴 피부 질감, 수염 결 및 실사 고문서 사진(김구, 유관순)을 4배 초해상화 복원
  3) GFPGANv1.4.pth                 : 인물의 눈동자, 쌍꺼풀, 눈썹, 코, 입술 윤곽을 고해상도로 복원하여 LTX-2.3 모델의 얼굴/입술 인식률을 극대화
====================================================================================================
"""

import os
import sys
import shutil
import urllib.request
import cv2
import numpy as np
import torch
from PIL import Image
import spandrel
import spandrel_extra_arches

try:
    spandrel_extra_arches.install()
except Exception:
    pass

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr:
    sys.stderr.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC_IMAGES_DIR = os.path.join(ROOT_DIR, "client", "public", "images")
DIST_IMAGES_DIR = os.path.join(ROOT_DIR, "client", "dist", "images")
WEIGHTS_DIR = os.path.join(ROOT_DIR, "server", "weights", "upscalers")
RAW_BACKUP_DIR = os.path.join(ROOT_DIR, "server", "weights", "portrait_clean_sources")

MODEL_URLS = {
    "RealESRGAN_x4plus.pth": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
    "RealESRGAN_x4plus_anime_6B.pth": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
    "GFPGANv1.4.pth": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
}


def ensure_weights():
    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    paths = {}
    for name, url in MODEL_URLS.items():
        dest = os.path.join(WEIGHTS_DIR, name)
        if not os.path.exists(dest) or os.path.getsize(dest) < 1_000_000:
            print(f"📥 [Downloading AI Upscaler Weight] {name} ...")
            urllib.request.urlretrieve(url, dest)
            print(f"   ✅ Saved: {dest} ({os.path.getsize(dest):,} bytes)")
        paths[name] = dest
    return paths


def img_to_tensor(img_rgb_u8, device):
    t = torch.from_numpy(img_rgb_u8.astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0).to(device)
    return t


def tensor_to_img(t):
    arr = t.squeeze(0).detach().cpu().clamp(0.0, 1.0).permute(1, 2, 0).numpy()
    return (arr * 255.0 + 0.5).astype(np.uint8)


@torch.no_grad()
def run_tiled_sr(model, img_rgb_u8, tile_size=256, tile_pad=24, device="cpu"):
    """Run 4x Real-ESRGAN super-resolution with seamless overlapping tiles"""
    scale = model.scale
    h, w, c = img_rgb_u8.shape
    out_h, out_w = h * scale, w * scale
    output = np.zeros((out_h, out_w, c), dtype=np.float32)
    weight = np.zeros((out_h, out_w, 1), dtype=np.float32)

    for y in range(0, h, tile_size):
        for x in range(0, w, tile_size):
            x0 = max(x - tile_pad, 0)
            y0 = max(y - tile_pad, 0)
            x1 = min(x + tile_size + tile_pad, w)
            y1 = min(y + tile_size + tile_pad, h)

            patch = img_rgb_u8[y0:y1, x0:x1]
            inp_t = img_to_tensor(patch, device)
            sr_t = model(inp_t)
            sr_patch = tensor_to_img(sr_t).astype(np.float32)

            ox0, oy0 = x0 * scale, y0 * scale
            ox1, oy1 = x1 * scale, y1 * scale
            ph, pw, _ = sr_patch.shape

            wy = np.ones((ph, 1), dtype=np.float32)
            wx = np.ones((1, pw), dtype=np.float32)
            pad_out = tile_pad * scale
            if y0 > 0 and ph > pad_out * 2:
                wy[:pad_out, 0] = np.linspace(0.1, 1.0, pad_out)
            if y1 < h and ph > pad_out * 2:
                wy[-pad_out:, 0] = np.linspace(1.0, 0.1, pad_out)
            if x0 > 0 and pw > pad_out * 2:
                wx[0, :pad_out] = np.linspace(0.1, 1.0, pad_out)
            if x1 < w and pw > pad_out * 2:
                wx[0, -pad_out:] = np.linspace(1.0, 0.1, pad_out)
            w_mask = (wy @ wx)[:, :, None]

            output[oy0:oy1, ox0:ox1] += sr_patch * w_mask
            weight[oy0:oy1, ox0:ox1] += w_mask

    output = np.clip(output / np.maximum(weight, 1e-6), 0, 255).astype(np.uint8)
    return output


@torch.no_grad()
def enhance_face_gfpgan(gfpgan_model, img_rgb_u8, face_box_norm, blend_alpha=0.80, device="cpu"):
    """
    Extract the aligned 512x512 face region, run GFPGANv1.4 neural facial restoration
    (eyes, pupils, eyelids, nose, mouth, lips, beard), and seamlessly feather-blend back.
    """
    h, w, _ = img_rgb_u8.shape
    cx_n, cy_n, box_n = face_box_norm
    cx, cy = int(cx_n * w), int(cy_n * h)
    half = int(box_n * min(w, h) * 0.5)

    x0 = max(0, cx - half)
    y0 = max(0, cy - half)
    x1 = min(w, cx + half)
    y1 = min(h, cy + half)

    face_crop = img_rgb_u8[y0:y1, x0:x1]
    fh, fw, _ = face_crop.shape
    if fh < 64 or fw < 64:
        return img_rgb_u8

    face_512 = cv2.resize(face_crop, (512, 512), interpolation=cv2.INTER_LANCZOS4)
    inp = torch.from_numpy(face_512.astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0).to(device)
    inp = (inp - 0.5) / 0.5
    out = gfpgan_model(inp)
    if isinstance(out, (tuple, list)):
        out = out[0]
    out = (out * 0.5 + 0.5).clamp(0.0, 1.0)
    restored_512 = (out.squeeze(0).detach().cpu().permute(1, 2, 0).numpy() * 255.0 + 0.5).astype(np.uint8)

    # Color-match restored face to original face chrominance (LAB A/B channels + mean L)
    orig_lab = cv2.cvtColor(face_512, cv2.COLOR_RGB2LAB).astype(np.float32)
    rest_lab = cv2.cvtColor(restored_512, cv2.COLOR_RGB2LAB).astype(np.float32)

    l_orig_mean, l_orig_std = orig_lab[:, :, 0].mean(), orig_lab[:, :, 0].std() + 1e-5
    l_rest_mean, l_rest_std = rest_lab[:, :, 0].mean(), rest_lab[:, :, 0].std() + 1e-5
    rest_l_matched = (rest_lab[:, :, 0] - l_rest_mean) * (l_orig_std / l_rest_std) + l_orig_mean
    rest_lab[:, :, 0] = np.clip(rest_l_matched * 0.82 + rest_lab[:, :, 0] * 0.18, 0, 255)
    rest_lab[:, :, 1] = rest_lab[:, :, 1] * 0.35 + orig_lab[:, :, 1] * 0.65
    rest_lab[:, :, 2] = rest_lab[:, :, 2] * 0.35 + orig_lab[:, :, 2] * 0.65

    restored_512_matched = cv2.cvtColor(rest_lab.astype(np.uint8), cv2.COLOR_LAB2RGB)
    restored_crop = cv2.resize(restored_512_matched, (fw, fh), interpolation=cv2.INTER_LANCZOS4)

    yy, xx = np.mgrid[0:fh, 0:fw]
    ny = (yy - fh * 0.48) / (fh * 0.42)
    nx = (xx - fw * 0.50) / (fw * 0.40)
    dist = np.sqrt(nx * nx + ny * ny)
    mask = np.clip(1.0 - np.clip((dist - 0.52) / 0.48, 0.0, 1.0), 0.0, 1.0)
    mask = cv2.GaussianBlur(mask.astype(np.float32), (31, 31), 10.0)[:, :, None] * blend_alpha

    result = img_rgb_u8.copy()
    blended = (restored_crop.astype(np.float32) * mask + face_crop.astype(np.float32) * (1.0 - mask))
    result[y0:y1, x0:x1] = np.clip(blended, 0, 255).astype(np.uint8)
    return result


def get_clean_base_portrait(fig_id):
    """
    Prepare clean shoulder-line bust portrait:
    - king-sejong & yi-sun-sin: crop shoulder-line bust directly from fullbody_backup.webp
      (matching the exact shoulder-line framing requested by the user!)
    - shin-saimdang, kim-koo, yu-gwan-sun: load from clean source and pre-deblock JPEG macroblocks.
    """
    os.makedirs(RAW_BACKUP_DIR, exist_ok=True)
    clean_backup = os.path.join(RAW_BACKUP_DIR, f"{fig_id}_base.png")

    if fig_id == "king-sejong":
        fb_path = os.path.join(PUBLIC_IMAGES_DIR, "king-sejong_fullbody_backup.webp")
        if os.path.exists(fb_path):
            im = Image.open(fb_path).convert("RGB")
            # Exact shoulder-line bust crop (636x900 -> 250x321, aspect 838:1076)
            cropped = np.array(im.crop((193, 48, 193 + 250, 48 + 321)))
            deblocked = cv2.bilateralFilter(cropped, d=5, sigmaColor=22, sigmaSpace=22)
            return deblocked

    if fig_id == "yi-sun-sin":
        fb_path = os.path.join(PUBLIC_IMAGES_DIR, "yi-sun-sin_fullbody_backup.webp")
        if os.path.exists(fb_path):
            im = Image.open(fb_path).convert("RGB")
            # Exact shoulder-line bust crop (576x1000 -> 272x349, aspect 838:1076)
            cropped = np.array(im.crop((152, 32, 152 + 272, 32 + 349)))
            deblocked = cv2.bilateralFilter(cropped, d=5, sigmaColor=22, sigmaSpace=22)
            return deblocked

    webp_path = os.path.join(PUBLIC_IMAGES_DIR, f"{fig_id}.webp")
    if not os.path.exists(clean_backup):
        im = Image.open(webp_path).convert("RGB")
        im_base = im.resize((520, 668), Image.Resampling.BOX)
        im_base.save(clean_backup, "PNG")

    base_rgb = np.array(Image.open(clean_backup).convert("RGB"))
    if fig_id == "shin-saimdang":
        base_bgr = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2BGR)
        denoised = cv2.fastNlMeansDenoisingColored(base_bgr, None, 6, 6, 7, 21)
        denoised = cv2.bilateralFilter(denoised, d=7, sigmaColor=28, sigmaSpace=28)
        base_rgb = cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB)
    return base_rgb


FACE_CONFIGS = {
    "king-sejong":   {"box": (0.50, 0.42, 0.54), "blend": 0.82, "mode": "painted"},
    "yi-sun-sin":    {"box": (0.50, 0.44, 0.52), "blend": 0.82, "mode": "painted"},
    "shin-saimdang": {"box": (0.52, 0.28, 0.46), "blend": 0.85, "mode": "painted"},
    "kim-koo":       {"box": (0.47, 0.35, 0.56), "blend": 0.65, "mode": "photo"},
    "yu-gwan-sun":   {"box": (0.50, 0.30, 0.50), "blend": 0.72, "mode": "photo"},
}


def main():
    print("=" * 85)
    print("🚀 [NEXUS] Real-ESRGAN x4 + GFPGAN v1.4 딥러닝 초해상화(FHD/2K) 인물 복원 엔진 가동")
    print("=" * 85)

    weights = ensure_weights()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"🔧 Loading Spandrel AI Models on device: {device} ...")

    loader = spandrel.ModelLoader(device=device)
    esrgan_photo = loader.load_from_file(weights["RealESRGAN_x4plus.pth"]).eval()
    esrgan_art = loader.load_from_file(weights["RealESRGAN_x4plus_anime_6B.pth"]).eval()
    gfpgan = loader.load_from_file(weights["GFPGANv1.4.pth"]).eval()
    print("✅ Models loaded: RealESRGAN_x4plus, RealESRGAN_x4plus_anime_6B, GFPGANv1.4\n")

    target_w, target_h = 1676, 2152
    os.makedirs(DIST_IMAGES_DIR, exist_ok=True)

    for fig_id, cfg in FACE_CONFIGS.items():
        print(f"🎨 [{fig_id}] AI Super-Resolution + Facial Feature Restoration in progress...")
        base_rgb = get_clean_base_portrait(fig_id)
        print(f"   ▶ Base clean input size: {base_rgb.shape[1]}x{base_rgb.shape[0]}")

        if cfg["mode"] == "painted":
            sr_art = run_tiled_sr(esrgan_art, base_rgb, tile_size=256, tile_pad=24, device=device)
            sr_photo = run_tiled_sr(esrgan_photo, base_rgb, tile_size=256, tile_pad=24, device=device)
            # Blend art (clean silk/embroidery, zero macroblocks) on background/robes,
            # while keeping natural photo texture on the face & beard region!
            sh, sw, _ = sr_art.shape
            yy, xx = np.mgrid[0:sh, 0:sw]
            cx_n, cy_n, box_n = cfg["box"]
            ny = (yy - cy_n * sh) / (box_n * sh * 0.65)
            nx = (xx - cx_n * sw) / (box_n * sw * 0.55)
            face_beard_mask = np.clip(1.0 - np.clip(np.sqrt(nx*nx + ny*ny) - 0.5, 0.0, 1.0), 0.0, 1.0)
            face_beard_mask = cv2.GaussianBlur(face_beard_mask.astype(np.float32), (41, 41), 14.0)[:, :, None]

            robe_bg_blend = cv2.addWeighted(sr_art, 0.72, sr_photo, 0.28, 0).astype(np.float32)
            face_photo_blend = cv2.addWeighted(sr_photo, 0.78, sr_art, 0.22, 0).astype(np.float32)
            sr_rgb = np.clip(face_photo_blend * face_beard_mask + robe_bg_blend * (1.0 - face_beard_mask), 0, 255).astype(np.uint8)
        else:
            sr_rgb = run_tiled_sr(esrgan_photo, base_rgb, tile_size=256, tile_pad=24, device=device)

        restored_rgb = enhance_face_gfpgan(
            gfpgan_model=gfpgan,
            img_rgb_u8=sr_rgb,
            face_box_norm=cfg["box"],
            blend_alpha=cfg["blend"],
            device=device,
        )

        final_bgr = cv2.cvtColor(restored_rgb, cv2.COLOR_RGB2BGR)
        final_bgr = cv2.resize(final_bgr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
        final_rgb = cv2.cvtColor(final_bgr, cv2.COLOR_BGR2RGB)
        out_pil = Image.fromarray(final_rgb)

        webp_path = os.path.join(PUBLIC_IMAGES_DIR, f"{fig_id}.webp")
        out_pil.save(webp_path, "WEBP", quality=98, method=6)
        shutil.copy2(webp_path, os.path.join(DIST_IMAGES_DIR, f"{fig_id}.webp"))

        jpg_path = os.path.join(PUBLIC_IMAGES_DIR, f"{fig_id}.jpg")
        out_pil.save(jpg_path, "JPEG", quality=98, subsampling=0)
        shutil.copy2(jpg_path, os.path.join(DIST_IMAGES_DIR, f"{fig_id}.jpg"))

        print(f"   ✅ Restored FHD+ Portrait: {webp_path} ({target_w}x{target_h}, {os.path.getsize(webp_path):,} bytes)\n")

    print("=" * 85)
    print("🎉 전 인물 Real-ESRGAN x4 + GFPGAN v1.4 딥러닝 초해상화 복원 완료!")
    print("=" * 85)


if __name__ == "__main__":
    main()
