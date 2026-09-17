import os
import sys
import asyncio
import edge_tts
import json

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr:
    sys.stderr.reconfigure(encoding='utf-8')

AUDIO_DIR = os.path.join("client", "public", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

VOICE_PROFILES = {
    "kim-koo": {
        "voice": "ko-KR-InJoonNeural",
        "rate": "-8%",
        "pitch": "-25Hz"
    },
    "king-sejong": {
        "voice": "ko-KR-HyunsuMultilingualNeural",
        "rate": "-10%",
        "pitch": "-15Hz"
    },
    "yi-sun-sin": {
        "voice": "ko-KR-HyunsuMultilingualNeural",
        "rate": "-5%",
        "pitch": "-20Hz"
    },
    "yu-gwan-sun": {
        "voice": "ko-KR-SunHiNeural",
        "rate": "+0%",
        "pitch": "+10Hz"
    },
    "shin-saimdang": {
        "voice": "ko-KR-SunHiNeural",
        "rate": "-6%",
        "pitch": "-5Hz"
    }
}

cached_path = os.path.join("server", "data", "cached_dialogues.json")
with open(cached_path, "r", encoding="utf-8") as f:
    dialogues = json.load(f)

async def synthesize(item):
    fig_id = item["figureId"]
    profile = VOICE_PROFILES.get(fig_id, {
        "voice": "ko-KR-InJoonNeural",
        "rate": "+0%",
        "pitch": "+0Hz"
    })
    
    # Audio filename from item['audioUrl']
    filename = os.path.basename(item["audioUrl"])
    out_path = os.path.join(AUDIO_DIR, filename)
    text = item["speechText"]
    
    print(f"🎙️ Synthesizing [{fig_id}] -> {filename}")
    print(f"   Voice: {profile['voice']} (rate={profile['rate']}, pitch={profile['pitch']})")
    print(f"   Text: \"{text[:35]}...\"")
    
    comm = edge_tts.Communicate(
        text=text,
        voice=profile["voice"],
        rate=profile["rate"],
        pitch=profile["pitch"]
    )
    await comm.save(out_path)
    size = os.path.getsize(out_path)
    print(f"   ✅ Saved: {filename} ({size} bytes)\n")

async def main():
    print("======================================================================")
    print("[NEXUS] Generating Perfect Character Audios for all 15 Dialogues")
    print("======================================================================")
    for item in dialogues:
        await synthesize(item)
    print("🎉 All 15 character audios successfully synthesized!")

if __name__ == "__main__":
    asyncio.run(main())
