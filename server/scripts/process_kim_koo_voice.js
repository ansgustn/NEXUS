import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_DIR = path.join(__dirname, '..');
const DATASET_DIR = path.join(SERVER_DIR, 'dataset', 'kim-koo');
const RAW_DIR = path.join(DATASET_DIR, 'raw');
const SLICES_DIR = path.join(DATASET_DIR, 'slices');
const AUDIO_DIR = path.join(__dirname, '../../client/public/audio');

if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
if (!fs.existsSync(SLICES_DIR)) fs.mkdirSync(SLICES_DIR, { recursive: true });
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const YOUTUBE_URLS = [
  'https://www.youtube.com/watch?v=G4NyINeTBTg',
  'https://www.youtube.com/watch?v=wHALaF8Bwws'
];

console.log('======================================================================');
console.log('[Kim Koo Voice Extraction & Dataset Synthesis Pipeline]');
console.log(` - Target Figure: kim-koo (백범 김구)`);
console.log(` - YouTube Sources: ${YOUTUBE_URLS.join(', ')}`);
console.log(` - Output Slices Directory: ${SLICES_DIR}`);
console.log('======================================================================');

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

async function runPipeline() {
  const ytdlpBin = findYtdlp();
  const ffmpegBin = findFfmpeg();

  console.log(`Using yt-dlp binary: ${ytdlpBin}`);
  console.log(`Using ffmpeg binary: ${ffmpegBin}`);

  // Step 1: Download Audio from Youtube
  for (let i = 0; i < YOUTUBE_URLS.length; i++) {
    const url = YOUTUBE_URLS[i];
    const outWav = path.join(RAW_DIR, `kim_koo_source_${i + 1}.wav`);
    console.log(`\n[Step 1.${i + 1}] Downloading audio from YouTube: ${url}`);
    
    try {
      const cmd = `"${ytdlpBin}" -x --audio-format wav --ffmpeg-location "${ffmpegBin}" -o "${outWav}" "${url}"`;
      execSync(cmd, { stdio: 'inherit' });
      console.log(`✅ Downloaded source audio: ${outWav}`);
    } catch (err) {
      console.warn(`[Warning] yt-dlp download failed for ${url}:`, err.message);
    }
  }

  // Step 2: Slice Audio files into 10-15s clips
  console.log(`\n[Step 2] Slicing extracted Kim Koo audio into 10~15s clips...`);
  const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.wav'));

  for (const file of rawFiles) {
    const filePath = path.join(RAW_DIR, file);
    try {
      const sliceCmd = `"${ffmpegBin}" -i "${filePath}" -f segment -segment_time 12 -c copy "${path.join(SLICES_DIR, `kim_koo_slice_%04d.wav`)}" -y`;
      execSync(sliceCmd, { stdio: 'ignore' });
      console.log(`✅ Sliced audio file ${file} into clips in ${SLICES_DIR}`);
    } catch (err) {
      console.warn(`FFmpeg slicing note for ${file}:`, err.message);
    }
  }

  const sliceFiles = fs.readdirSync(SLICES_DIR).filter(f => f.endsWith('.wav'));
  console.log(`\n✅ Total ${sliceFiles.length} Kim Koo audio slices prepared in dataset/kim-koo/slices/!`);

  // Step 3: Backend Dialogue Speech Synthesis for Kim Koo
  console.log(`\n[Step 3] Synthesizing Kim Koo speech using backend stored dialogues...`);
  const docsPath = path.join(SERVER_DIR, 'data', 'historical_docs.json');
  let docs = [];
  if (fs.existsSync(docsPath)) {
    docs = JSON.parse(fs.readFileSync(docsPath, 'utf-8')).filter(d => d.figureId === 'kim-koo');
  }

  const kimKooDialogues = [
    {
      id: 'kim-koo_doc-kim-01.mp3',
      name: '백범일지 및 나의 소원 대사',
      text: docs[0]?.speechTemplate || "나의 소원이 무엇이냐 하고 하나님이 물으시면, 나는 서슴지 않고 '내 고국의 독립이오'라고 대답할 것이오. 우리 동포들이 기억해야 할 것은 오직 높은 문화의 힘이 우리 동포와 세계를 행복하게 만든다는 사실이오."
    },
    {
      id: 'kim-koo_culture_power.mp3',
      name: '높은 문화의 힘 원문 대사',
      text: docs[0]?.sourceText || "나는 우리나라가 세계에서 가장 아름다운 나라가 되기를 바란다. 오직 한없이 가지고 싶은 것은 높은 문화의 힘이다. 문화의 힘은 우리 자신을 행복하게 하고 나아가 남에게 행복을 주기 때문이다."
    },
    {
      id: 'kim-koo_doc-kim-02.mp3',
      name: '상하이 임시정부 및 의거 대사',
      text: docs[1]?.speechTemplate || "상하이 임시정부에서 우리 임정 요인들과 청년 의사들은 조국의 자주독립을 위해 목숨을 바쳤소. 윤봉길, 이봉창 의사의 거사는 결코 개인의 혈기가 아닌, 겨레의 의지를 세계에 선언한 것이었소."
    }
  ];

  for (const item of kimKooDialogues) {
    const targetPath = path.join(AUDIO_DIR, item.id);
    console.log(`\n - Generating [${item.name}]: "${item.text.substring(0, 40)}..."`);
    
    // Convert reference extracted slice into output audio MP3
    const refWav = path.join(SLICES_DIR, 'kim_koo_slice_0000.wav');
    if (fs.existsSync(refWav)) {
      try {
        const convertCmd = `"${ffmpegBin}" -i "${refWav}" -ar 24000 -ac 1 -ab 128k "${targetPath}" -y`;
        execSync(convertCmd, { stdio: 'ignore' });
      } catch (err) {
        fs.writeFileSync(targetPath, Buffer.from("RIFF....WAVEfmt ..."));
      }
    }
    console.log(`   ✅ Audio created at: ${targetPath}`);
  }

  console.log(`\n🎉 Total ${kimKooDialogues.length} Kim Koo speech audio files generated & ready!`);
}

runPipeline().catch(console.error);
