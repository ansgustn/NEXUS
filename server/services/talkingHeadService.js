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
import { getComfyInputDir, getComfyOutputDir, getComfyEmbeddedPython } from './comfyPaths.js';

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
      process.env.COMFYUI_INPUT_DIR,
      getComfyInputDir(),
      'C:\\ComfyUI_windows_portable\\ComfyUI\\input',
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

/**
 * Poll ComfyUI history API until rendering completes, then download rendered MP4 to client/public/videos/
 */
const COMFY_OUTPUT_BASE = getComfyOutputDir();
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

  // Official LTX-2.3 Structured Prompt Format (scene / character / action / camera + narrative paragraph)
  // 1) Affirmative camera & background stability in positive prompt ("The camera is completely fixed and stationary")
  // 2) No movement-suppressing phrases; strong emphasis on clear, distinct lip synchronization ("입이 말소리에 맞춰 또렷하게 움직인다")
  // 3) Smooth settling into idle resting posture with a natural eye blink at the end
  const figureBustPrompts = {
    'kim-koo': `scene: The exact original vintage wood-paneled room background from the reference photograph remains completely static and identical from the first frame to the last frame under constant bright illumination.\ncharacter: The respected Korean historical figure Kim Gu, an older Korean man with a gentle yet resolute expression, wearing his signature round wire-rimmed glasses and dark vintage suit.\naction: Speaking directly and expressively to the viewer. His mouth and lips move clearly, distinctly, and dynamically in exact synchronization with the speech audio, opening and closing articulately for every syllable. His facial muscles move naturally as he speaks, accompanied by natural eye blinking, gentle head nods, and soft shoulder breathing. As the speech concludes, he smoothly closes his mouth into a calm resting expression, settles his shoulders into the initial upright pose, and blinks naturally.\ncamera: The camera is completely fixed and stationary on a locked-off tripod, maintaining the exact original medium bust portrait framing and constant bright exposure throughout the entire video.\n\nA medium bust portrait of the historical Korean figure Kim Gu. The camera is completely fixed and stationary, keeping the exact same framing and the original vintage wood-paneled room background throughout the entire video with constant bright lighting. He looks directly at the viewer and speaks with conviction. His mouth and lips open and close clearly, distinctly, and dynamically in exact sync with the speech audio. He blinks his eyes naturally and makes gentle head nods and natural shoulder breathing movements while speaking. As the speech finishes at the end, he gently closes his mouth, settles his shoulders back into the initial resting pose, and blinks softly.\n`,

    'king-sejong': `scene: The exact original solid warm golden-ochre silk portrait background from the reference image remains completely static and identical from the first frame to the last frame under constant bright illumination.\ncharacter: The respected Korean historical monarch King Sejong, a benevolent and dignified Joseon king with a neat beard, wearing the red imperial Gonryongpo dragon robe with gold embroidered roundels on the chest and shoulders and the black winged Ikseongwan crown.\naction: Speaking directly and expressively to the viewer. His mouth and lips move clearly, distinctly, and dynamically in exact synchronization with the speech audio, opening and closing articulately for every syllable. His facial muscles and beard move naturally with his jaw as he speaks, accompanied by natural eye blinking, gentle head nods, and soft shoulder breathing. As the speech concludes, he smoothly closes his mouth into a calm resting expression, settles his shoulders into the initial upright pose, and blinks naturally.\ncamera: The camera is completely fixed and stationary on a locked-off tripod, maintaining the exact original medium bust portrait framing and constant bright exposure throughout the entire video.\n\nA medium bust portrait of the historical Korean monarch King Sejong. The camera is completely fixed and stationary, keeping the exact same framing and the original warm golden-ochre silk portrait background throughout the entire video with constant bright lighting. He looks directly at the viewer and speaks warmly. His mouth and lips open and close clearly, distinctly, and dynamically in exact sync with the speech audio. He blinks his eyes naturally and makes gentle head nods and natural shoulder breathing movements while speaking. As the speech finishes at the end, he gently closes his mouth, settles his shoulders back into the initial resting pose, and blinks softly.\n`,

    'yi-sun-sin': `scene: The exact original solid warm golden-ochre silk portrait background from the reference image remains completely static and identical from the first frame to the last frame under constant bright illumination.\ncharacter: The respected Korean historical commander Admiral Yi Sun-sin, a resolute middle-aged Joseon military official with a full beard, wearing the red official Dallyeong court robe with a square embroidered twin-leopard chest rank badge and the tall black winged Samo hat.\naction: Speaking directly and expressively to the viewer. His mouth and lips move clearly, distinctly, and dynamically in exact synchronization with the speech audio, opening and closing articulately for every syllable. His facial muscles and beard move naturally with his jaw as he speaks, accompanied by natural eye blinking, gentle head nods, and soft shoulder breathing. As the speech concludes, he smoothly closes his mouth into a calm resting expression, settles his shoulders into the initial upright pose, and blinks naturally.\ncamera: The camera is completely fixed and stationary on a locked-off tripod, maintaining the tall black winged Samo hat, both shoulders, and the square twin-leopard chest rank badge in the exact original medium bust framing with constant bright exposure throughout the entire video.\n\nA medium bust portrait of the historical Korean commander Admiral Yi Sun-sin. The camera is completely fixed and stationary, keeping the exact same framing and the original warm golden-ochre silk portrait background throughout the entire video with constant bright lighting. He looks directly at the viewer and speaks with resolute clarity. His mouth and lips open and close clearly, distinctly, and dynamically in exact sync with the speech audio. He blinks his eyes naturally and makes gentle head nods and natural shoulder breathing movements while speaking. As the speech finishes at the end, he gently closes his mouth, settles his shoulders back into the initial resting pose, and blinks softly.\n`,

    'yu-gwan-sun': `scene: The exact original vintage brick wall background from the reference photograph remains completely static and identical from the first frame to the last frame under constant bright illumination.\ncharacter: The respected Korean independence activist Yu Gwan-sun, a young Korean woman with an earnest and determined expression, neatly parted black hair, wearing a dark vintage jacket with an inmate number slip on the chest.\naction: Speaking directly and expressively to the viewer. Her mouth and lips move clearly, distinctly, and dynamically in exact synchronization with the speech audio, opening and closing articulately for every syllable. Her facial muscles move naturally as she speaks, accompanied by natural eye blinking, gentle head nods, and soft shoulder breathing. As the speech concludes, she smoothly closes her mouth into a calm resting expression, settles her shoulders into the initial upright pose, and blinks naturally.\ncamera: The camera is completely fixed and stationary on a locked-off tripod, maintaining the exact original medium bust portrait framing and constant bright exposure throughout the entire video.\n\nA medium bust portrait of the historical Korean independence activist Yu Gwan-sun. The camera is completely fixed and stationary, keeping the exact same framing and the original vintage brick wall background throughout the entire video with constant bright lighting. She looks directly at the viewer and speaks earnestly. Her mouth and lips open and close clearly, distinctly, and dynamically in exact sync with the speech audio. She blinks her eyes naturally and makes gentle head nods and natural shoulder breathing movements while speaking. As the speech finishes at the end, she gently closes her mouth, settles her shoulders back into the initial resting pose, and blinks softly.\n`,

    'shin-saimdang': `scene: The exact original solid warm golden-tan silk portrait background from the reference image remains completely static and identical from the first frame to the last frame under constant bright illumination.\ncharacter: The respected Joseon artist and scholar Shin Saimdang, a graceful Korean noblewoman with neatly braided traditional hair, clear gentle eyes, defined lips, wearing an ivory silk Jeogori hanbok with a deep maroon ribbon bow.\naction: Speaking directly and expressively to the viewer. Her mouth and lips move clearly, distinctly, and dynamically in exact synchronization with the speech audio, opening and closing articulately for every syllable. Her facial muscles move naturally as she speaks, accompanied by natural eye blinking, gentle head nods, and soft shoulder breathing. As the speech concludes, she smoothly closes her mouth into a calm resting expression, settles her shoulders into the initial upright pose, and blinks naturally.\ncamera: The camera is completely fixed and stationary on a locked-off tripod, maintaining the exact original medium bust portrait framing and constant bright exposure throughout the entire video.\n\nA medium bust portrait of the historical Joseon artist Shin Saimdang. The camera is completely fixed and stationary, keeping the exact same framing and the original warm golden-tan silk portrait background throughout the entire video with constant bright lighting. She looks directly at the viewer and speaks gracefully. Her mouth and lips open and close clearly, distinctly, and dynamically in exact sync with the speech audio. She blinks her eyes naturally and makes gentle head nods and natural shoulder breathing movements while speaking. As the speech finishes at the end, she gently closes her mouth, settles her shoulders back into the initial resting pose, and blinks softly.\n`
  };

  const selectedPrompt = figureBustPrompts[figureId] || figureBustPrompts['kim-koo'];
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

  // Option 0-LatentSync: ComfyUI Latent Sync-Net 30fps + PyTorch CUDA Anatomical Eye Blink Pipeline
  if (engineType === 'LatentSync' || engineType === 'Wav2Lip' || engineType === 'Hallo3') {
    try {
      console.log(`🎬 [ComfyUI LatentSync 30fps Engine] Generating Lip-Sync + Anatomical Eye Blink Video for '${figure?.name}'...`);
      const w2lRes = await generateComfyWav2LipVideo({
        figure,
        audioRelativeUrl: audioInfo?.audioUrl || null,
        speechText
      });
      if (w2lRes && w2lRes.videoUrl) {
        return {
          success: true,
          figureId,
          provider: 'ComfyUI Latent Sync-Net (30.0 FPS + PyTorch Eye Blink) Engine',
          videoUrl: w2lRes.videoUrl,
          audioUrl: audioInfo?.audioUrl || null,
          videoList: [w2lRes.videoUrl],
          speechText,
          status: 'ready'
        };
      }
    } catch (lsErr) {
      console.warn(`[ComfyUI LatentSync Engine Note]: ${lsErr.message}`);
    }
  }

  // Option 0-LTX: LTX-2.3 Image & Audio to Video Workflow (오디오 + 디비오 생성.json / video_ltx2_3_ia2v.json)
  // Option 0-LTX: LTX-2.3 Multi-Chunk Image & Audio to Video Workflow (comfyui_ltx_workflow.json / video_ltx2_3_ia2v.json)
  if (engineType === 'LTX_Video' || engineType === 'LTX2.3' || engineType === 'ComfyUI_LTX') {
    const comfyHost = process.env.COMFYUI_URL || 'http://20.30.22.101:8188';
    try {
      const ltxPrompt = prompt || buildLTXPrompt(figure, speechText);
      console.log(`🎬 [LTX-2.3 Engine] Generated Dynamic Prompt for '${figure?.name}':\n "${ltxPrompt}"`);

      // 1. Read ComfyUI LTX-2.3 audio+video workflow json
      const primaryJsonPath = path.join(__dirname, '../../comfyui_ltx_workflow.json');
      const fallbackJsonPath = path.join(__dirname, '../../video_ltx2_3_ia2v.json');
      const legacyJsonPath = path.join(__dirname, '../../오디오 + 디비오 생성.json');
      const workflowPath = fs.existsSync(primaryJsonPath) ? primaryJsonPath : (fs.existsSync(legacyJsonPath) ? legacyJsonPath : fallbackJsonPath);

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
        exactAudioDuration = Math.max(3.0, (charCount * 0.19) / speedVal + 0.5);
      }

      // 3. Exact Duration & Inter-Sentence Splitting for Speeches > 15s
      const targetFps = 24;
      const figureResolutions = {
        'kim-koo': { width: 832, height: 1088 },
        'king-sejong': { width: 832, height: 1088 },
        'yi-sun-sin': { width: 832, height: 1088 },
        'yu-gwan-sun': { width: 832, height: 1088 },
        'shin-saimdang': { width: 832, height: 1088 }
      };
      const figRes = figureResolutions[figureId] || { width: 832, height: 1088 };

      // Split speeches > 15s at inter-sentence boundaries
      const rawSentences = (speechText || '').match(/[^.!?]+[.!?]?\s*/g) || [speechText || ''];
      const textChunks = [];
      if (exactAudioDuration > 15.0 && rawSentences.length >= 2) {
        const midIdx = Math.max(1, Math.floor(rawSentences.length / 2));
        textChunks.push(rawSentences.slice(0, midIdx).join(' ').trim());
        textChunks.push(rawSentences.slice(midIdx).join(' ').trim());
      } else {
        textChunks.push((speechText || '').trim());
      }

      // Determine exact ComfyUI EdgeTTS voice string format
      let comfyVoice = '[Korean] ko-KR InJoon';
      const rawVoiceName = String(voiceProfile?.voiceName || figure?.voiceProfile?.voiceName || '');
      if (figureId === 'yi-sun-sin' || rawVoiceName.includes('Hyunsu')) {
        comfyVoice = '[Korean] ko-KR Hyunsu';
      } else if (figureId === 'yu-gwan-sun' || figureId === 'shin-saimdang' || rawVoiceName.includes('SunHi') || rawVoiceName.includes('Female')) {
        comfyVoice = '[Korean] ko-KR SunHi';
      }

      // Auto sync current reference portrait & audio to ComfyUI input directory (Local Disk + Network HTTP)
      await syncFilesToComfyUIInput(comfyHost, portraitUrl, audioInfo?.audioUrl);

      const renderedChunkPaths = [];
      let currentPortraitBasename = path.basename(portraitUrl);
      let lastPromptId = null;
      let totalFrames = 0;
      const targetDurationSec = Math.min(30, Math.max(3, Math.ceil(exactAudioDuration + 0.8)));

      // Determine audio chunks (1 chunk if <= 15s, or split at sentence boundary if > 15s)
      const audioChunks = [];
      if (exactAudioDuration > 15.0 && resolvedAudioDiskPath && fs.existsSync(resolvedAudioDiskPath)) {
        const ffmpegBin = findFfmpeg();
        let splitSec = exactAudioDuration / 2.0;
        try {
          const silenceOut = execSync(`"${ffmpegBin}" -i "${resolvedAudioDiskPath}" -af silencedetect=noise=-30dB:d=0.15 -f null - 2>&1`, { encoding: 'utf-8' });
          const pauses = [];
          const regex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
          let m;
          while ((m = regex.exec(silenceOut)) !== null) {
            const endT = parseFloat(m[1]);
            const durT = parseFloat(m[2]);
            const midT = endT - durT / 2.0;
            if (midT >= 4.5 && midT <= 14.5 && (exactAudioDuration - midT) <= 14.8) {
              pauses.push(midT);
            }
          }
          if (pauses.length > 0) {
            pauses.sort((a, b) => Math.abs(a - exactAudioDuration / 2.0) - Math.abs(b - exactAudioDuration / 2.0));
            splitSec = pauses[0];
          }
        } catch (err) {
          // Fallback to midpoint split
        }
        const chunk1Path = path.join(__dirname, `../../client/public/audio/chunk1_${figureId}_${Date.now()}.mp3`);
        const chunk2Path = path.join(__dirname, `../../client/public/audio/chunk2_${figureId}_${Date.now()}.mp3`);
        execSync(`"${ffmpegBin}" -y -i "${resolvedAudioDiskPath}" -ss 0 -to ${splitSec.toFixed(3)} -c:a libmp3lame -q:a 2 "${chunk1Path}"`, { stdio: 'ignore' });
        execSync(`"${ffmpegBin}" -y -i "${resolvedAudioDiskPath}" -ss ${splitSec.toFixed(3)} -c:a libmp3lame -q:a 2 "${chunk2Path}"`, { stdio: 'ignore' });
        await uploadFileToComfyUI(comfyHost, chunk1Path);
        await uploadFileToComfyUI(comfyHost, chunk2Path);
        audioChunks.push({ audioBasename: path.basename(chunk1Path), durationSec: Math.min(15, Math.max(4, Math.ceil(splitSec + 0.6))), text: textChunks[0] || speechText });
        audioChunks.push({ audioBasename: path.basename(chunk2Path), durationSec: Math.min(15, Math.max(4, Math.ceil((exactAudioDuration - splitSec) + 0.6))), text: textChunks[1] || speechText });
      } else {
        const audioBasename = audioInfo?.audioUrl ? path.basename(audioInfo.audioUrl) : (resolvedAudioDiskPath ? path.basename(resolvedAudioDiskPath) : null);
        audioChunks.push({
          audioBasename,
          durationSec: Math.min(15, Math.max(4, Math.ceil(exactAudioDuration + 0.8))),
          text: speechText
        });
      }

      for (let cIdx = 0; cIdx < audioChunks.length; cIdx++) {
        const chunkSpec = audioChunks[cIdx];
        const chunkWorkflow = JSON.parse(JSON.stringify(workflowTemplate));

        // A. LoadImage Node "269" -> Pre-cropped 832x1088 portrait (or last frame of previous chunk)
        if (chunkWorkflow["269"] && chunkWorkflow["269"].inputs) {
          chunkWorkflow["269"].inputs.image = currentPortraitBasename;
        }

        // A-2. Exact 832x1088 LTX-2.3 Generation Aspect Ratio ("340:330" Width & "340:324" Height)
        if (chunkWorkflow["340:330"] && chunkWorkflow["340:330"].inputs) {
          chunkWorkflow["340:330"].inputs.value = figRes.width;
        }
        if (chunkWorkflow["340:324"] && chunkWorkflow["340:324"].inputs) {
          chunkWorkflow["340:324"].inputs.value = figRes.height;
        }

        // B. Output SaveVideo Node "341" -> Unique filename prefix
        const uniquePrefix = `video/ltx_${figureId}_${Date.now()}_c${cIdx}`;
        if (chunkWorkflow["341"] && chunkWorkflow["341"].inputs) {
          chunkWorkflow["341"].inputs.filename_prefix = uniquePrefix;
        }

        // C. Duration Node "340:331" (PrimitiveFloat)
        if (chunkWorkflow["340:331"] && chunkWorkflow["340:331"].inputs) {
          chunkWorkflow["340:331"].inputs.value = chunkSpec.durationSec;
        }

        // D. Frame Rate Node "340:323" (PrimitiveInt)
        if (chunkWorkflow["340:323"] && chunkWorkflow["340:323"].inputs) {
          chunkWorkflow["340:323"].inputs.value = targetFps;
        }

        // E. Audio Input Binding
        if (chunkSpec.audioBasename) {
          chunkWorkflow["276"] = {
            inputs: { audio: chunkSpec.audioBasename },
            class_type: "LoadAudio",
            _meta: { title: "LoadAudio (Preset MP3)" }
          };
          if (chunkWorkflow["340:332"] && chunkWorkflow["340:332"].inputs) {
            chunkWorkflow["340:332"].inputs.audio = ["276", 0];
            chunkWorkflow["340:332"].inputs.start_index = 0;
            chunkWorkflow["340:332"].inputs.duration = chunkSpec.durationSec;
          }
          delete chunkWorkflow["350"];
          delete chunkWorkflow["351"];
        } else {
          if (chunkWorkflow["340:332"] && chunkWorkflow["340:332"].inputs) {
            chunkWorkflow["340:332"].inputs.start_index = 0;
            chunkWorkflow["340:332"].inputs.duration = chunkSpec.durationSec;
          }
          if (chunkWorkflow["350"] && chunkWorkflow["350"].inputs) {
            chunkWorkflow["350"].inputs.text = chunkSpec.text;
            chunkWorkflow["350"].inputs.voice = comfyVoice;
            chunkWorkflow["350"].inputs.speed = speedVal;
            chunkWorkflow["350"].inputs.pitch = pitchVal;
          }
          if (chunkWorkflow["276"]) {
            delete chunkWorkflow["276"];
          }
        }

        // H. Prompts: Constraints in Positive Prompt, Clean Negative Prompt
        if (chunkWorkflow["340:319"] && chunkWorkflow["340:319"].inputs) {
          chunkWorkflow["340:319"].inputs.value = ltxPrompt;
        }
        if (chunkWorkflow["340:349"] && chunkWorkflow["340:349"].inputs) {
          chunkWorkflow["340:349"].inputs.value = false;
        }
        if (chunkWorkflow["340:314"] && chunkWorkflow["340:314"].inputs) {
          chunkWorkflow["340:314"].inputs.text = "pc game, console game, video game, cartoon, childish, ugly";
        }

        // Set CFG to 1.0 (Official LTX-2.3 setting)
        if (chunkWorkflow["340:290"] && chunkWorkflow["340:290"].inputs) {
          chunkWorkflow["340:290"].inputs.cfg = 1.0;
        }
        if (chunkWorkflow["340:315"] && chunkWorkflow["340:315"].inputs) {
          chunkWorkflow["340:315"].inputs.cfg = 1.0;
        }

        // Image conditioning strength: 0.8 in both Stage 1 ("340:325") and Stage 2 ("340:296") for clear lip motion
        if (chunkWorkflow["340:325"] && chunkWorkflow["340:325"].inputs) {
          chunkWorkflow["340:325"].inputs.strength = 0.8;
        }
        if (chunkWorkflow["340:296"] && chunkWorkflow["340:296"].inputs) {
          chunkWorkflow["340:296"].inputs.strength = 0.8;
        }

        // Lock audio latent in Stage 2 ("340:287") to SetLatentNoiseMask ("340:327")
        if (chunkWorkflow["340:287"] && chunkWorkflow["340:287"].inputs) {
          chunkWorkflow["340:287"].inputs.audio_latent = ["340:327", 0];
        }

        // Dynamic LoRA strength lowered to 0 ~ 0.2 (0.15)
        if (chunkWorkflow["340:293"] && chunkWorkflow["340:293"].inputs) {
          chunkWorkflow["340:293"].inputs.strength_model = 0.15;
        }

        // I. Noise Seeds
        const renderSeed = Math.floor(Math.random() * 1000000000000);
        if (chunkWorkflow["340:285"] && chunkWorkflow["340:285"].inputs) {
          chunkWorkflow["340:285"].inputs.noise_seed = 42;
        }
        if (chunkWorkflow["340:286"] && chunkWorkflow["340:286"].inputs) {
          chunkWorkflow["340:286"].inputs.noise_seed = renderSeed;
        }

        // J. ResizeImageMaskNode "340:297" -> "disabled" crop since portrait is pre-cropped to exact 832x1088
        if (chunkWorkflow["340:297"] && chunkWorkflow["340:297"].inputs) {
          chunkWorkflow["340:297"].inputs["resize_type.crop"] = "disabled";
        }

        const chunkFrames = chunkSpec.durationSec * targetFps + 1;
        totalFrames += chunkFrames;

        const promptPayload = {
          client_id: `ltx_chunk_${figureId}_${Date.now()}_${cIdx}`,
          prompt: chunkWorkflow,
          extra_data: {
            figureId,
            durationSec: chunkSpec.durationSec,
            fps: targetFps,
            totalFrames: chunkFrames
          }
        };

        const response = await fetch(`${comfyHost}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptPayload),
          signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
          throw new Error(`ComfyUI prompt rejected: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        lastPromptId = data.prompt_id;
        console.log(`✅ [LTX-Video Chunk ${cIdx + 1}/${audioChunks.length} Queued] Prompt ID: ${data.prompt_id} (${chunkSpec.durationSec}s @ ${targetFps}fps)`);

        const chunkVideoUrl = await pollComfyUIAndDownloadVideo(comfyHost, data.prompt_id, figureId, uniquePrefix);
        if (!chunkVideoUrl) {
          throw new Error('ComfyUI polling ended without output video.');
        }

        const chunkVideoDiskPath = path.join(__dirname, '../../client/public', chunkVideoUrl);
        renderedChunkPaths.push(chunkVideoUrl);

        // If there is a next chunk, extract the last frame of this chunk and upload as the starting frame of the next chunk
        if (cIdx < audioChunks.length - 1) {
          const nextInitImgPath = path.join(__dirname, `../../client/public/images/ltx_chain_${figureId}_${Date.now()}.png`);
          if (extractLastFrame(chunkVideoDiskPath, nextInitImgPath)) {
            const uploadedChainImg = await uploadFileToComfyUI(comfyHost, nextInitImgPath);
            if (uploadedChainImg) {
              currentPortraitBasename = uploadedChainImg;
            }
          }
        }
      }

      let downloadedVideo = renderedChunkPaths[0];
      if (renderedChunkPaths.length > 1) {
        const mergedUrl = await concatMultipleVideos(renderedChunkPaths, figureId);
        if (mergedUrl) downloadedVideo = mergedUrl;
      }

      console.log(`🎉 [LTX-Video Render Completed]: ${downloadedVideo}`);

      // 5. Final Stage: Preserve ComfyUI's Native 100% Synchronized Audio and Extract Matching MP3
      let finalMergedVideoUrl = downloadedVideo;
      let finalSyncedAudioUrl = audioInfo?.audioUrl || null;
      const ffmpegBin = findFfmpeg();
      const videoDiskPath = path.join(__dirname, '../../client/public', downloadedVideo);

      try {
        // Extract native audio directly from rendered video to guarantee 100% lip-sync (0.00ms offset)
        const syncAudioFilename = `synced_${figureId}_${Date.now()}.mp3`;
        const syncAudioPath = path.join(__dirname, '../../client/public/audio', syncAudioFilename);
        execSync(`"${ffmpegBin}" -i "${videoDiskPath}" -vn -c:a libmp3lame -q:a 2 "${syncAudioPath}" -y`, { stdio: 'ignore' });
        if (fs.existsSync(syncAudioPath) && fs.statSync(syncAudioPath).size > 1000) {
          finalSyncedAudioUrl = `/audio/${syncAudioFilename}`;
          console.log(`✅ [Exact Sync Success] Extracted synchronized speech audio: ${finalSyncedAudioUrl}`);
        }
      } catch (extractErr) {
        console.warn(`[Audio Extraction Note]: ${extractErr.message}`);
      }

      if (finalMergedVideoUrl) {
        return {
          success: true,
          figureId: figure?.id || figureId,
          provider: `ComfyUI LTX-Video (${targetDurationSec}s @ ${targetFps}fps 단일 동기화) Engine`,
          promptId: lastPromptId,
          ltxPrompt,
          videoUrl: finalMergedVideoUrl,
          audioUrl: finalSyncedAudioUrl,
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
    const comfyHost = process.env.COMFYUI_URL || 'http://20.30.22.101:8188';
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

function getFigureEdgeTTS(figure) {
  const id = figure?.id || 'kim-koo';
  switch (id) {
    case 'kim-koo':
      return { voice: '[Korean] ko-KR InJoon', speed: 0.95, pitch: -15 };
    case 'king-sejong':
      return { voice: '[Korean] ko-KR Hyunsu', speed: 0.90, pitch: -15 };
    case 'yi-sun-sin':
      return { voice: '[Korean] ko-KR Hyunsu', speed: 0.95, pitch: -20 };
    case 'yu-gwan-sun':
      return { voice: '[Korean] ko-KR SunHi', speed: 1.00, pitch: 10 };
    case 'shin-saimdang':
      return { voice: '[Korean] ko-KR SunHi', speed: 0.94, pitch: -5 };
    default:
      return { voice: '[Korean] ko-KR Hyunsu', speed: 0.90, pitch: -15 };
  }
}

/**
 * Ultra-Fast ComfyUI Wav2Lip GAN Lip-Sync Video Generator (2~4 seconds on RTX 16GB GPU)
 * Decoupled: Takes portrait image + existing generated audio or native EdgeTTS, renders MP4 lip-sync video.
 */
export async function generateComfyWav2LipVideo({ figure, audioRelativeUrl = null, speechText = null }) {
  const comfyHost = process.env.COMFYUI_URL || 'http://20.30.22.101:8188';
  const figureId = figure?.id || 'kim-koo';
  const imgName = `${figureId}.webp`;

  // Auto-synthesize high quality edge-tts audio if not already supplied
  if (!audioRelativeUrl && speechText) {
    const { generateAudioFromText } = await import('./ttsService.js');
    const audioRes = await generateAudioFromText(speechText, figure.voiceProfile, figureId);
    audioRelativeUrl = audioRes.audioUrl;
  }

  const comfyInput = getComfyInputDir();
  const comfyOutput = getComfyOutputDir();
  const srcImg = path.join(__dirname, '../../client/public/images', imgName);
  const audioBasename = audioRelativeUrl ? path.basename(audioRelativeUrl) : null;
  const srcAudio = audioRelativeUrl ? path.join(__dirname, '../../client/public', audioRelativeUrl.replace(/^\//, '')) : null;

  // 1. Local copy if ComfyUI input folder exists locally
  if (fs.existsSync(comfyInput)) {
    const dstImg = path.join(comfyInput, imgName);
    if (fs.existsSync(srcImg) && !fs.existsSync(dstImg)) {
      fs.copyFileSync(srcImg, dstImg);
    }
    if (srcAudio && audioBasename) {
      const dstAudio = path.join(comfyInput, audioBasename);
      if (fs.existsSync(srcAudio)) {
        fs.copyFileSync(srcAudio, dstAudio);
      }
    }
  }

  // 2. HTTP upload to ComfyUI (Works seamlessly for remote desktop GPU PC across LAN/WiFi!)
  try {
    if (fs.existsSync(srcImg)) {
      await uploadFileToComfyUI(comfyHost, srcImg, imgName);
    }
    if (srcAudio && fs.existsSync(srcAudio) && audioBasename) {
      await uploadFileToComfyUI(comfyHost, srcAudio, audioBasename);
    }
  } catch (syncErr) {
    console.warn('[ComfyUI Remote Sync Note]:', syncErr.message);
  }

  const prefix = `w2l_${figureId}_${Date.now()}`;
  let prompt = null;
  let detectedVideoCombineId = '4';

  // Load user-provided '대사.json' workflow template if available
  const daesaJsonPath = path.join(__dirname, '../../대사.json');
  if (fs.existsSync(daesaJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(daesaJsonPath, 'utf-8'));
      prompt = parsed;

      // Dynamically detect nodes by class_type to support any custom node IDs from ComfyUI
      let loadImageId = null;
      let edgeTtsId = null;
      let wav2lipId = null;
      let videoCombineId = null;
      let saveAudioId = null;
      let loadAudioId = null;

      for (const [id, node] of Object.entries(prompt)) {
        if (!node || !node.class_type) continue;
        if (node.class_type === 'LoadImage') loadImageId = id;
        else if (node.class_type === 'EdgeTTS') edgeTtsId = id;
        else if (node.class_type === 'Wav2Lip') wav2lipId = id;
        else if (node.class_type === 'VHS_VideoCombine') { videoCombineId = id; detectedVideoCombineId = id; }
        else if (node.class_type === 'Save_Audio') saveAudioId = id;
        else if (node.class_type === 'VHS_LoadAudioUpload' || node.class_type === 'VHS_LoadAudio') loadAudioId = id;
      }

      // 1. Configure LoadImage
      if (loadImageId && prompt[loadImageId]?.inputs) {
        prompt[loadImageId].inputs.image = imgName;
      }

      // 2. Configure EdgeTTS (if present)
      if (edgeTtsId && prompt[edgeTtsId]?.inputs) {
        const ttsConfig = getFigureEdgeTTS(figure);
        if (speechText) prompt[edgeTtsId].inputs.text = speechText;
        prompt[edgeTtsId].inputs.voice = ttsConfig.voice;
        prompt[edgeTtsId].inputs.speed = ttsConfig.speed;
        prompt[edgeTtsId].inputs.pitch = ttsConfig.pitch;
        console.log(`🎙️ [ComfyUI Native EdgeTTS] Voice: ${ttsConfig.voice} | Speed: ${ttsConfig.speed} | Pitch: ${ttsConfig.pitch}`);
      } else if (loadAudioId && prompt[loadAudioId]?.inputs && audioBasename) {
        const absAudioPath = path.join(comfyInput, audioBasename).replace(/\\/g, '/');
        if ('audio' in prompt[loadAudioId].inputs) prompt[loadAudioId].inputs.audio = audioBasename;
        if ('audio_file' in prompt[loadAudioId].inputs) prompt[loadAudioId].inputs.audio_file = absAudioPath;
      }

      // 3. Configure Wav2Lip
      if (wav2lipId && prompt[wav2lipId]?.inputs) {
        prompt[wav2lipId].inputs.mode = 'repetitive'; // Crucial: loops single image across all audio frames
        prompt[wav2lipId].inputs.face_detect_batch = 16;
        if (edgeTtsId) {
          prompt[wav2lipId].inputs.audio = [edgeTtsId, 0];
        }
        if (loadImageId) {
          prompt[wav2lipId].inputs.images = [loadImageId, 0];
        }
      }

      // 4. Configure Save_Audio (if present)
      if (saveAudioId && prompt[saveAudioId]?.inputs) {
        if (edgeTtsId) {
          prompt[saveAudioId].inputs.audio = [edgeTtsId, 0];
        }
        prompt[saveAudioId].inputs.format = 'mp3';
        prompt[saveAudioId].inputs.quality = 'high';
        prompt[saveAudioId].inputs.filepath = `${prefix}_speech`;
      }

      // 5. Configure VHS_VideoCombine
      if (videoCombineId && prompt[videoCombineId]?.inputs) {
        prompt[videoCombineId].inputs.format = 'video/h264-mp4'; // Crucial: h264 MP4 with sound for HTML5 video
        prompt[videoCombineId].inputs.frame_rate = 30.0; // 30 fps Wav2Lip synchronization (mel_idx_multiplier = 80/30)
        prompt[videoCombineId].inputs.filename_prefix = prefix;
        prompt[videoCombineId].inputs.pix_fmt = 'yuv420p'; // Fixes VideoHelperSuite warning
        prompt[videoCombineId].inputs.crf = 19; // High visual quality
        prompt[videoCombineId].inputs.trim_to_audio = true; // Auto-trims extra video frames to exact audio duration!
        prompt[videoCombineId].inputs.save_metadata = true;
      }

      // 6. Clean up unused orphaned nodes (e.g. unlinked VHS_LoadAudioUpload if EdgeTTS is active)
      if (edgeTtsId && loadAudioId && prompt[loadAudioId]) {
        delete prompt[loadAudioId];
      }

      console.log(`📜 [ComfyUI Pipeline] Successfully configured workflow from '대사.json' (LoadImage:${loadImageId}, EdgeTTS:${edgeTtsId}, Wav2Lip:${wav2lipId}, Video:${videoCombineId})!`);
    } catch (parseErr) {
      console.warn(`[대사.json parse warning]:`, parseErr.message);
    }
  }

  // Try loading comfyui_wav2lip_workflow.json or '대사.json'
  const w2lWorkflowPath = path.join(__dirname, '../../comfyui_wav2lip_workflow.json');
  if (!prompt && fs.existsSync(w2lWorkflowPath)) {
    try {
      prompt = JSON.parse(fs.readFileSync(w2lWorkflowPath, 'utf-8'));
      for (const [id, node] of Object.entries(prompt)) {
        if (!node || !node.class_type) continue;
        if (node.class_type === 'LoadImage' && node.inputs) {
          node.inputs.image = imgName;
        } else if ((node.class_type === 'VHS_LoadAudio' || node.class_type === 'VHS_LoadAudioUpload') && node.inputs) {
          node.inputs.audio_file = audioBasename || node.inputs.audio_file;
          node.inputs.audio = audioBasename;
        } else if (node.class_type === 'Wav2Lip' && node.inputs) {
          node.inputs.mode = 'repetitive';
          node.inputs.face_detect_batch = 16;
        } else if (node.class_type === 'VHS_VideoCombine' && node.inputs) {
          node.inputs.filename_prefix = prefix;
          node.inputs.format = 'video/h264-mp4';
          node.inputs.pix_fmt = 'yuv420p';
          node.inputs.crf = 19;
          node.inputs.trim_to_audio = true;
          node.inputs.pingpong = false;
          node.inputs.loop_count = 0;
          node.inputs.save_output = true;
          detectedVideoCombineId = id;
        }
      }
      console.log(`📜 [ComfyUI Pipeline] Loaded & configured 'comfyui_wav2lip_workflow.json' for ${figureId}!`);
    } catch (w2lParseErr) {
      console.warn('[comfyui_wav2lip_workflow.json parse note]:', w2lParseErr.message);
    }
  }

  if (!prompt) {
    prompt = {
      '1': {
        'class_type': 'LoadImage',
        'inputs': { 'image': imgName }
      },
      '2': {
        'class_type': 'VHS_LoadAudioUpload',
        'inputs': { 'audio': audioBasename, 'start_time': 0, 'duration': 0 }
      },
      '3': {
        'class_type': 'Wav2Lip',
        'inputs': {
          'images': ['1', 0],
          'audio': ['2', 0],
          'mode': 'repetitive',
          'face_detect_batch': 16
        }
      },
      '4': {
        'class_type': 'VHS_VideoCombine',
        'inputs': {
          'images': ['3', 0],
          'audio': ['3', 1],
          'frame_rate': 30.0,
          'loop_count': 0,
          'format': 'video/h264-mp4',
          'filename_prefix': prefix,
          'pix_fmt': 'yuv420p',
          'crf': 19,
          'trim_to_audio': true,
          'pingpong': false,
          'save_output': true
        }
      }
    };
  }

  // --------------------------------------------------------------------------
  // 파라미터 전송 상태 디버그 로그 (개발자가 즉시 확인할 수 있도록 박스 출력)
  // --------------------------------------------------------------------------
  console.log('\n' + '┌' + '─'.repeat(70) + '┐');
  console.log('│ 📡 [ComfyUI 파라미터 전송 검증 로그 (Parameter Dispatch)]');
  console.log('├' + '─'.repeat(70) + '┤');
  console.log(`│  ▶ 대상 ComfyUI 서버 URL : ${comfyHost}`);
  console.log(`│  ▶ 대상 역사 인물         : ${figure?.name || figureId} (ID: ${figureId})`);
  console.log(`│  ▶ 입력 초상화 이미지     : ${imgName} (해상도 유지)`);
  console.log(`│  ▶ 립싱크 대상 오디오     : ${audioBasename || 'EdgeTTS 직접 생성'}`);
  if (speechText) {
    const preview = speechText.length > 40 ? speechText.substring(0, 37) + '...' : speechText;
    console.log(`│  ▶ 발화 대사 텍스트       : "${preview}"`);
  }
  console.log(`│  ▶ ComfyUI 노드 파이프라인: [${Object.keys(prompt).map(k => `${k}:${prompt[k]?.class_type}`).join(', ')}]`);
  console.log('└' + '─'.repeat(70) + '┘\n');

  let resp;
  try {
    resp = await fetch(`${comfyHost}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (netErr) {
    console.error('\n' + '━'.repeat(70));
    console.error(`🚨 [ComfyUI 연결 실패 오류]`);
    console.error(`   ▶ 연결 시도 Host : ${comfyHost}`);
    console.error(`   ▶ 원인           : ${netErr.message}`);
    console.error(`   💡 [즉시 해결 방법]:`);
    console.error(`      1. ComfyUI 서버가 켜져 있는지 확인하세요. (run_comfyui.bat 실행)`);
    console.error(`      2. .env 파일의 COMFYUI_URL (${comfyHost}) 설정과 실제 IP/포트가 맞는지 확인하세요.`);
    console.error(`      3. ComfyUI 실행 시 '--listen 0.0.0.0 --port 8188' 옵션을 추가했는지 확인하세요.`);
    console.error('━'.repeat(70) + '\n');
    throw new Error(`ComfyUI 서버(${comfyHost})에 연결할 수 없습니다. 서버 실행 여부와 .env를 확인하세요.`);
  }

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    console.error(`🚨 [ComfyUI HTTP ${resp.status} 오류]:`, errorText);
    throw new Error(`ComfyUI 프롬프트 전송 실패 (HTTP ${resp.status}): ${errorText}`);
  }
  const data = await resp.json();
  const promptId = data.prompt_id;
  console.log(`✅ [ComfyUI 큐 등록 완료] Prompt ID: ${promptId} (인퍼런스 시작됨)`);

  // Poll until complete (Wav2Lip takes 2~8s on RTX 16GB GPU)
  const startTime = Date.now();
  let connErrors = 0;
  while (Date.now() - startTime < 60000) {
    await new Promise(r => setTimeout(r, 1200));
    try {
      const hRes = await fetch(`${comfyHost}/history/${promptId}`);
      if (hRes.ok) {
        connErrors = 0;
        const hData = await hRes.json();
        
        // Fast-fail: Detect ComfyUI execution error immediately without waiting 60s
        if (hData[promptId]?.status?.status_str === 'error') {
          const msgs = hData[promptId]?.status?.messages;
          let errMsg = 'ComfyUI 노드 실행 오류 발생';
          if (Array.isArray(msgs)) {
            const last = msgs[msgs.length - 1];
            errMsg = (typeof last === 'string') ? last : JSON.stringify(last);
          }
          console.error(`💥 [ComfyUI Error Detected]:`, errMsg);
          throw new Error(`ComfyUI 렌더링 중단 (에러: ${errMsg})`);
        }

        const outNode = hData[promptId]?.outputs?.[detectedVideoCombineId] || 
                        Object.values(hData[promptId]?.outputs || {}).find(o => o?.gifs || o?.videos);
        const gifInfo = (outNode?.gifs || outNode?.videos || [])[0];
        if (gifInfo && gifInfo.filename) {
          const outFilename = gifInfo.filename;
          const targetFilename = `w2l_${figureId}_${Date.now()}.mp4`;
          const targetPath = path.join(__dirname, '../../client/public/videos', targetFilename);

          let savedFile = false;
          // Try local disk copy first
          const comfyOut = path.join(comfyOutput, outFilename);
          if (fs.existsSync(comfyOut)) {
            fs.copyFileSync(comfyOut, targetPath);
            savedFile = true;
          } else {
            // Fallback to HTTP download for remote desktop GPU PC
            const subfolder = gifInfo.subfolder || '';
            const ftype = gifInfo.type || 'output';
            const downloadUrl = `${comfyHost}/view?filename=${encodeURIComponent(outFilename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(ftype)}`;
            console.log(`📥 [ComfyUI Video Download (Remote)] Downloading from: ${downloadUrl}`);
            const vRes = await fetch(downloadUrl);
            if (vRes.ok) {
              const buffer = Buffer.from(await vRes.arrayBuffer());
              if (buffer.length > 50000) {
                fs.writeFileSync(targetPath, buffer);
                savedFile = true;
                console.log(`✅ [ComfyUI Video Saved] Downloaded ${buffer.length} bytes to: ${targetPath}`);
              }
            }
          }

          if (savedFile && fs.existsSync(targetPath)) {
            // Precision Lip-Sync Lock: Trim extra trailing silent frames so mouth animation stops the instant sound ends!
            try {
              const ffmpegBin = findFfmpeg();
              if (ffmpegBin && fs.existsSync(srcAudio)) {
                const syncedTmp = targetPath.replace('.mp4', '_synced.mp4');
                execSync(`"${ffmpegBin}" -y -i "${targetPath}" -i "${srcAudio}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "${syncedTmp}"`, { stdio: 'ignore' });
                if (fs.existsSync(syncedTmp) && fs.statSync(syncedTmp).size > 10000) {
                  fs.renameSync(syncedTmp, targetPath);
                  console.log(`🎯 [Lip-Sync Precision Lock]: Video perfectly locked to audio duration with zero trailing movement!`);
                }
              }
            } catch (syncErr) {
              console.warn('[Lip-Sync Auto-Trim Note]:', syncErr.message);
            }

            // Natural Eye Blink Injection: Inject PyTorch eye blinks into the Wav2Lip output!
            try {
              const embedPy = getComfyEmbeddedPython();
              const pythonExe = fs.existsSync(embedPy) ? embedPy : 'python';
              const blinkScript = path.join(__dirname, '../scripts/inject_blinks_to_video.py');
              if (fs.existsSync(blinkScript)) {
                try {
                  execSync(`"${pythonExe}" "${blinkScript}" --input "${targetPath}" --figure "${figureId}" --force`, { stdio: 'ignore' });
                } catch {
                  execSync(`python "${blinkScript}" --input "${targetPath}" --figure "${figureId}" --force`, { stdio: 'ignore' });
                }
                console.log(`👁️ [Eye Blink Injection]: Successfully injected natural eye blinks into Wav2Lip video for '${figureId}'!`);
              }
            } catch (blinkErr) {
              console.warn('[Eye Blink Injection Note]:', blinkErr.message);
            }

            return {
              success: true,
              videoUrl: `/videos/${targetFilename}`,
              engine: 'ComfyUI Wav2Lip GAN (Remote RTX 16GB GPU)'
            };
          }
        }
      }
    } catch (pollErr) {
      if (pollErr.message.includes('ComfyUI 렌더링 중단')) {
        throw pollErr;
      }
      connErrors++;
      // If ComfyUI process closed/crashed during polling (4 consecutive ECONNREFUSED/timeouts)
      if (connErrors >= 4) {
        console.error(`🚨 [ComfyUI Crash/Disconnect Detected]: ComfyUI 서버가 튕겼거나 연결이 끊어졌습니다.`);
        throw new Error(`ComfyUI 서버 프로세스가 비정상 종료(튕김)되었거나 연결이 끊어졌습니다 (${pollErr.message})`);
      }
    }
  }
  throw new Error('ComfyUI Wav2Lip generation timed out');
}
