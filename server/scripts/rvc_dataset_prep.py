import os
import sys
import argparse
import subprocess
import wave
import contextlib

# Fix Windows console UTF-8 output encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Add local ffmpeg to PATH and pydub converter
ffmpeg_dir = os.path.abspath("ffmpeg")
if os.path.exists(ffmpeg_dir):
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

try:
    from pydub import AudioSegment
    ffmpeg_exe = os.path.join(ffmpeg_dir, "ffmpeg.exe")
    if os.path.exists(ffmpeg_exe):
        AudioSegment.converter = ffmpeg_exe
except Exception:
    pass

def download_youtube_audio(url, output_path):
    """
    Download YouTube Audio using yt_dlp Python API or CLI.
    """
    print(f"[yt-dlp] Downloading: {url}")
    try:
        import yt_dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'wav',
                'preferredquality': '192',
            }],
            'outtmpl': output_path.replace('.wav', ''),
            'quiet': False
        }
        
        if os.path.exists(ffmpeg_dir):
            ydl_opts['ffmpeg_location'] = ffmpeg_dir

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        expected_wav = output_path.replace('.wav', '.wav')
        if os.path.exists(expected_wav):
            return expected_wav
        return output_path
    except ImportError:
        print("[yt-dlp] yt_dlp module not installed. Falling back to subprocess CLI call...")
        cmd = ["yt-dlp", "-x", "--audio-format", "wav", "-o", output_path, url]
        if os.path.exists(ffmpeg_dir):
            cmd.extend(["--ffmpeg-location", ffmpeg_dir])
        subprocess.run(cmd, check=True)
        return output_path
    except Exception as e:
        print(f"[yt-dlp Error]: {e}")
        return None

def slice_audio_file(wav_path, output_dir, prefix="slice", max_sec=15, min_sec=3):
    """
    Slice audio file into 10~15 second chunks using wave/pydub logic.
    """
    os.makedirs(output_dir, exist_ok=True)
    existing_count = len([f for f in os.listdir(output_dir) if f.endswith('.wav')])
    
    try:
        from pydub import AudioSegment
        from pydub.silence import split_on_silence

        print(f"[RVC Dataset Slicer] Slicing file: {wav_path}")
        audio = AudioSegment.from_file(wav_path)

        chunks = split_on_silence(
            audio,
            min_silence_len=500,
            silence_thresh=audio.dBFS - 14 if audio.dBFS != float('-inf') else -40,
            keep_silence=250
        )

        target_duration = max_sec * 1000
        min_duration = min_sec * 1000

        merged_chunks = []
        current_chunk = AudioSegment.empty()

        for chunk in chunks:
            if len(current_chunk) + len(chunk) > target_duration:
                if len(current_chunk) >= min_duration:
                    merged_chunks.append(current_chunk)
                current_chunk = chunk
            else:
                current_chunk += chunk

        if len(current_chunk) >= min_duration:
            merged_chunks.append(current_chunk)

        if not merged_chunks and len(audio) > 0:
            step = target_duration
            for i in range(0, len(audio), step):
                sub = audio[i:i+step]
                if len(sub) >= min_duration:
                    merged_chunks.append(sub)

        print(f"[RVC Dataset Slicer] Extracted {len(merged_chunks)} audio slices from {os.path.basename(wav_path)}.")

        saved_files = []
        for idx, chunk in enumerate(merged_chunks):
            out_file = os.path.join(output_dir, f"{prefix}_{existing_count + idx + 1:04d}.wav")
            chunk.export(out_file, format="wav")
            saved_files.append(out_file)

        return saved_files
    except ImportError:
        print("[RVC Dataset Slicer] Warning: pydub not installed. Using fallback wave slicer.")
        return fallback_wave_slicer(wav_path, output_dir, prefix, max_sec)

