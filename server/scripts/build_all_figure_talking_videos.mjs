import { findFfmpeg } from '../services/videoMergerService.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const ffmpeg = findFfmpeg();
const publicDir = 'client/public';

const jobs = [
  // Yi Sun-sin
  { video: 'yi-sun-sin_talking_avatar.mp4', audio: 'yi-sun-sin_doc-yi-01.mp3', out: 'yi-sun-sin_doc-yi-01.mp4' },
  { video: 'yi-sun-sin_talking_avatar.mp4', audio: 'yi-sun-sin_doc-yi-02.mp3', out: 'yi-sun-sin_doc-yi-02.mp4' },
  { video: 'yi-sun-sin_talking_avatar.mp4', audio: 'yi-sun-sin_doc-yi-03.mp3', out: 'yi-sun-sin_doc-yi-03.mp4' },

  // Yu Gwan-sun
  { video: 'yu-gwan-sun_talking_avatar.mp4', audio: 'yu-gwan-sun_doc-yu-01.mp3', out: 'yu-gwan-sun_doc-yu-01.mp4' },
  { video: 'yu-gwan-sun_talking_avatar.mp4', audio: 'yu-gwan-sun_doc-yu-02.mp3', out: 'yu-gwan-sun_doc-yu-02.mp4' },
  { video: 'yu-gwan-sun_talking_avatar.mp4', audio: 'yu-gwan-sun_doc-yu-03.mp3', out: 'yu-gwan-sun_doc-yu-03.mp4' },

  // Shin Saimdang
  { video: 'shin-saimdang_talking_avatar.mp4', audio: 'synced_shin-saimdang_1788853185055.mp3', out: 'shin-saimdang_doc-shin-01.mp4' },
  { video: 'shin-saimdang_talking_avatar.mp4', audio: 'shin-saimdang_doc-shin-02.mp3', out: 'shin-saimdang_doc-shin-02.mp4' },
  { video: 'shin-saimdang_talking_avatar.mp4', audio: 'shin-saimdang_doc-shin-03.mp3', out: 'shin-saimdang_doc-shin-03.mp4' }
];

console.log('Using ffmpeg:', ffmpeg);

for (const j of jobs) {
  const vPath = path.join(publicDir, 'videos', j.video);
  const aPath = path.join(publicDir, 'audio', j.audio);
  const oPath = path.join(publicDir, 'videos', j.out);

  if (!fs.existsSync(vPath) || !fs.existsSync(aPath)) {
    console.log('Skipping missing:', j);
    continue;
  }

  console.log('Generating:', j.out);
  const cmd = `"${ffmpeg}" -y -stream_loop -1 -i "${vPath}" -i "${aPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest -movflags +faststart "${oPath}"`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log('✅ Generated:', j.out, 'size:', fs.statSync(oPath).size);
  } catch (e) {
    console.error('Error generating ' + j.out + ':', e.message);
  }
}

console.log('All jobs completed!');
