import urllib.request
import json
import time

url = "http://localhost:8010/speak"
payload = {
    "figureId": "kim-koo",
    "text": "나는 우리나라가 세계에서 가장 아름다운 나라가 되기를 바랍니다."
}

req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode('utf-8'),
    headers={"Content-Type": "application/json"}
)

t0 = time.time()
with urllib.request.urlopen(req) as resp:
    res_data = json.loads(resp.read().decode('utf-8'))

elapsed = time.time() - t0
print(f"[TEST /speak Success in {elapsed:.2f}s]:", res_data)
