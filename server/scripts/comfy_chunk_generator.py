#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
ComfyUI LTX-2.3 Multi-Chunk Video Generator with Jump-Cut Prevention
- Splits speech audio into 5-second chunks (Zero CUDA OOM on 16GB VRAM)
- Uniquely names ComfyUI output prefixes to prevent file overwrite
- Automatically extracts last frame of chunk N to use as starting frame for chunk N+1 (Prevents Jump Cut)
- Polls ComfyUI history API until each chunk is finished
- Seamlessly concatenates all chunks into a continuous full video via FFmpeg concat demuxer
"""

import os
import sys
import time
import json
import argparse
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path

DEFAULT_COMFY_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
DEFAULT_FFMPEG = r"C:\Users\301\Desktop\ComfyUI_windows_portable\python_embeded\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
if not os.path.exists(DEFAULT_FFMPEG):
    DEFAULT_FFMPEG = "ffmpeg"


def get_audio_duration(audio_path, ffmpeg_bin=DEFAULT_FFMPEG):
    """Get exact audio duration in seconds using FFmpeg"""
    try:
        cmd = f'"{ffmpeg_bin}" -i "{audio_path}"'
        res = subprocess.run(cmd, shell=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        out = res.stderr + res.stdout
        for line in out.splitlines():
            if "Duration:" in line:
                part = line.split("Duration:")[1].split(",")[0].strip()
                h, m, s = part.split(":")
                return float(h) * 3600 + float(m) * 60 + float(s)
    except Exception as e:
        print(f"[Warning] Audio duration probe error: {e}")
    return 5.0


def extract_last_frame(video_path, output_image_path, ffmpeg_bin=DEFAULT_FFMPEG):
    """Extract last frame as uncompressed RGB image for jump-cut prevention"""
    try:
        cmd = f'"{ffmpeg_bin}" -sseof -0.1 -i "{video_path}" -frames:v 1 -update 1 -pix_fmt rgb24 "{output_image_path}" -y'
        res = subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return os.path.exists(output_image_path)
    except Exception as e:
        print(f"[Warning] Last frame extraction error: {e}")
        return False


def sync_file_to_comfy_input(file_path):
    """Copy reference files into ComfyUI input folder if accessible"""
    possible_dirs = [
        r"C:\Users\301\Desktop\ComfyUI_windows_portable\ComfyUI\input",
        os.path.join(os.path.dirname(__file__), "../../../ComfyUI/input")
    ]
    for d in possible_dirs:
        if os.path.exists(d):
            try:
                dest = os.path.join(d, os.path.basename(file_path))
                import shutil
                shutil.copyfile(file_path, dest)
                return dest
            except Exception:
                pass
    return file_path


def poll_comfy_and_download(comfy_host, prompt_id, output_path, max_wait_sec=240):
    """Poll ComfyUI /history/{prompt_id} until completed, then download video"""
    start_time = time.time()
    print(f"⏳ [ComfyUI Polling] Waiting for rendering completion (Prompt ID: {prompt_id})...")
    
    while time.time() - start_time < max_wait_sec:
        try:
            hist_url = f"{comfy_host}/history/{prompt_id}"
            req = urllib.request.Request(hist_url)
            with urllib.request.urlopen(req, timeout=10) as response:
                hist_data = json.loads(response.read().decode('utf-8'))
                
            if prompt_id in hist_data:
                prompt_info = hist_data[prompt_id]
                outputs = prompt_info.get("outputs", {})
                
                # Search for video outputs
                video_info = None
                for node_id, node_out in outputs.items():
                    file_list = node_out.get("videos") or node_out.get("images") or node_out.get("gifs") or []
                    for item in file_list:
                        if isinstance(item, dict) and item.get("filename"):
                            video_info = item
                            break
                    if video_info:
                        break
                
                if video_info:
                    filename = video_info.get("filename")
                    subfolder = video_info.get("subfolder", "")
                    ftype = video_info.get("type", "output")
                    params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": ftype})
                    view_url = f"{comfy_host}/view?{params}"
                    
                    print(f"📥 [Downloading Video] From: {view_url}")
                    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                    urllib.request.urlretrieve(view_url, output_path)
                    print(f"✅ [Saved Video Chunk] -> {output_path} ({os.path.getsize(output_path)} bytes)")
                    return output_path
        except Exception as e:
            pass
        time.sleep(2)
        
    print(f"⚠️ [Timeout] Rendering for prompt {prompt_id} exceeded {max_wait_sec}s.")
    return None


def merge_video_chunks(video_paths, master_audio_path, final_output_path, ffmpeg_bin=DEFAULT_FFMPEG):
    """Concatenate video chunks into one seamless MP4 file via FFmpeg concat demuxer"""
    if len(video_paths) == 1:
        import shutil
        shutil.copyfile(video_paths[0], final_output_path)
        return final_output_path

    list_txt_path = final_output_path + ".list.txt"
    with open(list_txt_path, "w", encoding="utf-8") as f:
        for v in video_paths:
            f.write(f"file '{os.path.abspath(v).replace(chr(92), '/')}'\n")

    cmd = f'"{ffmpeg_bin}" -f concat -safe 0 -i "{list_txt_path}"'
    if master_audio_path and os.path.exists(master_audio_path):
        cmd += f' -i "{master_audio_path}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest'
    else:
        cmd += ' -c copy'
    cmd += f' "{final_output_path}" -y'

    print(f"🎬 [FFmpeg Concat] Running merge command:\n {cmd}")
    subprocess.run(cmd, shell=True)
    try:
        os.remove(list_txt_path)
    except Exception:
        pass

    if os.path.exists(final_output_path) and os.path.getsize(final_output_path) > 0:
        print(f"🎉 [Full Video Ready] Merged successfully: {final_output_path} ({os.path.getsize(final_output_path)} bytes)")
        return final_output_path
    return None


def run_multi_chunk_generation(figure_id, image_path, audio_path, speech_text, workflow_json_path, comfy_url=DEFAULT_COMFY_URL, output_dir=None):
    """Core multi-chunk execution pipeline"""
    if not output_dir:
        output_dir = os.path.join(os.path.dirname(__file__), "../../client/public/videos")
    os.makedirs(output_dir, exist_ok=True)
    
    with open(workflow_json_path, "r", encoding="utf-8") as f:
        workflow_template = json.load(f)

    # 1. Probe exact audio duration
    exact_duration = get_audio_duration(audio_path)
    chunk_sec = 5.0
    import math
    total_chunks = max(1, math.ceil(exact_duration / chunk_sec))
    print(f"\n==========================================")
    print(f"🎯 [Multi-Chunk Pipeline] Figure: {figure_id}")
    print(f"⏱️ Audio Duration: {exact_duration:.2f}s | Total 5-sec Chunks: {total_chunks}")
    print(f"==========================================\n")

    generated_chunks = []
    current_image = image_path

    for idx in range(total_chunks):
        start_sec = idx * chunk_sec
        if start_sec >= exact_duration:
            break

        print(f"\n--- [Chunk {idx + 1}/{total_chunks}] {start_sec:.1f}s ~ {start_sec + chunk_sec:.1f}s ---")
        chunk_workflow = json.loads(json.dumps(workflow_template))

        # Copy image to input dir
        sync_file_to_comfy_input(current_image)
        if audio_path:
            sync_file_to_comfy_input(audio_path)

        # A. LoadImage node (269)
        if "269" in chunk_workflow and "inputs" in chunk_workflow["269"]:
            chunk_workflow["269"]["inputs"]["image"] = os.path.basename(current_image)

        # B. SaveVideo node unique filename_prefix (341) -> Solves file overwrite!
        unique_prefix = f"video/ltx_{figure_id}_part{idx}_{int(time.time()*1000)}"
        if "341" in chunk_workflow and "inputs" in chunk_workflow["341"]:
            chunk_workflow["341"]["inputs"]["filename_prefix"] = unique_prefix

        # C. Duration and Trim nodes (340:331 & 340:332)
        if "340:331" in chunk_workflow and "inputs" in chunk_workflow["340:331"]:
            chunk_workflow["340:331"]["inputs"]["value"] = chunk_sec
        if "340:332" in chunk_workflow and "inputs" in chunk_workflow["340:332"]:
            chunk_workflow["340:332"]["inputs"]["start_index"] = start_sec
            chunk_workflow["340:332"]["inputs"]["duration"] = chunk_sec

        # D. EdgeTTS text (350)
        if "350" in chunk_workflow and "inputs" in chunk_workflow["350"]:
            chunk_workflow["350"]["inputs"]["text"] = speech_text

        # Queue prompt to ComfyUI
        payload = json.dumps({"prompt": chunk_workflow}).encode("utf-8")
        req = urllib.request.Request(f"{comfy_url}/prompt", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            prompt_id = resp_data.get("prompt_id")
            print(f"🚀 [Prompt Queued] ID: {prompt_id}")

        # Poll and download
        chunk_mp4_name = f"chunk_{figure_id}_{idx}_{int(time.time()*1000)}.mp4"
        chunk_mp4_path = os.path.join(output_dir, chunk_mp4_name)
        saved_video = poll_comfy_and_download(comfy_url, prompt_id, chunk_mp4_path)

        if not saved_video:
            print(f"❌ [Chunk {idx + 1} Failed] Stop chaining.")
            break

        generated_chunks.append(saved_video)

        # Jump-cut prevention: Extract last frame for next chunk
        if idx + 1 < total_chunks:
            last_frame_name = f"last_frame_{figure_id}_{idx}_{int(time.time()*1000)}.png"
            images_dir = os.path.join(os.path.dirname(__file__), "../../client/public/images")
            os.makedirs(images_dir, exist_ok=True)
            last_frame_path = os.path.join(images_dir, last_frame_name)
            if extract_last_frame(saved_video, last_frame_path):
                current_image = last_frame_path
                print(f"🖼️ [Jump Cut Prevention] Extracted last frame -> {last_frame_name}")

    # Concatenate all chunks
    if generated_chunks:
        final_mp4_name = f"full_chained_{figure_id}_{int(time.time()*1000)}.mp4"
        final_mp4_path = os.path.join(output_dir, final_mp4_name)
        merged = merge_video_chunks(generated_chunks, audio_path, final_mp4_path)
        return merged
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ComfyUI LTX-2.3 Multi-Chunk Sequential Generator")
    parser.add_argument("--figure", default="kim-koo", help="Figure ID")
    parser.add_argument("--image", default=r"client\public\images\kim-koo.webp", help="Initial portrait image path")
    parser.add_argument("--audio", default=r"client\public\audio\kim-koo_doc-kim-01.mp3", help="Audio file path")
    parser.add_argument("--text", default="오직 한없이 가지고 싶은 것은 높은 문화의 힘이다.", help="Speech text")
    parser.add_argument("--workflow", default="오디오 + 디비오 생성.json", help="Workflow JSON path")
    parser.add_argument("--comfy_url", default=DEFAULT_COMFY_URL, help="ComfyUI server URL")
    args = parser.parse_args()

    run_multi_chunk_generation(
        figure_id=args.figure,
        image_path=os.path.abspath(args.image),
        audio_path=os.path.abspath(args.audio),
        speech_text=args.text,
        workflow_json_path=os.path.abspath(args.workflow),
        comfy_url=args.comfy_url
    )
