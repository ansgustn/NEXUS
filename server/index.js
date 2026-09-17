import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

import { generateDialogueLocally } from './aiEngine.js';
import { generateAudioFromText } from './services/ttsService.js';
import { generateTalkingHeadVideo, generateComfyWav2LipVideo } from './services/talkingHeadService.js';
import { convertVoiceWithRVC, prepRVCDataset } from './services/rvcService.js';
import { inferVoiceProfileFromImage, synthesizeFaceToVoice } from './services/faceToVoiceService.js';
import { mergeVideoWithAudio } from './services/videoMergerService.js';
import { findSimilarCachedDialogue, saveToSimilarityCache, getCachedDialogues } from './services/cacheService.js';
import { generateLivePersonaLLM } from './services/llmService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env environment file from project root
const envFilePath = path.join(__dirname, '../.env');
if (fs.existsSync(envFilePath)) {
  try {
    const envLines = fs.readFileSync(envFilePath, 'utf-8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const eqIdx = trimmed.indexOf('=');
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
    console.log(`🌿 [Environment Config] Loaded custom configurations from .env (COMFYUI_URL: ${process.env.COMFYUI_URL || 'default'})`);
  } catch (e) {
    console.warn('[Environment Config Note]:', e.message);
  }
}

import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3001;
const WEBRTC_SERVER_URL = process.env.WEBRTC_SERVER_URL || 'http://localhost:8010';

async function checkWebRTCHealth() {
  try {
    const res = await fetch(`${WEBRTC_SERVER_URL}/health`, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    return null;
  }
  return null;
}

let webrtcProcess = null;

async function ensureWebRTCServerRunning() {
  const health = await checkWebRTCHealth();
  if (health) return true;

  console.log('🚀 [Auto-Launcher] WebRTC server not running on port 8010. Spawning background Python process...');
  const pythonExe = 'C:\\Users\\user\\Desktop\\ComfyUI_windows_portable\\python_embeded\\python.exe';
  const scriptPath = path.join(__dirname, 'webrtc', 'avatar_webrtc_server.py');

  if (fs.existsSync(pythonExe) && fs.existsSync(scriptPath)) {
    try {
      webrtcProcess = spawn(pythonExe, [scriptPath], {
        cwd: path.join(__dirname, 'webrtc'),
        stdio: 'ignore',
        detached: true
      });
      webrtcProcess.unref();

      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 500));
        const check = await checkWebRTCHealth();
        if (check) {
          console.log('✅ [Auto-Launcher] WebRTC server is now ONLINE on port 8010!');
          return true;
        }
      }
    } catch (err) {
      console.warn('[Auto-Launcher Warning]: Failed to spawn WebRTC server:', err.message);
    }
  }
  return false;
}

app.use(cors());
app.use(express.json());

// Serve uploaded & public portrait images, videos, and audio
const imagesDir = path.join(__dirname, '../client/public/images');
const videosDir = path.join(__dirname, '../client/public/videos');
const audioDir = path.join(__dirname, '../client/public/audio');

if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

const staticOptions = {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
  }
};
app.use('/images', express.static(imagesDir, staticOptions));
app.use('/videos', express.static(videosDir, staticOptions));
app.use('/audio', express.static(audioDir, staticOptions));

// Load local historical figures DB and historical docs with explicit utf-8 encoding
const figuresPath = path.join(__dirname, 'data', 'figures.json');
const docsPath = path.join(__dirname, 'data', 'historical_docs.json');
let figures = [];
let historicalDocs = [];
try {
  const data = fs.readFileSync(figuresPath, 'utf-8');
  figures = JSON.parse(data);
} catch (err) {
  console.error('Failed to load figures.json:', err);
}
try {
  const docsData = fs.readFileSync(docsPath, 'utf-8');
  historicalDocs = JSON.parse(docsData);
} catch (err) {
  console.error('Failed to load historical_docs.json:', err);
}

