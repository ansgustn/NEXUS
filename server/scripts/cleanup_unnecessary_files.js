import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_DIR = path.join(__dirname, '../../client/public/audio');
const VIDEOS_DIR = path.join(__dirname, '../../client/public/videos');

// List of official canonical audio files to keep
const CANONICAL_AUDIO_FILES = new Set([
  'kim-koo_doc-kim-01.mp3',
  'kim-koo_doc-kim-02.mp3',
  'kim-koo_culture_power.mp3',
  'king-sejong_speech.mp3',
  'king-sejong_speech_original.mp3',
  'king-sejong_speech_science.mp3',
  'king-sejong_speech_teaching.mp3',
  'yi-sun-sin_doc-yi-01.mp3',
  'yi-sun-sin_doc-yi-02.mp3',
  'yi-sun-sin_speech.mp3',
  'yu-gwan-sun_doc-yu-01.mp3',
  'yu-gwan-sun_doc-yu-02.mp3',
  'yu-gwan-sun_speech.mp3',
  'shin-saimdang_doc-shin-01.mp3',
  'shin-saimdang_doc-shin-02.mp3',
  'shin-saimdang_speech.mp3'
]);

// List of official canonical video files to keep
const CANONICAL_VIDEO_FILES = new Set([
  'kim-koo1.mp4',
  'kim-koo2.mp4',
  'king-sejong_speech_original_video.mp4',
  'king-sejong_talking_avatar.mp4',
  'shin-saimdang_talking_avatar.mp4',
  'yi-sun-sin_talking_avatar.mp4',
  'yu-gwan-sun_talking_avatar.mp4'
]);

function cleanup() {
  console.log('======================================================================');
  console.log('[Nexus AI File Cleanup Utility]');
  console.log('======================================================================');

  let deletedAudioCount = 0;
  let deletedVideoCount = 0;

  // 1. Cleanup Audio Directory
  if (fs.existsSync(AUDIO_DIR)) {
    const files = fs.readdirSync(AUDIO_DIR);
    for (const file of files) {
      if (!CANONICAL_AUDIO_FILES.has(file)) {
        const filePath = path.join(AUDIO_DIR, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️ [Deleted Unnecessary Audio]: ${file}`);
          deletedAudioCount++;
        } catch (e) {
          console.warn(`Failed to delete ${file}:`, e.message);
        }
      }
    }
  }

  // 2. Cleanup Video Directory
  if (fs.existsSync(VIDEOS_DIR)) {
    const files = fs.readdirSync(VIDEOS_DIR);
    for (const file of files) {
      if (!CANONICAL_VIDEO_FILES.has(file)) {
        const filePath = path.join(VIDEOS_DIR, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️ [Deleted Temporary Video]: ${file}`);
          deletedVideoCount++;
        } catch (e) {
          console.warn(`Failed to delete ${file}:`, e.message);
        }
      }
    }
  }

  // 3. Cleanup Images Directory
  const IMAGES_DIR = path.join(__dirname, '../../client/public/images');
  const CANONICAL_IMAGE_FILES = new Set([
    'kim-koo.jpg',
    'kim-koo.webp',
    'king-sejong.webp',
    'shin-saimdang.webp',
    'yi-sun-sin.webp',
    'yu-gwan-sun.webp'
  ]);

  let deletedImageCount = 0;
  if (fs.existsSync(IMAGES_DIR)) {
    const files = fs.readdirSync(IMAGES_DIR);
    for (const file of files) {
      if (!CANONICAL_IMAGE_FILES.has(file)) {
        const filePath = path.join(IMAGES_DIR, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`[Deleted Temp Image]: ${file}`);
          deletedImageCount++;
        } catch (e) {
          console.warn(`Failed to delete image ${file}:`, e.message);
        }
      }
    }
  }

  // 4. Cleanup Temp Scripts
  const TEMP_SCRIPTS = [
    'enhance_kim_koo_texture_seamless.py',
    'preprocess_historical_figure.py',
    'generate_neural_avatar.py',
    'generate_reference_matched_video.py',
    'generate_sejong_style_kim_koo.py',
    'inpaint_kim_koo_teeth.py'
  ];
  let deletedScriptCount = 0;
  for (const scriptFile of TEMP_SCRIPTS) {
    const scriptPath = path.join(__dirname, scriptFile);
    if (fs.existsSync(scriptPath)) {
      try {
        fs.unlinkSync(scriptPath);
        console.log(`[Deleted Temp Script]: ${scriptFile}`);
        deletedScriptCount++;
      } catch (e) {
        console.warn(`Failed to delete script ${scriptFile}:`, e.message);
      }
    }
  }

  console.log('\n======================================================================');
  console.log(`Cleanup Complete! Deleted ${deletedAudioCount} audio, ${deletedVideoCount} video, ${deletedImageCount} image, and ${deletedScriptCount} script files.`);
  console.log('======================================================================');
}

cleanup();
