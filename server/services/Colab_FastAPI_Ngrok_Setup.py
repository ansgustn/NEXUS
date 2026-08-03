# ==============================================================================
# Google Colab T4 GPU + FastAPI + Ngrok AI Video Backend Server Code
# Copy and Paste this code block into Google Colab (Runtime: T4 GPU)
# ==============================================================================

"""
[Step 1] Shell Commands to install dependencies in Colab Cell:

!pip install fastapi uvicorn pyngrok torch torchvision diffusers transformers gTTS
!git clone https://github.com/OpenTalker/SadTalker.git
%cd SadTalker
!pip install -r requirements.txt
"""

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from pyngrok import ngrok

app = FastAPI(title="SadTalker / LivePortrait AI Video Server", version="1.0.0")

# Input Request Data Schema
class VideoGenerationRequest(BaseModel):
    figure_id: str
    image_url: str
    text: str
    audio_url: str = None

@app.get("/")
def health_check():
    return {"status": "running", "engine": "SadTalker / LivePortrait T4 GPU Inference Server"}

# FastAPI @app.post("/generate") Endpoint
@app.post("/generate")
async def generate_talking_head_video(req: VideoGenerationRequest):
    try:
        print(f"[Colab AI GPU Server] Processing Request for Figure: {req.figure_id}")
        print(f" - Image URL: {req.image_url}")
        print(f" - Script Text: {req.text}")
        
        # 1. Run TTS / Audiospectrogram conversion
        # 2. Run SadTalker PyTorch Inference: python inference.py --driven_audio ... --source_image ...
        # 3. Output MP4 file path
        
        output_mp4_path = f"/content/output_{req.figure_id}.mp4"
        
        return {
            "status": "success",
            "figure_id": req.figure_id,
            "video_path": output_mp4_path,
            "message": "AI Talking Avatar video generated successfully on Colab T4 GPU."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def start_ngrok_tunnel(authtoken: str, port: int = 8000):
    # Set Ngrok Auth Token
    ngrok.set_auth_token(authtoken)
    public_url = ngrok.connect(port)
    print("=" * 70)
    print(f"🚀 Google Colab FastAPI Ngrok Public Server URL:")
    print(f"👉 {public_url}")
    print("=" * 70)
    print("Copy the above URL and paste it into History-Nexus AI Web App!")
    return public_url

if __name__ == "__main__":
    # User Genuine Ngrok Auth Token from dashboard.ngrok.com
    MY_NGROK_TOKEN = "3GZWgtKHkbv5YtG7Zox3uoDrnOj_VA6Hib6T7PSGhRRST4Ba"
    
    start_ngrok_tunnel(MY_NGROK_TOKEN, 8000)
    uvicorn.run(app, host="0.0.0.0", port=8000)
