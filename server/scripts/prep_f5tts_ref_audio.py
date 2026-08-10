import os
import sys
import subprocess
import imageio_ffmpeg

def extract_5sec_reference_audio():
    """
    Extract clean 5-second reference audio (.wav) for F5-TTS Zero-Shot synthesis
    from authentic historical audio archives.
    """
    base_dir = r"C:\Users\DSU\Desktop\NEXUS-master\NEXUS-master"
    ref_dir = os.path.join(base_dir, "server/data/ref_audio")
    os.makedirs(ref_dir, exist_ok=True)

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    # 1. Kim Koo 5-sec Reference Audio (from authentic speech archive)
    src_kim_koo = os.path.join(base_dir, "client/public/audio/kim-koo_culture_power.mp3")
    out_kim_koo = os.path.join(ref_dir, "kim-koo_ref.wav")

    if os.path.exists(src_kim_koo):
        cmd = [
            ffmpeg_exe, '-y',
            '-ss', '00:00:01',
            '-t', '00:00:05',
            '-i', src_kim_koo,
            '-ar', '24000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            out_kim_koo
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if os.path.exists(out_kim_koo):
            print(f"SUCCESS: Extracted Kim Koo 5-sec Reference Audio -> {out_kim_koo}")

    # 2. King Sejong 5-sec Reference Audio
    src_sejong = os.path.join(base_dir, "client/public/audio/king-sejong_speech.mp3")
    out_sejong = os.path.join(ref_dir, "king-sejong_ref.wav")

    if os.path.exists(src_sejong):
        cmd = [
            ffmpeg_exe, '-y',
            '-ss', '00:00:00',
            '-t', '00:00:05',
            '-i', src_sejong,
            '-ar', '24000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            out_sejong
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if os.path.exists(out_sejong):
            print(f"SUCCESS: Extracted King Sejong 5-sec Reference Audio -> {out_sejong}")

    # Create dummy reference files for other figures if needed
    for fig_id in ['yi-sun-sin', 'yu-gwan-sun', 'shin-saimdang']:
        ref_file = os.path.join(ref_dir, f"{fig_id}_ref.wav")
        src_file = os.path.join(base_dir, f"client/public/audio/{fig_id}_speech.mp3")
        if os.path.exists(src_file):
            cmd = [
                ffmpeg_exe, '-y',
                '-ss', '00:00:00',
                '-t', '00:00:05',
                '-i', src_file,
                '-ar', '24000',
                '-ac', '1',
                '-c:a', 'pcm_s16le',
                ref_file
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

if __name__ == '__main__':
    extract_5sec_reference_audio()
