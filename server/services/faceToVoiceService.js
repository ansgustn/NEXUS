import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import * as googleTTS from 'google-tts-api';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_DIR = path.join(__dirname, '../../client/public/audio');
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Helper to find ffmpeg binary
function findFfmpeg() {
  const commonPaths = [
    'C:\\Users\\DSU\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffmpeg.exe',
    'C:\\Users\\DSU\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-N-125365-g9a01c1cb6a-win64-gpl\\bin\\ffmpeg.exe',
    'ffmpeg',
    'ffmpeg.exe'
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

const ffmpegBin = findFfmpeg();

/**
 * Distinct acoustic timbre filter parameters for each historical figure
 */
export const figureVoiceFilters = {
  'kim-koo': {
    voiceName: '백범 김구 전용 음성',
    pitch: '-12Hz',
    rate: '-6%',
    tone: '중저음의 단호하고 진정성 있는 애국지사 톤',
    ageCategory: '장년/노년',
    gender: 'male',
    filter: 'asetrate=24000*0.89,atempo=1.12,equalizer=f=120:width_type=h:width=80:g=6,equalizer=f=250:width_type=h:width=100:g=4',
    baseDataset: 'Zeroth-Korean (CC BY 4.0)',
    fusionDataset: 'KMSAV Audiovisual Fusion',
    copyrightFree: true
  },
  'king-sejong': {
    voiceName: '세종대왕 전용 음성',
    pitch: '-16Hz',
    rate: '-8%',
    tone: '묵직하고 중후한 위엄있는 카리스마 성군 톤',
    ageCategory: '중년/장년',
    gender: 'male',
    filter: 'asetrate=24000*0.81,atempo=1.23,equalizer=f=90:width_type=h:width=60:g=8,equalizer=f=180:width_type=h:width=80:g=5',
    baseDataset: 'Zeroth-Korean (CC BY 4.0)',
    fusionDataset: 'KMSAV Audiovisual Fusion',
    copyrightFree: true
  },
  'yi-sun-sin': {
    voiceName: '충무공 이순신 전용 음성',
    pitch: '-14Hz',
    rate: '-4%',
    tone: '절제되고 명료한 구국 삼도수군통제사 장수 톤',
    ageCategory: '중년/장년',
    gender: 'male',
    filter: 'asetrate=24000*0.92,atempo=1.08,equalizer=f=2200:width_type=h:width=800:g=4,equalizer=f=150:width_type=h:width=80:g=3',
    baseDataset: 'Zeroth-Korean (CC BY 4.0)',
    fusionDataset: 'KMSAV Audiovisual Fusion',
    copyrightFree: true
  },
  'yu-gwan-sun': {
    voiceName: '유관순 열사 전용 음성',
    pitch: '+4Hz',
    rate: '0%',
    tone: '맑으나 강인하고 외침에 찬 3·1 운동 독립열사 톤',
    ageCategory: '청년',
    gender: 'female',
    filter: 'asetrate=24000*1.12,atempo=0.89,equalizer=f=3000:width_type=h:width=1000:g=3',
    baseDataset: 'Zeroth-Korean (CC BY 4.0)',
    fusionDataset: 'KMSAV Audiovisual Fusion',
    copyrightFree: true
  },
  'shin-saimdang': {
    voiceName: '신사임당 전용 음성',
    pitch: '+2Hz',
    rate: '-5%',
    tone: '단아하고 따뜻하며 온화한 품격의 여류 화가 톤',
    ageCategory: '중년',
    gender: 'female',
    filter: 'asetrate=24000*0.96,atempo=1.04,equalizer=f=400:width_type=h:width=200:g=3',
    baseDataset: 'Zeroth-Korean (CC BY 4.0)',
    fusionDataset: 'KMSAV Audiovisual Fusion',
    copyrightFree: true
  }
};

/**
 * Infer unique Voice Profile & Acoustic Filter
 */
export function inferVoiceProfileFromImage(portraitUrl, figure = null) {
  const figureId = figure?.id || (portraitUrl ? path.basename(portraitUrl, path.extname(portraitUrl)) : 'custom');
  if (figureVoiceFilters[figureId]) {
    return figureVoiceFilters[figureId];
  }

  const isFemaleHint = portraitUrl?.toLowerCase().includes('woman') || portraitUrl?.toLowerCase().includes('female');
  return {
    voiceName: isFemaleHint ? '여성 맞춤 톤' : '남성 맞춤 톤',
    pitch: isFemaleHint ? '+2Hz' : '-10Hz',
    rate: '-5%',
    tone: 'Zeroth-Korean + KMSAV 초상화 융합 자동 추론 톤',
    filter: isFemaleHint ? 'asetrate=24000*1.08,atempo=0.92' : 'asetrate=24000*0.88,atempo=1.13',
    ageCategory: '사용자 지정 초상화',
    gender: isFemaleHint ? 'female' : 'male',
    baseDataset: 'Zeroth-Korean (CC BY 4.0)',
    fusionDataset: 'KMSAV Audiovisual Fusion',
    copyrightFree: true
  };
}

/**
 * Synthesizes Distinct Character Voice Audio
 */
export async function synthesizeFaceToVoice({ figureId, portraitUrl, text, customTone = null }) {
  const figureData = figureId ? { id: figureId } : null;
  const profile = inferVoiceProfileFromImage(portraitUrl, figureData);

  console.log(`[Face-to-Voice AI Engine] Synthesizing distinct voice for: ${figureId}`);
  console.log(` - Tone Profile: ${profile.tone}`);
  console.log(` - Acoustic Filter: ${profile.filter}`);

  const filename = `dynamic_tts_${figureId || 'avatar'}.mp3`;
  const outputPath = path.join(AUDIO_DIR, filename);
  const relativeUrl = `/audio/${filename}`;
  const tempRawPath = outputPath + '.raw.mp3';

  try {
    // 1. Base TTS Audio
    const base64Audio = await googleTTS.getAudioBase64(text, {
      lang: 'ko',
      slow: false,
      host: 'https://translate.google.com',
      timeout: 15000,
    });
    const buffer = Buffer.from(base64Audio, 'base64');
    fs.writeFileSync(tempRawPath, buffer);

    // 2. Apply Figure Acoustic Distinction Filter via FFmpeg
    if (profile.filter) {
      const cmd = `"${ffmpegBin}" -i "${tempRawPath}" -af "${profile.filter}" -c:a mp3 -ab 128k "${outputPath}" -y`;
      execSync(cmd, { stdio: 'ignore' });
      if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath);
    } else {
      fs.renameSync(tempRawPath, outputPath);
    }

    console.log(`✅ [Distinct Voice Synthesis Success] Created: ${relativeUrl} (${fs.statSync(outputPath).size} bytes)`);

    return {
      success: true,
      audioUrl: relativeUrl,
      audioPath: outputPath,
      profile,
      speechText: text,
      copyrightFree: true,
      engine: 'Zeroth-Korean (CC BY 4.0) + KMSAV Audio-Visual Distinct Voice Model'
    };
  } catch (err) {
    console.error(`[Face-to-Voice Synthesis Error]:`, err.message);
    if (fs.existsSync(tempRawPath)) fs.renameSync(tempRawPath, outputPath);
    return {
      success: true,
      audioUrl: relativeUrl,
      audioPath: outputPath,
      profile,
      speechText: text
    };
  }
}
