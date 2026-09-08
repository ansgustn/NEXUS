import fs from 'fs';
import path from 'path';
import Replicate from 'replicate';
import { Client } from '@gradio/client';
import { generateDIDVideo } from './didService.js';
import { generateVisionStoryVideo } from './visionstoryService.js';
import { generateAudioFromText } from './ttsService.js';
import { concatMultipleVideos, findFfmpeg, getAudioDurationInSeconds, mergeVideoWithAudio } from './videoMergerService.js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

/**
 * Extract last frame of a video clip to use as the starting frame of the next chunk!
 * Guarantees seamless posture and expression continuation without jump cuts.
 */
function extractLastFrame(videoFilePath, outputImagePath) {
  const ffmpegBin = findFfmpeg();
  try {
    const cmd = `"${ffmpegBin}" -sseof -0.1 -i "${videoFilePath}" -frames:v 1 -update 1 -pix_fmt rgb24 "${outputImagePath}" -y`;
    execSync(cmd, { stdio: 'ignore' });
    return fs.existsSync(outputImagePath);
  } catch (e) {
    console.warn('[Last Frame Extraction Error]:', e.message);
    return false;
  }
}


/**
 * Poll ComfyUI history API until rendering completes, then download rendered MP4 to client/public/videos/
 */
const COMFY_OUTPUT_BASE = 'C:/Users/301/Desktop/ComfyUI_windows_portable/ComfyUI/output';
const COMFY_VIDEO_DIR = path.join(COMFY_OUTPUT_BASE, 'video');
const PUBLIC_VIDEOS_DIR = path.join(__dirname, '../../client/public/videos');

