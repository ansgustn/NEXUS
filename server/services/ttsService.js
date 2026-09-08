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
export async function generateAudioFromText(text, voiceProfile = 'ko-KR-SunHiNeural', figureId = 'kim-koo') {
  return new Promise((resolve) => {
    // 1. Look up matched audio in historical_docs.json
    try {
      const docsPath = path.join(__dirname, '../data/historical_docs.json');
      if (fs.existsSync(docsPath)) {
        const docs = JSON.parse(fs.readFileSync(docsPath, 'utf-8'));
        const matchedDoc = docs.find(d => 
          (text && d.speechTemplate && text.includes(d.speechTemplate.substring(0, 15))) ||
          (text && d.speechTemplate && d.speechTemplate.includes(text.substring(0, 15)))
        );
        if (matchedDoc?.audioUrl) {
          const resolvedDiskPath = path.join(__dirname, '../../client/public', matchedDoc.audioUrl);
          if (fs.existsSync(resolvedDiskPath)) {
            console.log(`[TTS Service] Matched pre-recorded audio: ${matchedDoc.audioUrl}`);
            return resolve({
              success: true,
              audioUrl: matchedDoc.audioUrl,
              audioPath: resolvedDiskPath,
              text,
              durationSec: Math.max(5, Math.ceil(text.length * 0.22)),
              isFallback: false
            });
          } else {
            console.log(`[TTS Service] Matched doc audio ${matchedDoc.audioUrl} not found on disk. Generating real-time...`);
          }
        }
      }
    } catch (e) {
      console.warn('[TTS Doc Search Note]:', e.message);
    }

    const timestamp = Date.now();
    const filename = `guide_speech_${timestamp}.mp3`;
    const outputPath = path.join(AUDIO_DIR, filename);
    const relativeUrl = `/audio/${filename}`;

    // 2. Check for F5-TTS 5-second Reference Audio file
    const refAudioPath = path.join(__dirname, '../data/ref_audio', `${figureId}_ref.wav`);
    if (fs.existsSync(refAudioPath)) {
      console.log(`🎙️ [F5-TTS Pipeline] Utilizing 5-sec Reference Audio Zero-Shot Synthesis: ${refAudioPath}`);
      const f5ScriptPath = path.join(SCRIPTS_DIR, 'f5_tts_inference.py');
      const f5Cmd = `python "${f5ScriptPath}" --text "${text.replace(/"/g, '\\"')}" --ref_audio "${refAudioPath}" --output "${outputPath}"`;
      
      return exec(f5Cmd, (f5Err) => {
        if (!f5Err && fs.existsSync(outputPath)) {
          console.log(`✅ [F5-TTS Success] Zero-Shot Voice Synthesis Generated: ${outputPath}`);
          return resolve({
            success: true,
            audioUrl: relativeUrl,
            audioPath: outputPath,
            text,
            durationSec: Math.max(5, Math.ceil(text.length * 0.22)),
            usedF5TTS: true
          });
        }
      });
    }

    const voiceName = typeof voiceProfile === 'object' ? (voiceProfile.voiceName || 'ko-KR-InJoonNeural') : voiceProfile;
    const pitch = typeof voiceProfile === 'object' ? (voiceProfile.pitch || '-18Hz') : '-18Hz';
    const rate = typeof voiceProfile === 'object' ? (voiceProfile.rate || '-15%') : '-15%';
    const volume = typeof voiceProfile === 'object' ? (voiceProfile.volume || '+0%') : '+0%';

    const scriptPath = path.join(SCRIPTS_DIR, 'generate_tts_guide.py');
    const command = `python "${scriptPath}" --text "${text.replace(/"/g, '\\"')}" --output "${outputPath}" --voice "${voiceName}" --pitch "${pitch}" --rate "${rate}" --volume "${volume}"`;

    console.log(`[TTS Service] Generating Guide Audio for text: "${text.substring(0, 30)}..." (${voiceName} | Pitch: ${pitch} | Rate: ${rate})`);

    exec(command, async (error, stdout, stderr) => {
      if (!error && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        console.log(`✅ [TTS Service Success] Guide Audio saved at: ${outputPath}`);
        return resolve({
          success: true,
          audioUrl: relativeUrl,
          audioPath: outputPath,
          text,
          durationSec: Math.max(5, Math.ceil(text.length * 0.22)),
          isFallback: false
        });
      }

      // Pure Node.js google-tts-api fallback to GUARANTEE physical .mp3 audio file creation on backend!
      try {
        console.log(`🎙️ [Pure Node TTS Engine] Generating physical MP3 file using google-tts-api: ${outputPath}`);
        const googleTTS = await import('google-tts-api');
        const getAudioBase64 = googleTTS.getAudioBase64 || googleTTS.default?.getAudioBase64;
        if (getAudioBase64) {
          const base64Audio = await getAudioBase64(text.substring(0, 200), {
            lang: 'ko',
            slow: false,
            host: 'https://translate.google.com',
            timeout: 5000,
          });
          const buffer = Buffer.from(base64Audio, 'base64');
          fs.writeFileSync(outputPath, buffer);
          console.log(`✅ [Pure Node TTS Success] Saved MP3 audio file (${buffer.length} bytes) at: ${outputPath}`);
          return resolve({
            success: true,
            audioUrl: relativeUrl,
            audioPath: outputPath,
            text,
            durationSec: Math.max(3, Math.ceil(text.length * 0.2)),
            isFallback: false
          });
        }
      } catch (gttsErr) {
        console.warn(`[Node TTS Note]: ${gttsErr.message}`);
      }

      const fallbackAudio = `/audio/${figureId === 'kim-koo' ? 'kim-koo_culture_power.mp3' : `${figureId}_speech.mp3`}`;
      resolve({
        success: true,
        audioUrl: fallbackAudio,
        text,
        durationSec: Math.max(2, Math.ceil(text.length * 0.18)),
        isFallback: true
      });
    });
  });
}
