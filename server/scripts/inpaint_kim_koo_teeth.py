import os
import sys
import cv2
import numpy as np
import torch

def Automated_Lip_Inpainting_Preprocess_Preserve_Thickness(input_image_path, output_image_path, mouth_cx_ratio=0.4684, mouth_cy_ratio=0.4809):
    """
    Automated Lip Micro-Aperture Inpainting Pre-processing with 100% Full Lip Thickness Preservation
    - Preserves 100% of original upper & lower lip thickness and lip contour
    - Micro-slit inner seam aperture only (aperture_h = 0.012)
    - Prevents lips from looking thin
    """
    print(f"[Full Lip Thickness Preservation Pre-processor] Source: {os.path.basename(input_image_path)}")

    img_bgr = cv2.imread(input_image_path)
    if img_bgr is None:
        img_bgr = cv2.imdecode(np.fromfile(input_image_path, dtype=np.uint8), cv2.IMREAD_COLOR)

    if img_bgr is None:
        print(f"Error: Cannot read image {input_image_path}")
        return False

    h, w, c = img_bgr.shape
    cx_px = int(w * mouth_cx_ratio)
    cy_px = int(h * mouth_cy_ratio)

    aperture_w = int(w * 0.13)
    # Ultra-precise micro-slit height (0.012) to preserve 100% full lip thickness!
    aperture_h = int(h * 0.012)

    img_out = img_bgr.copy()

    # 1. Micro-slit dark oral cavity background strictly inside inner seam
    cavity = np.zeros_like(img_out)
    cv2.ellipse(cavity, (cx_px, cy_px), (aperture_w // 2, max(1, aperture_h // 2)), 0, 0, 360, (25, 20, 20), -1)

    # 2. Subtle historical teeth line guide
    teeth_y = cy_px - max(1, aperture_h // 4)
    cv2.ellipse(cavity, (cx_px, teeth_y), (int(aperture_w * 0.32), max(1, aperture_h // 3)), 0, 0, 180, (220, 225, 228), -1)

    # 3. High-precision inner-seam-only alpha blending mask (preserving outer lip thickness 100%)
    mask = np.zeros((h, w), dtype=np.float32)
    cv2.ellipse(mask, (cx_px, cy_px), (aperture_w // 2, max(1, aperture_h // 2)), 0, 0, 360, 0.90, -1)
    mask_blur = cv2.GaussianBlur(mask, (5, 5), 0)
    mask_3d = np.repeat(mask_blur[:, :, np.newaxis], 3, axis=2)

    # Blend inpainted inner seam ONLY, keeping 100% full lip thickness intact
    img_open = (img_out * (1.0 - mask_3d) + cavity * mask_3d).astype(np.uint8)

    os.makedirs(os.path.dirname(output_image_path), exist_ok=True)
    cv2.imwrite(output_image_path, img_open)
    print(f"SUCCESS: Saved Full Thickness Open Portrait: {output_image_path} ({os.path.getsize(output_image_path)} bytes)")
    return True

if __name__ == '__main__':
    base_dir = "c:/Users/301/Desktop/NEXUS-master/NEXUS-master"
    src_img = os.path.join(base_dir, "client/public/images/kim-koo.webp")
    dst_img = os.path.join(base_dir, "client/public/images/kim-koo_open.webp")

    Automated_Lip_Inpainting_Preprocess_Preserve_Thickness(src_img, dst_img)
