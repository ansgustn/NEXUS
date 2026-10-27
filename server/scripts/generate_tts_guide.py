import os
import sys
import argparse
import asyncio

FIGURE_VOICE_MAP = {
    "kim-koo": {
        "voice": "ko-KR-InJoonNeural",
        "pitch": "-15Hz",
        "rate": "-5%"
    },
    "king-sejong": {
        "voice": "ko-KR-HyunsuMultilingualNeural",
        "pitch": "-15Hz",
        "rate": "-10%"
    },
    "yi-sun-sin": {
        "voice": "ko-KR-HyunsuMultilingualNeural",
        "pitch": "-20Hz",
        "rate": "-5%"
    },
    "yu-gwan-sun": {
        "voice": "ko-KR-SunHiNeural",
        "pitch": "+10Hz",
        "rate": "+0%"
    },
    "shin-saimdang": {
        "voice": "ko-KR-SunHiNeural",
        "pitch": "-5Hz",
        "rate": "-6%"
    }
}

def normalize_voice(voice, figure_id=None):
    if figure_id and figure_id in FIGURE_VOICE_MAP:
        # If voice is empty or mistakenly passed as InJoon for non-Kim-Koo
        if not voice or ("injoon" in voice.lower() and figure_id != "kim-koo"):
            return FIGURE_VOICE_MAP[figure_id]["voice"]

    v = (voice or "").lower().replace("[korean]", "").strip()
    if "hyunsu" in v:
        return "ko-KR-HyunsuMultilingualNeural"
    if "sunhi" in v or "female" in v:
        return "ko-KR-SunHiNeural"
    if "injoon" in v:
        return "ko-KR-InJoonNeural"
    if figure_id and figure_id in FIGURE_VOICE_MAP:
        return FIGURE_VOICE_MAP[figure_id]["voice"]
    return "ko-KR-InJoonNeural"

async def generate_edge_tts(text, voice="ko-KR-InJoonNeural", pitch="-15Hz", rate="-5%", volume="+0%", output_file="guide_tts.mp3", figure_id=None):
    """
    Synthesize high quality character-specific TTS audio via edge-tts with valid Hz pitch format (e.g. -15Hz, -20Hz).
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    temp_raw = output_file + ".raw.mp3"

    voice = normalize_voice(voice, figure_id)

    # Cleanly format pitch for edge-tts (e.g. -15Hz, +10Hz, -5%)
    if isinstance(pitch, str):
        pitch = pitch.strip()
        if not pitch.endswith("Hz") and not pitch.endswith("%"):
            try:
                num = int(pitch.replace("+", ""))
                pitch = f"{num:+d}Hz" if num != 0 else "+0Hz"
            except:
                if figure_id and figure_id in FIGURE_VOICE_MAP:
                    pitch = FIGURE_VOICE_MAP[figure_id]["pitch"]
                else:
                    pitch = "-15Hz"
    else:
        if figure_id and figure_id in FIGURE_VOICE_MAP:
            pitch = FIGURE_VOICE_MAP[figure_id]["pitch"]
        else:
            pitch = "-15Hz"

    try:
        import edge_tts
        print(f"[Edge-TTS Engine] Direct Synthesize (Voice: {voice} | Pitch: {pitch} | Rate: {rate} | Figure: {figure_id})...")

        communicate = edge_tts.Communicate(
            text=text,
            voice=voice,
            pitch=pitch,
            rate=rate,
            volume=volume
        )
        await communicate.save(temp_raw)
        print(f"Edge-TTS Raw Synthesized: {temp_raw}")

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
    parser = argparse.ArgumentParser(description="Generate Character Voice Audio with Distinct Pitch/Tone Prosody")
    parser.add_argument("--text", required=True, help="Script text prompt to synthesize")
    parser.add_argument("--output", default="guide_speech.mp3", help="Output MP3 file path")
    parser.add_argument("--voice", default="", help="Edge TTS Voice identifier")
    parser.add_argument("--pitch", default="", help="Pitch Hz string (e.g. -15Hz)")
    parser.add_argument("--rate", default="", help="Rate percentage string")
    parser.add_argument("--volume", default="+0%", help="Volume percentage string")
    parser.add_argument("--figure", default="", help="Figure ID (e.g. king-sejong, yi-sun-sin)")

    # Handle negative CLI args
    raw_args = sys.argv[1:]
    for i in range(len(raw_args)):
        if raw_args[i] in ["--pitch", "--rate", "--volume"] and i + 1 < len(raw_args):
            if raw_args[i+1].startswith("-"):
                raw_args[i] = f"{raw_args[i]}={raw_args[i+1]}"
                raw_args[i+1] = ""
    raw_args = [a for a in raw_args if a != ""]

    args = parser.parse_args(raw_args)

    figure_id = args.figure.strip() if args.figure else None
    voice = args.voice.strip()
    pitch = args.pitch.strip()
    rate = args.rate.strip()

    if figure_id and figure_id in FIGURE_VOICE_MAP:
        meta = FIGURE_VOICE_MAP[figure_id]
        if not voice:
            voice = meta["voice"]
        if not pitch:
            pitch = meta["pitch"]
        if not rate:
            rate = meta["rate"]

    if not voice:
        voice = "ko-KR-InJoonNeural"
    if not pitch:
        pitch = "-15Hz"
    if not rate:
        rate = "-5%"

    ok = asyncio.run(generate_edge_tts(
        text=args.text,
        voice=voice,
        pitch=pitch,
        rate=rate,
        volume=args.volume,
        output_file=args.output,
        figure_id=figure_id
    ))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
