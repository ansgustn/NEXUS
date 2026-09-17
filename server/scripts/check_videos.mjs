import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ffmpeg = 'C:\\Users\\user\\AppData\\Roaming\\Python\\Python314\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const cached = JSON.parse(fs.readFileSync('server/data/cached_dialogues.json', 'utf8'));

for (let i = 0; i < cached.length; i++) {
  const item = cached[i];
  const vPath = path.join('client/public', item.videoUrl);
  try {
    const out = execSync(`"${ffmpeg}" -i "${vPath}" -af "volumedetect" -f null - 2>&1`, { encoding: 'utf8', stdio: 'pipe' });
    const maxVol = out.match(/max_volume: ([-\d.]+) dB/);
    const meanVol = out.match(/mean_volume: ([-\d.]+) dB/);
    console.log(`${i+1}. ${item.figureId} | Max: ${maxVol ? maxVol[1] : 'none'} dB | Mean: ${meanVol ? meanVol[1] : 'none'} dB | ${item.videoUrl}`);
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const maxVol = out.match(/max_volume: ([-\d.]+) dB/);
    const meanVol = out.match(/mean_volume: ([-\d.]+) dB/);
    console.log(`${i+1}. ${item.figureId} | Max: ${maxVol ? maxVol[1] : 'none'} dB | Mean: ${meanVol ? meanVol[1] : 'none'} dB | ${item.videoUrl}`);
  }
}
