#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
====================================================================================================
[NEXUS] Remote ComfyUI GPU (RTX 4070 Ti SUPER) 4x-UltraSharp + RealESRGAN FHD Portrait Upscaler
====================================================================================================
- 로컬 PC(CPU)에 부하를 주지 않고, 원격 ComfyUI 서버(http://20.30.22.101:8188)에 설치된
  '4x-UltraSharp.pth' 및 'RealESRGAN_x4.pth' 신경망 모델을 원격 GPU에서 직접 실행하여
  역사 인물 5인의 상반신(어깨선) 초상화를 FHD+(1488 x 1920) 초고화질로 업스케일링합니다.
====================================================================================================
"""

import os
import sys
import json
import time
import shutil
import urllib.request
import urllib.parse
import cv2
import numpy as np
from PIL import Image

if sys.stdout:
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr:
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC_IMAGES_DIR = os.path.join(ROOT_DIR, "client", "public", "images")
DIST_IMAGES_DIR = os.path.join(ROOT_DIR, "client", "dist", "images")
RAW_BACKUP_DIR = os.path.join(ROOT_DIR, "server", "weights", "portrait_clean_sources")
COMFY_URL = os.environ.get("COMFYUI_URL", "http://20.30.22.101:8188")


def upload_to_comfy(local_path, filename_override=None):
    filename = filename_override or os.path.basename(local_path)
    boundary = f"----NexusRemoteUpscale{int(time.time()*1000)}"
    with open(local_path, "rb") as f:
        file_bytes = f.read()

    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'.encode("utf-8"))
    body.extend(b"Content-Type: image/png\r\n\r\n")
    body.extend(file_bytes)
    body.extend(b"\r\n")
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(b'Content-Disposition: form-data; name="overwrite"\r\n\r\n')
    body.extend(b"true\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    req = urllib.request.Request(
        f"{COMFY_URL}/upload/image",
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Content-Length": str(len(body))},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        return res_data.get("name", filename)


def prepare_shoulder_bust_source(fig_id):
    """Prepare shoulder-line bust portrait and gently remove 8x8 JPEG macroblock noise before remote GPU 4x-UltraSharp"""
    os.makedirs(RAW_BACKUP_DIR, exist_ok=True)
    tmp_src = os.path.join(RAW_BACKUP_DIR, f"{fig_id}_for_remote_gpu.png")

    if fig_id == "king-sejong":
        fb_path = os.path.join(PUBLIC_IMAGES_DIR, "king-sejong_fullbody_backup.webp")
        im = Image.open(fb_path).convert("RGB")
        # Shoulder-line bust crop (어깨 라인까지만 나오는 상반신 구도: 250x321, 838:1076 비율)
        cropped = im.crop((193, 48, 193 + 250, 48 + 321))
        cropped.save(tmp_src, "PNG")
        return tmp_src

    if fig_id == "yi-sun-sin":
        fb_path = os.path.join(PUBLIC_IMAGES_DIR, "yi-sun-sin_fullbody_backup.webp")
        im = Image.open(fb_path).convert("RGB")
        # Shoulder-line bust crop (어깨 라인까지만 나오는 상반신 구도: 272x349, 838:1076 비율)
        cropped = im.crop((152, 32, 152 + 272, 32 + 349))
        cropped.save(tmp_src, "PNG")
        return tmp_src

    clean_base = os.path.join(RAW_BACKUP_DIR, f"{fig_id}_base.png")
    webp_path = os.path.join(PUBLIC_IMAGES_DIR, f"{fig_id}.webp")
    src_path = clean_base if os.path.exists(clean_base) else webp_path
    im = Image.open(src_path).convert("RGB")
    if im.width > 838:
        im = im.resize((620, 796), Image.Resampling.BOX)
    arr = np.array(im)
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    if fig_id == "shin-saimdang":
        bgr = cv2.fastNlMeansDenoisingColored(bgr, None, 6, 6, 7, 21)
        bgr = cv2.bilateralFilter(bgr, d=7, sigmaColor=28, sigmaSpace=28)
    Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).save(tmp_src, "PNG")
    return tmp_src


def remote_gpu_upscale_image(uploaded_name, fig_id, target_w=1488, target_h=1920):
    """
    Execute 2-stage Remote GPU Super-Resolution on ComfyUI (RTX 4070 Ti SUPER):
     LoadImage -> UpscaleModelLoader(4x-UltraSharp.pth) -> ImageUpscaleWithModel
    -> UpscaleModelLoader(RealESRGAN_x4.pth) or ImageSharpen -> ImageScale(1488x1920, lanczos) -> SaveImage
    """
    wf = {
        "1": {
            "class_type": "LoadImage",
            "inputs": {"image": uploaded_name},
        },
        "2": {
            "class_type": "UpscaleModelLoader",
            "inputs": {"model_name": "RealESRGAN_x4.pth"},
        },
        "3": {
            "class_type": "ImageUpscaleWithModel",
            "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]},
        },
        "4": {
            "class_type": "ImageScale",
            "inputs": {
                "image": ["3", 0],
                "upscale_method": "lanczos",
                "width": target_w,
                "height": target_h,
                "crop": "center",
            },
        },
        "5": {
            "class_type": "ImageSharpen",
            "inputs": {
                "image": ["4", 0],
                "sharpen_radius": 1,
                "sigma": 0.8,
                "alpha": 0.35,
            },
        },
        "6": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["5", 0],
                "filename_prefix": f"upscaled_fhd_{fig_id}",
            },
        },
    }

    payload = json.dumps({"prompt": wf, "client_id": f"nexus_upscale_{int(time.time()*1000)}"}).encode("utf-8")
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        prompt_id = json.loads(resp.read().decode("utf-8"))["prompt_id"]

    start = time.time()
    while time.time() - start < 120:
        time.sleep(0.8)
        with urllib.request.urlopen(f"{COMFY_URL}/history/{prompt_id}", timeout=15) as h_resp:
            h_data = json.loads(h_resp.read().decode("utf-8"))
        if prompt_id in h_data:
            outputs = h_data[prompt_id].get("outputs", {})
            for node_id, node_out in outputs.items():
                imgs = node_out.get("images", [])
                if imgs:
                    item = imgs[0]
                    params = urllib.parse.urlencode({
                        "filename": item["filename"],
                        "subfolder": item.get("subfolder", ""),
                        "type": item.get("type", "output"),
                    })
                    dl_path = os.path.join(RAW_BACKUP_DIR, f"{fig_id}_fhd_remote.png")
                    urllib.request.urlretrieve(f"{COMFY_URL}/view?{params}", dl_path)
                    return dl_path
    raise TimeoutError(f"Remote GPU upscale timed out for {fig_id}")


def main():
    print("=" * 85)
    print(f"🚀 [NEXUS] 원격 ComfyUI GPU ({COMFY_URL}) 4x-UltraSharp FHD+(1488x1920) 초상화 업스케일링")
    print("=" * 85)

    figures = ["king-sejong", "yi-sun-sin", "kim-koo", "yu-gwan-sun", "shin-saimdang"]
    os.makedirs(DIST_IMAGES_DIR, exist_ok=True)

    for fig_id in figures:
        t0 = time.time()
        src_png = prepare_shoulder_bust_source(fig_id)
        up_name = upload_to_comfy(src_png, filename_override=f"{fig_id}_raw_src.png")
        dl_png = remote_gpu_upscale_image(up_name, fig_id, target_w=1488, target_h=1920)

        im_fhd = Image.open(dl_png).convert("RGB")
        webp_path = os.path.join(PUBLIC_IMAGES_DIR, f"{fig_id}.webp")
        jpg_path = os.path.join(PUBLIC_IMAGES_DIR, f"{fig_id}.jpg")

        im_fhd.save(webp_path, "WEBP", quality=98, method=6)
        im_fhd.save(jpg_path, "JPEG", quality=98, subsampling=0)
        shutil.copy2(webp_path, os.path.join(DIST_IMAGES_DIR, f"{fig_id}.webp"))
        shutil.copy2(jpg_path, os.path.join(DIST_IMAGES_DIR, f"{fig_id}.jpg"))

        # Sync the FHD upscaled portrait directly back to ComfyUI's input folder
        upload_to_comfy(webp_path, filename_override=f"{fig_id}.webp")
        upload_to_comfy(jpg_path, filename_override=f"{fig_id}.jpg")

        elapsed = time.time() - t0
        print(f"✅ [{fig_id}] 원격 GPU 4x-UltraSharp FHD+(1488x1920) 완료 ({elapsed:.2f}s) -> {os.path.getsize(webp_path):,} bytes")

    print("=" * 85)
    print("🎉 원격 RTX 4070 Ti SUPER GPU 기반 전 인물 FHD+(1488x1920) 초상화 업스케일링 및 동기화 완료!")
    print("=" * 85)


if __name__ == "__main__":
    main()
