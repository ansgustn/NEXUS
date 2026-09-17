"""
eye_blink_model.py
==================
Anatomical Biological Eyelid Closure Engine for AI Talking Avatars.
- True downward eyelid descent covering pupil and iris completely.
- Preserves 100% stationary background, glasses frames, and forehead.
- Pure CUDA Tensor grid deformation with zero bilinear loss during idle.
"""

import torch
import numpy as np

FIGURE_EYE_CONFIGS = {
    'shin-saimdang': {
        'left':  {'cx': -0.0275, 'cy': -0.4786, 'rx': 0.0525, 'ry': 0.0177, 'delta_travel': 0.38, 'above_span': 0.20, 'angle_deg': 0.0},
        'right': {'cx':  0.2470, 'cy': -0.4647, 'rx': 0.0418, 'ry': 0.0158, 'delta_travel': 0.38, 'above_span': 0.20, 'angle_deg': 0.0},
    },
    'kim-koo': {
        'left':  {'cx': -0.2208, 'cy': -0.3764, 'rx': 0.0668, 'ry': 0.0158, 'delta_travel': 1.20, 'above_span': 0.30, 'angle_deg': -6.0},
        'right': {'cx':  0.1289, 'cy': -0.3745, 'rx': 0.0621, 'ry': 0.0158, 'delta_travel': 1.20, 'above_span': 0.30, 'angle_deg': 8.0},
    },
    'yu-gwan-sun': {
        'left':  {'cx': -0.1314, 'cy': -0.4381, 'rx': 0.0597, 'ry': 0.0167, 'delta_travel': 0.40, 'above_span': 0.20, 'angle_deg': 0.0},
        'right': {'cx':  0.1398, 'cy': -0.4437, 'rx': 0.0562, 'ry': 0.0149, 'delta_travel': 0.40, 'above_span': 0.20, 'angle_deg': 0.0},
    },
    'king-sejong': {
        'left':  {'cx': -0.0541, 'cy': -0.6347, 'rx': 0.0350, 'ry': 0.0087, 'delta_travel': 0.25, 'above_span': 0.15, 'angle_deg': 0.0},
        'right': {'cx':  0.0446, 'cy': -0.6347, 'rx': 0.0350, 'ry': 0.0087, 'delta_travel': 0.25, 'above_span': 0.15, 'angle_deg': 0.0},
    },
    'yi-sun-sin': {
        'left':  {'cx': -0.0942, 'cy': -0.6605, 'rx': 0.0361, 'ry': 0.0065, 'delta_travel': 0.25, 'above_span': 0.15, 'angle_deg': 0.0},
        'right': {'cx':  0.0481, 'cy': -0.6605, 'rx': 0.0361, 'ry': 0.0065, 'delta_travel': 0.25, 'above_span': 0.15, 'angle_deg': 0.0},
    }
}

# 5-frame natural biological eyelid blink profile (200ms at 25 FPS)
BLINK_PROFILE = [0.35, 0.85, 1.00, 0.60, 0.20]

