#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
====================================================================================================
[NEXUS] ComfyUI LTX-Video 2.3 Official Format Preset Video Batch Generator (Seamless Idle Landing)
====================================================================================================
- 김구 001 레퍼런스(LTX_2.3_ia2v_00001_.mp4) 및 LTX-2.3 공식 문서 양식(scene / character / action / camera + 서술형 문단) 준수
- 주요 제약 조건 100% 반영:
  1) 배경 변경 절대 금지: 원본 초상화의 고유 배경을 그대로 고정 유지 (strength=0.88 + 프롬프트 배경 고정)
  2) 마지막 페이드아웃(화면 검어짐) 절대 금지: 네거티브 프롬프트 차단 + 오디오 길이보다 +1.0초 여유 렌더링 후 테일 컷오프 + 휘도 고정
  3) 대기 화면(Idle) 무결점 자연스러운 연결: 대사 종료 구간(마지막 0.85초)에서 입을 자연스럽게 다물고,
     어깨와 상반신이 초기 대기 자세로 부드럽게 안착하며 자연스러운 눈 깜빡임(Anatomical Eye Blink) 후 대기 화면으로 직결
====================================================================================================
"""

import os
import sys
import json
import time
import math
import shutil
import argparse
import subprocess
import urllib.request
import urllib.parse
import urllib.error
import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr:
    sys.stderr.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
sys.path.insert(0, SCRIPT_DIR)
import eye_blink_model

ENV_PATH = os.path.join(ROOT_DIR, ".env")


def load_env():
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


load_env()

DEFAULT_COMFY_URL = os.environ.get("COMFYUI_URL", "http://20.30.22.101:8188")
WORKFLOW_PATH = os.path.join(ROOT_DIR, "comfyui_ltx_workflow.json")
DOCS_PATH = os.path.join(ROOT_DIR, "server", "data", "historical_docs.json")
PUBLIC_DIR = os.path.join(ROOT_DIR, "client", "public")
DIST_DIR = os.path.join(ROOT_DIR, "client", "dist")

try:
    import imageio_ffmpeg
    FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_BIN = r"C:\Users\user\AppData\Roaming\Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
    if not os.path.exists(FFMPEG_BIN):
        FFMPEG_BIN = "ffmpeg"

FIGURE_RESOLUTIONS = {
    "kim-koo": (832, 1088),
    "king-sejong": (832, 1088),
    "yi-sun-sin": (832, 1088),
    "yu-gwan-sun": (832, 1088),
    "shin-saimdang": (832, 1088),
}

# ----------------------------------------------------------------------------------------------
# LTX-2.3 공식 프롬프트 양식 (scene / character / action / camera + 시간순 서술 문단)
# 5대 핵심 규칙:
# 1) 초상화·대기 영상·말하는 영상 모두 동일 832x1088 구도 사용
# 2) dynamic LoRA 0.15 (0~0.2), 금지어는 네거티브 대신 긍정 프롬프트에 서술 ("카메라가 완전히 고정됨")
# 3) 사진 고정 강도(ImgToVideoInplace) 0.8, 움직임을 억누르는 문장 제거 + "입이 말소리에 맞춰 또렷하게 움직인다" 강조
# 4) 2단계(Stage 2)에서도 음성 정보 고정 (340:287 audio_latent -> ["340:327", 0])
# 5) 15초가 넘는 대사는 문장 사이 무음 구간에서 분할 생성 후 무결점 이어 붙이기
# ----------------------------------------------------------------------------------------------
FIGURE_PROFILES = {
    "kim-koo": {
        "he": "he", "his": "his",
        "name": "the Korean independence leader Kim Gu",
        "background": "the exact original vintage wood-paneled room background from the reference photograph",
        "character": "An older Korean man with a gentle yet resolute expression, wearing his signature round wire-rimmed glasses and a dark vintage suit.",
        "framing": "his head, round glasses and both shoulders",
    },
    "king-sejong": {
        "he": "he", "his": "his",
        "name": "the Joseon monarch King Sejong",
        "background": "the exact original solid warm golden-ochre silk portrait background from the reference image",
        "character": "A benevolent and dignified Joseon king with a neat beard, wearing the red Gonryongpo dragon robe with gold embroidered roundels on the chest and shoulders and the black winged Ikseongwan crown.",
        "framing": "the black winged Ikseongwan crown, both shoulders and the gold chest roundel",
    },
    "yi-sun-sin": {
        "he": "he", "his": "his",
        "name": "the Joseon naval commander Admiral Yi Sun-sin",
        "background": "the exact original solid warm golden-ochre silk portrait background from the reference image",
        "character": "A resolute middle-aged Joseon military official with a full beard, wearing the red Dallyeong court robe with a square embroidered twin-leopard rank badge and the tall black winged Samo hat.",
        "framing": "the tall black winged Samo hat, both shoulders and the square twin-leopard rank badge",
    },
    "yu-gwan-sun": {
        "he": "she", "his": "her",
        "name": "the Korean independence activist Yu Gwan-sun",
        "background": "the exact original vintage brick wall background from the reference photograph",
        "character": "A young Korean woman with an earnest, determined expression and neatly parted black hair, wearing a dark vintage jacket with an inmate number slip on the chest.",
        "framing": "her head, parted hair and both shoulders",
    },
    "shin-saimdang": {
        "he": "she", "his": "her",
        "name": "the Joseon artist and scholar Shin Saimdang",
        "background": "the exact original solid warm golden-tan silk portrait background from the reference image",
        "character": "A graceful Korean noblewoman with neatly braided traditional hair, clear gentle eyes and defined lips, wearing an ivory silk Jeogori hanbok with a deep maroon ribbon bow.",
        "framing": "her braided hair, both shoulders and the maroon ribbon bow",
    },
}

# 질문(사료 프리셋)별 감정/표정 큐
DOC_DEMEANOR = {
    # 김구
    "doc-kim-01": "with a sincere, heartfelt tone about his lifelong wish for independence; his eyes soften with conviction and he gives natural nods on key words",
    "doc-kim-02": "with a solemn, reflective tone, recalling the Provisional Government in Shanghai; his gaze is steady and expressive",
    "doc-kim-03": "with a warm, hopeful tone about a nation rich in culture; a gentle smile appears and he nods warmly",
    "doc-kim-04": "with a calm, modest tone, saying the spirit of the nation matters more than honors; a gentle humble expression and natural nods",
    "doc-kim-05": "with a grave, sorrowful tone, recalling the young patriots he sent away; his eyes convey deep emotion and quiet resolve, and his head moves naturally with slow, gentle nods on key words",
    "doc-kim-06": "with a moved, proud tone, reflecting on modern Korea; his eyes glisten slightly and a warm, emotional smile forms",
    # 세종
    "doc-sejong-01": "with a compassionate, earnest tone, explaining why he created Hunminjeongeum for the common people; a kind expression and natural nods",
    "doc-sejong-02": "with an encouraging, scholarly tone, praising talented people and scientific instruments; his eyebrows lift naturally with interest",
    "doc-sejong-03": "with a benevolent, teacherly tone about love for his people; a soft, warm expression and natural nods",
    "doc-sejong-04": "with a gracious, gently touched tone about his portrait on the banknote; a warm dignified smile",
    "doc-sejong-05": "with a calm, thoughtful and open-minded tone about new words and slang; a thoughtful expression and natural nods",
    "doc-sejong-06": "with a measured, reasoning tone, recalling respectful debates with his scholars; a composed, expressive demeanor with natural nods",
    # 이순신
    "doc-yi-01": "with a resolute, commanding tone, recalling the Battle of Myeongnyang with twelve ships; a firm jaw, steady gaze and natural nods",
    "doc-yi-02": "with a clear, explanatory tone, describing the turtle ship and the crane-wing formation; focused eyes and natural nods",
    "doc-yi-03": "with a quiet, reflective tone about writing his war diary at night; his expression is solemn and sincere",
    "doc-yi-04": "with a modest, dignified tone about his face on coins; a calm expression with a gentle nod",
    "doc-yi-05": "with a serious, introspective tone, explaining why he recorded the war every day; steady eyes and natural nods",
    "doc-yi-06": "with a heavy, honest tone, admitting fear and how he mastered it; his eyes express deep emotion and calm determination",
    # 유관순
    "doc-yu-01": "with a passionate, earnest tone, recalling the Aunae market independence cry; her eyes shine with determination",
    "doc-yu-02": "with a firm, unbreakable tone about her faith in prison; a resolute expression, steady gaze and natural nods",
    "doc-yu-03": "with an earnest, encouraging tone addressing young people; a hopeful expression with natural nods",
    "doc-yu-04": "with a sincere, humble tone about the value of freedom over honors; a calm, gentle expression",
    "doc-yu-05": "with an honest, brave tone, admitting she was afraid at eighteen; her eyes express warmth and determination",
    "doc-yu-06": "with a wistful, gentle tone, recalling her school days and her dream of becoming a teacher; a calm, gentle expression without smiling",
    "doc-yu-07": "with a warm, heartfelt tone, giving hope to teenagers of today; a calm, earnest expression without smiling",
    # 신사임당
    "doc-shin-01": "with a serene, gentle tone about painting insects and flowers; a soft graceful smile and expressive eyes",
    "doc-shin-02": "with a calm, wise motherly tone about educating her son Yulgok; a gentle, warm expression with natural nods",
    "doc-shin-03": "with a peaceful, poetic tone about nature; a tranquil expression with a gentle smile",
    "doc-shin-04": "with a modest, gracious tone about her portrait on the 50,000 won note; a humble, warm smile",
    "doc-shin-05": "with a quiet, steadfast tone about keeping her art alive despite the limits of her era; clear and expressive eyes",
    "doc-shin-06": "with a warm, encouraging tone, advising students facing hardship; a kind smile and natural nods",
    "doc-shin-07": "with a tender, understanding tone, recalling her son's wandering and her trust in him; a compassionate expression",
}

DEFAULT_DEMEANOR = "with a calm, sincere tone, explaining history to visitors; an expressive, dignified demeanor with natural nods"


# 사용자가 만족한 김구 기존 영상(1~3번)을 만든 프롬프트 원문
BASELINE_PROMPTS = {
    "kim-koo": (
        "A medium shot of the historical Korean figure Kim Gu, framed from the chest up. Static camera, locked-off shot, "
        "absolutely no zoom in, zero camera movement. (He is actively speaking to the viewer:1.3), "
        "(his mouth is opening and closing dynamically:1.5), (lips are moving clearly:1.4). "
        "He blinks his eyes and makes subtle facial expressions. He keeps his head facing the viewer and almost still throughout, "
        "with only very small slow nods, never turning or tilting his head to the side. His expression stays serious and solemn, and he does not smile. "
        "He wears round wire-rimmed glasses and traditional Korean clothing. The background is a warmly lit vintage study room. "
        "When the speech ends he gently closes his mouth and returns to his initial resting pose."
    ),
}


def build_idle_prompt(figure_id):
    """대기 화면: 말하지 않고 입을 다문 채 숨 쉬고 눈을 깜빡이는 모습."""
    p = FIGURE_PROFILES.get(figure_id, FIGURE_PROFILES["kim-koo"])
    he, his = p["he"], p["his"]
    He, His = he.capitalize(), his.capitalize()
    bg = p["background"]
    return (
        f"scene: {bg[0].upper() + bg[1:]} remains completely static and identical to the reference image from the first frame to the last frame under constant bright illumination.\n"
        f"character: {p['name']} exactly as in the reference portrait, preserving the same face, identity, clothing and hairstyle throughout the entire video. {p['character']}\n"
        f"action: {He} sits silently and calmly, waiting for a visitor's question. {His} lips stay gently closed the whole time and {he} does not speak. "
        f"{He} breathes slowly so {his} shoulders rise and fall very slightly, and {he} blinks naturally once or twice. "
        f"{His} head stays still and facing the viewer, with a calm, dignified expression that does not change.\n"
        f"camera: The camera is completely fixed and stationary on a locked-off tripod, maintaining the exact original medium bust framing where {p['framing']} stay in the same position and scale under constant bright exposure.\n"
    )


def build_ltx_prompt(figure_id, doc_id):
    if doc_id.endswith("-idle"):
        return build_idle_prompt(figure_id)
    if os.environ.get("LTX_PROMPT_STYLE") == "baseline" and figure_id in BASELINE_PROMPTS:
        return BASELINE_PROMPTS[figure_id]
    p = FIGURE_PROFILES.get(figure_id, FIGURE_PROFILES["kim-koo"])
    he, his = p["he"], p["his"]
    He, His = he.capitalize(), his.capitalize()
    bg = p["background"]
    demeanor = DOC_DEMEANOR.get(doc_id, DEFAULT_DEMEANOR)
    if doc_id.endswith("-thinking"):
        # "잠시 생각을 정리하겠다"는 짧은 말: 사려 깊게 잠시 생각을 가다듬는 표정
        demeanor = (f"with a calm, thoughtful tone, saying that it is a fresh question and asking the visitor to wait a moment "
                    f"while {he} gathers {his} thoughts; a reflective, gentle expression")
    return (
        f"scene: {bg[0].upper() + bg[1:]} remains completely static and identical to the reference image from the first frame to the last frame under constant bright illumination.\n"
        f"character: {p['name']} exactly as in the reference portrait, preserving the same face, identity, clothing and hairstyle throughout the entire video. {p['character']}\n"
        f"action: Speaking directly and expressively to the viewer {demeanor}. "
        f"{His} mouth and lips move clearly, distinctly, and dynamically in exact synchronization with the speech audio, opening and closing articulately for every syllable. "
        f"{His} facial muscles move naturally with the speech, {he} blinks naturally, keeps {his} head facing the viewer and almost still with only very small slow nods, never turning to the side, and {his} shoulders rise and fall softly with natural breathing. "
        f"As the speech finishes at the end, {he} smoothly closes {his} mouth into a calm resting expression, settles {his} shoulders back to the initial upright pose, and blinks naturally.\n"
        f"camera: The camera is completely fixed and stationary on a locked-off tripod, maintaining the exact original medium bust framing where {p['framing']} stay in the same position and scale under constant bright exposure.\n\n"
        f"A medium bust portrait of {p['name']}. The camera is completely fixed and stationary, keeping the exact same framing and {bg} unchanged from start to finish with constant bright lighting. "
        f"{He} looks directly at the viewer and speaks {demeanor}. "
        f"{His} mouth and lips open and close clearly, distinctly, and dynamically in exact sync with the words of the speech audio. "
        f"{He} blinks periodically, {his} head stays facing the viewer and almost still, and {his} shoulders move gently with breathing while speaking. "
        f"At the end of the speech, {he} gently closes {his} mouth, settles back into the initial resting posture, and blinks softly.\n"
    )


NEGATIVE_PROMPT = "pc game, console game, video game, cartoon, childish, ugly"


def check_comfy_server(comfy_url):
    try:
        req = urllib.request.Request(f"{comfy_url}/system_stats")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None
    return None


def interrupt_comfy_server(comfy_url):
    try:
        req = urllib.request.Request(f"{comfy_url}/interrupt", data=b"", method="POST")
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def get_audio_duration(audio_path):
    try:
        cmd = [FFMPEG_BIN, "-i", audio_path]
        res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, errors="ignore")
        out = (res.stderr or "") + (res.stdout or "")
        for line in out.splitlines():
            if "Duration:" in line:
                part = line.split("Duration:")[1].split(",")[0].strip()
                h, m, s = part.split(":")
                return float(h) * 3600 + float(m) * 60 + float(s)
    except Exception as e:
        print(f"   [Warning] Audio duration probe failed: {e}")
    return 15.0


def get_speech_end(audio_path, audio_dur):
    """음성 파일 끝의 무음을 뺀 실제 말이 끝나는 시각(초). 측정에 실패하면 audio_dur을 돌려준다."""
    try:
        raw = subprocess.run([FFMPEG_BIN, "-v", "error", "-i", audio_path, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True).stdout
        a = np.frombuffer(raw, np.int16).astype(np.float32)
        win = 400  # 25ms
        n = len(a) // win
        if n == 0:
            return audio_dur
        rms = np.sqrt((a[:n * win].reshape(n, win) ** 2).mean(axis=1))
        loud = np.where(rms > max(200.0, rms.max() * 0.03))[0]
        if len(loud) == 0:
            return audio_dur
        return min(audio_dur, (loud[-1] + 1) * win / 16000.0)
    except Exception as e:
        print(f"   [Warning] Speech end probe failed: {e}")
        return audio_dur


def upload_file_to_comfy(comfy_url, local_path):
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"File not found: {local_path}")

    filename = os.path.basename(local_path)
    boundary = f"----NexusComfyBoundary{int(time.time()*1000)}"

    with open(local_path, "rb") as f:
        file_bytes = f.read()

    ext = os.path.splitext(filename)[1].lower()
    mime_map = {
        ".webp": "image/webp",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
    }
    mime_type = mime_map.get(ext, "application/octet-stream")

    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'.encode("utf-8"))
    body.extend(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
    body.extend(file_bytes)
    body.extend(b"\r\n")

    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(b'Content-Disposition: form-data; name="overwrite"\r\n\r\n')
    body.extend(b"true\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    req = urllib.request.Request(
        f"{comfy_url}/upload/image",
        data=bytes(body),
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        uploaded_name = res_data.get("name", filename)
        print(f"   📡 [Uploaded to ComfyUI] {filename} ({len(file_bytes):,} bytes) -> {uploaded_name}")
        return uploaded_name


def split_audio_at_sentence_pause(audio_path, total_dur, max_chunk_sec=15.0):
    """
    15초가 넘는 대사는 문장 사이 무음 구간(silencedetect)을 찾아 <= 15초 청크들로 분할한다.
    반환값: [(chunk_audio_path, chunk_duration_sec), ...]
    """
    if total_dur <= max_chunk_sec:
        return [(audio_path, total_dur)]

    pauses = []
    try:
        cmd = [FFMPEG_BIN, "-i", audio_path, "-af", "silencedetect=noise=-30dB:d=0.14", "-f", "null", "-"]
        res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, errors="ignore")
        out = (res.stderr or "") + (res.stdout or "")
        for line in out.splitlines():
            if "silence_end:" in line and "silence_duration:" in line:
                parts = line.split("silence_end:")[1].split("|")
                s_end = float(parts[0].strip())
                s_dur = float(parts[1].split("silence_duration:")[1].strip())
                s_mid = s_end - (s_dur * 0.5)
                if 4.0 <= s_mid <= total_dur - 3.0:
                    pauses.append(s_mid)
    except Exception as e:
        print(f"   [Warning] silencedetect failed: {e}")

    # Greedy / balanced sentence pause selection so every chunk is <= 14.5s
    cut_points = [0.0]
    cur_t = 0.0
    while total_dur - cur_t > max_chunk_sec:
        ideal_t = cur_t + min(11.0, (total_dur - cur_t) * 0.5)
        valid_pauses = [p for p in pauses if (cur_t + 4.5) <= p <= (cur_t + 14.2)]
        if valid_pauses:
            best_p = min(valid_pauses, key=lambda p: abs(p - ideal_t))
        else:
            best_p = cur_t + min(12.0, (total_dur - cur_t) * 0.5)
        cut_points.append(best_p)
        cur_t = best_p
    cut_points.append(total_dur)

    chunks = []
    base_dir = os.path.dirname(audio_path)
    base_stem = os.path.splitext(os.path.basename(audio_path))[0]
    for i in range(len(cut_points) - 1):
        t0, t1 = cut_points[i], cut_points[i + 1]
        c_dur = t1 - t0
        chunk_wav = os.path.join(base_dir, f"{base_stem}_chunk{i+1}.wav")
        cmd = [
            FFMPEG_BIN, "-y",
            "-i", audio_path,
            "-ss", f"{t0:.3f}",
            "-to", f"{t1:.3f}",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            chunk_wav,
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        chunks.append((chunk_wav, c_dur))
    print(f"   ✂️ [15초 초과 문장 분할] 총 {total_dur:.2f}s -> {len(chunks)}개 문장 청크: {[round(c[1], 2) for c in chunks]}s")
    return chunks


def add_framing_guides(wf, duration_sec, fps):
    """
    화면 확대 방지: LTX는 프롬프트와 무관하게 평평한 그림 배경에서 서서히 줌인한다.
    초상화를 일정 간격 + 마지막 프레임의 약한 키프레임으로 넣어 구도가 누적해서 벗어나지 못하게 한다.
    """
    every = float(os.environ.get("LTX_GUIDE_EVERY_SEC", "3.0"))
    strength = float(os.environ.get("LTX_GUIDE_STRENGTH", "0.4"))
    if every <= 0 or strength <= 0:
        return
    total = int(duration_sec * fps)
    # 1단계 latent 프레임 단위(8의 배수)로 맞춘 앵커 위치, 마지막 프레임은 -1
    anchors = sorted({int(t * fps) // 8 * 8 for t in np.arange(every, duration_sec - 1.0, every)})
    anchors = [a for a in anchors if 0 < a < total] + [-1]

    pos, neg, latent = ["340:307", 0], ["340:307", 1], ["340:325", 0]
    for i, frame_idx in enumerate(anchors):
        node = f"guide_{i}"
        wf[node] = {
            "class_type": "LTXVAddGuide",
            "inputs": {
                "positive": pos, "negative": neg,
                "vae": ["340:317", 2], "latent": latent,
                "image": ["340:334", 0],
                "frame_idx": frame_idx,
                # 마지막 프레임은 대기 화면과 이어지도록 더 강하게 사진 쪽으로 끌어당긴다
                "strength": float(os.environ.get("LTX_END_GUIDE_STRENGTH", "0.8")) if frame_idx == -1 else strength,
            },
            "_meta": {"title": f"구도 고정 앵커 {frame_idx}"},
        }
        pos, neg, latent = [node, 0], [node, 1], [node, 2]

    wf["340:326"]["inputs"]["video_latent"] = latent
    wf["340:315"]["inputs"]["positive"] = pos
    wf["340:315"]["inputs"]["negative"] = neg
    # 2단계로 넘기기 전에 앵커 프레임을 잘라낸다
    wf["340:292"]["inputs"]["positive"] = pos
    wf["340:292"]["inputs"]["negative"] = neg
    wf["340:295"]["inputs"]["samples"] = ["340:292", 2]


def build_ltx_workflow(workflow_template, figure_id, doc_id, uploaded_image_name, uploaded_audio_name, speech_text, duration_sec, fps, prefix, attempt=0):
    wf = json.loads(json.dumps(workflow_template))
    width, height = FIGURE_RESOLUTIONS.get(figure_id, (832, 1088))
    prompt_text = build_ltx_prompt(figure_id, doc_id)

    if "269" in wf and "inputs" in wf["269"]:
        wf["269"]["inputs"]["image"] = uploaded_image_name
    wf.pop("270", None)
    wf.pop("271", None)

    if "340:330" in wf and "inputs" in wf["340:330"]:
        wf["340:330"]["inputs"]["value"] = width
    if "340:324" in wf and "inputs" in wf["340:324"]:
        wf["340:324"]["inputs"]["value"] = height

    # 1) 초상화가 이미 832x1088 생성 비율로 잘려 있으므로 추가 크롭 비활성화 (구도 100% 일치)
    if "340:297" in wf and "inputs" in wf["340:297"]:
        wf["340:297"]["inputs"]["input"] = ["269", 0]
        wf["340:297"]["inputs"]["resize_type.crop"] = "disabled"
        wf["340:297"]["inputs"]["scale_method"] = "lanczos"
    if "340:334" in wf and "inputs" in wf["340:334"]:
        wf["340:334"]["inputs"]["img_compression"] = int(os.environ.get("LTX_IMG_COMPRESSION", "18"))

    if "341" in wf and "inputs" in wf["341"]:
        wf["341"]["inputs"]["filename_prefix"] = prefix

    if "340:331" in wf and "inputs" in wf["340:331"]:
        wf["340:331"]["inputs"]["value"] = float(duration_sec)
    if "340:323" in wf and "inputs" in wf["340:323"]:
        wf["340:323"]["inputs"]["value"] = int(fps)

    if uploaded_audio_name:
        wf["276"] = {
            "inputs": {"audio": uploaded_audio_name},
            "class_type": "LoadAudio",
            "_meta": {"title": "오디오 로드"},
        }
        if "340:332" in wf and "inputs" in wf["340:332"]:
            wf["340:332"]["inputs"]["audio"] = ["276", 0]
            wf["340:332"]["inputs"]["start_index"] = 0.0
            wf["340:332"]["inputs"]["duration"] = ["340:331", 0]
        wf.pop("350", None)
        wf.pop("351", None)
    else:
        if "350" in wf and "inputs" in wf["350"]:
            wf["350"]["inputs"]["text"] = speech_text

    if "340:319" in wf and "inputs" in wf["340:319"]:
        wf["340:319"]["inputs"]["value"] = prompt_text
    if "340:349" in wf and "inputs" in wf["340:349"]:
        wf["340:349"]["inputs"]["value"] = False
    if "340:314" in wf and "inputs" in wf["340:314"]:
        wf["340:314"]["inputs"]["text"] = NEGATIVE_PROMPT

    if "340:290" in wf and "inputs" in wf["340:290"]:
        wf["340:290"]["inputs"]["cfg"] = 1.0
    if "340:315" in wf and "inputs" in wf["340:315"]:
        wf["340:315"]["inputs"]["cfg"] = 1.0

    # 김구 기존 영상(1~3번)의 설정: distilled LoRA 0.5 / 1단계 0.7 / 2단계 1.0 / img_compression 18
    # 파일명의 "dynamic"은 LoRA 추출 방식(rank)이며 움직임 강도가 아니다. 낮추면 distilled 스케줄이 덜 수렴해 입 주변이 뭉개진다.
    if "340:293" in wf and "inputs" in wf["340:293"]:
        wf["340:293"]["inputs"]["strength_model"] = float(os.environ.get("LTX_DISTILLED_LORA", "0.5"))
    if "340:325" in wf and "inputs" in wf["340:325"]:
        wf["340:325"]["inputs"]["strength"] = float(os.environ.get("LTX_IMG_STRENGTH", "0.7"))
    if "340:296" in wf and "inputs" in wf["340:296"]:
        wf["340:296"]["inputs"]["strength"] = float(os.environ.get("LTX_IMG_STRENGTH_STAGE2", "1.0"))

    # 4) 2단계(Stage 2)에서도 음성 정보를 고정 ("340:287"의 audio_latent를 SetLatentNoiseMask ["340:327", 0]에 연결)
    if "340:287" in wf and "inputs" in wf["340:287"]:
        wf["340:287"]["inputs"]["audio_latent"] = ["340:309", 1] if os.environ.get("LTX_STAGE2_AUDIO") == "baseline" else ["340:327", 0]

    add_framing_guides(wf, duration_sec, fps)

    if "340:285" in wf and "inputs" in wf["340:285"]:
        wf["340:285"]["inputs"]["noise_seed"] = 42 + attempt
    if "340:286" in wf and "inputs" in wf["340:286"]:
        wf["340:286"]["inputs"]["noise_seed"] = 959753657417200 + attempt * 1009

    return wf


def queue_and_wait_ltx(comfy_url, wf, output_mp4_path, max_wait_sec=900):
    payload = json.dumps({"prompt": wf, "client_id": f"nexus_ltx_{int(time.time()*1000)}"}).encode("utf-8")
    req = urllib.request.Request(f"{comfy_url}/prompt", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        res_json = json.loads(resp.read().decode("utf-8"))
        prompt_id = res_json["prompt_id"]

    print(f"   🚀 [LTX-2.3 Queued] Prompt ID: {prompt_id} | Waiting for GPU rendering...")
    start = time.time()

    while time.time() - start < max_wait_sec:
        time.sleep(3)
        try:
            with urllib.request.urlopen(f"{comfy_url}/history/{prompt_id}", timeout=30) as h_resp:
                h_data = json.loads(h_resp.read().decode("utf-8"))

            if prompt_id in h_data:
                info = h_data[prompt_id]
                status = info.get("status", {})
                if status.get("status_str") == "error":
                    raise RuntimeError(f"ComfyUI execution error: {status.get('messages')}")

                outputs = info.get("outputs", {})
                video_item = None
                for node_id, node_out in outputs.items():
                    items = node_out.get("videos") or node_out.get("gifs") or node_out.get("images") or []
                    for item in items:
                        if isinstance(item, dict) and item.get("filename"):
                            video_item = item
                            break
                    if video_item:
                        break

                if video_item:
                    filename = video_item["filename"]
                    subfolder = video_item.get("subfolder", "")
                    ftype = video_item.get("type", "output")
                    params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": ftype})
                    view_url = f"{comfy_url}/view?{params}"

                    os.makedirs(os.path.dirname(os.path.abspath(output_mp4_path)), exist_ok=True)
                    tmp_download = output_mp4_path + ".raw_ltx.mp4"
                    print(f"   📥 [Downloading LTX Video] {view_url}")
                    urllib.request.urlretrieve(view_url, tmp_download)
                    return tmp_download
        except Exception as e:
            if "ComfyUI execution error" in str(e):
                raise
            pass

    raise TimeoutError(f"Timed out waiting for LTX-2.3 prompt {prompt_id} after {max_wait_sec}s")


def measure_zoom_drift(video_path, sample_sec=1.0):
    """프레임0 대비 전역 스케일 편차의 최댓값. 프레임을 변형하지 않고 판정에만 쓴다."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    step = max(1, int(sample_sec * fps))
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5)
    warp = np.eye(2, 3, dtype=np.float32)
    g0, worst, idx = None, 0.0, 0
    while True:
        ret, fr = cap.read()
        if not ret:
            break
        if idx % step == 0:
            g = cv2.cvtColor(cv2.resize(fr, (208, 256), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
            if g0 is None:
                g0 = g
            else:
                try:
                    _, warp = cv2.findTransformECC(g0, g, warp, cv2.MOTION_AFFINE, criteria, None, 5)
                    worst = max(worst, abs(float(np.sqrt(abs(np.linalg.det(warp[:, :2])))) - 1.0))
                except cv2.error:
                    pass
        idx += 1
    cap.release()
    return worst


def measure_head_steadiness(video_path):
    """첫 프레임 눈 영역과의 일치도 하위 5% 값. 고개가 많이 돌아갈수록 낮아진다. 자연스러움이 아니라 안정성만 나타낸다."""
    cap = cv2.VideoCapture(video_path)
    ok, f0 = cap.read()
    if not ok:
        return 0.0
    h, w, _ = f0.shape
    tpl = cv2.cvtColor(f0, cv2.COLOR_BGR2GRAY)[int(.20 * h):int(.38 * h), int(.22 * w):int(.72 * w)]
    scores, idx = [], 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        idx += 1
        if idx % 4 == 0:
            res = cv2.matchTemplate(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), tpl, cv2.TM_CCOEFF_NORMED)
            scores.append(cv2.minMaxLoc(res)[1])
    cap.release()
    return float(np.percentile(scores, 5)) if scores else 1.0


# 인물별 정상 입 움직임 기준값. 사용자가 확인한 영상과 정상 렌더링의 측정값에서 잡았다.
MOUTH_REF = {"king-sejong": 3.2, "kim-koo": 4.5, "shin-saimdang": 2.2, "yi-sun-sin": 4.0, "yu-gwan-sun": 5.0}
_FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def _largest_face(gray):
    faces = _FACE_CASCADE.detectMultiScale(gray, 1.1, 6, minSize=(gray.shape[1] // 6, gray.shape[1] // 6))
    if len(faces) == 0:
        return None
    return max(faces, key=lambda r: r[2] * r[3])


def _audio_envelope(audio_path, fps):
    cmd = [FFMPEG_BIN, "-v", "error", "-i", audio_path, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"]
    pcm = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout
    a = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    hop = max(1, int(16000 / fps))
    n = len(a) // hop
    return np.array([np.sqrt((a[i * hop:(i + 1) * hop] ** 2).mean()) for i in range(n)])


def measure_face_motion(video_path, audio_path, figure_id):
    """말하는 구간의 입 움직임과 고개 이동을 잰다. 입 영역 변화량은 눈 위치로 머리 이동을 뺀 값이다."""
    result = {"mouth": 0.0, "dead_pct": 100.0, "dead_run": 99.0, "head_x": 99.0, "head_y": 99.0, "head_speed": 99.0}
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    ok, frame = cap.read()
    if not ok:
        return result
    box = _largest_face(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
    if box is None:
        cap.release()
        return result
    x, y, w, h = [int(v) for v in box]
    ex, ey, ew, eh = x + int(.1 * w), y + int(.2 * h), int(.8 * w), int(.25 * h)
    mx, my, mw, mh = x + int(.25 * w), y + int(.68 * h), int(.5 * w), int(.27 * h)
    g_first = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    tpl = g_first[ey:ey + eh, ex:ex + ew]
    # 첫 프레임은 입을 다문 사진이므로, 입 모양이 이것과 같으면 입이 닫혀 있다고 본다
    closed_tpl = g_first[my:my + mh, mx:mx + mw]
    pad = int(w * .45)
    prev, act, xs, ys, closed_sim = None, [], [], [], []
    while ok:
        g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        x0, y0 = max(0, ex - pad), max(0, ey - pad)
        res = cv2.matchTemplate(g[y0:ey + eh + pad, x0:ex + ew + pad], tpl, cv2.TM_CCOEFF_NORMED)
        loc = cv2.minMaxLoc(res)[3]
        dx, dy = loc[0] + x0 - ex, loc[1] + y0 - ey
        xs.append(dx / w * 100.0)
        ys.append(dy / w * 100.0)
        roi = g[max(0, my + dy):max(0, my + dy) + mh, max(0, mx + dx):max(0, mx + dx) + mw]
        roi = cv2.GaussianBlur(cv2.resize(roi, (mw, mh)), (3, 3), 0).astype(np.float32)
        if prev is not None:
            act.append(float(np.abs(roi - prev).mean()))
        prev = roi
        cy, cx = max(0, my + dy - 8), max(0, mx + dx - 8)
        area = g[cy:cy + mh + 16, cx:cx + mw + 16]
        if area.shape[0] >= mh and area.shape[1] >= mw:
            closed_sim.append(float(cv2.minMaxLoc(cv2.matchTemplate(area, closed_tpl, cv2.TM_CCOEFF_NORMED))[1]))
        else:
            closed_sim.append(0.0)
        ok, frame = cap.read()
    cap.release()
    if len(act) < 12:
        return result

    k3 = np.ones(5) / 5.0
    sx, sy = np.convolve(xs, k3, "valid"), np.convolve(ys, k3, "valid")
    result["head_x"] = float(np.percentile(sx, 98) - np.percentile(sx, 2))
    result["head_y"] = float(np.percentile(sy, 98) - np.percentile(sy, 2))
    result["head_speed"] = float(np.percentile(np.hypot(np.diff(sx), np.diff(sy)) * fps, 98))

    act = np.array([act[0]] + act)
    env = _audio_envelope(audio_path, fps)
    n = min(len(act), len(env))
    if n < 12:
        return result
    win = int(fps * .5)
    k = np.ones(win) / win
    act_s, env_s = np.convolve(act[:n], k, "same"), np.convolve(env[:n], k, "same")
    speech = env_s > max(.02, env_s.max() * .15)
    speech[-int(fps * .6):] = False
    if not speech.any():
        return result
    ref = MOUTH_REF.get(figure_id, 3.5)
    dead = (act_s < ref * .45) & speech
    run, longest = 0, 0
    for v in dead:
        run = run + 1 if v else 0
        longest = max(longest, run)
    result["mouth"] = float(np.median(act_s[speech]) / ref)
    result["dead_pct"] = float(100.0 * dead.sum() / speech.sum())
    result["dead_run"] = float(longest / fps)

    # 말하는 중에 입이 다문 사진 그대로인 구간 (김구처럼 사진 질감이 거칠면 변화량만으로는 못 잡는다)
    cs = np.convolve(np.array(closed_sim[:n]), np.ones(5) / 5.0, "same")
    closed = (cs > float(os.environ.get("LTX_CLOSED_SIM", "0.9"))) & speech
    run, longest = 0, 0
    for v in closed:
        run = run + 1 if v else 0
        longest = max(longest, run)
    result["closed_pct"] = float(100.0 * closed.sum() / speech.sum())
    result["closed_run"] = float(longest / fps)
    result["closed_check"] = figure_id in os.environ.get("LTX_CLOSED_MOUTH_FIGURES", "kim-koo").split(",")
    return result


def measure_frame_jump(video_path):
    """연속 프레임 사이의 최대 변화량. 얼굴이 한 프레임 만에 바뀌면 크게 튄다."""
    cap = cv2.VideoCapture(video_path)
    prev, worst = None, 0.0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(fr, (208, 272), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev is not None:
            worst = max(worst, float(np.abs(g - prev).mean()))
        prev = g
    cap.release()
    return worst


def measure_idle_motion(video_path):
    """대기 영상 검사: 입이 열리지 않는지, 고개가 움직이지 않는지, 눈을 깜빡이는지."""
    out = {"mouth_open": 1.0, "head": 99.0, "blink": 0.0}
    cap = cv2.VideoCapture(video_path)
    ok, frame = cap.read()
    if not ok:
        return out
    g0 = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    box = _largest_face(g0)
    if box is None:
        cap.release()
        return out
    x, y, w, h = [int(v) for v in box]
    ex, ey, ew, eh = x + int(.1 * w), y + int(.2 * h), int(.8 * w), int(.25 * h)
    mx, my, mw, mh = x + int(.25 * w), y + int(.68 * h), int(.5 * w), int(.27 * h)
    eye_tpl, mouth_tpl = g0[ey:ey + eh, ex:ex + ew], g0[my:my + mh, mx:mx + mw]
    pad = int(w * .3)
    mouth_sims, shifts, eye_diffs = [], [], []
    while ok:
        g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        x0, y0 = max(0, ex - pad), max(0, ey - pad)
        loc = cv2.minMaxLoc(cv2.matchTemplate(g[y0:ey + eh + pad, x0:ex + ew + pad], eye_tpl, cv2.TM_CCOEFF_NORMED))[3]
        dx, dy = loc[0] + x0 - ex, loc[1] + y0 - ey
        shifts.append((dx / w * 100.0, dy / w * 100.0))
        eye = g[max(0, ey + dy):max(0, ey + dy) + eh, max(0, ex + dx):max(0, ex + dx) + ew]
        if eye.shape == eye_tpl.shape:
            eye_diffs.append(float(np.abs(eye.astype(np.float32) - eye_tpl.astype(np.float32)).mean()))
        area = g[max(0, my + dy - 8):max(0, my + dy - 8) + mh + 16, max(0, mx + dx - 8):max(0, mx + dx - 8) + mw + 16]
        if area.shape[0] >= mh and area.shape[1] >= mw:
            mouth_sims.append(float(cv2.minMaxLoc(cv2.matchTemplate(area, mouth_tpl, cv2.TM_CCOEFF_NORMED))[1]))
        ok, frame = cap.read()
    cap.release()
    if not mouth_sims or not shifts:
        return out
    sx = np.array([v[0] for v in shifts])
    sy = np.array([v[1] for v in shifts])
    out["mouth_open"] = float(1.0 - np.percentile(mouth_sims, 3))  # 입 모양이 첫 프레임과 가장 달랐던 정도
    out["head"] = float(max(np.ptp(sx), np.ptp(sy)))
    out["blink"] = float(max(eye_diffs) - np.median(eye_diffs)) if eye_diffs else 0.0
    return out


def _idle_faults(m, drift, jump, max_drift):
    faults = []
    if drift > max_drift:
        faults.append("확대")
    if m["mouth_open"] > float(os.environ.get("LTX_IDLE_MAX_MOUTH_OPEN", "0.12")):
        faults.append("입이 움직임")
    if m["head"] > float(os.environ.get("LTX_IDLE_MAX_HEAD", "3")):
        faults.append("고개 움직임")
    if jump > float(os.environ.get("LTX_MAX_FRAME_JUMP", "5")):
        faults.append("프레임 튐")
    if m["blink"] < float(os.environ.get("LTX_IDLE_MIN_BLINK", "4")):
        faults.append("눈 깜빡임 없음")
    return faults


def _face_motion_faults(m):
    """기준을 넘은 항목 목록. 비어 있으면 통과."""
    faults = []
    if m["mouth"] < float(os.environ.get("LTX_MIN_MOUTH", "0.6")):
        faults.append("입 움직임 부족")
    if m["dead_pct"] > float(os.environ.get("LTX_MAX_DEAD_PCT", "15")) or m["dead_run"] > float(os.environ.get("LTX_MAX_DEAD_RUN", "1.0")):
        faults.append("입 멈춤")
    if m.get("closed_check") and (m.get("closed_pct", 0) > float(os.environ.get("LTX_MAX_CLOSED_PCT", "20"))
                                  or m.get("closed_run", 0) > float(os.environ.get("LTX_MAX_CLOSED_RUN", "1.0"))):
        faults.append("말하는 중 입 닫힘")
    if m["head_x"] > float(os.environ.get("LTX_MAX_HEAD_X", "8")) or m["head_y"] > float(os.environ.get("LTX_MAX_HEAD_Y", "10")):
        faults.append("고개 이동 큼")
    if m["head_speed"] > float(os.environ.get("LTX_MAX_HEAD_SPEED", "22")):
        faults.append("고개 움직임 빠름")
    return faults


def render_with_zoom_gate(comfy_url, make_wf, out_path, audio_path, figure_id, max_attempts=None, max_drift=None, idle=False):
    """확대, 입 멈춤, 고개 흔들림 중 하나라도 기준을 넘으면 시드를 바꿔 재생성하고, 가장 좋은 결과를 쓴다."""
    max_attempts = max_attempts or int(os.environ.get("LTX_MAX_ATTEMPTS", "6"))
    max_drift = max_drift if max_drift is not None else float(os.environ.get("LTX_MAX_ZOOM_DRIFT", "0.03"))
    best_path, best_key, best_faults = None, None, ["렌더링 없음"]
    for attempt in range(max_attempts):
        raw = queue_and_wait_ltx(comfy_url, make_wf(attempt), out_path)
        drift = measure_zoom_drift(raw)
        if idle:
            jump = measure_frame_jump(raw)
            im = measure_idle_motion(raw)
            faults = _idle_faults(im, drift, jump, max_drift)
            print(f"   🔎 [대기 영상 검사] 시도 {attempt + 1}/{max_attempts}: 확대 {drift * 100:.1f}%, 입 변화 {im['mouth_open']:.2f}, "
                  f"고개 {im['head']:.1f}%, 눈 깜빡임 {im['blink']:.1f}, 프레임 급변 {jump:.1f} -> {'통과' if not faults else ', '.join(faults)}", flush=True)
            key = (drift <= max_drift, "입이 움직임" not in faults, -len(faults), -im["head"])
            if best_key is None or key > best_key:
                best_key, best_faults = key, faults
                best_path = f"{out_path}.best_ltx.mp4"
                shutil.move(raw, best_path)
            elif os.path.exists(raw):
                os.remove(raw)
            if not best_faults:
                break
            continue
        m = measure_face_motion(raw, audio_path, figure_id)
        faults = _face_motion_faults(m)
        if drift > max_drift:
            faults.insert(0, "확대")
        jump = measure_frame_jump(raw)
        if jump > float(os.environ.get("LTX_MAX_FRAME_JUMP", "5")):
            faults.append("프레임 튐")
        print(f"   🔎 [품질 검사] 시도 {attempt + 1}/{max_attempts}: 확대 {drift * 100:.1f}%, 입 {m['mouth']:.2f} (멈춤 {m['dead_pct']:.0f}%, 최장 {m['dead_run']:.1f}s, 닫힘 {m.get('closed_pct', 0):.0f}%/{m.get('closed_run', 0):.1f}s), "
              f"고개 좌우 {m['head_x']:.1f}% 상하 {m['head_y']:.1f}% 속도 {m['head_speed']:.1f}, 프레임 급변 {jump:.1f} -> {'통과' if not faults else ', '.join(faults)}", flush=True)
        # 입이 멈춘 영상을 가장 먼저 탈락시키고, 그다음 확대, 고개 순으로 고른다
        mouth_bad = "입 멈춤" in faults or "입 움직임 부족" in faults or "말하는 중 입 닫힘" in faults
        key = (not mouth_bad, drift <= max_drift, -len(faults), -m["dead_pct"], -m["head_speed"])
        if best_key is None or key > best_key:
            best_key, best_faults = key, faults
            best_path = f"{out_path}.best_ltx.mp4"
            shutil.move(raw, best_path)
        elif os.path.exists(raw):
            os.remove(raw)
        if not best_faults:
            break
    final = f"{out_path}.raw_ltx.mp4"
    shutil.move(best_path, final)
    if best_faults:
        print(f"   ⚠️ [품질 검사] {max_attempts}회 모두 기준 미달, 가장 나은 결과 사용: {', '.join(best_faults)}", flush=True)
    return final


def find_exact_eye_centers_in_frame(frame_bgr, fig_id):
    """Automatically locate exact left and right eye pupil/fissure centers in 832x1024 frame"""
    h, w, _ = frame_bgr.shape
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)

    windows = {
        "king-sejong":   (0.325, 0.365, 0.38, 0.47, 0.53, 0.62),
        "yi-sun-sin":    (0.310, 0.355, 0.38, 0.47, 0.53, 0.62),
        # 832x1088 초상화에서 실제 눈 위치(왼쪽 x 0.475, 오른쪽 x 0.607, y 0.237). 예전 값은 눈 아래 뺨을 가리켜 깜빡임이 보이지 않았다
        "shin-saimdang": (0.218, 0.258, 0.44, 0.51, 0.575, 0.645),
        "kim-koo":       (0.295, 0.345, 0.36, 0.45, 0.52, 0.61),
        "yu-gwan-sun":   (0.260, 0.310, 0.39, 0.47, 0.53, 0.61),
    }
    y0n, y1n, lx0n, lx1n, rx0n, rx1n = windows.get(fig_id, (0.30, 0.36, 0.38, 0.47, 0.53, 0.62))
    y0, y1 = int(y0n * h), int(y1n * h)
    lx0, lx1 = int(lx0n * w), int(lx1n * w)
    rx0, rx1 = int(rx0n * w), int(rx1n * w)

    def get_dark_centroid(patch, ox, oy):
        thresh = np.percentile(patch, 8)
        ys, xs = np.where(patch <= thresh)
        cx_p = ox + float(xs.mean())
        cy_p = oy + float(ys.mean())
        return (cx_p / w) * 2.0 - 1.0, (cy_p / h) * 2.0 - 1.0

    lcx, lcy = get_dark_centroid(gray[y0:y1, lx0:lx1], lx0, y0)
    rcx, rcy = get_dark_centroid(gray[y0:y1, rx0:rx1], rx0, y0)
    return lcx, lcy, rcx, rcy


def optical_flow_settle_frame(src_frame, target_resting_frame, alpha):
    """
    Physically glide head, hat, and shoulders from src_frame -> target_resting_frame using
    Dense Optical Flow warping so there is ZERO double-edge ghosting on the hat or shoulders!
    """
    if alpha <= 0.001:
        return src_frame.copy()
    if alpha >= 0.999:
        return target_resting_frame.copy()

    h, w, _ = src_frame.shape
    g_src = cv2.cvtColor(src_frame, cv2.COLOR_BGR2GRAY)
    g_dst = cv2.cvtColor(target_resting_frame, cv2.COLOR_BGR2GRAY)

    params = dict(pyr_scale=0.5, levels=3, winsize=21, iterations=3, poly_n=5, poly_sigma=1.2, flags=0)
    flow_to_src = cv2.calcOpticalFlowFarneback(g_dst, g_src, None, **params)
    flow_to_dst = cv2.calcOpticalFlowFarneback(g_src, g_dst, None, **params)

    # alpha=0이면 src 그대로, alpha=1이면 target 그대로가 되도록 양쪽을 중간 위치로 보낸다
    grid_y, grid_x = np.mgrid[0:h, 0:w].astype(np.float32)
    warped_src = cv2.remap(src_frame, grid_x + flow_to_dst[:, :, 0] * alpha, grid_y + flow_to_dst[:, :, 1] * alpha,
                           interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    warped_dst = cv2.remap(target_resting_frame, grid_x + flow_to_src[:, :, 0] * (1.0 - alpha), grid_y + flow_to_src[:, :, 1] * (1.0 - alpha),
                           interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    return cv2.addWeighted(warped_dst, alpha, warped_src, 1.0 - alpha, 0)


@torch.no_grad()
def apply_calibrated_blink(frame_bgr, lcx, lcy, rcx, rcy, rx, ry, blink_weight):
    if blink_weight <= 1e-3:
        return frame_bgr
    h, w, _ = frame_bgr.shape
    gy, gx = torch.meshgrid(
        torch.linspace(-1.0, 1.0, h, dtype=torch.float32),
        torch.linspace(-1.0, 1.0, w, dtype=torch.float32),
        indexing="ij",
    )
    disp_y = torch.zeros_like(gy)
    delta_travel = 0.42
    above_span = 0.22

    for (cx, cy) in [(lcx, lcy), (rcx, rcy)]:
        dx = (gx - cx) / rx
        dy = (gy - cy) / ry
        h_in = dx.abs() <= 1.0
        arch = torch.where(h_in, torch.sqrt(torch.clamp(1.0 - dx ** 2, min=0.0)), torch.zeros_like(dx))
        y_top = -0.95 * arch
        y_seam = 0.95 * arch
        fissure_h = y_seam - y_top

        in_aperture = h_in & (dy >= y_top) & (dy <= y_seam)
        tau = torch.where(in_aperture, (dy - y_top) / (fissure_h + 1e-6), torch.zeros_like(dy))
        y_src_inside = y_top - (delta_travel * arch) * (1.0 - tau)
        dy_inside = torch.where(in_aperture, (y_src_inside - dy) * ry, torch.zeros_like(dy))

        in_above = h_in & (dy < y_top) & (dy >= y_top - above_span * arch)
        d_above = torch.clamp((y_top - dy) / (above_span * arch + 1e-6), 0.0, 1.0)
        above_decay = 0.5 + 0.5 * torch.cos(torch.pi * d_above)
        dy_above = torch.where(in_above, (-delta_travel * arch * above_decay) * ry, torch.zeros_like(dy))

        disp_y = disp_y + dy_inside + dy_above

    sample_grid = torch.stack([gx, gy + disp_y * float(blink_weight)], dim=-1).unsqueeze(0)
    inp = torch.from_numpy(frame_bgr.astype(np.float32)).permute(2, 0, 1).unsqueeze(0)
    warped = F.grid_sample(inp, sample_grid, mode="bilinear", padding_mode="border", align_corners=True)
    return warped.squeeze(0).permute(1, 2, 0).clamp(0, 255).numpy().astype(np.uint8)


def finalize_seamless_idle_ending_and_remux(raw_video_path, original_audio_path, portrait_img_path, figure_id, audio_dur, final_video_path, final_size=None, keep_idle=False):
    """
    1. Trim extra post-audio buffer frames so LTX-2.3's end-of-clip fade-out never appears.
    2. Lock frame luminance in the final 2.0s so there is 0% fade-to-black / 0% dimming.
    3. Over the final 0.9s (22 frames), physically glide the head/shoulders and mouth back into the
       exact initial resting portrait posture via Dense Optical Flow (zero ghosting) and trigger a natural
       5-frame anatomical eye blink right as the shoulders settle, guaranteeing a 100% seamless handoff to the Idle Waiting Screen.
    """
    cap = cv2.VideoCapture(raw_video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(frame)
    cap.release()

    if not frames:
        shutil.move(raw_video_path, final_video_path)
        return

    # 말이 끝난 뒤 입을 다무는 구간까지 남긴다
    # 음성 파일 끝의 무음까지 세면 말이 없는데도 입이 움직이는 구간이 생기므로 실제 말 끝을 기준으로 자른다
    tail_frames = int(float(os.environ.get("LTX_END_TAIL_SEC", "0.8")) * fps)
    speech_end = get_speech_end(original_audio_path, audio_dur)
    target_frame_count = max(24, min(len(frames), int(round(speech_end * fps)) + tail_frames))
    frames = frames[:target_frame_count]

    resting_frame = frames[0].copy()
    ref_l_mean = float(cv2.cvtColor(resting_frame, cv2.COLOR_BGR2LAB)[:, :, 0].mean())

    check_start = max(0, len(frames) - int(2.0 * fps))
    # 한 프레임에서 밝기가 튀지 않도록 보정량을 구간 끝까지 서서히 늘린다
    span = max(1, len(frames) - 1 - check_start)
    for i in range(check_start, len(frames)):
        lab = cv2.cvtColor(frames[i], cv2.COLOR_BGR2LAB).astype(np.float32)
        cur_mean = float(lab[:, :, 0].mean())
        if cur_mean > 5.0:
            scale = 1.0 + (ref_l_mean / cur_mean - 1.0) * (i - check_start) / span
            lab[:, :, 0] = np.clip(lab[:, :, 0] * scale, 0, 255)
            frames[i] = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

    if final_size and final_size != (w, h):
        frames = [cv2.resize(fr, final_size, interpolation=cv2.INTER_LANCZOS4) for fr in frames]
        resting_frame = cv2.resize(resting_frame, final_size, interpolation=cv2.INTER_LANCZOS4)
        w, h = final_size

    # Encode processed frames + mux with original clean TTS audio
    tmp_processed = final_video_path + ".settled.mp4"
    cmd = [
        FFMPEG_BIN, "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{w}x{h}",
        "-pix_fmt", "bgr24",
        "-r", str(fps),
        "-i", "-",
        "-i", original_audio_path,
        "-map", "0:v:0",
        "-map", "1:a:0",
        # apad + -shortest는 파이프 입력에서 가끔 오디오가 끊기지 않아 수십 분짜리 파일이 된다.
        # 영상 프레임 수로 길이를 직접 정한다.
        "-af", "apad",
        "-t", f"{len(frames) / fps:.3f}",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-maxrate", "2.0M",
        "-bufsize", "4.0M",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        tmp_processed,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for fr in frames:
        proc.stdin.write(fr.tobytes())
    proc.stdin.close()
    proc.wait()

    if os.path.exists(tmp_processed) and os.path.getsize(tmp_processed) > 50000:
        shutil.move(tmp_processed, final_video_path)
    else:
        shutil.move(raw_video_path, final_video_path)

    if keep_idle:
        if os.path.exists(raw_video_path):
            os.remove(raw_video_path)
        return

    # 4. Also regenerate idle_blink_{figure_id}.mp4 from the exact same resting_frame (frames[0])
    # so the transition from Talking Video -> Idle Waiting Screen is 100% pixel-identical!
    idle_path = os.path.join(PUBLIC_DIR, "videos", f"idle_blink_{figure_id}.mp4")
    tmp_idle = idle_path + ".tmp.mp4"
    idle_total_frames = int(4.0 * fps)  # 4-second seamless idle loop
    idle_cmd = [
        FFMPEG_BIN, "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{w}x{h}",
        "-pix_fmt", "bgr24",
        "-r", str(fps),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-maxrate", "1.5M",
        "-bufsize", "3.0M",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        tmp_idle,
    ]
    idle_proc = subprocess.Popen(idle_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    idle_blink_start = int(1.8 * fps)
    blink_profile = [0.35, 0.85, 1.00, 0.65, 0.22]
    lcx, lcy, rcx, rcy = find_exact_eye_centers_in_frame(resting_frame, figure_id)
    rx = 0.055 if figure_id == "shin-saimdang" else 0.065
    ry = 0.020 if figure_id == "king-sejong" else 0.018
    for fi in range(idle_total_frames):
        b_idx = fi - idle_blink_start
        if 0 <= b_idx < len(blink_profile):
            fr_idle = apply_calibrated_blink(resting_frame, lcx, lcy, rcx, rcy, rx, ry, blink_profile[b_idx])
        else:
            fr_idle = resting_frame
        idle_proc.stdin.write(fr_idle.tobytes())
    idle_proc.stdin.close()
    idle_proc.wait()
    if os.path.exists(tmp_idle) and os.path.getsize(tmp_idle) > 10000:
        shutil.move(tmp_idle, idle_path)
        if os.path.exists(DIST_DIR):
            os.makedirs(os.path.join(DIST_DIR, "videos"), exist_ok=True)
            shutil.copy2(idle_path, os.path.join(DIST_DIR, "videos", f"idle_blink_{figure_id}.mp4"))
        print(f"   🔄 [Idle Screen Synced] Pixel-locked idle_blink_{figure_id}.mp4 updated for zero-cut transition!")

    if os.path.exists(raw_video_path):
        try:
            os.remove(raw_video_path)
        except Exception:
            pass


def finalize_idle_loop(raw_video_path, final_video_path, final_size=None, fps=24):
    """대기 영상: 소리를 빼고, 마지막 0.5초를 첫 프레임과 서서히 섞어 반복 재생 시 이음매가 보이지 않게 한다."""
    cap = cv2.VideoCapture(raw_video_path)
    frames = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        frames.append(fr)
    cap.release()
    if len(frames) < fps:
        raise RuntimeError("대기 영상 프레임이 너무 적습니다")
    # LTX가 끝에서 화면을 어둡게 하는 경우가 있어 마지막 0.3초는 버린다
    frames = frames[:len(frames) - int(0.3 * fps)]
    first = frames[0].astype(np.float32)
    blend = int(0.5 * fps)
    for k in range(blend):
        idx = len(frames) - blend + k
        a = 0.5 - 0.5 * math.cos(math.pi * (k + 1) / blend)
        frames[idx] = cv2.addWeighted(frames[idx].astype(np.float32), 1.0 - a, first, a, 0).astype(np.uint8)
    # 마지막 프레임이 첫 프레임과 같으면 반복 시 같은 장면이 두 번 나오므로 하나 뺀다
    frames = frames[:-1]
    if final_size:
        frames = [cv2.resize(f, final_size, interpolation=cv2.INTER_LANCZOS4) for f in frames]
    h, w, _ = frames[0].shape
    tmp = final_video_path + ".tmp.mp4"
    cmd = [FFMPEG_BIN, "-y", "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{w}x{h}", "-pix_fmt", "bgr24", "-r", str(fps), "-i", "-",
           "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for f in frames:
        proc.stdin.write(f.tobytes())
    proc.stdin.close()
    proc.wait()
    shutil.move(tmp, final_video_path)
    if os.path.exists(raw_video_path):
        os.remove(raw_video_path)


def make_silent_wav(path, seconds):
    """대기 영상용 오디오. 완전한 무음이면 모델이 영상 전체를 멈춰 버리므로, 기본으로 아주 작은 잡음(숨소리 수준)을 넣는다."""
    noise_db = os.environ.get("LTX_IDLE_NOISE_DB", "-45")
    if noise_db.lower() == "off":
        src = ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
        af = []
    else:
        src = ["-f", "lavfi", "-i", "anoisesrc=r=44100:color=pink:amplitude=1"]
        af = ["-af", f"lowpass=f=1200,volume={noise_db}dB", "-ac", "2"]
    subprocess.run([FFMPEG_BIN, "-y", "-v", "error"] + src + ["-t", f"{seconds:.2f}"] + af + ["-acodec", "pcm_s16le", path], check=True)


def main():
    parser = argparse.ArgumentParser(description="NEXUS LTX-Video 2.3 Official Format Preset Batch Generator")
    parser.add_argument("--comfy-url", default=DEFAULT_COMFY_URL, help="ComfyUI Server URL (default from .env)")
    parser.add_argument("--figure", nargs="*", default=None, help="Filter by figureId(s)")
    parser.add_argument("--doc", nargs="*", default=None, help="Filter by specific doc id(s)")
    parser.add_argument("--skip-existing", action="store_true", help="Skip videos that are already >2MB")
    parser.add_argument("--source-image", default=None, help="Use this image instead of images/{figure}.webp")
    parser.add_argument("--final-size", default=None, help="Resize the final video, e.g. 838x1076 (matches existing clips)")
    parser.add_argument("--keep-idle", action="store_true", help="Do not regenerate idle_blink_{figure}.mp4")
    parser.add_argument("--kind", choices=["doc", "thinking", "idle"], default="doc",
                        help="doc: 질문 영상, thinking: 답변을 준비하는 동안 나오는 '생각 중' 영상, idle: 대기 화면 영상")
    args = parser.parse_args()

    print("=" * 85)
    print("🎬 [NEXUS] LTX-Video 2.3 생성기 (배경 고정 + 페이드아웃 차단 + 대기화면 눈깜빡임/어깨안착 연결)")
    print(f"   ▶ 대상 ComfyUI 서버 : {args.comfy_url}")
    print("=" * 85)

    stats = check_comfy_server(args.comfy_url)
    if not stats:
        print(f"\n🚨 [연결 실패] ComfyUI 서버({args.comfy_url})에 연결할 수 없습니다!")
        sys.exit(1)

    devices = stats.get("devices", [])
    gpu_name = devices[0].get("name", "Unknown GPU") if devices else "Connected"
    print(f"✅ [ComfyUI 서버 연결 성공] GPU: {gpu_name}\n")
    interrupt_comfy_server(args.comfy_url)

    with open(WORKFLOW_PATH, "r", encoding="utf-8") as f:
        workflow_template = json.load(f)

    with open(DOCS_PATH, "r", encoding="utf-8") as f:
        docs = json.load(f)

    tasks = []
    if args.kind != "doc":
        # 생각 중 / 대기 영상은 인물마다 하나씩 만든다
        with open(os.path.join(ROOT_DIR, "server", "data", "figures.json"), "r", encoding="utf-8") as f:
            fig_ids = [x["id"] for x in json.load(f)]
        docs = []
        for fid in fig_ids:
            if args.figure and fid not in args.figure:
                continue
            if args.kind == "thinking":
                docs.append({"id": f"{fid}-thinking", "figureId": fid, "topic": "생각 중 영상",
                             "videoUrl": f"/videos/{fid}_thinking.mp4", "audioUrl": f"/audio/{fid}_thinking.mp3"})
            else:
                docs.append({"id": f"{fid}-idle", "figureId": fid, "topic": "대기 화면 영상",
                             "videoUrl": f"/videos/idle_blink_{fid}.mp4", "audioUrl": None})
        args.keep_idle = True
    for doc in docs:
        if args.kind != "doc":
            tasks.append(doc)
            continue
        if args.figure and doc.get("figureId") not in args.figure:
            continue
        if args.doc and doc.get("id") not in args.doc:
            continue
        if doc.get("videoUrl") and doc.get("audioUrl"):
            tasks.append(doc)

    print(f"📋 총 {len(tasks)}개의 사료 프리셋 영상을 생성합니다.\n")

    success_count = 0
    for idx, doc in enumerate(tasks, 1):
        doc_id = doc["id"]
        figure_id = doc["figureId"]
        topic = doc.get("topic", "")
        speech_text = doc.get("speechTemplate") or doc.get("sourceText") or ""
        video_rel = doc["videoUrl"].lstrip("/")
        audio_rel = (doc["audioUrl"] or "").lstrip("/")

        img_local = args.source_image or os.path.join(PUBLIC_DIR, "images", f"{figure_id}.webp")
        audio_local = os.path.join(PUBLIC_DIR, audio_rel)
        is_idle = args.kind == "idle"
        if is_idle:
            # 대기 영상은 소리 없는 오디오로 만든다 (모델이 말하지 않도록)
            audio_local = os.path.join(PUBLIC_DIR, "audio", f"temp_silence_{figure_id}.wav")
            make_silent_wav(audio_local, float(os.environ.get("LTX_IDLE_SEC", "5.2")))
        video_local = os.path.join(PUBLIC_DIR, video_rel)
        dist_video_local = os.path.join(DIST_DIR, video_rel)

        if args.skip_existing and os.path.exists(video_local) and os.path.getsize(video_local) > 2_000_000:
            print(f"[{idx}/{len(tasks)}] ⏭️ SKIP ({doc_id}): {video_rel} 이미 존재 ({os.path.getsize(video_local):,} bytes)")
            continue

        print(f"\n--------------------------------------------------------------------------------")
        print(f"🎯 [{idx}/{len(tasks)}] {figure_id} ({doc_id}) - '{topic}'")
        print(f"   ▶ FHD 초상화 : {img_local}")
        print(f"   ▶ 대사 음성  : {audio_local}")
        print(f"   ▶ 출력 영상  : {video_local}")

        if not os.path.exists(img_local) or not os.path.exists(audio_local):
            print(f"   ❌ [Error] 입력 초상화 또는 오디오 파일이 존재하지 않습니다.")
            continue

        try:
            audio_dur = get_audio_duration(audio_local)
            target_fps = 24
            # 조각마다 사진에서 다시 시작해 이음새가 끊겨 보이므로, 렌더링 가능한 길이까지는 한 번에 만든다
            audio_chunks = split_audio_at_sentence_pause(audio_local, audio_dur, max_chunk_sec=float(os.environ.get("LTX_MAX_CHUNK_SEC", "30")))

            t0 = time.time()
            current_img_local = img_local
            temp_files_to_clean = []

            if len(audio_chunks) == 1:
                target_dur = float(max(5.0, math.ceil(audio_dur) + 0.8))
                print(f"   ⏱️ 오디오 길이: {audio_dur:.2f}s -> LTX 렌더링 {target_dur:.1f}s @ {target_fps}fps")
                up_img = upload_file_to_comfy(args.comfy_url, current_img_local)
                up_aud = upload_file_to_comfy(args.comfy_url, audio_local)

                prefix = f"video/LTX_2.3_ia2v_{figure_id}_{doc_id}"
                raw_mp4 = render_with_zoom_gate(args.comfy_url, lambda attempt: build_ltx_workflow(
                    workflow_template=workflow_template,
                    figure_id=figure_id,
                    doc_id=doc_id,
                    uploaded_image_name=up_img,
                    uploaded_audio_name=up_aud,
                    speech_text=speech_text,
                    duration_sec=target_dur,
                    fps=target_fps,
                    prefix=prefix,
                    attempt=attempt,
                ), video_local, audio_local, figure_id, idle=is_idle)
            else:
                all_concat_frames = []
                w_out, h_out = FIGURE_RESOLUTIONS.get(figure_id, (832, 1088))
                for c_idx, (chunk_aud_path, chunk_dur) in enumerate(audio_chunks):
                    temp_files_to_clean.append(chunk_aud_path)
                    c_target_dur = float(min(15.0, max(4.0, math.ceil(chunk_dur) + 0.8)))
                    print(f"   ⏱️ [청크 {c_idx+1}/{len(audio_chunks)}] 구간 오디오: {chunk_dur:.2f}s -> LTX 렌더링 {c_target_dur:.1f}s @ {target_fps}fps")

                    up_img = upload_file_to_comfy(args.comfy_url, current_img_local)
                    up_aud = upload_file_to_comfy(args.comfy_url, chunk_aud_path)
                    prefix = f"video/LTX_2.3_ia2v_{figure_id}_{doc_id}_part{c_idx+1}"
                    chunk_raw_mp4 = render_with_zoom_gate(args.comfy_url, lambda attempt: build_ltx_workflow(
                        workflow_template=workflow_template,
                        figure_id=figure_id,
                        doc_id=doc_id,
                        uploaded_image_name=up_img,
                        uploaded_audio_name=up_aud,
                        speech_text=speech_text,
                        duration_sec=c_target_dur,
                        fps=target_fps,
                        prefix=prefix,
                        attempt=attempt,
                    ), f"{video_local}.part{c_idx+1}.mp4", chunk_aud_path, figure_id)
                    temp_files_to_clean.append(chunk_raw_mp4)

                    cap_c = cv2.VideoCapture(chunk_raw_mp4)
                    c_frames = []
                    while True:
                        ret_c, fr_c = cap_c.read()
                        if not ret_c:
                            break
                        c_frames.append(fr_c)
                    cap_c.release()

                    if c_idx < len(audio_chunks) - 1:
                        # Trim to exact chunk audio duration and smoothly settle during the inter-sentence pause back to initial resting pose
                        keep_n = max(12, min(len(c_frames), int(round(chunk_dur * target_fps))))
                        c_frames = c_frames[:keep_n]
                        base_pose = c_frames[0].copy()
                        settle_c = min(6, len(c_frames) // 4)
                        for sk in range(settle_c):
                            s_idx = len(c_frames) - settle_c + sk
                            t_p = (sk + 1) / float(settle_c)
                            s_alpha = 0.5 - 0.5 * math.cos(math.pi * t_p)
                            c_frames[s_idx] = optical_flow_settle_frame(c_frames[s_idx], base_pose, s_alpha)
                        all_concat_frames.extend(c_frames)
                        # Next chunk starts from the exact same crisp 832x1088 portrait (which matches c_frames[-1] == base_pose!)
                        current_img_local = img_local
                    else:
                        all_concat_frames.extend(c_frames)

                # Write combined raw_mp4 for finalize_seamless_idle_ending_and_remux
                raw_mp4 = video_local + ".raw_ltx.mp4"
                cmd_comb = [
                    FFMPEG_BIN, "-y",
                    "-f", "rawvideo", "-vcodec", "rawvideo",
                    "-s", f"{w_out}x{h_out}", "-pix_fmt", "bgr24",
                    "-r", str(target_fps), "-i", "-",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p",
                    raw_mp4,
                ]
                proc_c = subprocess.Popen(cmd_comb, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                for fr_item in all_concat_frames:
                    proc_c.stdin.write(fr_item.tobytes())
                proc_c.stdin.close()
                proc_c.wait()

            if is_idle:
                finalize_idle_loop(raw_mp4, video_local,
                                   final_size=tuple(int(v) for v in args.final_size.split("x")) if args.final_size else None)
                if os.path.exists(audio_local):
                    os.remove(audio_local)
            else:
              finalize_seamless_idle_ending_and_remux(
                raw_video_path=raw_mp4,
                original_audio_path=audio_local,
                portrait_img_path=img_local,
                figure_id=figure_id,
                audio_dur=audio_dur,
                final_video_path=video_local,
                final_size=tuple(int(v) for v in args.final_size.split("x")) if args.final_size else None,
                keep_idle=args.keep_idle,
            )

            for tf in temp_files_to_clean:
                if os.path.exists(tf):
                    try:
                        os.remove(tf)
                    except Exception:
                        pass

            if os.path.exists(DIST_DIR):
                os.makedirs(os.path.dirname(dist_video_local), exist_ok=True)
                shutil.copy2(video_local, dist_video_local)

            if doc_id in ("doc-sejong-01", "doc-yi-01", "doc-kim-01", "doc-yu-01", "doc-shin-01"):
                avatar_vid = os.path.join(PUBLIC_DIR, "videos", f"{figure_id}_talking_avatar.mp4")
                shutil.copy2(video_local, avatar_vid)
                if os.path.exists(DIST_DIR):
                    shutil.copy2(video_local, os.path.join(DIST_DIR, "videos", f"{figure_id}_talking_avatar.mp4"))

            elapsed = time.time() - t0
            final_sz = os.path.getsize(video_local)
            print(f"   ✅ [ 완료 ({elapsed:.1f}s) ] {video_rel} ({final_sz:,} bytes)")
            success_count += 1
        except Exception as e:
            print(f"   ❌ [실패] {doc_id}: {e}")

    print("\n" + "=" * 85)
    print(f"🎉 LTX-Video 2.3 배치 작업 완료: {success_count}/{len(tasks)} 성공!")
    print("=" * 85)


if __name__ == "__main__":
    main()
