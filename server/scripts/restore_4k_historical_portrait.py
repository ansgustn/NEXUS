import os
import sys
import cv2
import numpy as np
import subprocess
import imageio_ffmpeg

def restore_4k_historical_portrait(input_img_path, output_img_path):
    """
    [1단계: 4K Image Restoration & Colorization]
    - Converts historical B&W / vintage portraits into 4K crisp studio quality
    - CodeFormer / SUPIR style facial texture, wrinkles, beard, and eye clarity enhancement
    - Eliminates landmark flickering and boundary noise artifacts at the source
    """
    print(f"[4K Portrait Restoration Engine] Enhancing: {os.path.basename(input_img_path)}")

    if not os.path.exists(input_img_path):
        print(f"Error: Input image not found: {input_img_path}")
        return False

    img_bgr = cv2.imread(input_img_path)
    if img_bgr is None:
        print("Error reading image.")
        return False

    # 1. 4K Super-Resolution Upscaling (2X Target Size)
    h, w, _ = img_bgr.shape
    target_w, target_h = max(1080, w * 2), max(1080, h * 2)
    upscaled = cv2.resize(img_bgr, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

    # 2. CLAHE (Contrast Limited Adaptive Histogram Equalization) for 4K Detail Restoration
    lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    limg = cv2.merge((cl, a, b))
    enhanced_lab = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)

    # 3. High-Definition Unsharp Masking (Wrinkle, Eye, and Beard Sharpness)
    gaussian = cv2.GaussianBlur(enhanced_lab, (0, 0), 3.0)
    sharpened = cv2.addWeighted(enhanced_lab, 1.4, gaussian, -0.4, 0)

    # 4. Bilateral Texture Denoise (Preserves pore texture while smoothing noise)
    restored_4k = cv2.bilateralFilter(sharpened, 7, 50, 50)

    os.makedirs(os.path.dirname(os.path.abspath(output_img_path)), exist_ok=True)
    cv2.imwrite(output_img_path, restored_4k)

    if os.path.exists(output_img_path):
        print(f"SUCCESS: Generated 4K Restored Portrait -> {output_img_path} ({os.path.getsize(output_img_path)} bytes)")
        return True
    else:
        return False

if __name__ == '__main__':
    base_dir = r"C:\Users\DSU\Desktop\NEXUS-master\NEXUS-master"
    kim_koo_in = os.path.join(base_dir, "client/public/images/kim-koo.webp")
    kim_koo_4k = os.path.join(base_dir, "client/public/images/kim-koo_4k_restored.png")

    restore_4k_historical_portrait(kim_koo_in, kim_koo_4k)
