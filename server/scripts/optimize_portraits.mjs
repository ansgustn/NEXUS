import { findFfmpeg } from '../services/videoMergerService.js';
import { execSync } from 'child_process';
import fs from 'fs';

const ffmpeg = findFfmpeg();

// Ensure both yu-gwan-sun and shin-saimdang are exactly 838x1076 with clean facial contrast
const figuresToOptimize = [
  {
    name: 'shin-saimdang',
    vf: 'eq=contrast=1.16:brightness=-0.02:saturation=1.25,scale=838:1076:flags=lanczos'
  },
  {
    name: 'yu-gwan-sun',
    vf: 'eq=contrast=1.12:brightness=-0.02,scale=838:1076:flags=lanczos'
  }
];

for (const fig of figuresToOptimize) {
  const src = `client/public/images/${fig.name}.webp`;
  const tmp = `client/public/images/${fig.name}_opt.webp`;
  const cmd = `"${ffmpeg}" -i "${src}" -vf "${fig.vf}" -c:v libwebp -lossless 0 -q:v 95 "${tmp}" -y`;
  execSync(cmd, { stdio: 'inherit' });
  if (fs.existsSync(tmp) && fs.statSync(tmp).size > 1000) {
    fs.copyFileSync(tmp, src);
    fs.unlinkSync(tmp);
    console.log(`✅ Optimized ${fig.name}.webp -> 838x1076`);
  }
}
