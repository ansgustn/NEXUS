import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEOS_DIR = path.join(__dirname, '../../client/public/videos');
const PUBLIC_DIR = path.join(__dirname, '../../client/public');

// Helper to find ffmpeg binary
function findFfmpeg() {
  const commonPaths = [
    'C:\\Users\\DSU\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffmpeg.exe',
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
    } catch (e) {}
  }
  return 'ffmpeg';
}

/**
 * Fast High-Speed Server-Side Video + TTS Audio Merger
 * Merges avatar video stream with synthesized Zeroth-Korean + KMSAV TTS voice audio in < 2 seconds.
 */
export async function mergeVideoWithAudio({ videoUrl, audioUrl, figureId = 'avatar' }) {
  try {
    const ffmpegBin = findFfmpeg();

    // Resolve absolute file paths
    const videoPath = videoUrl.startsWith('http')
      ? path.join(PUBLIC_DIR, videoUrl.replace(/^http:\/\/[^\/]+/, ''))
      : path.join(PUBLIC_DIR, videoUrl);

    const audioPath = audioUrl.startsWith('http')
      ? path.join(PUBLIC_DIR, audioUrl.replace(/^http:\/\/[^\/]+/, ''))
      : path.join(PUBLIC_DIR, audioUrl);

    if (!fs.existsSync(videoPath)) {
      console.warn(`[Video Merger Note]: Video file not found at ${videoPath}, returning original videoUrl.`);
      return { success: false, videoUrl };
    }

    if (!fs.existsSync(audioPath)) {
      console.warn(`[Video Merger Note]: Audio file not found at ${audioPath}, returning original videoUrl.`);
      return { success: false, videoUrl };
    }

    const mergedFileName = `dynamic_merged_${figureId}.mp4`;
    const outputPath = path.join(VIDEOS_DIR, mergedFileName);
    const mergedVideoUrl = `/videos/${mergedFileName}`;

    console.log(`[Fast Video Merger] Merging Video (${path.basename(videoPath)}) + TTS Audio (${path.basename(audioPath)})...`);

    // High speed FFmpeg audio-video multiplexing (-c:v copy -c:a aac -shortest)
    const cmd = `"${ffmpegBin}" -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}" -y`;

    execSync(cmd, { stdio: 'ignore' });

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      console.log(`✅ [Fast Video Merger Success] Created merged video: ${mergedVideoUrl} (${fs.statSync(outputPath).size} bytes)`);
      return {
        success: true,
        mergedVideoUrl,
        mergedVideoPath: outputPath,
        durationSec: Math.max(3, Math.ceil(fs.statSync(audioPath).size / 8000)),
        message: '서버 측 영상과 TTS 음성 자동 합성 완료'
      };
    }
  } catch (err) {
    console.error(`[Video Merger Error]:`, err.message);
  }

  return { success: false, videoUrl };
}
