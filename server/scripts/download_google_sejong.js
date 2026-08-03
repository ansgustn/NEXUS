import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function downloadSejongImages() {
  const targetDir = path.join(__dirname, '../../client/public/images');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  // Query Wikipedia API for 10000 won note image info
  const fileTitles = [
    'File:10000_won_serieVI_obverse.jpeg',
    'File:Portrait_of_King_Sejong_1965.jpg',
    'File:King_Sejong_Statue.jpg'
  ];

  const headers = { 'User-Agent': 'NexusApp/1.0 (https://nexus.example.com; contact@nexus.example.com)' };

  for (const title of fileTitles) {
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`;
      console.log(`[Wiki API] Fetching info for: ${title}`);
      const resp = await fetch(url, { headers });
      const data = await resp.json();
      const pages = data.query?.pages || {};
      for (const p in pages) {
        const info = pages[p].imageinfo?.[0];
        if (info?.url) {
          console.log(` -> Downloading image: ${info.url}`);
          const imgResp = await fetch(info.url, { headers });
          if (imgResp.ok) {
            const buffer = Buffer.from(await imgResp.arrayBuffer());
            const fileName = `sejong_real_${path.basename(title).replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
            const dest = path.join(targetDir, fileName);
            fs.writeFileSync(dest, buffer);
            console.log(`✅ Saved: ${dest} (${buffer.length} bytes)`);
          }
        }
      }
    } catch (err) {
      console.warn(`Error for ${title}:`, err.message);
    }
  }
}

downloadSejongImages().catch(console.error);