def fallback_wave_slicer(wav_path, output_dir, prefix="slice", slice_duration_sec=10):
    saved_files = []
    existing_count = len([f for f in os.listdir(output_dir) if f.endswith('.wav')])
    try:
        with contextlib.closing(wave.open(wav_path, 'rb')) as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            
            chunk_frames = int(framerate * slice_duration_sec)
            total_chunks = (n_frames + chunk_frames - 1) // chunk_frames

            for i in range(total_chunks):
                wf.setpos(i * chunk_frames)
                frames = wf.readframes(chunk_frames)
                out_path = os.path.join(output_dir, f"{prefix}_{existing_count + i + 1:04d}.wav")
                with wave.open(out_path, 'wb') as out_wf:
                    out_wf.setnchannels(n_channels)
                    out_wf.setsampwidth(sampwidth)
                    out_wf.setframerate(framerate)
                    out_wf.writeframes(frames)
                saved_files.append(out_path)
        print(f"[Fallback Slicer] Saved {len(saved_files)} chunks into {output_dir}")
        return saved_files
    except Exception as e:
        print(f"[Fallback Slicer Error]: {e}")
        return []

def process_single_input(input_src, figure_id, idx=1):
    figure_dir = os.path.join("dataset", figure_id)
    os.makedirs(figure_dir, exist_ok=True)
    raw_dir = os.path.join(figure_dir, "raw")
    os.makedirs(raw_dir, exist_ok=True)

    working_wav = os.path.join(raw_dir, f"source_{idx}.wav")

    if input_src.startswith("http://") or input_src.startswith("https://"):
        print(f"\n[Step 1.{idx}] Downloading YouTube Audio: {input_src}")
        downloaded = download_youtube_audio(input_src, working_wav)
        if downloaded and os.path.exists(downloaded):
            working_wav = downloaded
        else:
            print(f"Error downloading YouTube URL '{input_src}'.")
            return []
    else:
        working_wav = input_src

    if not os.path.exists(working_wav):
        print(f"Error: Audio file '{working_wav}' not found.")
        return []

    print(f"[Step 2.{idx}] Isolating vocal stem for source {idx}...")
    clean_vocal_wav = working_wav

    try:
        demucs_cmd = ["demucs", "--two-stems=vocals", "-n", "htdemucs", "-o", raw_dir, working_wav]
        subprocess.run(demucs_cmd, check=True)
        htdemucs_out = os.path.join(raw_dir, "htdemucs", os.path.splitext(os.path.basename(working_wav))[0], "vocals.wav")
        if os.path.exists(htdemucs_out):
            clean_vocal_wav = htdemucs_out
    except Exception:
        print("[Note] Demucs not found or skipped. Using raw audio for slicing.")

    print(f"[Step 3.{idx}] Slicing pure vocal audio into 10~15s clips...")
    slices_dir = os.path.join(figure_dir, "slices")
    slices = slice_audio_file(clean_vocal_wav, slices_dir, prefix=f"sejong_{idx}", max_sec=15)
    return slices

def main():
    parser = argparse.ArgumentParser(description="RVC Multi-Source Audio Dataset Prep")
    parser.add_argument("--inputs", "--input", nargs="+", dest="inputs", required=True, help="One or more YouTube URLs or local audio file paths")
    parser.add_argument("--figure_id", default="king-sejong", help="Identifier for historical figure")
    
    args = parser.parse_args()

    total_slices = []
    print("=" * 70)
    print(f"[RVC Pipeline] Starting RVC Dataset Preparation for: {args.figure_id}")
    print(f" - Inputs ({len(args.inputs)} items): {args.inputs}")
    print("=" * 70)

    for idx, src in enumerate(args.inputs, 1):
        slices = process_single_input(src, args.figure_id, idx)
        total_slices.extend(slices)

    print(f"\n[RVC Pipeline Complete] Dataset prep completed for '{args.figure_id}'!")
    print(f"[RVC Output] Total {len(total_slices)} audio slices ready in: dataset/{args.figure_id}/slices/")

if __name__ == "__main__":
    main()
