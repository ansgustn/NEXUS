import os
import sys
import time
import asyncio
import edge_tts

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AUDIO_DIR = os.path.join(ROOT_DIR, "client", "public", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

FIGURE_VOICES = {
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

SCRIPTS = {
    "kim-koo": {
        "thinking": "신선한 질문이구려. 내가 잠시 옛 기억과 생각을 가다듬어 볼 터이니 조금만 기다려 주시게.",
        "refusal": "허허, 그 물음은 우리 시대의 예의에 어긋나거나 내가 답하기 어려운 이야기구려. 나라와 독립을 위한 뜻깊은 대화를 나누어 봅시다."
    },
    "king-sejong": {
        "thinking": "참으로 기발하고 신선한 물음이로다. 과인이 잠시 생각을 정리할 터이니 잠시 기다리시오.",
        "refusal": "과인의 조선 시대에는 그러한 말이 존재하지 않았거늘, 백성을 위한 바른 말과 예를 갖추어 다시 물어보시오."
    },
    "yi-sun-sin": {
        "thinking": "신선한 물음이오. 군무 중 잠시 뜻을 헤아려 볼 터이니 기다려 주시오.",
        "refusal": "장수로서 답하기 어려운 물음이오. 예의를 지키고 우리 바다와 나라를 지킨 뜻을 물어보시오."
    },
    "yu-gwan-sun": {
        "thinking": "참 새롭고 신선한 질문이네요! 잠시 제 생각을 정리해 볼 테니 조금만 기다려 주세요!",
        "refusal": "그런 험한 말이나 시대에 맞지 않는 물음에는 답할 수 없어요. 우리 조국의 밝은 미래를 이야기해요!"
    },
    "shin-saimdang": {
        "thinking": "참으로 신선하고 뜻깊은 물음이군요. 제 마음에 떠오르는 생각을 가다듬어 말씀드리겠습니다.",
        "refusal": "마음을 어지럽히는 궂은 말에는 대답하기 어렵습니다. 아름다운 자연과 배움의 도리를 나누어 보아요."
    }
}

async def synthesize_one(figure_id, category):
    v_conf = FIGURE_VOICES[figure_id]
    text = SCRIPTS[figure_id][category]
    filename = f"{figure_id}_{category}.mp3"
    out_path = os.path.join(AUDIO_DIR, filename)

    print(f"🎙️ Synthesizing [{figure_id}] {category} -> {filename} ({v_conf['voice']} | {v_conf['pitch']} | {v_conf['rate']})")
    
    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(
                text=text,
                voice=v_conf["voice"],
                pitch=v_conf["pitch"],
                rate=v_conf["rate"]
            )
            await communicate.save(out_path)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
                print(f"   ✅ Saved {out_path} ({os.path.getsize(out_path):,} bytes)")
                return True
        except Exception as e:
            print(f"   [Retry {attempt+1}/3] Error: {e}")
            await asyncio.sleep(1.0)
            
    print(f"   ❌ FAILED to synthesize {filename}")
    return False

async def main():
    print("=== Re-synthesizing all 10 Thinking & Refusal Audio files with Canonical Figures Voices ===")
    for figure_id in FIGURE_VOICES:
        for category in ["thinking", "refusal"]:
            await synthesize_one(figure_id, category)
            await asyncio.sleep(0.5)
    print("=== All 10 Audio files synthesized successfully! ===")

if __name__ == '__main__':
    asyncio.run(main())
