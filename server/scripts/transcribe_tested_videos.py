import os
import subprocess
import speech_recognition as sr

ffmpeg = r"C:\Users\user\AppData\Roaming\Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
r = sr.Recognizer()

videos = [
    "kim-koo_my_wish.mp4",
    "dynamic_video_king-sejong_1788846535081.mp4",
    "yu-gwan-sun_doc-yu-02.mp4"
]

results = []
for v in videos:
    v_path = os.path.join("client", "public", "videos", v)
    temp_wav = f"temp_{v}.wav"
    cmd = f'"{ffmpeg}" -y -i "{v_path}" -vn -ar 16000 -ac 1 "{temp_wav}"'
    subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    if os.path.exists(temp_wav):
        try:
            with sr.AudioFile(temp_wav) as source:
                audio_data = r.record(source)
                text = r.recognize_google(audio_data, language="ko-KR")
                results.append(f"[{v}]\nTranscribed: \"{text}\"\n")
        except Exception as e:
            results.append(f"[{v}]\nError: {e}\n")
        os.remove(temp_wav)

with open("transcription_full.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(results))
print("Saved to transcription_full.txt")
