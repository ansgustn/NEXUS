import * as googleTTS from 'google-tts-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_DIR = path.join(__dirname, '../../client/public/audio');
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// All historical figures dialogue dataset definitions
const figureDialogues = [
  {
    figureId: 'kim-koo',
    name: '백범 김구',
    items: [
      {
        filename: 'kim-koo_doc-kim-01.mp3',
        topic: '백범일지 및 나의 소원',
        text: "나의 소원이 무엇이냐 하고 하나님이 물으시면, 나는 서슴지 않고 '내 고국의 독립이오'라고 대답할 것이오. 우리 동포들이 기억해야 할 것은 오직 높은 문화의 힘이 우리 동포와 세계를 행복하게 만든다는 사실이오."
      },
      {
        filename: 'kim-koo_doc-kim-02.mp3',
        topic: '상하이 임시정부 및 의거',
        text: "상하이 임시정부에서 우리 임정 요인들과 청년 의사들은 조국의 자주독립을 위해 목숨을 바쳤소. 윤봉길, 이봉창 의사의 거사는 결코 개인의 혈기가 아닌, 겨레의 의지를 세계에 선언한 것이었소."
      },
      {
        filename: 'kim-koo_culture_power.mp3',
        topic: '높은 문화의 힘',
        text: "나는 우리나라가 세계에서 가장 아름다운 나라가 되기를 바란다. 오직 한없이 가지고 싶은 것은 높은 문화의 힘이다. 문화의 힘은 우리 자신을 행복하게 하고 나아가 남에게 행복을 주기 때문이다."
      }
    ]
  },
  {
    figureId: 'king-sejong',
    name: '세종대왕',
    items: [
      {
        filename: 'king-sejong_speech.mp3',
        topic: '훈민정음 창제 (현대어)',
        text: "백성들이 제 뜻을 글로 표현하지 못하는 것이 참으로 안타까웠느니라. 하여 집현전 학사들과 머리를 맞대어 누구나 쉬이 익혀 쓸 수 있는 스물여덟 자를 만들었으니, 이것이 훈민정음이니라."
      },
      {
        filename: 'king-sejong_speech_original.mp3',
        topic: '훈민정음 어제 서문 (원문)',
        text: "나랏말싸미 댯귁에 달라 문자와로 서로 사맛디 아니할쎄, 이런 전차로 어린 백성이 니르고져 홀 배 있어도 마참내 제 뜻을 실어 펼지 못할 놈이 하니라. 내 이를 어엿삐 여겨 새로 스물여덟 자를 맹가노니."
      },
      {
        filename: 'king-sejong_speech_science.mp3',
        topic: '과학기술 및 장영실 등용',
        text: "신분과 출신이 무엇이 중요하겠느냐? 장영실과 같은 재주 있는 자를 아껴 관천대를 세우고 측우기와 해시계를 만들었으니, 이는 오롯이 농업에 힘쓰는 백성들의 삶을 도우려 함이었느니라."
      },
      {
        filename: 'king-sejong_speech_teaching.mp3',
        topic: '애민정신과 성군의 가르침',
        text: "경이 물어본 바에 답하노니, 백성을 위한 학문과 이치가 가장 으뜸이니라. 과인이 내 어여쁜 백성들을 위해 이 깊은 뜻을 전하노라."
      }
    ]
  },
  {
    figureId: 'yi-sun-sin',
    name: '충무공 이순신',
    items: [
      {
        filename: 'yi-sun-sin_speech.mp3',
        topic: '대표 명언',
        text: "신에게는 아직 12척의 배가 있사옵니다."
      },
      {
        filename: 'yi-sun-sin_doc-yi-01.mp3',
        topic: '명량대첩과 12척의 배',
        text: "신에게는 아직 12척의 배가 있사옵니다! 필사즉생 필생즉사, 죽기를 각오하고 울돌목의 바다에서 일절 물러서지 않았기에 백성과 수군 모두가 승리를 일구어낼 수 있었소."
      },
      {
        filename: 'yi-sun-sin_doc-yi-02.mp3',
        topic: '난중일기와 거북선',
        text: "왜적의 철갑과 통제를 뚫기 위해 덮개를 씌운 거북선을 개발하고, 한산 바다에서 학이 날개를 펼치듯 학익진을 펼쳤소. 일기장에 적은 하루하루는 내 조국에 바친 맹세였소."
      }
    ]
  },
  {
    figureId: 'yu-gwan-sun',
    name: '유관순 열사',
    items: [
      {
        filename: 'yu-gwan-sun_speech.mp3',
        topic: '대표 명언',
        text: "내 손톱이 빠져나가고 귀와 코가 잘려도 대한독립 만세!"
      },
      {
        filename: 'yu-gwan-sun_doc-yu-01.mp3',
        topic: '아우내 장터 만세 운동',
        text: "아우내 장터에서 사람들에게 직접 그린 태극기를 나누어 드릴 때 제 가슴은 뜨겁게 타올랐습니다. 일본 순사의 칼날 앞에서도 결코 '대한독립 만세'를 멈출 수 없었습니다!"
      },
      {
        filename: 'yu-gwan-sun_doc-yu-02.mp3',
        topic: '옥중 투쟁과 신념',
        text: "내 손톱이 빠져나가고 코와 귀가 잘려도, 그 고통은 잊을 수 있으나 조국을 잃은 고통은 참을 수 없습니다. 나라를 위해 바칠 목숨이 하나뿐인 것이 나의 유일한 유한입니다!"
      }
    ]
  },
  {
    figureId: 'shin-saimdang',
    name: '신사임당',
    items: [
      {
        filename: 'shin-saimdang_speech.mp3',
        topic: '대표 명언',
        text: "자연을 담은 초충도와 지혜로운 어미의 마음"
      },
      {
        filename: 'shin-saimdang_doc-shin-01.mp3',
        topic: '초충도와 예술적 재능',
        text: "뜰 앞에 피어난 가지와 나라오르는 나비 한 마리도 소중한 생명입니다. 풀벌레 소리와 소나무 바람을 도화지에 담으며 조용히 마음을 다스렸답니다."
      },
      {
        filename: 'shin-saimdang_doc-shin-02.mp3',
        topic: '율곡 이이의 교육과 어머님의 마음',
        text: "학문이란 벼슬을 얻기 위함이 아니요, 세상을 이롭게 하고 바른 뜻을 실천하기 위함입니다. 율곡이 곧고 바른 선비로 자란 것은 스스로 배움을 즐거워했기 때문이지요."
      }
    ]
  }
];

