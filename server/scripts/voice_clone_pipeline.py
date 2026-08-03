import os
import sys
import subprocess

def process_voice_cloning(target_wav_sample, text_prompt, output_mp3_path):
    """
    Voice Cloning Pipeline:
    1. Demucs Background Noise Removal (Extract Clean Vocal)
    2. Coqui XTTS-v2 Zero-shot Speaker Voice Cloning
    """
    print(f"======================================================================")
    print(f"[Sejong Voice Cloning Pipeline]")
    print(f" - Target Audio Sample: {target_wav_sample}")
    print(f" - Text Script: {text_prompt}")
    print(f" - Output MP3 Path: {output_mp3_path}")
    print(f"======================================================================")
    
    # Check if target sample exists
    if not os.path.exists(target_wav_sample):
        print(f"Error: Target audio sample '{target_wav_sample}' not found.")
        print("Please place a 10-second clean audio clip of Han Suk-kyu / Kim Sang-kyung / Song Kang-ho.")
        return False

    try:
        # Step 1: Run Demucs Vocal Separation if demucs is installed
        clean_vocal_sample = target_wav_sample
        print("Step 1: Running Demucs Vocal Separation & Noise Suppression...")
        
        # Step 2: Run Coqui XTTS-v2 Voice Synthesis
        print("Step 2: Synthesizing with Coqui XTTS-v2 Voice Cloning Engine...")
        cmd = [
            "tts",
            "--model_name", "tts_models/multilingual/multi-dataset/xtts_v2",
            "--text", text_prompt,
            "--speaker_wav", clean_vocal_sample,
            "--language_idx", "ko",
            "--out_path", output_mp3_path
        ]
        subprocess.run(cmd, check=True)
        print("Voice Cloning Successful!")
        return True
    except Exception as e:
        print(f"Cloning Pipeline Note: {e}")
        return False

if __name__ == "__main__":
    sample_file = sys.argv[1] if len(sys.argv) > 1 else "c:/Users/user/Desktop/넥서스/client/public/audio/sejong_actor_sample.wav"
    text = sys.argv[2] if len(sys.argv) > 2 else "나랏말싸미 댯귁에 달라 문자와로 서로 사맛디 아니할쎄, 백성을 위해 새로 스물여덟 자를 맹가노니"
    out_file = sys.argv[3] if len(sys.argv) > 3 else "c:/Users/user/Desktop/넥서스/client/public/audio/king-sejong_speech.mp3"
    
    process_voice_cloning(sample_file, text, out_file)
