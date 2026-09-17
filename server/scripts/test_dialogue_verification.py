import urllib.request
import json
import sys

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')

test_questions = [
    ('kim-koo', '백범 김구 선생님의 소원은 무엇이었나요?'),
    ('kim-koo', '높은 문화의 힘에 대해 말씀해주세요.'),
    ('king-sejong', '훈민정음을 창제하신 까닭은 무엇인가요?'),
    ('yi-sun-sin', '명량해전에서 12척 배로 어떻게 이겼나요?'),
    ('yu-gwan-sun', '아우내 장터 만세 운동 이야기를 해주세요.'),
    ('shin-saimdang', '초충도 그림을 그리실 때 마음은 어떠셨나요?')
]

for fig_id, q in test_questions:
    req_body = json.dumps({'figureId': fig_id, 'query': q, 'webrtcMode': False}).encode('utf-8')
    req = urllib.request.Request('http://localhost:3001/api/dialogue', data=req_body, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"[{fig_id}] Q: \"{q}\"")
            print(f"    Success: {data.get('success')} | Cache: {data.get('isCacheHit')}")
            print(f"    Video: {data.get('videoUrl')}")
            print(f"    Audio: {data.get('audioUrl')}")
            print(f"    Speech: \"{data.get('speechText', '')[:40]}...\"\n")
    except Exception as e:
        print(f"[{fig_id}] ERROR: {e}\n")
