import os
import subprocess
import speech_recognition as sr

ffmpeg = r"C:\Users\user\AppData\Roaming\Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
r = sr.Recognizer()

videos = [
    "kim-koo_my_wish.mp4",
    "kim-koo_shanghai_tmp.mp4",
    "kim-koo_culture_power.mp4",
    "dynamic_video_king-sejong_1788846379016.mp4",
    "dynamic_video_king-sejong_1788846535081.mp4",
    "comfy_ltx_king-sejong_1788853845103.mp4",
    "yi-sun-sin_doc-yi-01.mp4",
    "yu-gwan-sun_doc-yu-02.mp4",
    "shin-saimdang_doc-shin-01.mp4"
]

temp_wav = "temp_transcribe.wav"

for v in videos:
    v_path = os.path.join("client", "public", "videos", v)
    if not os.path.exists(v_path):
        continue
    
    # Extract first 10s of audio to 16kHz mono wav
    cmd = f'"{ffmpeg}" -y -t 10 -i "{v_path}" -vn -ar 16000 -ac 1 "{temp_wav}"'
    subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    if os.path.exists(temp_wav):
        try:
            with sr.AudioFile(temp_wav) as source:
                audio_data = r.record(source, duration=10)
                text = r.recognize_google(audio_data, language="ko-KR")
                print(f"[TRANSCRIBED] {v}:\n  --> \"{text}\"\n", flush=True)
        except Exception as e:
            print(f"[FAILED] {v}: {e}\n", flush=True)

if os.path.exists(temp_wav):
    os.remove(temp_wav)
