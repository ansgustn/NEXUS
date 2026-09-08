import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

import { generateDialogueLocally } from './aiEngine.js';
import { generateAudioFromText } from './services/ttsService.js';
import { generateTalkingHeadVideo } from './services/talkingHeadService.js';
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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve uploaded & public portrait images, videos, and audio
const imagesDir = path.join(__dirname, '../client/public/images');
const videosDir = path.join(__dirname, '../client/public/videos');
const audioDir = path.join(__dirname, '../client/public/audio');

if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

app.use('/images', express.static(imagesDir));
app.use('/videos', express.static(videosDir));
app.use('/audio', express.static(audioDir));

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
  res.json({ success: true, figures });
});

// API 2: Interactive Historical Persona RAG Dialogue Generation with Similarity Cache DB
app.post('/api/dialogue', async (req, res) => {
  try {
    const { figureId, query } = req.body;
    const figure = figures.find(f => f.id === figureId);
    if (!figure) {
      return res.status(404).json({ success: false, error: 'Figure not found' });
    }

    const cleanQuery = (query || '').trim();

    // Step 1: Check Similarity Cache DB first (Immediate 0ms response, 100% answer & video consistency)
    const cachedHit = findSimilarCachedDialogue(figureId, cleanQuery);
    if (cachedHit && cachedHit.videoUrl) {
      const videoDiskPath = path.join(__dirname, '../client/public', cachedHit.videoUrl);
      if (fs.existsSync(videoDiskPath)) {
        console.log(`🎯 [Intelligent Cache RETURN]: Immediate consistent return for '${figure.name}': "${cleanQuery}"`);
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
            provider: '지능형 캐시 저장소',
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

      // If there is NO pre-rendered video, trigger ComfyUI to GENERATE the video in real-time!
      console.log(`🎨 [ComfyUI Video Pipeline] Triggering ComfyUI LTX-2.3 rendering for '${figure.name}': "${cleanQuery}"`);
      const audioResult = await generateAudioFromText(preset.speechText, figure.voiceProfile, figure.id);
      const videoResult = await generateTalkingHeadVideo({
        figure,
        audioInfo: audioResult,
        text: preset.speechText,
        engineType: 'LTX_Video'
      });

      if (videoResult.videoUrl) {
        const diskCheck = path.join(__dirname, '../client/public', videoResult.videoUrl);
        if (fs.existsSync(diskCheck)) {
          saveToSimilarityCache({
            figureId,
            query: cleanQuery,
            speechText: preset.speechText,
            audioUrl: audioResult.audioUrl || preset.audioUrl,
            videoUrl: videoResult.videoUrl
          });
        }
      }

      return res.json({
        ...preset,
        videoUrl: videoResult.videoUrl || null,
        videoList: videoResult.videoList || (videoResult.videoUrl ? [videoResult.videoUrl] : []),
        success: true,
        valid: true,
        isCacheHit: false,
        aiVideoResult: videoResult,
        tokenCost: 0,
        engine: 'Pure ComfyUI LTX-2.3 Engine'
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

    // Step 4: Generate TTS Speech Audio & Trigger Pure ComfyUI LTX-2.3 Video Pipeline
    console.log(`🎨 [Pure ComfyUI API Pipeline] Triggering ComfyUI Workflow ('오디오 + 디비오 생성.json') for: "${cleanQuery}"`);
    const audioResult = await generateAudioFromText(llmResult.speechText, figure.voiceProfile, figure.id);
    const videoResult = await generateTalkingHeadVideo({
      figure,
      audioInfo: audioResult,
      text: llmResult.speechText,
      engineType: 'LTX_Video'
    });

    // Step 5: Save to Similarity Cache DB for 100% Consistency on future reloads / re-queries
    if (videoResult.videoUrl) {
      const diskCheck = path.join(__dirname, '../client/public', videoResult.videoUrl);
      if (fs.existsSync(diskCheck)) {
        saveToSimilarityCache({
          figureId,
          query: cleanQuery,
          speechText: llmResult.speechText,
          audioUrl: audioResult.audioUrl,
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
        themeColor: figure.themeColor
      },
      matchedTopic: `${figure.name}의 실시간 AI 동영상`,
      speechText: llmResult.speechText,
      historicalReference: `ComfyUI LTX-2.3 워크플로우 렌더링 동영상`,
      videoUrl: videoResult.videoUrl,
      videoList: videoResult.videoList || (videoResult.videoUrl ? [videoResult.videoUrl] : []),
      audioUrl: audioResult.audioUrl,
      aiVideoResult: videoResult,
      tokenCost: 0,
      engine: 'Pure ComfyUI LTX-2.3 Engine'
    });

  } catch (err) {
    console.error('Dialogue error:', err);
    res.status(500).json({ success: false, error: err.message });
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

// Port Conflict Resilient Express Server Start
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`🚀 Nexus Server running on http://localhost:${port}`);
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
