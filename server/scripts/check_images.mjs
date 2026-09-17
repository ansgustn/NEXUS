import { findFfmpeg } from '../services/videoMergerService.js';
import { execSync } from 'child_process';

const ffmpeg = findFfmpeg();
const files = ['kim-koo.webp', 'king-sejong.webp', 'yi-sun-sin.webp', 'yu-gwan-sun.webp', 'shin-saimdang.webp'];

for (const f of files) {
  try {
    const out = execSync(`"${ffmpeg}" -i "client/public/images/${f}" 2>&1`).toString();
    const m = out.match(/Stream.*Video:.* ([0-9]+x[0-9]+)/);
    console.log(`${f}: ${m ? m[1] : 'unknown'}`);
  } catch (e) {
    const m = e.stdout?.toString().match(/Stream.*Video:.* ([0-9]+x[0-9]+)/) || e.message.match(/Stream.*Video:.* ([0-9]+x[0-9]+)/);
    console.log(`${f}: ${m ? m[1] : 'error'}`);
  }
}
