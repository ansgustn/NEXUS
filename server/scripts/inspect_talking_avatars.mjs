import { execSync } from 'child_process';
const ffmpeg = 'C:\\Users\\user\\AppData\\Roaming\\Python\\Python314\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
for (const v of ['yi-sun-sin_talking_avatar.mp4', 'yu-gwan-sun_talking_avatar.mp4', 'shin-saimdang_talking_avatar.mp4']) {
  try {
    execSync(`"${ffmpeg}" -i "client/public/videos/${v}"`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const dur = out.match(/Duration: ([0-9:.]+)/);
    const stream = out.match(/Stream #0:0.*?: Video: ([^\n]+)/);
    console.log(`${v} -> Dur: ${dur ? dur[1] : 'unknown'}, Video: ${stream ? stream[1] : 'unknown'}`);
  }
}
