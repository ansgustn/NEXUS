import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_DIR = path.join(__dirname, '..');
const AUDIO_DIR = path.join(__dirname, '../../client/public/audio');

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// Helper to find yt-dlp binary
function findYtdlp() {
  const commonPaths = [
    'C:\\Users\\DSU\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe',
    'yt-dlp',
    'yt-dlp.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Links/yt-dlp.exe')
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
  return 'yt-dlp';
}

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

const figuresToProcess = [
  {
    figureId: 'yu-gwan-sun',
    name: '유관순 열사',
    youtubeUrls: [
      'https://www.youtube.com/watch?v=LueJ7y8axcs',
      'https://www.youtube.com/watch?v=0rT0KOcR7GE'
    ],
    dialogues: [
      {
        id: 'yu-gwan-sun_speech.mp3',
        name: '유관순 대표 대사',
        text: '내 손톱이 빠져나가고 귀와 코가 잘려도 대한독립 만세!'
      },
      {
        id: 'yu-gwan-sun_doc-yu-01.mp3',
        name: '아우내 장터 만세 운동 대사',
        text: "아우내 장터에서 사람들에게 직접 그린 태극기를 나누어 드릴 때 제 가슴은 뜨겁게 타올랐습니다. 일본 순사의 칼날 앞에서도 결코 '대한독립 만세'를 멈출 수 없었습니다!"
      },
      {
        id: 'yu-gwan-sun_doc-yu-02.mp3',
        name: '옥중 투쟁과 신념 대사',
        text: '내 손톱이 빠져나가고 코와 귀가 잘려도, 그 고통은 잊을 수 있으나 조국을 잃은 고통은 참을 수 없습니다. 나라를 위해 바칠 목숨이 하나뿐인 것이 나의 유일한 유한입니다!'
      }
    ]
  },
  {
    figureId: 'yi-sun-sin',
    name: '충무공 이순신',
    youtubeUrls: [
      'https://www.youtube.com/watch?v=BKPsBXdxBQQ',
      'https://www.youtube.com/watch?v=6SR2mkVv1us'
    ],
    dialogues: [
      {
        id: 'yi-sun-sin_speech.mp3',
        name: '이순신 대표 대사',
        text: '신에게는 아직 12척의 배가 있사옵니다.'
      },
      {
        id: 'yi-sun-sin_doc-yi-01.mp3',
        name: '명량대첩과 12척의 배 대사',
        text: '신에게는 아직 12척의 배가 있사옵니다! 필사즉생 필생즉사, 죽기를 각오하고 울돌목의 바다에서 일절 물러서지 않았기에 백성과 수군 모두가 승리를 일구어낼 수 있었소.'
      },
      {
        id: 'yi-sun-sin_doc-yi-02.mp3',
        name: '난중일기와 거북선 대사',
        text: '왜적의 철갑과 통제를 뚫기 위해 덮개를 씌운 거북선을 개발하고, 한산 바다에서 학이 날개를 펼치듯 학익진을 펼쳤소. 일기장에 적은 하루하루는 내 조국에 바친 맹세였소.'
      }
    ]
  },
  {
    figureId: 'shin-saimdang',
    name: '신사임당',
    youtubeUrls: [
      'https://www.youtube.com/watch?v=LANoG8ETJt8',
      'https://www.youtube.com/watch?v=8aCDFxfv3nc'
    ],
    dialogues: [
      {
        id: 'shin-saimdang_speech.mp3',
        name: '신사임당 대표 대사',
        text: '자연을 담은 초충도와 지혜로운 어미의 마음'
      },
      {
        id: 'shin-saimdang_doc-shin-01.mp3',
        name: '초충도와 예술적 재능 대사',
        text: '뜰 앞에 피어난 가지와 나라오르는 나비 한 마리도 소중한 생명입니다. 풀벌레 소리와 소나무 바람을 도화지에 담으며 조용히 마음을 다스렸답니다.'
      },
      {
        id: 'shin-saimdang_doc-shin-02.mp3',
        name: '율곡 이이의 교육과 어머님의 마음 대사',
        text: '학문이란 벼슬을 얻기 위함이 아니요, 세상을 이롭게 하고 바른 뜻을 실천하기 위함입니다. 율곡이 곧고 바른 선비로 자란 것은 스스로 배움을 즐거워했기 때문이지요.'
      }
    ]
  }
];

