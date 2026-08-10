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

// Load local historical figures DB with explicit utf-8 encoding
const figuresPath = path.join(__dirname, 'data', 'figures.json');
let figures = [];
try {
  const data = fs.readFileSync(figuresPath, 'utf-8');
  figures = JSON.parse(data);
} catch (err) {
  console.error('Failed to load figures.json:', err);
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

    // Step 1: Search Similarity Cache DB (Cache Hit -> 0ms Latency Instant Video)
    const cachedHit = findSimilarCachedDialogue(figureId, query);
    if (cachedHit) {
      return res.json({
        success: true,
        isCacheHit: true,
        figure: {
          id: figure.id,
          name: figure.name,
          title: figure.title,
          voiceProfile: figure.voiceProfile,
          portraitUrl: figure.portraitUrl,
          themeColor: figure.themeColor
        },
        matchedTopic: `⚡ [유사 질문 캐시 적중] ${cachedHit.matchedQuery}`,
        speechText: cachedHit.speechText,
        historicalReference: `지능형 유사도 캐시 데이터베이스 (0ms 즉시 재생)`,
        videoUrl: cachedHit.videoUrl,
        audioUrl: cachedHit.audioUrl,
        aiVideoResult: {
          success: true,
          provider: '지능형 유사도 캐시 DB (0ms 즉시 재생)',
          videoUrl: cachedHit.videoUrl,
          speechText: cachedHit.speechText,
          status: 'ready'
        },
        tokenCost: 0,
        engine: 'Intelligent Similarity Cache Engine (0ms Latency)'
      });
    }

    // Step 2: RAG Matching & Preset Check
    const result = generateDialogueLocally(figureId, query);

    // If query matches a preset document (e.g. 추천 질문), return preset pre-recorded video & audio!
    if (result.isPreset) {
      return res.json({ success: true, isCacheHit: false, ...result });
    }

    // Step 3: Un-preset New Custom Question -> Trigger Real-Time LLM Persona Generation
    console.log(`🤖 [Live Question Detected]: Query "${query}" is un-preset -> Calling Realtime LLM Persona Generator`);
    const llmResult = await generateLivePersonaLLM({
      figureId,
      figure,
      userQuery: query
    });

    res.json({
      success: true,
      isCacheHit: false,
      isPreset: false,
      figure: result.figure,
      matchedTopic: `${figure.name}의 실시간 AI 페르소나 응답`,
      speechText: llmResult.speechText,
      historicalReference: `실시간 AI 대화 엔진 (${llmResult.engine})`,
      videoUrl: null, // Will be generated on-the-fly by pipeline
      audioUrl: null,
      tokenCost: 0,
      engine: llmResult.engine
    });
  } catch (err) {
    console.error('Dialogue error:', err);
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
    const { figureId, text, query = null, engineType = 'SadTalker', apiKey = null, ngrokUrl = null } = req.body;
    const figure = figures.find(f => f.id === figureId);

    if (!text) {
      return res.status(400).json({ success: false, error: 'Text prompt is required.' });
    }

    console.log(`[Backend API] Generating AI Video for Figure: ${figureId}`);

    const audioInfo = await generateAudioFromText(text, figure?.voiceProfile, figureId);

    const rawVideoResult = await generateTalkingHeadVideo({
      figure,
      audioInfo,
      engineType,
      apiKey,
      ngrokUrl
    });

    // High speed server-side video + TTS audio merging
    let finalVideoUrl = rawVideoResult.videoUrl;
    if (rawVideoResult?.videoUrl && audioInfo?.audioUrl) {
      const mergeRes = await mergeVideoWithAudio({
        videoUrl: rawVideoResult.videoUrl,
        audioUrl: audioInfo.audioUrl,
        figureId
      });
      if (mergeRes.success && mergeRes.mergedVideoUrl) {
        finalVideoUrl = mergeRes.mergedVideoUrl;
      }
    }

    // Auto-save generated Q&A + Video bundle into Similarity Cache DB
    if (finalVideoUrl && audioInfo?.audioUrl) {
      saveToSimilarityCache({
        figureId,
        query: query || text,
        speechText: text,
        audioUrl: audioInfo.audioUrl,
        videoUrl: finalVideoUrl
      });
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
