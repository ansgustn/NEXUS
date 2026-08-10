import fs from 'fs';
import path from 'path';

async function checkTask() {
  const apiKey = process.env.VISIONSTORY_API_KEY || 'sk-vs-P7YupP6Csy2tzrzNR1Uu3h6kccr1X5VHNWc3Pe11ZUSdtKcP';
  const taskId = '8376042568934494098';
  const url = `https://openapi.visionstory.ai/api/v1/video?video_id=${taskId}`;

  console.log(`Checking VisionStory Task ID: ${taskId}...`);
  const resp = await fetch(url, {
    headers: { 'X-API-Key': apiKey }
  });

  const data = await resp.json();
  console.log('Result:', JSON.stringify(data, null, 2));

  if (data.data?.video_url) {
    console.log(`\n🎉 Task Completed! Downloading video from: ${data.data.video_url}`);
    const vidResp = await fetch(data.data.video_url);
    if (vidResp.ok) {
      const buffer = Buffer.from(await vidResp.arrayBuffer());
      const dest = path.join(process.cwd(), 'client/public/videos/kim-koo_vtalk_full.mp4');
      const destMain = path.join(process.cwd(), 'client/public/videos/kim-koo_talking_avatar.mp4');
      fs.writeFileSync(dest, buffer);
      fs.writeFileSync(destMain, buffer);
      console.log(`✅ Saved to: ${dest} (${buffer.length} bytes)`);
    }
  }
}

checkTask().catch(console.error);
