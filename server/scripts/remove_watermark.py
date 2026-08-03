import os
import sys
import subprocess
import cv2
import numpy as np
import imageio_ffmpeg

def Detect_Watermark_Mask(frame, is_tiled_mode=True):
    """
    Generates an adaptive watermark mask covering both semi-transparent corner logos (D-ID/HeyGen)
    and full-screen tiled / rain-like repeating watermarks.
    
    Works on both dark and bright backgrounds by calculating local median background difference.
    """
    h, w, _ = frame.shape
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    mask = np.zeros((h, w), dtype=np.uint8)
    
    # 1. Bottom-Left Corner Watermark Mask (D-ID / HeyGen logo area: bottom ~15%, left ~35%)
    bl_gray = gray[int(h * 0.85):, :int(w * 0.35)]
    bl_bg = cv2.medianBlur(bl_gray, 17)
    bl_diff = cv2.absdiff(bl_gray, bl_bg)
    _, mask_bl = cv2.threshold(bl_diff, 8, 255, cv2.THRESH_BINARY)
    mask[int(h * 0.85):, :int(w * 0.35)] = mask_bl

    # 2. Full-frame Tiled / Rain Watermark Mask (High-pass local contrast difference)
    if is_tiled_mode:
        median_bg = cv2.medianBlur(gray, 25)
        local_diff = cv2.absdiff(gray, median_bg)
        
        # Capture sharp local variance of semi-transparent watermark text
        _, mask_tiled = cv2.threshold(local_diff, 20, 255, cv2.THRESH_BINARY)
        
        # Combine corner logo mask and tiled watermark mask
        mask = cv2.bitwise_or(mask, mask_tiled)

    # 3. Morphological Dilation to completely cover anti-aliased watermark edges
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dilated_mask = cv2.dilate(mask, kernel, iterations=2)
    
    return dilated_mask

def Inpaint_Video_Watermark(video_path, output_path=None, inpaint_radius=5):
    """
    Removes full-screen, tiled, or rain-like watermarks using OpenCV Telea Video Inpainting.
    Preserves original resolution, frame rate, and audio track.
    """
    if not output_path:
        output_path = video_path

    print(f"[AI Inpainting Engine] Processing Video: {os.path.basename(video_path)}")
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Unable to open video file {video_path}")
        return False

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    temp_video_only = output_path + ".inpainted_temp.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_video_only, fourcc, fps, (width, height))

    frame_count = 0
    print(f"[AI Inpainting Engine] Resolution: {width}x{height}, FPS: {fps:.2f}, Total Frames: {total_frames}")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Generate watermark mask for the current frame
        mask = Detect_Watermark_Mask(frame, is_tiled_mode=True)

        # Apply OpenCV Telea Inpainting algorithm
        inpainted_frame = cv2.inpaint(frame, mask, inpaint_radius, cv2.INPAINT_TELEA)

        out.write(inpainted_frame)
        frame_count += 1
        if frame_count % 30 == 0 or frame_count == total_frames:
            print(f"  Processed {frame_count}/{total_frames} frames ({int(frame_count/total_frames*100)}%)...")

    cap.release()
    out.release()

    # Merge original audio track using FFmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    final_temp = output_path + ".clean.mp4"

    cmd = [
        ffmpeg_exe, '-y',
        '-i', temp_video_only,
        '-i', video_path,
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0?',
        final_temp
    ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    # Cleanup temporary raw video stream
    if os.path.exists(temp_video_only):
        try:
            os.remove(temp_video_only)
        except:
            pass

    if os.path.exists(final_temp) and os.path.getsize(final_temp) > 10000:
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except:
                pass
        os.rename(final_temp, output_path)
        print(f"SUCCESS: AI Inpainting Complete! Clean Video Saved: {output_path} ({os.path.getsize(output_path)} bytes)")
        return True
    else:
        print(f"Inpainting note: {res.stderr.decode('utf-8', errors='ignore')[:300]}")
        return False

def Remove_DID_Watermark(video_path, output_path=None, mode='inpaint'):
    """
    Automated Watermark Removal Dispatcher:
    - mode='inpaint': Uses OpenCV Telea Inpainting (Best for tiled, rain, or semi-transparent watermarks)
    - mode='crop': Uses FFmpeg bottom-left crop (Best for small corner logos)
    """
    if mode == 'inpaint':
        return Inpaint_Video_Watermark(video_path, output_path)
    
    # Fallback / Crop mode
    if not output_path:
        output_path = video_path

    print(f"[Watermark Removal Engine (Crop Mode)] Input Video: {os.path.basename(video_path)}")

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    temp_clean = output_path + ".clean.mp4"

    cmd = [
        ffmpeg_exe, '-y',
        '-i', video_path,
        '-vf', 'crop=in_w:in_h*0.91:0:0,scale=720:720:flags=bicubic',
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'slow',
        '-c:a', 'copy',
        temp_clean
    ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if os.path.exists(temp_clean) and os.path.getsize(temp_clean) > 10000:
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except:
                pass
        os.rename(temp_clean, output_path)
        print(f"SUCCESS: Watermark Cropped Completely! Clean Video Saved: {output_path} ({os.path.getsize(output_path)} bytes)")
        return True
    else:
        print(f"Watermark removal note: {res.stderr.decode('utf-8', errors='ignore')[:300]}")
        return False

if __name__ == '__main__':
    base_dir = "c:/Users/301/Desktop/NEXUS-master/NEXUS-master"
    vid1 = os.path.join(base_dir, "client/public/videos/kim-koo_talking_avatar.mp4")
    vid2 = os.path.join(base_dir, "server/data/output_videos/kim-koo_talking_avatar.mp4")

    if os.path.exists(vid1):
        Remove_DID_Watermark(vid1, mode='inpaint')
    if os.path.exists(vid2):
        Remove_DID_Watermark(vid2, mode='inpaint')
