"""
sync_all_preset_videos.py
--------------------------
모든 프리셋 영상을 정확한 오디오 길이에 맞게 동기화합니다.

문제:
- 세종대왕: 영상 30~32s, 오디오 15s → 오디오 끝난 후 14~17초 입이 계속 움직임
- 이순신/유관순/신사임당: 영상이 오디오보다 2.5~3초 더 길어 끝부분 입이 계속 움직임
- 김구 doc-kim-02: 영상 16s < 오디오 17.66s → 영상이 먼저 끝남

해결:
1. 오디오를 기준으로 영상 trim (ffmpeg -ss 0 -t audio_duration)
2. 오디오 스트림을 새로 mux
3. 세종대왕은 비디오 루프 없이 exact trim
4. 김구 doc-kim-02는 비디오 루프하여 오디오 길이 맞춤
"""

import os
import sys
import json
import shutil
import subprocess
import numpy as np

FF = r'C:\Users\user\AppData\Roaming\Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe'
BASE = os.path.abspath('client/public')
VIDEOS = os.path.join(BASE, 'videos')
AUDIO  = os.path.join(BASE, 'audio')

def get_duration(path):
    """파일의 정확한 재생 시간 반환"""
    if not os.path.exists(path):
        return -1.0
    cmd = [FF, '-i', path]
    r = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, errors='ignore')
    for l in r.stderr.split('\n'):
        if 'Duration:' in l:
            try:
                parts = l.split('Duration:')[1].split(',')[0].strip().split(':')
                return float(parts[0])*3600 + float(parts[1])*60 + float(parts[2])
            except:
                pass
    return -1.0

