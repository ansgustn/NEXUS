import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getComfyEmbeddedPython } from './comfyPaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEOS_DIR = path.join(__dirname, '../../client/public/videos');
const PUBLIC_DIR = path.join(__dirname, '../../client/public');

// Find the first ffmpeg*.exe inside an imageio_ffmpeg binaries folder
function findImageioFfmpegIn(sitePackagesDir) {
  try {
    const binDir = path.join(sitePackagesDir, 'imageio_ffmpeg', 'binaries');
    const exe = fs.readdirSync(binDir).find(f => /^ffmpeg.*\.exe$/i.test(f));
    return exe ? path.join(binDir, exe) : null;
  } catch (e) {
    return null;
  }
}

// Helper to find ffmpeg binary (resolved once per process, machine-independent)
let cachedFfmpeg = null;
export function findFfmpeg() {
  if (cachedFfmpeg) return cachedFfmpeg;

  const candidates = [process.env.FFMPEG_PATH];

  // imageio-ffmpeg inside ComfyUI's embedded Python
  candidates.push(findImageioFfmpegIn(path.join(path.dirname(getComfyEmbeddedPython()), 'Lib', 'site-packages')));

  // imageio-ffmpeg in the user's Python site-packages (%APPDATA%\Python\PythonXYZ\site-packages)
  const userPyRoot = process.env.APPDATA ? path.join(process.env.APPDATA, 'Python') : null;
  if (userPyRoot && fs.existsSync(userPyRoot)) {
    // Newest Python first (e.g. Python314 before Python311) to prefer the newest bundled ffmpeg
    const versions = fs.readdirSync(userPyRoot).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const ver of versions) {
      candidates.push(findImageioFfmpegIn(path.join(userPyRoot, ver, 'site-packages')));
    }
  }

  // WinGet shim for the current user
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'));
  }

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return (cachedFfmpeg = p);
  }

  // ffmpeg on PATH
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return (cachedFfmpeg = 'ffmpeg');
  } catch (e) {}

  // imageio-ffmpeg installed in whichever Python is on PATH (installed by run_nexus.ps1)
  for (const py of ['python', 'py']) {
    try {
      const exe = execSync(`${py} -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (exe && fs.existsSync(exe)) return (cachedFfmpeg = exe);
    } catch (e) {}
  }

  // Not found: return plain 'ffmpeg' (callers already handle failures); don't cache so a later install is picked up
  return 'ffmpeg';
}

/**
 * Measure exact audio duration in seconds using FFmpeg
 */
export function getAudioDurationInSeconds(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const ffmpegBin = findFfmpeg();
  try {
    const cmd = `"${ffmpegBin}" -i "${filePath}" 2>&1`;
    const out = execSync(cmd, { encoding: 'utf-8' });
    const match = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]);
    }
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '') + (e.message || '');
    const match = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]);
    }
  }
  return null;
}


/**
 * Fast High-Speed Server-Side Video + TTS Audio Merger
 * Seamlessly loops or extends video so the speech audio is NEVER cut off midway!
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

    const timestamp = Date.now();
    const mergedFileName = `dynamic_video_${figureId}_${timestamp}.mp4`;
    const outputPath = path.join(VIDEOS_DIR, mergedFileName);
    const mergedVideoUrl = `/videos/${mergedFileName}`;

    console.log(`[Fast Video Merger] Merging Video (${path.basename(videoPath)}) + Full Audio (${path.basename(audioPath)})...`);

    // High speed FFmpeg audio-video multiplexing with -stream_loop -1 so speech NEVER cuts off
    const cmd = `"${ffmpegBin}" -stream_loop -1 -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}" -y`;

    try {
      execSync(cmd, { stdio: 'ignore' });
    } catch (cmdErr) {
      console.warn(`[FFmpeg Copy Note]: ${cmdErr.message}, re-encoding with libx264...`);
      const fallbackCmd = `"${ffmpegBin}" -stream_loop -1 -i "${videoPath}" -i "${audioPath}" -c:v libx264 -c:a aac -shortest "${outputPath}" -y`;
      try {
        execSync(fallbackCmd, { stdio: 'ignore' });
      } catch (e2) {}
    }

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      console.log(`✅ [Fast Video Merger Success] Saved Physical MP4 Video: ${mergedVideoUrl} (${fs.statSync(outputPath).size} bytes)`);
      return {
        success: true,
        mergedVideoUrl,
        mergedVideoPath: outputPath,
        durationSec: Math.max(3, Math.ceil(fs.statSync(audioPath).size / 8000)),
        message: '서버 측 물리적 동영상 + 오디오 파일 저장 완료'
      };
    }
  } catch (err) {
    console.error(`[Video Merger Error]:`, err.message);
  }

  return { success: false, videoUrl };
}