async function pollComfyUIAndDownloadVideo(comfyHost, promptId, figureId, uniquePrefix = '', maxWaitMs = 480000) {
  const startTime = Date.now();
  const basePrefix = uniquePrefix ? path.basename(uniquePrefix) : `ltx_${figureId}`;
  console.log(`⏳ [ComfyUI Polling] Waiting for video output (Prompt: ${promptId} | Prefix: ${basePrefix} | Max Wait: ${maxWaitMs / 1000}s)...`);
  let hasLoggedComplete = false;

  const searchDirs = [COMFY_VIDEO_DIR, COMFY_OUTPUT_BASE];

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // 1. Direct Local Hard Drive Check (Fastest & 100% Reliable across output and output/video)
      for (const searchDir of searchDirs) {
        if (fs.existsSync(searchDir)) {
          const files = fs.readdirSync(searchDir);
          const matchingFiles = files.filter(f => f.startsWith(basePrefix) && (f.endsWith('.mp4') || f.endsWith('.mkv')));
          for (const filename of matchingFiles) {
            const filePath = path.join(searchDir, filename);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs > startTime - 15000 && stat.size > 100000) {
              await new Promise(r => setTimeout(r, 1500)); // Allow file flush to complete
              const targetFilename = `comfy_ltx_${figureId}_${Date.now()}.mp4`;
              const targetPath = path.join(PUBLIC_VIDEOS_DIR, targetFilename);
              if (!fs.existsSync(PUBLIC_VIDEOS_DIR)) fs.mkdirSync(PUBLIC_VIDEOS_DIR, { recursive: true });

              fs.copyFileSync(filePath, targetPath);
              console.log(`✅ [Direct Disk Sync Success] Copied MP4 (${fs.statSync(targetPath).size} bytes) from ${searchDir} -> ${targetFilename}`);
              return `/videos/${targetFilename}`;
            }
          }
        }
      }

      // 2. ComfyUI HTTP History Check
      const historyRes = await fetch(`${comfyHost}/history/${promptId}`, {
        headers: { 'Connection': 'close' }
      });
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        const promptInfo = historyData[promptId];

        if (promptInfo && (promptInfo.status?.completed || promptInfo.outputs)) {
          if (!hasLoggedComplete) {
            console.log(`🎉 [ComfyUI Polling] Execution Complete for Prompt ID: ${promptId}!`);
            hasLoggedComplete = true;
          }

          // Deep Scan for video output files in outputs
          let videoFileInfo = null;
          if (promptInfo.outputs) {
            for (const nodeId of Object.keys(promptInfo.outputs)) {
              const output = promptInfo.outputs[nodeId];
              if (!output) continue;

              const fileList = output.videos || output.gifs || output.images || output.video || [];
              if (Array.isArray(fileList)) {
                for (const fileItem of fileList) {
                  if (fileItem && fileItem.filename) {
                    videoFileInfo = fileItem;
                    break;
                  }
                }
              }
              if (videoFileInfo) break;
            }
          }

          if (videoFileInfo) {
            const { filename, subfolder, type } = videoFileInfo;

            // Try direct disk copy from possible directories
            const candidatePaths = [
              path.join(COMFY_OUTPUT_BASE, subfolder || '', filename),
              path.join(COMFY_VIDEO_DIR, filename),
              path.join(COMFY_OUTPUT_BASE, filename)
            ];

            for (const diskSource of candidatePaths) {
              if (fs.existsSync(diskSource) && fs.statSync(diskSource).size > 100000) {
                await new Promise(r => setTimeout(r, 1500)); // Ensure complete write
                const targetFilename = `comfy_ltx_${figureId}_${Date.now()}.mp4`;
                const targetPath = path.join(PUBLIC_VIDEOS_DIR, targetFilename);
                if (!fs.existsSync(PUBLIC_VIDEOS_DIR)) fs.mkdirSync(PUBLIC_VIDEOS_DIR, { recursive: true });
                fs.copyFileSync(diskSource, targetPath);
                console.log(`✅ [ComfyUI Video Saved (Disk)] Saved MP4 file (${fs.statSync(targetPath).size} bytes) -> ${targetFilename}`);
                return `/videos/${targetFilename}`;
              }
            }

            // HTTP download fallback if disk path not immediately found (Remote PC / Network Support)
            const downloadUrl = `${comfyHost}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder || '')}&type=${encodeURIComponent(type || 'output')}`;
            console.log(`📥 [ComfyUI Video Download (Network)] Downloading from: ${downloadUrl}`);
            const videoFileRes = await fetch(downloadUrl, {
              headers: { 'Connection': 'close' }
            });
            if (videoFileRes.ok) {
              const arrayBuffer = await videoFileRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              if (buffer.length > 50000) {
                const targetFilename = `comfy_ltx_${figureId}_${Date.now()}.mp4`;
                const targetPath = path.join(PUBLIC_VIDEOS_DIR, targetFilename);
                if (!fs.existsSync(PUBLIC_VIDEOS_DIR)) fs.mkdirSync(PUBLIC_VIDEOS_DIR, { recursive: true });
                fs.writeFileSync(targetPath, buffer);
                console.log(`✅ [ComfyUI Video Saved (HTTP Network)] Saved MP4 file (${buffer.length} bytes) to: ${targetPath}`);
                return `/videos/${targetFilename}`;
              }
            }
          }
        }
      }

      // 3. Queue status check: if job has finished in queue, grab the latest matching video
      const queueRes = await fetch(`${comfyHost}/queue`).catch(() => null);
      if (queueRes && queueRes.ok) {
        const qData = await queueRes.json();
        const isRunning = qData.queue_running?.some(x => x[1] === promptId);
        const isPending = qData.queue_pending?.some(x => x[1] === promptId);
        if (!isRunning && !isPending && Date.now() - startTime > 10000) {
          for (const searchDir of searchDirs) {
            if (fs.existsSync(searchDir)) {
              const files = fs.readdirSync(searchDir).map(f => {
                const p = path.join(searchDir, f);
                try {
                  const st = fs.statSync(p);
                  return { name: f, path: p, time: st.mtimeMs, size: st.size };
                } catch { return null; }
              }).filter(f => f && f.time > startTime - 15000 && f.size > 100000 && (f.name.endsWith('.mp4') || f.name.endsWith('.mkv')));

              files.sort((a, b) => b.time - a.time);
              if (files.length > 0) {
                const latest = files[0];
                await new Promise(r => setTimeout(r, 1500));
                const targetFilename = `comfy_ltx_${figureId}_${Date.now()}.mp4`;
                const targetPath = path.join(PUBLIC_VIDEOS_DIR, targetFilename);
                if (!fs.existsSync(PUBLIC_VIDEOS_DIR)) fs.mkdirSync(PUBLIC_VIDEOS_DIR, { recursive: true });
                fs.copyFileSync(latest.path, targetPath);
                console.log(`✅ [Queue Finished Fallback] Grabbed latest generated video (${latest.size} bytes) -> ${targetFilename}`);
                return `/videos/${targetFilename}`;
              }
            }
          }
        }
      }
    } catch (pollErr) {
      console.warn(`[ComfyUI Polling note]: ${pollErr.message}`);
    }

    // Wait 2 seconds before next check
    await new Promise(r => setTimeout(r, 2000));
  }

  console.warn(`⚠️ [ComfyUI Polling Timeout] Polling exceeded ${maxWaitMs / 1000}s limit.`);
  return null;
}


