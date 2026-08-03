import os
import sys
import argparse
import asyncio

async def generate_edge_tts(text, voice="ko-KR-SunHiNeural", output_file="guide_tts.mp3"):
    """
    Generate 1st Guide Audio via edge-tts (or gTTS fallback).
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)

    try:
        import edge_tts
        print(f"[Guide TTS Engine] Synthesizing speech using edge-tts ({voice})...")
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_file)
        print(f"✅ Guide Audio generated: {output_file}")
        return True
    except ImportError:
        print("[Guide TTS Engine] Note: edge-tts not installed. Attempting gTTS fallback...")
        try:
            from gtts import gTTS
            tts = gTTS(text=text, lang='ko')
            tts.save(output_file)
            print(f"✅ Guide Audio generated via gTTS: {output_file}")
            return True
        except Exception as e:
            print(f"[Guide TTS Fallback Error]: {e}")
            return False
    except Exception as err:
        print(f"[Edge TTS Error]: {err}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Generate 1st Guide Audio for TTS + RVC Pipeline")
    parser.add_argument("--text", required=True, help="Script text prompt to synthesize")
    parser.add_argument("--output", default="guide_speech.mp3", help="Output MP3/WAV file path")
    parser.add_argument("--voice", default="ko-KR-SunHiNeural", help="Edge TTS Voice identifier")

    args = parser.parse_args()

    asyncio.run(generate_edge_tts(args.text, args.voice, args.output))

if __name__ == "__main__":
    main()
