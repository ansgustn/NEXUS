import os
import sys
import argparse
import subprocess
import cv2
import torch
import numpy as np
import imageio_ffmpeg

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eye_blink_model import FIGURE_EYE_CONFIGS, BLINK_PROFILE, compute_eye_displacement_template

device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

def inject_eye_blinks(input_video_path, figure_id, output_video_path=None, force=False):
    """
    Inject natural biological eye blinks into speech videos using anatomical eyelid closure.
    Preserves audio losslessly and leaves mouth/lip-sync 100% untouched.
    """
    if not os.path.exists(input_video_path):
        print(f"[inject_eye_blinks] Input not found: {input_video_path}")
        return False

    if figure_id not in FIGURE_EYE_CONFIGS:
        print(f"[inject_eye_blinks] Unknown figure '{figure_id}', skipping.")
        return False

    # Dynamic AI videos (Kim Gu, King Sejong preset) already have inherent, natural eye blinks.
    # But for Wav2Lip (which is based on static images), blinks should be injected with force=True.
    if figure_id in ['kim-koo', 'king-sejong'] and not force:
        print(f"[inject_eye_blinks] Skipping {figure_id}: Inherent natural AI blinks are already present.")
        return True

    in_place = False
    if output_video_path is None or output_video_path == input_video_path:
        in_place = True
        output_video_path = input_video_path + '.tmp_blink.mp4'

    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        print(f"[inject_eye_blinks] Cannot open {input_video_path}")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    w = orig_w - (orig_w % 2)
    h = orig_h - (orig_h % 2)

    if total_frames <= 10:
        cap.release()
        return False

    # 1. Extract audio losslessly
    temp_dir = os.path.dirname(os.path.abspath(output_video_path))
    temp_audio = os.path.join(temp_dir, f"_temp_audio_{os.getpid()}_{np.random.randint(1000, 9999)}.aac")
    if os.path.exists(temp_audio):
        try: os.remove(temp_audio)
        except Exception: pass

    subprocess.run(
        [ffmpeg_exe, '-y', '-i', input_video_path, '-vn', '-acodec', 'copy', temp_audio],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    has_audio = os.path.exists(temp_audio) and os.path.getsize(temp_audio) > 500

    # 2. Build calm, dignified biological blink schedule (1 blink every ~5.0 - 7.5 seconds)
    # Eliminates rapid 'dry eye' fluttering; ensures regal, steady gaze
    blink_schedule = [0.0] * total_frames
    
    frame_idx = int(fps * np.random.uniform(3.2, 4.2))
    while frame_idx < total_frames - 10:
        for offset, val in enumerate(BLINK_PROFILE):
            if frame_idx + offset < total_frames:
                blink_schedule[frame_idx + offset] = val
        frame_idx += int(fps * np.random.uniform(5.2, 7.5))

    # 3. Precompute grid & anatomical displacement template on device
    grid_y, grid_x = torch.meshgrid(
        torch.linspace(-1, 1, h, device=device),
        torch.linspace(-1, 1, w, device=device),
        indexing='ij'
    )
    base_grid = torch.stack((grid_x, grid_y), dim=-1).unsqueeze(0)

    eye_disp_x, eye_disp_y = compute_eye_displacement_template(grid_x, grid_y, figure_id, device)

    temp_video = os.path.join(temp_dir, f"_temp_video_{os.getpid()}_{np.random.randint(1000, 9999)}.mp4")
    cmd = [
        ffmpeg_exe, '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{w}x{h}',
        '-pix_fmt', 'bgr24',
        '-r', str(fps),
        '-i', '-',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        temp_video
    ]
    pipe = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    cur_idx = 0
    with torch.no_grad():
        while True:
            ret, frame = cap.read()
            if not ret or cur_idx >= total_frames:
                break

            f = frame[:h, :w]
            b_amount = blink_schedule[cur_idx] if cur_idx < len(blink_schedule) else 0.0

            if b_amount == 0.0:
                pipe.stdin.write(f.tobytes())
            else:
                t_frame = torch.from_numpy(f).permute(2, 0, 1).unsqueeze(0).float().to(device)
                cur_disp_x = eye_disp_x * b_amount
                cur_disp_y = eye_disp_y * b_amount
                deformed_grid = base_grid + torch.stack((cur_disp_x, cur_disp_y), dim=-1).unsqueeze(0)
                warped = torch.nn.functional.grid_sample(
                    t_frame,
                    deformed_grid,
                    mode='bilinear',
                    padding_mode='border',
                    align_corners=True
                )
                out_bgr = warped.squeeze(0).permute(1, 2, 0).cpu().numpy().clip(0, 255).astype(np.uint8)
                pipe.stdin.write(out_bgr.tobytes())

            cur_idx += 1

    cap.release()
    pipe.stdin.close()
    pipe.wait()

    # 4. Mux video with original audio
    mux_cmd = [ffmpeg_exe, '-y', '-i', temp_video]
    if has_audio:
        mux_cmd.extend(['-i', temp_audio, '-c:v', 'copy', '-c:a', 'copy', '-shortest'])
    else:
        mux_cmd.extend(['-c:v', 'copy'])
    mux_cmd.extend(['-movflags', '+faststart', output_video_path])

    subprocess.run(mux_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Cleanup temp files
    for p in [temp_video, temp_audio]:
        if os.path.exists(p):
            try: os.remove(p)
            except Exception: pass

    # If in-place replacement was requested
    if in_place and os.path.exists(output_video_path):
        target_path = input_video_path
        try:
            os.replace(output_video_path, target_path)
            print(f"[inject_eye_blinks] Successfully injected blinks in-place: {target_path}")
            return True
        except Exception as e:
            print(f"[inject_eye_blinks] In-place replace error: {e}")
            return False

    print(f"[inject_eye_blinks] Successfully injected blinks: {output_video_path}")
    return True

def process_all_historical_presets():
    import json
    docs_path = 'server/data/historical_docs.json'
    with open(docs_path, encoding='utf-8') as f:
        docs = json.load(f)

    processed_set = set()
    print(f"=== Batch Injecting Eye Blinks into Preset Videos ({len(docs)} docs) ===")
    for doc in docs:
        fig_id = doc.get('figureId')
        v_rel = doc.get('videoUrl')
        if not v_rel:
            continue
        v_abs = os.path.join('client/public', v_rel.lstrip('/'))
        if v_abs in processed_set:
            continue
        if not os.path.exists(v_abs):
            print(f"File not found, skipping: {v_abs}")
            continue

        print(f"Injecting blinks into [{fig_id}]: {v_rel} ...")
        inject_eye_blinks(v_abs, fig_id, None)
        processed_set.add(v_abs)

    # Also process default videos from figures.json if not already processed
    figures_path = 'server/data/figures.json'
    with open(figures_path, encoding='utf-8') as f:
        figs = json.load(f)
    for fig in figs:
        fig_id = fig.get('id')
        def_v = fig.get('defaultVideoUrl')
        if def_v:
            v_abs = os.path.join('client/public', def_v.lstrip('/'))
            if v_abs not in processed_set and os.path.exists(v_abs):
                print(f"Injecting blinks into default video [{fig_id}]: {def_v} ...")
                inject_eye_blinks(v_abs, fig_id, None)
                processed_set.add(v_abs)

    print(f"=== Completed blink injection for {len(processed_set)} speech videos! ===")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="PyTorch CUDA Eye Blink Injector for Talking Videos")
    parser.add_argument('--input', '-i', type=str, help="Input video path")
    parser.add_argument('--figure', '-f', type=str, help="Figure ID (kim-koo, king-sejong, etc.)")
    parser.add_argument('--output', '-o', type=str, default=None, help="Output video path (default: in-place replace)")
    parser.add_argument('--force', action='store_true', help="Force blink injection even for Kim Gu and King Sejong (for Wav2Lip videos)")
    parser.add_argument('--all-presets', action='store_true', help="Batch process all 15 historical preset videos in-place")

    args = parser.parse_args()

    if args.all_presets:
        process_all_historical_presets()
    elif args.input and args.figure:
        inject_eye_blinks(args.input, args.figure, args.output, force=args.force)
    else:
        parser.print_help()