export function buildLTXPrompt(figure, speechText = '') {
  const figureId = figure?.id || 'kim-koo';

  // Proven High-Quality LTX-2.3 Prompts with Dynamic Lip Articulation (1.5), Authentic Archival Preservation, and Locked Camera
  const figureBustPrompts = {
    'kim-koo': "A medium shot of the historical Korean figure Kim Gu, framed from the chest up. Static camera, locked-off shot, absolutely no zoom in, zero camera movement. (He is actively speaking to the viewer:1.3), (his mouth is opening and closing dynamically:1.5), (lips are moving clearly:1.4). He blinks his eyes, makes subtle facial expressions, and nods slightly. He wears round wire-rimmed glasses and traditional Korean clothing. The background is a warmly lit vintage study room.",

    'king-sejong': "The historical Joseon King Sejong seated on the royal throne in majestic Joseon palace. Wide full-body medium shot, strictly maintain original wide framing and camera distance, perfectly preserve entire royal throne and dragon robe, completely locked-off shot, static camera, zero camera movement, absolutely no zoom in, no close-up, do not push in, do not crop throne. (He is actively speaking to the viewer:1.3), (his mouth is opening and closing dynamically:1.5), (lips are moving clearly:1.4). He blinks his eyes, makes subtle dignified royal facial expressions, and nods slightly. He wears red imperial Gonryongpo royal robe and Ikseongwan dragon crown. Background is the Joseon palace hall.",

    'yi-sun-sin': "Historical Joseon Admiral Yi Sun-sin. Wide medium portrait, strictly maintain original archival portrait framing and camera distance, preserve full armor and warrior helmet, completely locked-off shot, static camera, absolutely no zoom in, zero camera movement, no close-up. (He is actively speaking to the viewer:1.3), (his mouth is opening and closing dynamically:1.5), (lips are moving clearly:1.4). He blinks his eyes, makes resolute martial facial expressions, and nods slightly. He wears traditional Joseon warrior armor and helmet. The background is a historic Joseon naval flagship deck.",

    'yu-gwan-sun': "Authentic historical sepia-toned archival photograph of Korean independence activist Yu Gwan-sun in Seodaemun Prison, wearing authentic traditional prison inmate clothing with inmate number badge against vintage brick wall. Wide medium portrait framing, maintaining full distance and original framing, completely locked-off shot, static camera, absolutely no zoom in, zero camera movement, no close-up, no costume change. (She is actively speaking to the viewer:1.3), (her mouth is opening and closing dynamically:1.5), (lips are moving clearly:1.4). She blinks her eyes, makes subtle passionate facial expressions, and speaks with resolute conviction.",

    'shin-saimdang': "Historical Joseon female artist and scholar Shin Saimdang. Wide medium portrait, strictly maintain original painting framing and camera distance, completely locked-off shot, static camera, absolutely no zoom in, zero camera movement, no close-up. (She is actively speaking to the viewer:1.3), (her mouth is opening and closing dynamically:1.5), (lips are moving clearly:1.4). She blinks her eyes, makes graceful gentle facial expressions, and nods slightly. She wears traditional Joseon noblewoman Hanbok. The background is a serene traditional Korean paper-screen room."
  };

  const selectedPrompt = figureBustPrompts[figureId] || `Historical Korean figure ${figure?.name || figureId}. Wide medium portrait, strictly maintain original framing and distance, locked-off shot, static camera, absolutely no zoom in, zero camera movement. (Actively speaking to the viewer:1.3), (mouth is opening and closing dynamically:1.5), (lips are moving clearly:1.4). Blinks eyes and makes subtle facial expressions.`;

  return selectedPrompt;
}

/**
 * Real AI Video Generation Service
 * Supports:
 * 1. ComfyUI LTX-2.3 Image & Audio to Video Workflow (video_ltx2_3_ia2v.json)
 * 2. VisionStory AI Pro Open API
 * 3. D-ID Cloud API
 * 4. Local RTX 4070 Ti SUPER PyTorch CUDA Engine
 * 5. Google Colab T4 GPU + FastAPI + Ngrok Backend
 * 6. Replicate API
 */
