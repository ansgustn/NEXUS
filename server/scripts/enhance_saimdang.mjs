import { findFfmpeg } from '../services/videoMergerService.js';
import { execSync } from 'child_process';
import fs from 'fs';

const ffmpeg = findFfmpeg();
const src = 'client/public/images/shin-saimdang.webp';
const tmp = 'client/public/images/shin-saimdang_enhanced.webp';

// Enhance contrast/saturation slightly so lips have distinct contrast from pale skin, and scale to 838:1076
const cmd = `"${ffmpeg}" -i "${src}" -vf "eq=contrast=1.16:brightness=-0.02:saturation=1.25,scale=838:1076:flags=lanczos" -c:v libwebp -lossless 0 -q:v 95 "${tmp}" -y`;
execSync(cmd, { stdio: 'inherit' });

if (fs.existsSync(tmp) && fs.statSync(tmp).size > 1000) {
  fs.copyFileSync(tmp, src);
  fs.unlinkSync(tmp);
  console.log('✅ Successfully enhanced and sized Shin Saimdang image to 838x1076!');
}