def get_audio_speech_end(audio_path):
    """오디오에서 실제 음성이 끝나는 시점 감지 (trailing silence 제외)"""
    if not os.path.exists(audio_path):
        return -1.0

    cmd = [FF, '-i', audio_path, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-']
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw = p.stdout
    if len(raw) == 0:
        return -1.0

    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    total_dur = len(samples) / 16000.0

    win_size = int(16000 * 0.05)  # 50ms
    num_windows = len(samples) // win_size
    energies = []
    for i in range(num_windows):
        w = samples[i*win_size:(i+1)*win_size]
        rms = np.sqrt(np.mean(w**2))
        energies.append(rms)

    if not energies:
        return total_dur

    max_e = max(energies)
    thresh = max_e * 0.03  # 3% 임계값

    # 마지막으로 에너지가 있는 윈도우 찾기
    last_active = 0
    for i, e in enumerate(energies):
        if e > thresh:
            last_active = i

    # 0.3초 여유 추가 (자연스러운 끝맺음)
    speech_end = (last_active + 1) * 0.05 + 0.3
    return min(speech_end, total_dur)

def trim_video_to_audio(video_in, audio_in, video_out, target_duration):
    """
    비디오를 target_duration으로 trim하고 오디오를 새로 mux합니다.
    비디오가 target_duration보다 짧으면 루프합니다.
    """
    tmp = video_out + '.tmp.mp4'
    video_dur = get_duration(video_in)

    if video_dur <= 0:
        print(f"  ERROR: Cannot read video duration for {video_in}")
        return False

    if video_dur >= target_duration:
        # 비디오가 충분히 길면 trim
        cmd = [
            FF, '-y',
            '-i', video_in,
            '-i', audio_in,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-t', str(target_duration),
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            tmp
        ]
    else:
        # 비디오가 짧으면 루프 후 trim
        loops_needed = int(target_duration / video_dur) + 2
        cmd = [
            FF, '-y',
            '-stream_loop', str(loops_needed),
            '-i', video_in,
            '-i', audio_in,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-t', str(target_duration),
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            tmp
        ]

    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if os.path.exists(tmp) and os.path.getsize(tmp) > 10000:
        if os.path.exists(video_out):
            os.remove(video_out)
        shutil.move(tmp, video_out)
        final_dur = get_duration(video_out)
        print(f"  OK {os.path.basename(video_out)}: {video_dur:.2f}s -> {final_dur:.2f}s (target={target_duration:.2f}s)")
        return True
    else:
        print(f"  FAILED: {video_out}")
        stderr_msg = r.stderr.decode('utf-8', errors='replace')[-300:]
        print(f"  stderr: {stderr_msg}")
        if os.path.exists(tmp):
            os.remove(tmp)
        return False

def main():
    docs = json.load(open('server/data/historical_docs.json', encoding='utf-8'))

    print("=" * 70)
    print("NEXUS Audio-Video Lip Sync Fixer")
    print("=" * 70)

    # 특수 오디오 오버라이드 (broken audioUrl 수정)
    special_audio_overrides = {
        'doc-shin-01': 'audio/shin-saimdang_doc-shin-01.mp3',
    }

    results = []
    for d in docs:
        doc_id = d['id']
        figure_id = d['figureId']
        vid_rel = d.get('videoUrl', '').lstrip('/')
        aud_rel = d.get('audioUrl', '').lstrip('/')

        # 특수 오디오 오버라이드 적용
        if doc_id in special_audio_overrides:
            aud_rel = special_audio_overrides[doc_id]
            print(f"\n[OVERRIDE] {doc_id}: audio -> {aud_rel}")

        vid_path = os.path.join('client/public', vid_rel)
        aud_path = os.path.join('client/public', aud_rel)

        if not os.path.exists(vid_path):
            print(f"\n[SKIP] {doc_id}: video not found: {vid_path}")
            results.append((doc_id, 'SKIP_NO_VIDEO'))
            continue
        if not os.path.exists(aud_path):
            print(f"\n[SKIP] {doc_id}: audio not found: {aud_path}")
            results.append((doc_id, 'SKIP_NO_AUDIO'))
            continue

        vid_dur = get_duration(vid_path)
        aud_dur = get_duration(aud_path)
        speech_end = get_audio_speech_end(aud_path)

        # 타겟 duration: 오디오 전체 길이 (trailing silence 포함)
        target = aud_dur

        diff = vid_dur - aud_dur

        print(f"\n[{doc_id}] {figure_id}")
        print(f"  vid={vid_dur:.2f}s | aud={aud_dur:.2f}s | speech_end={speech_end:.2f}s | diff={diff:+.2f}s")
        print(f"  Video: {os.path.basename(vid_path)}")
        print(f"  Audio: {os.path.basename(aud_path)}")

        # 허용 오차 0.3초 이내면 건너뜀
        if abs(diff) <= 0.3:
            print(f"  Already in sync (diff={diff:+.2f}s) -- skipping")
            results.append((doc_id, 'ALREADY_SYNCED'))
            continue

        print(f"  -> Trimming/remuxing to {target:.2f}s...")
        ok = trim_video_to_audio(vid_path, aud_path, vid_path, target)
        results.append((doc_id, 'OK' if ok else 'FAILED'))

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    for doc_id, status in results:
        icon = 'OK' if 'OK' in status or 'SYNCED' in status else ('SKIP' if 'SKIP' in status else 'FAIL')
        print(f"  [{icon}] {doc_id}: {status}")

    # historical_docs.json의 doc-shin-01 audioUrl 수정
    print("\n[FIX] Updating historical_docs.json for doc-shin-01 audioUrl...")
    docs_updated = False
    for d in docs:
        if d['id'] == 'doc-shin-01':
            old = d.get('audioUrl', '')
            d['audioUrl'] = '/audio/shin-saimdang_doc-shin-01.mp3'
            if old != d['audioUrl']:
                print(f"  audioUrl: {old} -> {d['audioUrl']}")
                docs_updated = True
    if docs_updated:
        with open('server/data/historical_docs.json', 'w', encoding='utf-8') as f:
            json.dump(docs, f, ensure_ascii=False, indent=2)
        print("  historical_docs.json updated!")
    else:
        print("  Already correct.")

if __name__ == '__main__':
    main()