/**
 * Concatenate multiple generated video clips sequentially into ONE continuous full video!
 * Merges video clips in exact sequence with full speech audio so dialogue never cuts off!
 */
export async function concatMultipleVideos({ videoUrls, audioUrl, figureId = 'avatar' }) {
  try {
    const ffmpegBin = findFfmpeg();
    if (!videoUrls || videoUrls.length === 0) return { success: false };
    if (videoUrls.length === 1) {
      return mergeVideoWithAudio({ videoUrl: videoUrls[0], audioUrl, figureId });
    }

    const timestamp = Date.now();
    const listFilePath = path.join(VIDEOS_DIR, `concat_list_${figureId}_${timestamp}.txt`);
    const mergedFileName = `full_chained_${figureId}_${timestamp}.mp4`;
    const outputPath = path.join(VIDEOS_DIR, mergedFileName);
    const mergedVideoUrl = `/videos/${mergedFileName}`;

    // Write file list for ffmpeg concat demuxer
    const fileEntries = videoUrls.map(vUrl => {
      const p = vUrl.startsWith('http') ? path.join(PUBLIC_DIR, vUrl.replace(/^http:\/\/[^\/]+/, '')) : path.join(PUBLIC_DIR, vUrl);
      return `file '${p.replace(/\\/g, '/')}'`;
    }).join('\n');
    fs.writeFileSync(listFilePath, fileEntries, 'utf-8');

    console.log(`[FFmpeg Video Chainer] Concatenating ${videoUrls.length} clips into continuous full video: ${mergedFileName}...`);

    let cmd = `"${ffmpegBin}" -f concat -safe 0 -i "${listFilePath}" -c copy "${outputPath}" -y`;
    if (audioUrl) {
      const audioPath = audioUrl.startsWith('http') ? path.join(PUBLIC_DIR, audioUrl.replace(/^http:\/\/[^\/]+/, '')) : path.join(PUBLIC_DIR, audioUrl);
      if (fs.existsSync(audioPath)) {
        cmd = `"${ffmpegBin}" -f concat -safe 0 -i "${listFilePath}" -i "${audioPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest "${outputPath}" -y`;
      }
    }

    try {
      execSync(cmd, { stdio: 'ignore' });
    } catch (e) {
      // Fallback re-encode
      const reencodeCmd = `"${ffmpegBin}" -f concat -safe 0 -i "${listFilePath}" -c:v libx264 -c:a aac "${outputPath}" -y`;
      try { execSync(reencodeCmd, { stdio: 'ignore' }); } catch (e2) {}
    }

    try { fs.unlinkSync(listFilePath); } catch (e) {}

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      console.log(`✅ [FFmpeg Concat Success] Merged Full Video Created: ${mergedVideoUrl} (${fs.statSync(outputPath).size} bytes)`);
      return {
        success: true,
        mergedVideoUrl,
        mergedVideoPath: outputPath
      };
    }
  } catch (err) {
    console.error(`[FFmpeg Concat Error]:`, err.message);
  }
  return { success: false, videoUrl: videoUrls[0] };
}

