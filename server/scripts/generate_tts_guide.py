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

    # Cleanly format pitch for edge-tts (e.g. -15Hz, +10Hz, -5%)
    if isinstance(pitch, str):
        pitch = pitch.strip()
        if not pitch.endswith("Hz") and not pitch.endswith("%"):
            try:
                num = int(pitch.replace("+", ""))
                pitch = f"{num:+d}Hz" if num != 0 else "+0Hz"
            except:
                pitch = "-15Hz"
    else:
        pitch = "-15Hz"

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

        # Pure authentic Microsoft Edge-TTS Audio
        if os.path.exists(temp_raw):
            if os.path.exists(output_file):
                try:
                    os.remove(output_file)
                except:
                    pass
            os.rename(temp_raw, output_file)
            print(f"SUCCESS: Generated Pure Edge-TTS Voice -> {output_file}")
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
    parser.add_argument("--rate", default="-15%", help="Rate percentage string")
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