def compute_eye_displacement_template(grid_x, grid_y, fig_id, device):
    """
    Precompute full-frame CUDA Tensor displacement template (disp_x, disp_y)
    for anatomical biological eyelid closure.
    - Grounded lower eyelid: 100% stationary lower eyelid and eye socket (zero downward translation).
    - Grounded upper orbit: Strictly confined eyelid motion; zero distortion on eyebrow, forehead, glasses.
    - Curvilinear almond seam: Follows natural palpebral margin curve from canthus to canthus.
    - Isotropic Euclidean Rotation: Supports slanted/tilted eyes (e.g. Kim Gu -6° / +8°) without shear distortion.
    - Eliminates all side-slits ('옆트임') and ghost wrinkles.
    """
    cur_h, cur_w = grid_y.shape
    if fig_id == 'king-sejong' and cur_w >= 800 and cur_h >= 1000:
        # High-res 832x1024 dynamic video framing override
        cfg = {
            'left':  {'cx': -0.0493, 'cy': -0.6739, 'rx': 0.0277, 'ry': 0.0088, 'delta_travel': 0.25, 'above_span': 0.15, 'angle_deg': 0.0},
            'right': {'cx':  0.0481, 'cy': -0.6739, 'rx': 0.0277, 'ry': 0.0088, 'delta_travel': 0.25, 'above_span': 0.15, 'angle_deg': 0.0},
        }
    else:
        cfg = FIGURE_EYE_CONFIGS.get(fig_id)
    if not cfg:
        cfg = {
            'left':  {'cx': -0.150, 'cy': -0.400, 'rx': 0.060, 'ry': 0.018, 'delta_travel': 0.35, 'above_span': 0.20, 'angle_deg': 0.0},
            'right': {'cx':  0.150, 'cy': -0.400, 'rx': 0.060, 'ry': 0.018, 'delta_travel': 0.35, 'above_span': 0.20, 'angle_deg': 0.0}
        }

    disp_template_x = torch.zeros_like(grid_x, device=device)
    disp_template_y = torch.zeros_like(grid_y, device=device)

    half_w = cur_w / 2.0
    half_h = cur_h / 2.0

    for side in ['left', 'right']:
        eye = cfg[side]
        cx, cy = eye['cx'], eye['cy']
        rx, ry = eye['rx'], eye['ry']
        delta_travel = eye['delta_travel']
        above_span = eye['above_span']
        angle_deg = eye.get('angle_deg', 0.0)

        if abs(angle_deg) > 1e-4:
            # Isotropic Euclidean rotation in pixel coordinates
            ang_rad = np.radians(angle_deg)
            cos_a = float(np.cos(ang_rad))
            sin_a = float(np.sin(ang_rad))

            rel_x_pix = (grid_x - cx) * half_w
            rel_y_pix = (grid_y - cy) * half_h
            rx_pix = rx * half_w
            ry_pix = ry * half_h

            rot_x = rel_x_pix * cos_a + rel_y_pix * sin_a
            rot_y = -rel_x_pix * sin_a + rel_y_pix * cos_a

            dx = rot_x / rx_pix
            dy = rot_y / ry_pix

            h_in = (dx.abs() <= 1.0)
            arch = torch.where(h_in, torch.sqrt(torch.clamp(1.0 - dx**2, min=0.0)), torch.zeros_like(dx))

            y_top = - 0.95 * arch
            y_seam = 0.95 * arch
            fissure_h = y_seam - y_top

            in_aperture = h_in & (dy >= y_top) & (dy <= y_seam)
            tau = torch.where(in_aperture, (dy - y_top) / (fissure_h + 1e-6), torch.zeros_like(dy))
            y_src_inside = y_top - (delta_travel * arch) * (1.0 - tau)
            disp_rot_y_inside = torch.where(in_aperture, (y_src_inside - dy) * ry_pix, torch.zeros_like(dy))

            in_above = h_in & (dy < y_top) & (dy >= y_top - above_span * arch)
            d_above = torch.clamp((y_top - dy) / (above_span * arch + 1e-6), 0.0, 1.0)
            above_decay = 0.5 + 0.5 * torch.cos(torch.pi * d_above)
            disp_rot_y_above = torch.where(in_above, (-delta_travel * arch * above_decay) * ry_pix, torch.zeros_like(dy))

            disp_rot_y_pix = disp_rot_y_inside + disp_rot_y_above

            # Rotate displacement vector back to image plane and normalize to [-1, 1]
            disp_x = (-disp_rot_y_pix * sin_a) / half_w
            disp_y = (disp_rot_y_pix * cos_a) / half_h
        else:
            dx = (grid_x - cx) / rx
            dy = (grid_y - cy) / ry

            h_in = (dx.abs() <= 1.0)
            arch = torch.where(h_in, torch.sqrt(torch.clamp(1.0 - dx**2, min=0.0)), torch.zeros_like(dx))

            y_top = - 0.95 * arch
            y_seam = 0.95 * arch
            fissure_h = y_seam - y_top

            # 1. Inside palpebral aperture: y_top <= dy <= y_seam
            in_aperture = h_in & (dy >= y_top) & (dy <= y_seam)
            tau = torch.where(in_aperture, (dy - y_top) / (fissure_h + 1e-6), torch.zeros_like(dy))
            y_src_inside = y_top - (delta_travel * arch) * (1.0 - tau)
            disp_y_inside = torch.where(in_aperture, (y_src_inside - dy) * ry, torch.zeros_like(dy))

            # 2. Above upper lash line: dy < y_top
            in_above = h_in & (dy < y_top) & (dy >= y_top - above_span * arch)
            d_above = torch.clamp((y_top - dy) / (above_span * arch + 1e-6), 0.0, 1.0)
            above_decay = 0.5 + 0.5 * torch.cos(torch.pi * d_above)
            disp_y_above = torch.where(in_above, (-delta_travel * arch * above_decay) * ry, torch.zeros_like(dy))

            disp_x = torch.zeros_like(grid_x)
            disp_y = disp_y_inside + disp_y_above

        disp_template_x = disp_template_x + disp_x
        disp_template_y = disp_template_y + disp_y

    return disp_template_x, disp_template_y
