async function main() {
  console.log('🚀 Triggering /api/dialogue for Yu Gwan-sun...');
  const start = Date.now();
  const res = await fetch('http://localhost:3001/api/dialogue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      figureId: 'yu-gwan-sun',
      query: '아우내 장터 만세 운동 이야기를 해주세요.'
    })
  });
  const data = await res.json();
  console.log(`⏱️ Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log('Result:', JSON.stringify(data, null, 2));
}

main().catch(err => console.error('Error:', err));