async function generateSpeechFile(text, lang = 'ko', targetPath) {
  try {
    const base64Audio = await googleTTS.getAudioBase64(text, {
      lang: lang,
      slow: false,
      host: 'https://translate.google.com',
      timeout: 15000,
    });
    const buffer = Buffer.from(base64Audio, 'base64');
    fs.writeFileSync(targetPath, buffer);
    console.log(`   ✅ Audio Generated: ${path.basename(targetPath)} (${buffer.length} bytes)`);
    return true;
  } catch (err) {
    console.error(`   ❌ Failed to generate audio for ${path.basename(targetPath)}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('[Nexus AI - Historical Figures Dialogue Audio Synthesizer]');
  console.log('======================================================================');

  let successCount = 0;
  let totalCount = 0;

  for (const group of figureDialogues) {
    console.log(`\n🎙️ [${group.name} (${group.figureId})] 대사 음성 생성 중...`);

    for (const item of group.items) {
      totalCount++;
      const targetPath = path.join(AUDIO_DIR, item.filename);

      // Skip kim-koo_doc-kim-01 and kim-koo_doc-kim-02 as they use user's custom video audio
      if (item.filename === 'kim-koo_doc-kim-01.mp3' || item.filename === 'kim-koo_doc-kim-02.mp3') {
        console.log(`   ⏩ [Preserved Custom Audio]: ${item.filename}`);
        successCount++;
        continue;
      }

      console.log(`   - Generating [${item.topic}]: "${item.text.substring(0, 30)}..."`);
      const ok = await generateSpeechFile(item.text, 'ko', targetPath);
      if (ok) successCount++;
      // Wait 300ms between requests
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log('\n======================================================================');
  console.log(`🎉 Audio Synthesis Complete! (${successCount} / ${totalCount} files ready)`);
  console.log('======================================================================');
}

main().catch(console.error);