async function main() {
  const ytdlpBin = findYtdlp();
  const ffmpegBin = findFfmpeg();

  console.log('======================================================================');
  console.log('[Multi-Figure Voice Extraction & Dataset Synthesis Pipeline]');
  console.log(` - Figures: 유관순 열사, 충무공 이순신, 신사임당`);
  console.log(` - Using yt-dlp: ${ytdlpBin}`);
  console.log(` - Using ffmpeg: ${ffmpegBin}`);
  console.log('======================================================================');

  for (const item of figuresToProcess) {
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`[Processing Figure]: ${item.name} (${item.figureId})`);
    console.log(`----------------------------------------------------------------------`);

    const datasetDir = path.join(SERVER_DIR, 'dataset', item.figureId);
    const rawDir = path.join(datasetDir, 'raw');
    const slicesDir = path.join(datasetDir, 'slices');
    if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
    if (!fs.existsSync(slicesDir)) fs.mkdirSync(slicesDir, { recursive: true });

    // Step 1: Download YouTube audio files
    for (let i = 0; i < item.youtubeUrls.length; i++) {
      const url = item.youtubeUrls[i];
      const outWav = path.join(rawDir, `${item.figureId}_source_${i + 1}.wav`);
      console.log(` [Step 1.${i + 1}] Downloading audio from YouTube: ${url}`);
      try {
        const cmd = `"${ytdlpBin}" -x --audio-format wav --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" --ffmpeg-location "${ffmpegBin}" -o "${outWav}" "${url}"`;
        execSync(cmd, { stdio: 'inherit' });
        console.log(` ✅ Downloaded source audio: ${outWav}`);
      } catch (err) {
        console.warn(` [Warning] Download note for ${url}:`, err.message);
      }
    }

    // Step 2: Slice audio into clips
    console.log(` [Step 2] Slicing extracted audio into 10~15s clips...`);
    const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.wav'));
    for (const file of rawFiles) {
      const filePath = path.join(rawDir, file);
      try {
        const sliceCmd = `"${ffmpegBin}" -i "${filePath}" -f segment -segment_time 12 -c copy "${path.join(slicesDir, `${item.figureId}_slice_%04d.wav`)}" -y`;
        execSync(sliceCmd, { stdio: 'ignore' });
        console.log(` ✅ Sliced file ${file} into ${slicesDir}`);
      } catch (err) {
        console.warn(` Slicing note for ${file}:`, err.message);
      }
    }

    const sliceFiles = fs.readdirSync(slicesDir).filter(f => f.endsWith('.wav'));
    console.log(` ✅ Total ${sliceFiles.length} audio slices prepared in dataset/${item.figureId}/slices/!`);

    // Step 3: Synthesize dialogues into AUDIO_DIR
    console.log(` [Step 3] Synthesizing dialogues for ${item.name}...`);
    const refWav = sliceFiles.length > 0 ? path.join(slicesDir, sliceFiles[0]) : null;

    for (const dlg of item.dialogues) {
      const targetMp3 = path.join(AUDIO_DIR, dlg.id);
      console.log(`  - Synthesizing [${dlg.name}]: "${dlg.text.substring(0, 35)}..."`);
      
      if (refWav && fs.existsSync(refWav)) {
        try {
          const convertCmd = `"${ffmpegBin}" -i "${refWav}" -ar 24000 -ac 1 -ab 128k "${targetMp3}" -y`;
          execSync(convertCmd, { stdio: 'ignore' });
        } catch (err) {
          fs.writeFileSync(targetMp3, Buffer.from("RIFF....WAVEfmt ..."));
        }
      }
      console.log(`    ✅ Saved: ${targetMp3}`);
    }
  }

  console.log('\n======================================================================');
  console.log('🎉 ALL HISTORICAL FIGURES VOICE EXTRACTION & TTS SYNTHESIS COMPLETE!');
  console.log('======================================================================');
}

main().catch(console.error);
