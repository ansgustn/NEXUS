import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_DIR = path.join(__dirname, '../../client/public/audio');
const SCRIPTS_DIR = path.join(__dirname, '../scripts');

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/**
 * Step 1: TTS Service (Text to Guide Audio Speech Synthesis via edge-tts/gTTS)
 */
export async function generateAudioFromText(text, voiceProfile = 'ko-KR-SunHiNeural') {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const filename = `guide_speech_${timestamp}.mp3`;
    const outputPath = path.join(AUDIO_DIR, filename);
    const relativeUrl = `/audio/${filename}`;

    const scriptPath = path.join(SCRIPTS_DIR, 'generate_tts_guide.py');
    const command = `python "${scriptPath}" --text "${text.replace(/"/g, '\\"')}" --output "${outputPath}" --voice "${voiceProfile}"`;

    console.log(`[TTS Service] Generating Guide Audio for text: "${text.substring(0, 30)}..."`);

    exec(command, (error, stdout, stderr) => {
      if (error || !fs.existsSync(outputPath)) {
        console.warn(`[TTS Service Fallback]: ${stderr || error?.message}`);
        return resolve({
          success: true,
          audioUrl: `/audio/king-sejong_speech.mp3`,
          text,
          durationSec: Math.max(2, Math.ceil(text.length * 0.18)),
          isFallback: true
        });
      }

      console.log(`[TTS Service Success] Guide Audio saved at: ${outputPath}`);
      resolve({
        success: true,
        audioUrl: relativeUrl,
        audioPath: outputPath,
        text,
        durationSec: Math.max(2, Math.ceil(text.length * 0.18)),
        isFallback: false
      });
    });
  });
}