// Multer setup for portrait file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `upload-${Date.now()}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// API 1: Get all historical figures
app.get('/api/figures', (req, res) => {
  try {
    figures = JSON.parse(fs.readFileSync(figuresPath, 'utf-8'));
  } catch (e) {}
  res.json({ success: true, figures });
});

// API 2: Interactive Historical Persona RAG Dialogue Generation with Similarity Cache DB
app.post('/api/dialogue', async (req, res) => {
  try {
    try {
      figures = JSON.parse(fs.readFileSync(figuresPath, 'utf-8'));
    } catch (e) {}
    const { figureId, query, webrtcMode = false } = req.body;
    const figure = figures.find(f => f.id === figureId);
    if (!figure) {
      return res.status(404).json({ success: false, error: 'Figure not found' });
    }

    const cleanQuery = (query || '').trim();

    // Step 0: Persona Guardrail & Anachronism Detection (Plays 15s polite refusal video & speech)
    const FIGURE_REFUSALS = {
      'kim-koo': '허허, 그 물음은 우리 시대의 예의에 어긋나거나 내가 답하기 어려운 이야기구려. 나라와 독립을 위한 뜻깊은 대화를 나누어 봅시다.',
      'king-sejong': '과인의 조선 시대에는 그러한 말이 존재하지 않았거늘, 백성을 위한 바른 말과 예를 갖추어 다시 물어보시오.',
      'yi-sun-sin': '장수로서 답하기 어려운 물음이오. 예의를 지키고 우리 바다와 나라를 지킨 뜻을 물어보시오.',
      'yu-gwan-sun': '그런 험한 말이나 시대에 맞지 않는 물음에는 답할 수 없어요. 우리 조국의 밝은 미래를 이야기해요!',
      'shin-saimdang': '마음을 어지럽히는 궂은 말에는 대답하기 어렵습니다. 아름다운 자연과 배움의 도리를 나누어 보아요.'
    };

    const badWords = [
      '시발', '씨발', '개새끼', '새끼', '지랄', '꺼져', '닥쳐', '미친', '병신', '바보', '멍청이',
      '죽어', '죽인다', 'sex', '섹스', '보지', '자지', '새끼야', '느금', '엠창', '개소리',
      '스마트폰', '아이폰', '갤럭시', '컴퓨터', '비트코인', '코인', '인터넷', '유튜브', '롤'
    ];
    const qNormalized = cleanQuery.toLowerCase().replace(/\s+/g, '');
    const isBadQuery = badWords.some(w => qNormalized.includes(w));

    if (isBadQuery) {
      console.log(`🛡️ [Guardrail Triggered]: Inappropriate/Anachronistic query for '${figure.name}': "${cleanQuery}"`);
      const refusalText = FIGURE_REFUSALS[figure.id] || `${figure.name}은(는) 예의를 갖춘 대화를 희망합니다.`;
      const refusalVideoUrl = `/videos/${figure.id}_refusal.mp4`;
      const refusalAudioUrl = `/audio/${figure.id}_refusal.mp3`;

      return res.json({
        success: true,
        valid: false,
        isRefusal: true,
        figure: {
          id: figure.id,
          name: figure.name,
          title: figure.title,
          voiceProfile: figure.voiceProfile,
          portraitUrl: figure.portraitUrl,
          themeColor: figure.themeColor
        },
        matchedTopic: '예의 및 품위 안내',
        speechText: refusalText,
        historicalReference: '역사적 품위 및 언어 윤리 안내',
        videoUrl: refusalVideoUrl,
        audioUrl: refusalAudioUrl,
        aiVideoResult: {
          success: true,
          provider: '예의 및 품위 안내',
          videoUrl: refusalVideoUrl,
          audioUrl: refusalAudioUrl,
          speechText: refusalText,
          status: 'ready'
        },
        tokenCost: 0,
        engine: 'Historical Persona Guardrail Engine'
      });
    }

    // Step 1: Check Similarity Cache DB first (Immediate 0ms response, 100% authentic video & audio)
    const cachedHit = findSimilarCachedDialogue(figureId, cleanQuery);
    if (cachedHit && cachedHit.videoUrl) {
      const videoDiskPath = path.join(__dirname, '../client/public', cachedHit.videoUrl);
      if (fs.existsSync(videoDiskPath)) {
        console.log(`🎯 [Intelligent Cache RETURN]: Immediate authentic talking video for '${figure.name}': "${cleanQuery}" -> ${cachedHit.videoUrl}`);
        return res.json({
          success: true,
          valid: true,
          isCacheHit: true,
          isPreset: false,
          figure: {
            id: figure.id,
            name: figure.name,
            title: figure.title,
            voiceProfile: figure.voiceProfile,
            portraitUrl: figure.portraitUrl,
            themeColor: figure.themeColor
          },
          matchedTopic: `${figure.name}의 지능형 보관 동영상`,
          speechText: cachedHit.speechText,
          historicalReference: `지능형 캐시 데이터베이스 보관 동영상`,
          videoUrl: cachedHit.videoUrl,
          audioUrl: cachedHit.audioUrl,
          aiVideoResult: {
            success: true,
            provider: '사료 대화 영상 아카이브',
            videoUrl: cachedHit.videoUrl,
            audioUrl: cachedHit.audioUrl,
            speechText: cachedHit.speechText,
            status: 'ready'
          },
          tokenCost: 0,
          engine: 'Intelligent Similarity Cache DB'
        });
      }
    }

    // Step 2: Check Local Historical Docs Preset (Curated high-definition historical footage)
    const preset = generateDialogueLocally(figureId, cleanQuery);
    if (preset && preset.isPreset) {
      const hasRealVideo = preset.videoUrl && !preset.videoUrl.includes('idle_blink') && fs.existsSync(path.join(__dirname, '../client/public', preset.videoUrl));
      const validVideoUrl = hasRealVideo ? preset.videoUrl : null;

      if (validVideoUrl) {
        console.log(`📜 [Historical Docs Preset RETURN]: Matched preset for '${figure.name}': "${cleanQuery}" (Video: Genuine Video)`);
        saveToSimilarityCache({
          figureId,
          query: cleanQuery,
          speechText: preset.speechText,
          audioUrl: preset.audioUrl,
          videoUrl: validVideoUrl
        });
        return res.json({
          ...preset,
          videoUrl: validVideoUrl,
          success: true,
          valid: true,
          isCacheHit: true,
          aiVideoResult: {
            success: true,
            provider: '사료 대화 영상 아카이브',
            videoUrl: validVideoUrl,
            audioUrl: preset.audioUrl,
            speechText: preset.speechText,
            status: 'ready'
          }
        });
      }
    }

    // Step 3: Check if WebRTC Mode is active and available for live dynamic fallback
    if (webrtcMode) {
      const webrtcHealth = await checkWebRTCHealth();
      if (webrtcHealth) {
        console.log(`📡 [WebRTC Dialogue Mode] Processing real-time question for '${figure.name}': "${cleanQuery}"`);
        let speechText = (cachedHit && cachedHit.speechText) || (preset && preset.speechText);

        if (!speechText) {
          const llmResult = await generateLivePersonaLLM({
            figureId,
            figure,
            userQuery: cleanQuery
          });
          speechText = llmResult.speechText;
        }

        if (speechText) {
          try {
            await fetch(`${WEBRTC_SERVER_URL}/speak`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                figureId,
                text: speechText,
                voiceProfile: figure.voiceProfile
              })
            });
            console.log(`🗣️ [WebRTC Dispatched] '${figure.name}' speech sent to WebRTC Stream!`);
          } catch (speakErr) {
            console.warn('[WebRTC Dispatch Warning]:', speakErr.message);
          }

          return res.json({
            success: true,
            valid: true,
            isWebRTC: true,
            isCacheHit: Boolean(cachedHit),
            figure: {
              id: figure.id,
              name: figure.name,
              title: figure.title,
              voiceProfile: figure.voiceProfile,
              portraitUrl: figure.portraitUrl,
              idleVideoUrl: figure.idleVideoUrl || `/videos/idle_blink_${figure.id}.mp4`,
              themeColor: figure.themeColor
            },
            matchedTopic: `${figure.name}의 실시간 WebRTC 음성/영상`,
            speechText,
            historicalReference: `로컬 GPU WebRTC 실시간 스트림`,
            tokenCost: 0,
            engine: 'NEXUS Local GPU WebRTC Engine'
          });
        }
      }
    }

    // Fallback: If there is NO pre-rendered video in cache or presets, generate via ComfyUI
    if (preset && preset.isPreset) {
      const audioResult = await generateAudioFromText(preset.speechText, figure.voiceProfile, figure.id);
      const daesaPath = path.join(__dirname, '../대사.json');
      let videoResult = null;

      if (fs.existsSync(daesaPath)) {
        console.log(`🎬 [ComfyUI Pipeline] Using '대사.json' (Wav2Lip 4-node) for '${figure.name}': "${cleanQuery}"`);
        try {
          const w2lRes = await generateComfyWav2LipVideo({
            figure,
            audioRelativeUrl: audioResult.audioUrl,
            speechText: preset.speechText
          });
          videoResult = {
            success: true,
            videoUrl: w2lRes.videoUrl,
            videoList: [w2lRes.videoUrl],
            engine: w2lRes.engine
          };
        } catch (w2lErr) {
          console.warn(`⚠️ [ComfyUI Crash/Error Handled]: ${w2lErr.message}`);
          // Graceful Fallback: Voice audio still plays, screen stays alive with portrait/default video!
          videoResult = {
            success: false,
            videoUrl: figure.defaultVideoUrl || null,
            videoList: figure.defaultVideoUrl ? [figure.defaultVideoUrl] : [],
            engine: 'Audio + Portrait Safe Fallback (ComfyUI Crash Protection)'
          };
        }
      } else {
        console.log(`🎨 [ComfyUI Video Pipeline] Triggering ComfyUI LTX-2.3 rendering for '${figure.name}': "${cleanQuery}"`);
        videoResult = await generateTalkingHeadVideo({
          figure,
          audioInfo: audioResult,
          text: preset.speechText,
          engineType: 'LTX_Video'
        });
      }

      if (videoResult?.videoUrl) {
        const diskCheck = path.join(__dirname, '../client/public', videoResult.videoUrl);
        if (fs.existsSync(diskCheck)) {
          saveToSimilarityCache({
            figureId,
            query: cleanQuery,
            speechText: preset.speechText,
            audioUrl: videoResult.audioUrl || audioResult.audioUrl || preset.audioUrl,
            videoUrl: videoResult.videoUrl
          });
        }
      }

      return res.json({
        ...preset,
        audioUrl: videoResult?.audioUrl || audioResult.audioUrl || preset.audioUrl,
        videoUrl: videoResult?.videoUrl || null,
        videoList: videoResult?.videoList || (videoResult?.videoUrl ? [videoResult.videoUrl] : []),
        success: true,
        valid: true,
        isCacheHit: false,
        aiVideoResult: videoResult,
        tokenCost: 0,
        engine: videoResult?.engine || 'Pure ComfyUI Engine'
      });
    }

    // Step 3: Generate Persona Answer Text via Fast LLM (Short, impactful 1~2 sentences)
    console.log(`🤖 [Interactive Persona LLM]: Generating reply for '${figure.name}': "${cleanQuery}"`);
    const llmResult = await generateLivePersonaLLM({
      figureId,
      figure,
      userQuery: cleanQuery
    });

    if (llmResult.valid === false) {
      return res.json({
        success: false,
        valid: false,
        message: llmResult.message || '질문을 할 수 없습니다.',
        speechText: null,
        engine: llmResult.engine
      });
    }

    // Step 4: Generate TTS Speech Audio & Trigger Fast ComfyUI Wav2Lip Pipeline
    console.log(`🎨 [AI Speech & Video Pipeline] Triggering for: "${cleanQuery}"`);
    const audioResult = await generateAudioFromText(llmResult.speechText, figure.voiceProfile, figure.id);
    const daesaPath = path.join(__dirname, '../대사.json');
    let videoResult = null;

    if (fs.existsSync(daesaPath)) {
      console.log(`🎬 [ComfyUI Pipeline] Using '대사.json' (Wav2Lip 4-node) for '${figure.name}': "${cleanQuery}"`);
      try {
        const w2lRes = await generateComfyWav2LipVideo({
          figure,
          audioRelativeUrl: audioResult.audioUrl,
          speechText: llmResult.speechText
        });
        videoResult = {
          success: true,
          videoUrl: w2lRes.videoUrl,
          videoList: [w2lRes.videoUrl],
          engine: w2lRes.engine,
          status: 'ready'
        };
      } catch (w2lErr) {
        console.warn(`⚠️ [ComfyUI Wav2Lip Fallback]:`, w2lErr.message);
        // Fallback to pre-rendered authentic video or portrait standby video
        const fallbackVid = figure.defaultVideoUrl || `/videos/${figure.id}_talking_avatar.mp4`;
        videoResult = {
          success: true,
          videoUrl: fallbackVid,
          videoList: [fallbackVid],
          engine: 'Audio + Standby Video Engine (ComfyUI Safe Mode)',
          status: 'ready'
        };
      }
    } else {
      videoResult = await generateTalkingHeadVideo({
        figure,
        audioInfo: audioResult,
        text: llmResult.speechText,
        engineType: 'LTX_Video'
      });
      if (!videoResult?.videoUrl) {
        const fallbackVid = figure.defaultVideoUrl || `/videos/${figure.id}_talking_avatar.mp4`;
        videoResult = {
          ...videoResult,
          videoUrl: fallbackVid,
          videoList: [fallbackVid],
          status: 'ready'
        };
      }
    }

    // Step 5: Save to Similarity Cache DB for 100% Consistency on future reloads / re-queries
    if (videoResult?.videoUrl) {
      const diskCheck = path.join(__dirname, '../client/public', videoResult.videoUrl);
      if (fs.existsSync(diskCheck)) {
        saveToSimilarityCache({
          figureId,
          query: cleanQuery,
          speechText: llmResult.speechText,
          audioUrl: videoResult.audioUrl || audioResult.audioUrl,
          videoUrl: videoResult.videoUrl
        });
      }
    }

    res.json({
      success: true,
      valid: true,
      isCacheHit: false,
      isPreset: false,
      figure: {
        id: figure.id,
        name: figure.name,
        title: figure.title,
        voiceProfile: figure.voiceProfile,
        portraitUrl: figure.portraitUrl,
        idleVideoUrl: figure.idleVideoUrl || `/videos/idle_blink_${figure.id}.mp4`,
        themeColor: figure.themeColor
      },
      matchedTopic: `${figure.name}의 실시간 AI 동영상`,
      speechText: llmResult.speechText,
      historicalReference: `인공지능 실시간 역사 대화`,
      videoUrl: videoResult.videoUrl,
      videoList: videoResult.videoList || (videoResult.videoUrl ? [videoResult.videoUrl] : []),
      audioUrl: videoResult.audioUrl || audioResult.audioUrl,
      aiVideoResult: videoResult,
      tokenCost: 0,
      engine: videoResult.engine || 'Pure ComfyUI Wav2Lip Engine'
    });

  } catch (err) {
    console.error('Dialogue error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 2.1: [Step 2] Independent Audio/TTS Generation (Takes figureId + text/query -> returns audioUrl in 0.3s)
app.post('/api/audio/generate', async (req, res) => {
  try {
    const { figureId, text, query } = req.body;
    const figure = figures.find(f => f.id === figureId);
    if (!figure) return res.status(404).json({ success: false, error: 'Figure not found' });

    let speechText = text;
    if (!speechText && query) {
      const cachedHit = findSimilarCachedDialogue(figureId, query);
      if (cachedHit) {
        speechText = cachedHit.speechText;
      } else {
        const llmResult = await generateLivePersonaLLM({ figureId, figure, userQuery: query });
        speechText = llmResult.speechText;
      }
    }

    if (!speechText) {
      return res.status(400).json({ success: false, error: 'Speech text or query is required' });
    }

    console.log(`🎙️ [Decoupled Step 2: Audio Generation] Synthesizing speech for '${figure.name}' (${figureId})...`);
    const audioResult = await generateAudioFromText(speechText, figure.voiceProfile, figure.id);

    return res.json({
      success: true,
      figureId,
      speechText,
      audioUrl: audioResult.audioUrl,
      duration: audioResult.duration || null,
      engine: 'High-Speed Edge-TTS Persona Voice'
    });
  } catch (err) {
    console.error('Audio generation error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 2.2: [Step 3] Independent Video Generation via ComfyUI Wav2Lip (Takes figureId + audioUrl -> returns videoUrl in 5~8s)
app.post('/api/video/generate', async (req, res) => {
  try {
    const { figureId, audioUrl } = req.body;
    const figure = figures.find(f => f.id === figureId);
    if (!figure) return res.status(404).json({ success: false, error: 'Figure not found' });
    if (!audioUrl) return res.status(400).json({ success: false, error: 'audioUrl is required' });

    console.log(`🎬 [Decoupled Step 3: Video Generation] Invoking ComfyUI Wav2Lip for '${figure.name}' (${figureId})...`);
    const videoResult = await generateComfyWav2LipVideo({
      figure,
      audioRelativeUrl: audioUrl
    });

    return res.json({
      success: true,
      figureId,
      audioUrl,
      videoUrl: videoResult.videoUrl,
      engine: 'ComfyUI Wav2Lip GAN (RTX 4050)'
    });
  } catch (err) {
    console.error('Video generation error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 2.5: Get Browsable Video Gallery Archive (Curated presets + Cached Q&A videos)
app.get('/api/videos/gallery', (req, res) => {
  try {
    const { figureId } = req.query;
    const cachedList = getCachedDialogues();
    const galleryItems = [];
    const seenUrls = new Set();

    // 1. Historical preset documents with video
    for (const doc of historicalDocs) {
      if (doc.videoUrl && (!figureId || doc.figureId === figureId)) {
        if (!seenUrls.has(doc.videoUrl)) {
          seenUrls.add(doc.videoUrl);
          const fig = figures.find(f => f.id === doc.figureId);
          galleryItems.push({
            id: doc.id,
            figureId: doc.figureId,
            figureName: fig?.name || doc.figureId,
            title: doc.topic,
            speechText: doc.speechTemplate || doc.sourceText,
            videoUrl: doc.videoUrl,
            audioUrl: doc.audioUrl,
            portraitUrl: fig?.portraitUrl,
            themeColor: fig?.themeColor,
            tag: '사료 명장면'
          });
        }
      }
    }

    // 2. Cached Q&A videos
    for (const item of cachedList) {
      if (item.videoUrl && (!figureId || item.figureId === figureId)) {
        if (!seenUrls.has(item.videoUrl)) {
          seenUrls.add(item.videoUrl);
          const fig = figures.find(f => f.id === item.figureId);
          galleryItems.push({
            id: item.id,
            figureId: item.figureId,
            figureName: fig?.name || item.figureId,
            title: item.query,
            speechText: item.speechText,
            videoUrl: item.videoUrl,
            audioUrl: item.audioUrl,
            portraitUrl: fig?.portraitUrl,
            themeColor: fig?.themeColor,
            tag: '지능형 보관 영상'
          });
        }
      }
    }

    // 3. Figures default videos
    for (const fig of figures) {
      if (fig.defaultVideoUrl && (!figureId || fig.id === figureId)) {
        if (!seenUrls.has(fig.defaultVideoUrl)) {
          seenUrls.add(fig.defaultVideoUrl);
          galleryItems.push({
            id: `default_${fig.id}`,
            figureId: fig.id,
            figureName: fig.name,
            title: `${fig.name} 기본 인터뷰`,
            speechText: fig.description,
            videoUrl: fig.defaultVideoUrl,
            audioUrl: `/audio/${fig.id}_speech.mp3`,
            portraitUrl: fig.portraitUrl,
            themeColor: fig.themeColor,
            tag: '대표 영상'
          });
        }
      }
    }

    res.json({ success: true, count: galleryItems.length, gallery: galleryItems });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 3: Upload custom user portrait photo
app.post('/api/upload-portrait', upload.single('portrait'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }
    const relativeUrl = `/images/${req.file.filename}`;
    res.json({
      success: true,
      imageUrl: relativeUrl,
      message: '사용자 지정 사진이 성공적으로 업로드되었습니다.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 4: Complete AI Video Generation Pipeline (Pure Backend Processor)
app.post('/api/pipeline/generate-video', async (req, res) => {
  try {
    const { figureId, text, query = null, engineType = 'LTX_Video', apiKey = null, ngrokUrl = null, duration = null, speed = null, pitch = null, prompt = null } = req.body;
    const figure = figures.find(f => f.id === figureId);

    if (!text) {
      return res.status(400).json({ success: false, error: 'Text prompt is required.' });
    }

    // Merge figure voiceProfile with request speed/pitch overrides
    const effectiveVoiceProfile = {
      ...(figure?.voiceProfile || {}),
      ...(speed !== null ? { speed: parseFloat(speed) } : {}),
      ...(pitch !== null ? { pitch: parseInt(pitch, 10) } : {})
    };

    const effectiveFigure = figure ? {
      ...figure,
      voiceProfile: effectiveVoiceProfile
    } : null;

    console.log(`[Backend API] Generating AI Video for Figure: ${figureId} | Speed: ${effectiveVoiceProfile.speed || '0.9'} | Pitch: ${effectiveVoiceProfile.pitch || '-15'} | Duration: ${duration || 'Auto'}`);

    const audioInfo = await generateAudioFromText(text, effectiveVoiceProfile, figureId);

    const rawVideoResult = await generateTalkingHeadVideo({
      figure: effectiveFigure,
      audioInfo,
      text,
      engineType,
      apiKey,
      ngrokUrl,
      duration,
      prompt
    });

    // High speed server-side video + TTS audio merging to guarantee physical mp4 file on disk
    let finalVideoUrl = null;
    if (rawVideoResult?.videoUrl) {
      const rawPath = path.join(__dirname, '../client/public', rawVideoResult.videoUrl);
      if (fs.existsSync(rawPath)) finalVideoUrl = rawVideoResult.videoUrl;
    }

    if (finalVideoUrl && audioInfo?.audioUrl) {
      const mergeRes = await mergeVideoWithAudio({
        videoUrl: finalVideoUrl,
        audioUrl: audioInfo.audioUrl,
        figureId
      });
      if (mergeRes.success && mergeRes.mergedVideoUrl) {
        finalVideoUrl = mergeRes.mergedVideoUrl;
      }
    }

    // Auto-save generated Q&A + Physical Video bundle into Similarity Cache DB ONLY if file physically exists
    if (finalVideoUrl && audioInfo?.audioUrl) {
      const diskCheck = path.join(__dirname, '../client/public', finalVideoUrl);
      if (fs.existsSync(diskCheck)) {
        saveToSimilarityCache({
          figureId,
          query: query || text,
          speechText: text,
          audioUrl: audioInfo.audioUrl,
          videoUrl: finalVideoUrl
        });
      }
    }

    const videoResult = {
      ...rawVideoResult,
      videoUrl: finalVideoUrl,
      rawVideoUrl: rawVideoResult.videoUrl,
      audioUrl: audioInfo.audioUrl
    };

    res.json({
      success: true,
      pipeline: {
        figure: figure?.name,
        text,
        audioInfo,
        videoResult,
        engineSelected: videoResult.provider
      }
    });
  } catch (err) {
    console.error('[Backend AI Pipeline Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 5: RVC Voice Conversion
app.post('/api/rvc/convert', async (req, res) => {
  try {
    const { inputAudioPath, figureId, pitch = 0 } = req.body;
    if (!inputAudioPath || !figureId) {
      return res.status(400).json({ success: false, error: 'inputAudioPath and figureId are required.' });
    }

    const result = await convertVoiceWithRVC({ inputAudioPath, figureId, pitch });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 6: RVC Automated Dataset Prep (YouTube/WAV Slicer)
app.post('/api/rvc/prep-dataset', async (req, res) => {
  try {
    const { inputSource, figureId } = req.body;
    if (!inputSource || !figureId) {
      return res.status(400).json({ success: false, error: 'inputSource and figureId are required.' });
    }

    const result = await prepRVCDataset({ inputSource, figureId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 7: Image-to-Voice (Face-to-Voice) Copyright-Free Voice Profile Inference
app.post('/api/face-to-voice/profile', (req, res) => {
  try {
    const { portraitUrl, figureId } = req.body;
    const figure = figures.find(f => f.id === figureId);
    const profile = inferVoiceProfileFromImage(portraitUrl, figure);
    res.json({ success: true, profile, figure: figure?.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 8: Image-to-Voice 100% Copyright-Free Audio Synthesis
app.post('/api/face-to-voice/synthesize', async (req, res) => {
  try {
    const { figureId, portraitUrl, text, customTone } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text prompt is required.' });
    }

    const result = await synthesizeFaceToVoice({ figureId, portraitUrl, text, customTone });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 9: WebRTC Microservice Health Status Proxy
app.get('/api/webrtc/status', async (req, res) => {
  const health = await checkWebRTCHealth();
  res.json({ success: true, online: Boolean(health), info: health || null });
});

// API 10: WebRTC Direct Speech Trigger Proxy
app.post('/api/webrtc/speak', async (req, res) => {
  try {
    const { figureId, text, voiceProfile } = req.body;
    const response = await fetch(`${WEBRTC_SERVER_URL}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figureId, text, voiceProfile })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ success: false, error: 'WebRTC Microservice Unreachable: ' + err.message });
  }
});

// API 11: WebRTC Switch Figure Proxy
app.post('/api/webrtc/figure', async (req, res) => {
  try {
    const { figureId } = req.body;
    const response = await fetch(`${WEBRTC_SERVER_URL}/figure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figureId })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ success: false, error: 'WebRTC Microservice Unreachable: ' + err.message });
  }
});

// Serve production built frontend from client/dist if present
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/images') || req.path.startsWith('/videos') || req.path.startsWith('/audio')) {
      return next();
    }
    const indexHtml = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      return res.sendFile(indexHtml);
    }
    next();
  });
  console.log(`📦 [Static Distribution] Express serving frontend SPA from: ${clientDistPath}`);
}

// Port Conflict Resilient Express Server Start
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`🚀 Nexus Server running on http://localhost:${port}`);
    console.log(`🎨 ComfyUI AI Engine connected: ${process.env.COMFYUI_URL || 'http://127.0.0.1:8188'}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, retrying on ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
};

startServer(PORT);
