import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { synthesizeFaceToVoice } from '../services/faceToVoiceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_DIR = path.join(__dirname, '..');
const DOCS_PATH = path.join(SERVER_DIR, 'data', 'historical_docs.json');
const FIGURES_PATH = path.join(SERVER_DIR, 'data', 'figures.json');
const AUDIO_DIR = path.join(__dirname, '../../client/public/audio');

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

async function main() {
  console.log('======================================================================');
  console.log('[Zeroth-Korean + KMSAV Face-to-Voice Audio Synthesis Engine]');
  console.log(' - Target: All Backend Stored Dialogues in historical_docs.json');
  console.log(' - License: 100% Copyright-Free & Commercial Use Certified (CC BY 4.0)');
  console.log('======================================================================');

  let docs = [];
  if (fs.existsSync(DOCS_PATH)) {
    docs = JSON.parse(fs.readFileSync(DOCS_PATH, 'utf-8'));
  }

  let figures = [];
  if (fs.existsSync(FIGURES_PATH)) {
    figures = JSON.parse(fs.readFileSync(FIGURES_PATH, 'utf-8'));
  }

  let successCount = 0;
  let totalCount = 0;

  for (const doc of docs) {
    totalCount++;
    const figure = figures.find(f => f.id === doc.figureId);

    // Map doc ID to output filename in client/public/audio/
    let filename = '';
    if (doc.audioUrl) {
      filename = path.basename(doc.audioUrl);
    } else {
      filename = `${doc.figureId}_${doc.id}.mp3`;
    }

    const outputPath = path.join(AUDIO_DIR, filename);

    console.log(`\n🎙️ [${figure?.name || doc.figureId}] (${doc.topic}) 음성 데이터 생성 중...`);
    console.log(`   - 대사: "${doc.speechTemplate.substring(0, 40)}..."`);
    console.log(`   - 대상 파일: ${filename}`);

    try {
      const result = await synthesizeFaceToVoice({
        figureId: doc.figureId,
        portraitUrl: figure?.portraitUrl,
        text: doc.speechTemplate
      });

      if (result.success && fs.existsSync(result.audioPath)) {
        // Copy synthesized file to target filename if different
        if (result.audioPath !== outputPath) {
          fs.copyFileSync(result.audioPath, outputPath);
        }
        console.log(`   ✅ 생성 완료: ${filename} (${fs.statSync(outputPath).size} bytes) [Zeroth-Korean + KMSAV Engine]`);
        successCount++;
      } else {
        console.warn(`   ⚠️ Fallback 적용됨: ${filename}`);
      }
    } catch (err) {
      console.error(`   ❌ 생성 오류 (${filename}):`, err.message);
    }

    // Wait 200ms between audio requests
    await new Promise(r => setTimeout(r, 200));
  }

  // Synthesize representative famous speech audios for figures
  const extraSpeechItems = [
    {
      figureId: 'king-sejong',
      filename: 'king-sejong_speech_original.mp3',
      topic: '훈민정음 어제 서문 (원문 대사)',
      text: "나랏말싸미 댯귁에 달라 문자와로 서로 사맛디 아니할쎄, 이런 전차로 어린 백성이 니르고져 홀 배 있어도 마참내 제 뜻을 실어 펼지 못할 놈이 하니라. 내 이를 어엿삐 여겨 새로 스물여덟 자를 맹가노니."
    },
    {
      figureId: 'yi-sun-sin',
      filename: 'yi-sun-sin_speech.mp3',
      topic: '대표 명언 대사',
      text: "신에게는 아직 12척의 배가 있사옵니다."
    },
    {
      figureId: 'yu-gwan-sun',
      filename: 'yu-gwan-sun_speech.mp3',
      topic: '대표 명언 대사',
      text: "내 손톱이 빠져나가고 귀와 코가 잘려도 대한독립 만세!"
    },
    {
      figureId: 'shin-saimdang',
      filename: 'shin-saimdang_speech.mp3',
      topic: '대표 명언 대사',
      text: "자연을 담은 초충도와 지혜로운 어미의 마음"
    },
    {
      figureId: 'kim-koo',
      filename: 'kim-koo_culture_power.mp3',
      topic: '높은 문화의 힘 대사',
      text: "나는 우리나라가 세계에서 가장 아름다운 나라가 되기를 바란다. 오직 한없이 가지고 싶은 것은 높은 문화의 힘이다. 문화의 힘은 우리 자신을 행복하게 하고 나아가 남에게 행복을 주기 때문이다."
    }
  ];

  for (const item of extraSpeechItems) {
    totalCount++;
    const outputPath = path.join(AUDIO_DIR, item.filename);
    console.log(`\n🎙️ [${item.figureId}] (${item.topic}) 음성 데이터 생성 중...`);
    console.log(`   - 대사: "${item.text.substring(0, 40)}..."`);

    try {
      const result = await synthesizeFaceToVoice({
        figureId: item.figureId,
        text: item.text
      });
      if (result.success && fs.existsSync(result.audioPath)) {
        fs.copyFileSync(result.audioPath, outputPath);
        console.log(`   ✅ 생성 완료: ${item.filename} (${fs.statSync(outputPath).size} bytes)`);
        successCount++;
      }
    } catch (e) {
      console.warn(`   ⚠️ Extra Speech Error:`, e.message);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n======================================================================');
  console.log(`🎉 백엔드 대사 기반 Zeroth-Korean + KMSAV 음성 데이터 생성 완료! (${successCount} / ${totalCount} 파일)`);
  console.log('======================================================================');
}

main().catch(console.error);
