import { findFfmpeg } from '../services/videoMergerService.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const ffmpeg = findFfmpeg();
const videoPath = 'client/public/videos/comfy_ltx_shin-saimdang_1788853185050.mp4';
const outDir = 'server/temp_frames_saimdang';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const times = [1, 3, 5, 7, 9, 11, 12.5];

for (const t of times) {
  const outJpg = path.join(outDir, `frame_${t}s.jpg`);
  const cmd = `"${ffmpeg}" -ss ${t} -i "${videoPath}" -vframes 1 -q:v 2 "${outJpg}" -y`;
  execSync(cmd, { stdio: 'ignore' });
  console.log(`Extracted frame at ${t}s -> ${outJpg}`);
}
