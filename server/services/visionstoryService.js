import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * VisionStory AI Video Generation Service (app.visionstory.ai / openapi.visionstory.ai)
 */
export async function generateVisionStoryVideo({ apiKey, imagePath, audioPath, text, figureId = 'king-sejong' }) {
  const effectiveKey = apiKey || process.env.VISIONSTORY_API_KEY || process.env.DID_API_KEY || 'sk-vs-P7YupP6Csy2tzrzNR1Uu3h6kccr1X5VHNWc3Pe11ZUSdtKcP';

  console.log(`[VisionStory AI Engine] Starting High-Quality Avatar Video Generation for figure: ${figureId}...`);

  const headers = {
    'X-API-Key': effectiveKey,
    'Content-Type': 'application/json'
  };

  // 1. Prepare Base64 Image - Always use user provided 세종.jpg for King Sejong
  let imgAbsPath = imagePath;
  const userSejongJpg = path.join(process.cwd(), 'client/public/images/세종.jpg');
  if (figureId === 'king-sejong' && fs.existsSync(userSejongJpg)) {
    imgAbsPath = userSejongJpg;
  } else if (!path.isAbsolute(imagePath)) {
    imgAbsPath = path.join(process.cwd(), 'client/public', imagePath);
  }

  if (!fs.existsSync(imgAbsPath)) {
    if (fs.existsSync(userSejongJpg)) {
      imgAbsPath = userSejongJpg;
    } else {
      throw new Error(`VisionStory Image file not found: ${imgAbsPath}`);
    }
  }

  const imgBuffer = fs.readFileSync(imgAbsPath);
  const imgB64 = imgBuffer.toString('base64');
  let mimeType = 'image/jpeg';
  if (imgAbsPath.toLowerCase().endsWith('.png')) mimeType = 'image/png';

  // 2. Create Avatar on VisionStory
  console.log(`[VisionStory AI] Creating Solemn Avatar for '${figureId}' using image: ${path.basename(imgAbsPath)}...`);
  const avatarResp = await fetch('https://openapi.visionstory.ai/api/v1/avatar', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      inline_data: {
        mime_type: mimeType,
        data: imgB64
      }
    })
  });

  if (!avatarResp.ok) {
    const errText = await avatarResp.text();
    throw new Error(`VisionStory Avatar Creation Failed (${avatarResp.status}): ${errText}`);
  }

  const avatarData = await avatarResp.json();
  const avatarId = avatarData.data?.avatar_id;
  console.log(`[VisionStory AI] Avatar Created! ID: ${avatarId}`);

  // 3. Prepare Video Payload (Low Motion Scale for Solemn, Serious King Demeanor)
  const videoPayload = {
    model_id: 'vs_character_v4',
    avatar_id: avatarId,
    aspect_ratio: '1:1',
    resolution: '720p',
    motion_scale: 0.1,
    camera_motion: false
  };

  if (audioPath) {
    let audAbsPath = audioPath;
    if (!path.isAbsolute(audioPath)) {
      audAbsPath = path.join(process.cwd(), 'client/public', audioPath);
    }

    if (fs.existsSync(audAbsPath)) {
      const audBuffer = fs.readFileSync(audAbsPath);
      const audB64 = audBuffer.toString('base64');
      const ext = path.extname(audAbsPath).toLowerCase();
      let audMime = 'audio/mp3';
      if (ext === '.wav') audMime = 'audio/wav';
      else if (ext === '.m4a') audMime = 'audio/m4a';

      videoPayload.audio_script = {
        inline_data: {
          mime_type: audMime,
          data: audB64
        }
      };
    }
  }

  if (!videoPayload.audio_script && text) {
    videoPayload.text_script = {
      text,
      voice_id: 'ko-KR-InJoonNeural',
      speech_rate: 'normal'
    };
  }

  // 4. Create Video Generation Task
  console.log(`[VisionStory AI] Submitting Video Generation Task for '${figureId}'...`);
  const videoTaskResp = await fetch('https://openapi.visionstory.ai/api/v1/video', {
    method: 'POST',
    headers,
    body: JSON.stringify(videoPayload)
  });

  if (!videoTaskResp.ok) {
    const errText = await videoTaskResp.text();
    throw new Error(`VisionStory Video Creation Failed (${videoTaskResp.status}): ${errText}`);
  }

  const videoTaskData = await videoTaskResp.json();
  const videoId = videoTaskData.data?.video_id;
  console.log(`[VisionStory AI] Video Task Created! Task ID: ${videoId}. Polling status...`);

  // 5. Poll Video Task Status
  let attempts = 0;
  const maxAttempts = 40;

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 3000));
    attempts++;

    const statusResp = await fetch(`https://openapi.visionstory.ai/api/v1/video?video_id=${videoId}`, { headers });
    if (statusResp.ok) {
      const statusData = await statusResp.json();
      const detail = statusData.data || {};
      const status = detail.status;
      console.log(`[VisionStory Polling ${attempts}/${maxAttempts}] Status: ${status}, Progress: ${detail.progress || 0}%`);

      if (status === 'success' || status === 'completed' || detail.video_url) {
        console.log(`[VisionStory Success] High-Quality Video URL: ${detail.video_url}`);
        
        // Download High-Quality Clean Video
        const vidResp = await fetch(detail.video_url);
        const vidBuffer = Buffer.from(await vidResp.arrayBuffer());

        const outFileName = `${figureId}_talking_avatar.mp4`;
        const v1 = path.join(process.cwd(), 'client/public/videos', outFileName);
        const v2 = path.join(process.cwd(), 'server/data/output_videos', outFileName);

        const v1Dir = path.dirname(v1);
        const v2Dir = path.dirname(v2);
        if (!fs.existsSync(v1Dir)) fs.mkdirSync(v1Dir, { recursive: true });
        if (!fs.existsSync(v2Dir)) fs.mkdirSync(v2Dir, { recursive: true });

        fs.writeFileSync(v1, vidBuffer);
        fs.writeFileSync(v2, vidBuffer);
        console.log(`[VisionStory Success] Saved Clean 1080p Video to ${v1}`);

        return {
          success: true,
          provider: 'VisionStory AI Pro Engine (Watermark-Free HD)',
          videoUrl: `/videos/${outFileName}`,
          rawUrl: detail.video_url,
          status: 'ready'
        };
      } else if (status === 'failed' || status === 'error') {
        throw new Error(`VisionStory Video Generation Failed: ${detail.error_message || 'Unknown error'}`);
      }
    }
  }

  throw new Error("VisionStory Video Generation Timeout.");
}
