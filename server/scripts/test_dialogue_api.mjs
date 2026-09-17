import fetch from 'node-fetch';

const questions = [
  { figureId: 'kim-koo', query: '백범 김구 선생님의 소원은 무엇이었나요?' },
  { figureId: 'kim-koo', query: '높은 문화의 힘에 대해 말씀해주세요.' },
  { figureId: 'king-sejong', query: '훈민정음을 창제하신 까닭은 무엇인가요?' },
  { figureId: 'yi-sun-sin', query: '명량해전에서 12척 배로 어떻게 이겼나요?' },
  { figureId: 'yu-gwan-sun', query: '아우내 장터 만세 운동 이야기를 해주세요.' },
  { figureId: 'shin-saimdang', query: '초충도 그림을 그리실 때 마음은 어떠셨나요?' }
];

async function run() {
  for (const q of questions) {
    const res = await fetch('http://localhost:3001/api/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figureId: q.figureId, query: q.query })
    });
    const data = await res.json();
    console.log(`[TEST] ${q.figureId} | Video: ${data.videoUrl} | Audio: ${data.audioUrl} | TextLen: ${data.speechText?.length} | CacheHit: ${data.isCacheHit}`);
  }
}

run().catch(console.error);
