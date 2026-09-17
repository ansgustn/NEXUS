import { findFfmpeg } from '../services/videoMergerService.js';
import { execSync } from 'child_process';
import path from 'path';

const ffmpeg = findFfmpeg();
const videos = ['kim-koo_my_wish.mp4', 'kim-koo_shanghai_tmp.mp4', 'kim-koo_culture_power.mp4', 'kim-koo_beautiful_korea.mp4'];

for (const v of videos) {
  const p = path.join('client/public/videos', v);
  try {
    execSync(`"${ffmpeg}" -i "${p}"`, { stdio: 'pipe' });
  } catch (e) {
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    const dur = out.match(/Duration: ([0-9:.]+)/);
    const audio = out.match(/Stream.*Audio:.*/);
    console.log(`${v} -> Duration: ${dur ? dur[1] : 'unknown'}, Audio: ${audio ? 'YES' : 'NO'}`);
  }
}
