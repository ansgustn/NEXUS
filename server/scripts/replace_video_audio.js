import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to find ffmpeg binary
function findFfmpeg() {
  const commonPaths = [
    'C:\\Users\\DSU\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-N-125365-g9a01c1cb6a-win64-gpl\\bin\\ffmpeg.exe',
    'ffmpeg',
    'ffmpeg.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Links/ffmpeg.exe')
  ];
  for (const p of commonPaths) {
    try {
      if (fs.existsSync(p)) return p;
      execSync(`"${p}" --version`, { stdio: 'ignore' });
      return p;
    } catch (e) {
      // ignore
    }
  }
  return 'ffmpeg';
}

/**
 * Replaces or overlays a new audio track onto an existing MP4 video file instantly without quality loss.
 * @param {string} videoPath - Relative or absolute path to existing MP4 video
 * @param {string} audioPath - Relative or absolute path to new MP3/WAV audio file
 * @param {string} outputPath - Path to save the combined video
 */
export function replaceVideoAudio(videoPath, audioPath, outputPath) {
  const ffmpegBin = findFfmpeg();

  const absVideo = path.isAbsolute(videoPath) ? videoPath : path.join(process.cwd(), 'client/public', videoPath);
  const absAudio = path.isAbsolute(audioPath) ? audioPath : path.join(process.cwd(), 'client/public', audioPath);
  const absOutput = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), 'client/public', outputPath);

  if (!fs.existsSync(absVideo)) {
    throw new Error(`Input video file not found: ${absVideo}`);
  }
  if (!fs.existsSync(absAudio)) {
    throw new Error(`Input audio file not found: ${absAudio}`);
  }

  const outDir = path.dirname(absOutput);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`[Audio Swap Utility] Overlaying new audio onto video...`);
  console.log(` - Input Video: ${absVideo}`);
  console.log(` - New Audio:   ${absAudio}`);
  console.log(` - Output Video: ${absOutput}`);

  // FFmpeg command to swap audio stream instantly (-c:v copy ensures no video re-encoding)
  const cmd = `"${ffmpegBin}" -i "${absVideo}" -i "${absAudio}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${absOutput}" -y`;
  execSync(cmd, { stdio: 'inherit' });

  console.log(`✅ Audio swapped successfully! Saved to: ${absOutput}`);
  return absOutput;
}

// CLI usage: node replace_video_audio.js <video> <audio> [output]
if (process.argv[1] && process.argv[1].endsWith('replace_video_audio.js')) {
  const inputVideo = process.argv[2] || 'videos/king-sejong_talking_avatar.mp4';
  const inputAudio = process.argv[3] || 'audio/king-sejong_speech_original.mp3';
  const outputVideo = process.argv[4] || 'videos/king-sejong_custom_audio.mp4';

  try {
    replaceVideoAudio(inputVideo, inputAudio, outputVideo);
  } catch (err) {
    console.error('Error replacing audio:', err.message);
  }
}
