import os
import sys
import argparse
import asyncio
import subprocess
import imageio_ffmpeg

async def generate_edge_tts(text, voice="ko-KR-InJoonNeural", pitch="-18Hz", rate="-15%", volume="+0%", output_file="guide_tts.mp3"):
    """
    Synthesize high quality TTS audio via edge-tts with valid Hz pitch format (e.g. -18Hz, -20Hz)
    and FFmpeg Deep Bass Equalizer for true elderly historical tone.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    temp_raw = output_file + ".raw.mp3"

    # Convert percentage pitch format to Hz format if needed (e.g. -24% -> -24Hz)
    if isinstance(pitch, str) and pitch.endswith("%"):
        try:
            val = int(pitch.replace("%", "").replace("+", ""))
            pitch = f"{val * 2}Hz"  # convert to Hz
        except:
            pitch = "-18Hz"

    try:
        import edge_tts
        print(f"[Edge-TTS Engine] Direct Synthesize ({voice} | pitch: {pitch} | rate: {rate})...")
        
        communicate = edge_tts.Communicate(
            text=text,
            voice=voice,
            pitch=pitch,
            rate=rate,
            volume=volume
        )
        await communicate.save(temp_raw)
        print(f"Edge-TTS Raw Synthesized: {temp_raw}")

        # Post-process with FFmpeg for Deep Elder Bass Resonant Tone
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        
        cmd = [
            ffmpeg_exe, '-y',
            '-i', temp_raw,
            '-af', 'asetrate=44100*0.78,atempo=1.28,equalizer=f=100:width_type=h:width=80:g=7',
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            output_file
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        if os.path.exists(temp_raw):
            try:
                os.remove(temp_raw)
            except:
                pass

        if os.path.exists(output_file):
            print(f"SUCCESS: Generated True Deep Elder Voice -> {output_file}")
            return True
        else:
            if os.path.exists(temp_raw):
                os.rename(temp_raw, output_file)
            return True

    except Exception as err:
        print(f"[Edge-TTS Direct Error]: {err}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Generate 1st Guide Audio with Deep Bass Pitch Prosody")
    parser.add_argument("--text", required=True, help="Script text prompt to synthesize")
    parser.add_argument("--output", default="guide_speech.mp3", help="Output MP3 file path")
    parser.add_argument("--voice", default="ko-KR-InJoonNeural", help="Edge TTS Voice identifier")
    parser.add_argument("--pitch", default="-18Hz", help="Pitch Hz string (e.g. -18Hz)")
    parser.add_argument("--rate", default="-15%", help="Rate percentage string (e.g. -15%)")
    parser.add_argument("--volume", default="+0%", help="Volume percentage string")

    # Handle negative CLI args
    raw_args = sys.argv[1:]
    for i in range(len(raw_args)):
        if raw_args[i] in ["--pitch", "--rate", "--volume"] and i + 1 < len(raw_args):
            if raw_args[i+1].startswith("-"):
                raw_args[i] = f"{raw_args[i]}={raw_args[i+1]}"
                raw_args[i+1] = ""
    raw_args = [a for a in raw_args if a != ""]

    args = parser.parse_args(raw_args)

    asyncio.run(generate_edge_tts(
        text=args.text,
        voice=args.voice,
        pitch=args.pitch,
        rate=args.rate,
        volume=args.volume,
        output_file=args.output
    ))

if __name__ == "__main__":
    main()