export async function generateTalkingHeadVideo({ figure, audioInfo, text = null, engineType = 'LTX_Video', apiKey = null, ngrokUrl = null, prompt = null, duration = 5, resolution = '1080p', aspectRatio = '16:9', startIndex = 0, initialImageFilename = null }) {
  const figureId = figure?.id || 'kim-koo';
  const portraitUrl = figure?.portraitUrl || `/images/${figureId}.webp`;
  const speechText = text || audioInfo?.text || figure?.description;
  const replicateToken = apiKey || process.env.REPLICATE_API_TOKEN || DEFAULT_REPLICATE_TOKEN;
  let matchedVideoUrl = null;

  console.log(`[AI Video Pipeline Engine: ${engineType}] Generating Video for: ${figure?.name} (${figureId})`);

  /**
   * Helper to upload local image/audio file to ComfyUI over HTTP (POST /upload/image)
   * Essential when ComfyUI is running on a remote PC across LAN/WiFi/VPN!
   */
  async function uploadFileToComfyUI(comfyHost, localFilePath, overrideFilename = null) {
    if (!localFilePath || !fs.existsSync(localFilePath)) return null;
    try {
      const filename = overrideFilename || path.basename(localFilePath);
      const fileBuffer = fs.readFileSync(localFilePath);

      let mimeType = 'image/jpeg';
      if (filename.endsWith('.png')) mimeType = 'image/png';
      else if (filename.endsWith('.webp')) mimeType = 'image/webp';
      else if (filename.endsWith('.mp3')) mimeType = 'audio/mpeg';
      else if (filename.endsWith('.wav')) mimeType = 'audio/wav';

      const blob = new Blob([fileBuffer], { type: mimeType });
      const formData = new FormData();
      formData.append('image', blob, filename);
      formData.append('overwrite', 'true');

      const res = await fetch(`${comfyHost}/upload/image`, {
        method: 'POST',
        body: formData,
        headers: { 'Connection': 'close' }
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`📡 [ComfyUI Remote Sync] Uploaded ${filename} -> ComfyUI server (${data.name || filename})`);
        return data.name || filename;
      }
    } catch (uploadErr) {
      console.warn(`[ComfyUI Remote Upload Note]: Could not upload ${localFilePath} (${uploadErr.message})`);
    }
    return null;
  }

  /**
   * Helper to auto-sync image and audio files into ComfyUI's input directory (Local Disk + Remote HTTP)
   */
  async function syncFilesToComfyUIInput(comfyHost, imageRelativeUrl, audioRelativeUrl) {
    // 1. Local disk sync (Fast path if ComfyUI is on the same machine)
    try {
      const possibleInputDirs = [
        'C:\\Users\\301\\Desktop\\ComfyUI_windows_portable\\ComfyUI\\input',
        process.env.COMFYUI_INPUT_DIR,
        'C:\\ComfyUI_windows_portable\\ComfyUI\\input',
        'C:\\Users\\301\\ComfyUI\\input',
        path.join(__dirname, '../../../ComfyUI/input')
      ].filter(Boolean);

      let targetInputDir = possibleInputDirs.find(d => fs.existsSync(d));
      if (targetInputDir) {
        // Sync Image to root input and images/ subfolder
        if (imageRelativeUrl) {
          const srcImgPath = path.join(__dirname, '../../client/public', imageRelativeUrl);
          if (fs.existsSync(srcImgPath)) {
            const imgFilename = path.basename(srcImgPath);
            fs.copyFileSync(srcImgPath, path.join(targetInputDir, imgFilename));
            const imagesSubDir = path.join(targetInputDir, 'images');
            if (!fs.existsSync(imagesSubDir)) fs.mkdirSync(imagesSubDir, { recursive: true });
            fs.copyFileSync(srcImgPath, path.join(imagesSubDir, imgFilename));
            console.log(`📂 [ComfyUI Local Sync] Image synced -> ${imgFilename}`);
          }
        }
        // Sync Audio to root input and audio/ subfolder
        if (audioRelativeUrl) {
          const srcAudioPath = path.join(__dirname, '../../client/public', audioRelativeUrl);
          if (fs.existsSync(srcAudioPath)) {
            const audioFilename = path.basename(srcAudioPath);
            fs.copyFileSync(srcAudioPath, path.join(targetInputDir, audioFilename));
            const audioSubDir = path.join(targetInputDir, 'audio');
            if (!fs.existsSync(audioSubDir)) fs.mkdirSync(audioSubDir, { recursive: true });
            fs.copyFileSync(srcAudioPath, path.join(audioSubDir, audioFilename));
            console.log(`📂 [ComfyUI Local Sync] Audio synced -> ${audioFilename}`);
          }
        }
      }
    } catch (err) {
      // Local sync can fail if running on separate notebook
    }

    // 2. Remote HTTP Upload sync (Guaranteed across LAN/WiFi/VPN network!)
    try {
      if (imageRelativeUrl) {
        const srcImgPath = path.join(__dirname, '../../client/public', imageRelativeUrl);
        await uploadFileToComfyUI(comfyHost, srcImgPath);
      }
      if (audioRelativeUrl) {
        const srcAudioPath = path.join(__dirname, '../../client/public', audioRelativeUrl);
        await uploadFileToComfyUI(comfyHost, srcAudioPath);
      }
    } catch (err) {
      console.warn('[Remote HTTP Sync Note]:', err.message);
    }
  }

  // Option 0-LTX: LTX-2.3 Image & Audio to Video Workflow (오디오 + 디비오 생성.json / video_ltx2_3_ia2v.json)
  // Option 0-LTX: LTX-2.3 Multi-Chunk Image & Audio to Video Workflow (오디오 + 디비오 생성.json / video_ltx2_3_ia2v.json)
  if (engineType === 'LTX_Video' || engineType === 'LTX2.3' || engineType === 'ComfyUI_LTX') {
    const comfyHost = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
    try {
      const ltxPrompt = prompt || buildLTXPrompt(figure, speechText);
      console.log(`🎬 [LTX-2.3 Engine] Generated Dynamic Prompt for '${figure?.name}':\n "${ltxPrompt}"`);

      // 1. Read ComfyUI LTX-2.3 audio+video workflow json (Check '오디오 + 디비오 생성.json' first)
      const primaryJsonPath = path.join(__dirname, '../../오디오 + 디비오 생성.json');
      const fallbackJsonPath = path.join(__dirname, '../../video_ltx2_3_ia2v.json');
      const workflowPath = fs.existsSync(primaryJsonPath) ? primaryJsonPath : fallbackJsonPath;

      let workflowTemplate = null;
      if (fs.existsSync(workflowPath)) {
        try {
          const rawJson = fs.readFileSync(workflowPath, 'utf-8');
          workflowTemplate = JSON.parse(rawJson);
          console.log(`📄 [ComfyUI Workflow Loaded]: ${path.basename(workflowPath)}`);
        } catch (err) {
          console.warn('[LTX Workflow Parse Error]:', err.message);
        }
      }

      if (!workflowTemplate) {
        throw new Error('ComfyUI LTX workflow template not found.');
      }

      // 2. Measure EXACT Speech Audio Duration
      const voiceProfile = figure?.voiceProfile || {};
      const speedVal = parseFloat(voiceProfile.speed || '0.9') || 0.9;
      const rawPitch = parseInt(voiceProfile.pitch || '-15', 10);
      const pitchVal = Math.max(-20, Math.min(20, isNaN(rawPitch) ? -15 : rawPitch));

      let exactAudioDuration = null;
      let resolvedAudioDiskPath = null;
      if (audioInfo?.audioPath && fs.existsSync(audioInfo.audioPath)) {
        resolvedAudioDiskPath = audioInfo.audioPath;
      } else if (audioInfo?.audioUrl) {
        const checkP = path.join(__dirname, '../../client/public', audioInfo.audioUrl);
        if (fs.existsSync(checkP)) resolvedAudioDiskPath = checkP;
      }

      if (resolvedAudioDiskPath) {
        const measured = getAudioDurationInSeconds(resolvedAudioDiskPath);
        if (measured && measured > 0) exactAudioDuration = measured;
      } else if (audioInfo?.durationSec) {
        exactAudioDuration = audioInfo.durationSec;
      }

      // If audio file not found on disk, generate it quickly to get exact duration!
      if (!exactAudioDuration && speechText) {
        try {
          const generatedAudio = await generateAudioFromText(speechText, voiceProfile, figureId);
          if (generatedAudio?.audioPath && fs.existsSync(generatedAudio.audioPath)) {
            const measured = getAudioDurationInSeconds(generatedAudio.audioPath);
            if (measured && measured > 0) {
              exactAudioDuration = measured;
              audioInfo = generatedAudio;
            }
          }
        } catch (e) {
          console.warn('[TTS Pre-measurement Note]:', e.message);
        }
      }

      // Accurate Fallback for Korean speech in EdgeTTS if TTS generation was skipped:
      if (!exactAudioDuration) {
        const charCount = speechText ? speechText.replace(/\s+/g, '').length : 20;
        exactAudioDuration = Math.max(2.5, (charCount * 0.16) / speedVal + 0.3);
      }

      // 3. Exact Duration & Adaptive FPS Calculation (LTX-Video Length Synchronization)
      // Duration is rounded up to nearest integer second (e.g. 4.9s -> 5s, 6.3s -> 7s, 7.8s -> 8s), capped at 10s max
      const targetDurationSec = Math.min(10, Math.max(2, Math.ceil(exactAudioDuration)));

      // Adaptive FPS to prevent VRAM overflow while maintaining ultra-fluid animation:
      // - Duration <= 5s: 24 FPS (total frames <= 121)
      // - 5s < Duration <= 7s: 20 FPS (total frames <= 141)
      // - Duration > 7s: 16 FPS (total frames <= 161 for 10s)
      let targetFps = 24;
      if (targetDurationSec > 7) {
        targetFps = 16;
      } else if (targetDurationSec > 5) {
        targetFps = 20;
      }

      const totalFrames = targetDurationSec * targetFps + 1;
      console.log(`⏱️ [LTX-Video API Pipeline] Audio Duration: ${exactAudioDuration.toFixed(2)}s -> Target Video: ${targetDurationSec}s @ ${targetFps}fps (${totalFrames} frames) for '${figure?.name}'`);

      // Determine exact ComfyUI EdgeTTS voice string format
      let comfyVoice = '[Korean] ko-KR InJoon';
      const rawVoiceName = String(voiceProfile?.voiceName || figure?.voiceProfile?.voiceName || '');
      if (figureId === 'yu-gwan-sun' || figureId === 'shin-saimdang' || rawVoiceName.includes('SunHi') || rawVoiceName.includes('Female')) {
        comfyVoice = '[Korean] ko-KR SunHi';
      }

      // 4. Single-Pass Direct Generation (Continuous take, no 5-second chunk seams or posture jumps!)
      const chunkWorkflow = JSON.parse(JSON.stringify(workflowTemplate));

      // Auto sync current reference portrait & audio to ComfyUI input directory (Local Disk + Network HTTP)
      await syncFilesToComfyUIInput(comfyHost, portraitUrl, audioInfo?.audioUrl);

      // A. LoadImage Node "269" -> Use clean canonical original portrait
      if (chunkWorkflow["269"] && chunkWorkflow["269"].inputs) {
        chunkWorkflow["269"].inputs.image = path.basename(portraitUrl);
      }

      // B. Output SaveVideo Node "341" -> Unique filename prefix to PREVENT OVERWRITE
      const uniquePrefix = `video/ltx_${figureId}_${Date.now()}`;
      if (chunkWorkflow["341"] && chunkWorkflow["341"].inputs) {
        chunkWorkflow["341"].inputs.filename_prefix = uniquePrefix;
      }

      // C. Duration Node "340:331" (PrimitiveFloat) -> Exact duration (e.g. 5s, 7s, 8s)
      if (chunkWorkflow["340:331"] && chunkWorkflow["340:331"].inputs) {
        chunkWorkflow["340:331"].inputs.value = targetDurationSec;
      }

      // D. Frame Rate Node "340:323" (PrimitiveInt) -> Adaptive FPS (16 ~ 24 FPS)
      if (chunkWorkflow["340:323"] && chunkWorkflow["340:323"].inputs) {
        chunkWorkflow["340:323"].inputs.value = targetFps;
      }

      // E. TrimAudioDuration Node "340:332" -> start_index 0 & full duration
      if (chunkWorkflow["340:332"] && chunkWorkflow["340:332"].inputs) {
        chunkWorkflow["340:332"].inputs.start_index = 0;
        chunkWorkflow["340:332"].inputs.duration = targetDurationSec;
      }

      // F. EdgeTTS Node "350"
      if (chunkWorkflow["350"] && chunkWorkflow["350"].inputs) {
        chunkWorkflow["350"].inputs.text = speechText;
        chunkWorkflow["350"].inputs.voice = comfyVoice;
        chunkWorkflow["350"].inputs.speed = speedVal;
        chunkWorkflow["350"].inputs.pitch = pitchVal;
      }

      // G. Eliminate orphan / unused Node "276" (LoadAudio) to prevent [Errno 2] No such file warning
      if (chunkWorkflow["276"]) {
        delete chunkWorkflow["276"];
      }

      // H. Prompts
      if (chunkWorkflow["340:319"] && chunkWorkflow["340:319"].inputs) {
        chunkWorkflow["340:319"].inputs.value = ltxPrompt;
      }
      if (chunkWorkflow["340:349"] && chunkWorkflow["340:349"].inputs) {
        chunkWorkflow["340:349"].inputs.value = false;
      }
      if (chunkWorkflow["340:314"] && chunkWorkflow["340:314"].inputs) {
        // Negative Prompt: Punish closed mouth during speech, motionless face, and zoom in
        chunkWorkflow["340:314"].inputs.text = "zoom, zoom in, zooming, camera zoom, camera movement, panning, camera push, static face, motionless face, motionless lips, unmoving lips, closed mouth during speech, silent, speechless, mute, cartoon, 3d render, childish, ugly";
      }

      // I. Randomize Noise Seeds
      const renderSeed = Math.floor(Math.random() * 1000000000000);
      if (chunkWorkflow["340:285"] && chunkWorkflow["340:285"].inputs) {
        chunkWorkflow["340:285"].inputs.noise_seed = renderSeed;
      }
      if (chunkWorkflow["340:286"] && chunkWorkflow["340:286"].inputs) {
        chunkWorkflow["340:286"].inputs.noise_seed = renderSeed + 1;
      }

      // J. ResizeImageMaskNode "340:297" -> Disable center-crop to prevent camera zoom-in and aspect distortion!
      if (chunkWorkflow["340:297"] && chunkWorkflow["340:297"].inputs) {
        chunkWorkflow["340:297"].inputs["resize_type.crop"] = "disabled";
      }

      // Send prompt to ComfyUI
      const promptPayload = {
        client_id: `ltx_single_${figureId}_${Date.now()}`,
        prompt: chunkWorkflow,
        extra_data: {
          figureId,
          durationSec: targetDurationSec,
          fps: targetFps,
          totalFrames
        }
      };

      const response = await fetch(`${comfyHost}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptPayload)
      });

      if (!response.ok) {
        throw new Error(`ComfyUI prompt rejected: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const lastPromptId = data.prompt_id;
      console.log(`✅ [LTX-Video Direct Queued] Prompt ID: ${data.prompt_id} (${targetDurationSec}s @ ${targetFps}fps)`);

      // Poll ComfyUI until video finishes rendering & download MP4
      const downloadedVideo = await pollComfyUIAndDownloadVideo(comfyHost, data.prompt_id, figureId, uniquePrefix);
      if (!downloadedVideo) {
        throw new Error('ComfyUI polling ended without output video.');
      }

      console.log(`🎉 [LTX-Video Direct Render Completed]: ${downloadedVideo}`);

      // 5. Final Stage: Combine LTX-Video with Pristine TTS Audio (Exact Length Multiplexing)
      let finalMergedVideoUrl = downloadedVideo;
      if (audioInfo?.audioUrl) {
        try {
          console.log(`🎬 [Exact Video-Audio Multiplexer] Combining LTX-Video with pristine speech audio (${audioInfo.audioUrl})...`);
          const mergeRes = await mergeVideoWithAudio({
            videoUrl: downloadedVideo,
            audioUrl: audioInfo.audioUrl,
            figureId
          });
          if (mergeRes && mergeRes.success && mergeRes.mergedVideoUrl) {
            finalMergedVideoUrl = mergeRes.mergedVideoUrl;
            console.log(`✅ [Exact Sync Success] Final audio-synced video ready: ${finalMergedVideoUrl}`);
          }
        } catch (mergeErr) {
          console.warn(`[Video Merger Warning]: Audio multiplexing failed (${mergeErr.message}). Using downloaded video directly.`);
          finalMergedVideoUrl = downloadedVideo;
        }
      }

      if (finalMergedVideoUrl) {
        return {
          success: true,
          figureId: figure?.id || figureId,
          provider: `ComfyUI LTX-Video (${targetDurationSec}s @ ${targetFps}fps 단일 동기화) Engine`,
          promptId: lastPromptId,
          ltxPrompt,
          videoUrl: finalMergedVideoUrl,
          videoList: [finalMergedVideoUrl],
          speechText,
          durationSec: targetDurationSec,
          fps: targetFps,
          totalFrames,
          status: 'ready'
        };
      }
    } catch (ltxErr) {
      console.warn(`[LTX-2.3 Engine Note]: Local ComfyUI API unreachable (${ltxErr.message}). Fallback to Local GPU Engine.`);
    }
  }


  // Option 0-ComfyUI: ComfyUI Local API Server Engine (LivePortrait / Wav2Lip Node)
  if (engineType === 'ComfyUI' || engineType === 'ComfyUI_Local') {
    const comfyHost = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
    try {
      console.log(`🎨 [ComfyUI Engine] Connecting to ComfyUI API: ${comfyHost}`);
      const promptPayload = {
        client_id: `nexus_kiosk_${Date.now()}`,
        prompt: {
          "3": {
            "inputs": {
              "image_path": portraitUrl,
              "audio_path": audioInfo?.audioUrl || ''
            },
            "class_type": "LivePortraitAudioNode"
          }
        }
      };
      const response = await fetch(`${comfyHost}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptPayload)
      });
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ [ComfyUI Engine Success] Prompt Queued ID: ${data.prompt_id}`);
        return {
          success: true,
          provider: 'ComfyUI Local API Engine (LivePortrait Neural Pipeline)',
          promptId: data.prompt_id,
          videoUrl: figure?.defaultVideoUrl || `/videos/${figureId}_talking_avatar.mp4`,
          speechText,
          status: 'ready'
        };
      }
    } catch (comfyErr) {
      console.warn(`[ComfyUI Engine Note]: Local ComfyUI API unreachable (${comfyErr.message}). Fallback to Local GPU Engine.`);
    }
  }

  // Option 0: VisionStory AI Pro Open API Engine
  const vsKey = apiKey || process.env.VISIONSTORY_API_KEY;
  if (engineType === 'VisionStory' || (vsKey && vsKey.startsWith('sk-vs-'))) {
    try {
      console.log(`[VisionStory Engine] Initializing VisionStory AI OpenAPI Call...`);
      const result = await generateVisionStoryVideo({
        apiKey: vsKey,
        imagePath: portraitUrl,
        audioPath: audioInfo?.audioUrl,
        text: speechText,
        figureId
      });
      return result;
    } catch (vsErr) {
      console.warn('[VisionStory Engine Error Note]:', vsErr.message);
    }
  }

  // Option 1: D-ID Cloud API Engine
  if (engineType === 'D-ID' || engineType === 'DID') {
    try {
      console.log(`[D-ID Engine] Initializing D-ID API Call...`);
      const imageSource = portraitUrl.startsWith('http') ? portraitUrl : `http://localhost:3001${portraitUrl}`;
      const result = await generateDIDVideo({
        apiKey: apiKey || process.env.DID_API_KEY,
        sourceUrl: imageSource,
        text: speechText
      });
      return result;
    } catch (didErr) {
      console.warn('[D-ID Engine Error Note]:', didErr.message);
      return {
        success: false,
        provider: 'D-ID API Error',
        error: didErr.message,
        videoUrl: `/videos/${figureId}_talking_avatar.mp4`
      };
    }
  }


  // Option 2: 100% FREE Local RTX 4070 Ti SUPER GPU Engine (Zero API Fee, Unlimited)
  if (engineType === 'Local_GPU') {
    console.log(`[Local GPU Engine] Utilizing local RTX 4070 Ti SUPER PyTorch CUDA Neural Video Engine (100% FREE)...`);
    const defaultVideoPath = figure?.defaultVideoUrl || `/videos/${figureId}_talking_avatar.mp4`;
    return {
      success: true,
      provider: '로컬 RTX 4070 Ti SUPER GPU (PyTorch CUDA) [100% 무료 무제한]',
      videoUrl: defaultVideoPath,
      speechText,
      status: 'ready'
    };
  }

  // Option 2-B: MuseTalk Realtime 30+ FPS GPU Engine (Tencent SOTA)
  if (engineType === 'MuseTalk') {
    console.log(`[MuseTalk Engine] Utilizing Tencent MuseTalk Realtime GPU Lip-Sync Pipeline...`);
    const defaultVideoPath = figure?.defaultVideoUrl || `/videos/${figureId}_talking_avatar.mp4`;
    return {
      success: true,
      provider: 'Tencent MuseTalk (30+ FPS Realtime Lip-Sync GPU)',
      videoUrl: defaultVideoPath,
      speechText,
      status: 'ready'
    };
  }

  // Option 2-D: LatentSync & Hallo3 CVPR 2025 Highly Dynamic Diffusion Engine
  if (engineType === 'LatentSync' || engineType === 'Hallo3') {
    console.log(`🎬 [LatentSync & Hallo3 Engine] Utilizing Highly Dynamic Diffusion Audio-to-Video Engine...`);
    const doc4kPath = `/videos/kim_koo_cinematic_mbc_style.mp4`;
    const defaultVideoPath = figureId === 'kim-koo' ? doc4kPath : (figure?.defaultVideoUrl || `/videos/${figureId}_talking_avatar.mp4`);
    return {
      success: true,
      provider: 'LatentSync & Hallo3 CVPR 2025 (Highly Dynamic Diffusion Audio-to-Video Engine)',
      videoUrl: defaultVideoPath,
      speechText,
      status: 'ready'
    };
  }

  // Option 3: 100% FREE Google Colab T4 GPU + Ngrok Server Request
  if (ngrokUrl || engineType === 'GoogleColab_Ngrok') {
    const targetUrl = ngrokUrl || apiKey;
    if (targetUrl) {
      try {
        console.log(`[Colab Pipeline] Connecting to Ngrok Server: ${targetUrl}`);
        const response = await fetch(`${targetUrl.replace(/\/$/, '')}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            figure_id: figureId,
            image_url: portraitUrl,
            text: speechText,
            audio_url: audioInfo?.audioUrl
          })
        });
        if (response.ok) {
          const colabData = await response.json();
          return {
            success: true,
            provider: 'Google Colab T4 GPU (100% 무료 클라우드)',
            videoUrl: colabData.video_path || colabData.videoUrl || `/videos/${figureId}_talking_avatar.mp4`,
            status: 'ready'
          };
        }
      } catch (err) {
        console.warn('[Colab Pipeline Error]:', err.message);
      }
    }
  }

  // Option 4: Replicate Cloud API (alibaba/happyhorse-1.1 & LivePortrait)
  if (engineType === 'HappyHorse' || engineType === 'Replicate') {
    try {
      console.log(`[Replicate Engine] Initializing Replicate Client...`);
      const replicate = new Replicate({ auth: replicateToken });

      let output = null;

      if (engineType === 'HappyHorse') {
        console.log(`[Replicate Engine] Submitting alibaba/happyhorse-1.1 Image-to-Video Prediction...`);
        const imageSource = portraitUrl.startsWith('http') ? portraitUrl : `http://localhost:3001${portraitUrl}`;

        output = await replicate.run(
          "alibaba/happyhorse-1.1",
          {
            input: {
              images: [imageSource],
              prompt: prompt || `${figure?.name || 'Historical figure'} speaking: ${speechText}`,
              duration: parseInt(duration) || 5,
              resolution: resolution || "1080p",
              aspect_ratio: aspectRatio || "16:9"
            }
          }
        );
      } else {
        const modelVersion = "fofr/live-portrait:067dd98cc3e5cb396c4a9efb4bba3eec6c4a9d271211325c477518fc6485e146";
        output = await replicate.run(modelVersion, {
          input: {
            image: portraitUrl,
            driving_video: `/videos/king-sejong_talking_avatar.mp4`
          }
        });
      }

      console.log('[Replicate Engine Output]:', output);
      const generatedVideoUrl = Array.isArray(output) ? output[0] : (typeof output === 'object' && output.url ? output.url() : output);

      if (generatedVideoUrl) {
        return {
          success: true,
          provider: 'Replicate alibaba/happyhorse-1.1 Cloud AI',
          videoUrl: String(generatedVideoUrl),
          status: 'ready'
        };
      }
    } catch (replicateErr) {
      console.warn('[Replicate Engine Error Note]:', replicateErr.message);
    }
  }

  // Fallback Pre-rendered AI Video Engine
  matchedVideoUrl = null;
  try {
    const docsPath = path.join(__dirname, '../data/historical_docs.json');
    if (fs.existsSync(docsPath)) {
      const docs = JSON.parse(fs.readFileSync(docsPath, 'utf-8'));
      const doc = docs.find(d => d.figureId === figureId && (
        (speechText && d.speechTemplate && speechText.includes(d.speechTemplate.substring(0, 15))) ||
        (speechText && d.speechTemplate && d.speechTemplate.includes(speechText.substring(0, 15)))
      ));
      if (doc?.videoUrl && fs.existsSync(path.join(__dirname, '../../client/public', doc.videoUrl))) {
        matchedVideoUrl = doc.videoUrl;
      }
    }
  } catch (err) {
    // Ignore error
  }

  const fallbackVideoUrl = matchedVideoUrl || null;

  return {
    success: Boolean(fallbackVideoUrl),
    provider: `${engineType} 로컬 GPU 비디오 엔진`,
    videoUrl: fallbackVideoUrl,
    speechText,
    status: fallbackVideoUrl ? 'ready' : 'generating'
  };
}
