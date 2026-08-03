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

// API 2: Interactive Historical Persona RAG Dialogue Generation
app.post('/api/dialogue', (req, res) => {
  try {
    const { figureId, query } = req.body;
    const figure = figures.find(f => f.id === figureId);
    if (!figure) {
      return res.status(404).json({ success: false, error: 'Figure not found' });
    }

    const result = generateDialogueLocally(figureId, query);
    res.json({ success: true, ...result });
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
    const { figureId, text, engineType = 'SadTalker', apiKey = null, ngrokUrl = null } = req.body;
    const figure = figures.find(f => f.id === figureId);

    if (!text) {
      return res.status(400).json({ success: false, error: 'Text prompt is required.' });
    }

    console.log(`[Backend API] Generating AI Video for Figure: ${figureId}`);

    const audioInfo = await generateAudioFromText(text, figure?.voiceProfile);

    const videoResult = await generateTalkingHeadVideo({
      figure,
      audioInfo,
      engineType,
      apiKey,
      ngrokUrl
    });

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
