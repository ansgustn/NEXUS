async function main() {
  console.log('🚀 Triggering /api/dialogue for Shin Saimdang...');
  const start = Date.now();
  const res = await fetch('http://localhost:3001/api/dialogue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      figureId: 'shin-saimdang',
      query: '초충도에 대해 설명해주세요.'
    })
  });
  const data = await res.json();
  console.log(`⏱️ Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log('Result:', JSON.stringify(data, null, 2));
}

main().catch(err => console.error('Error:', err));
