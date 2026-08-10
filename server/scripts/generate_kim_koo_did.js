import fs from 'fs';
import path from 'path';
import { generateDIDVideo } from '../services/didService.js';

async function main() {
  console.log("======================================================================");
  console.log("[Kim Koo D-ID AI Video Generation Pipeline]");
  console.log(" - Figure: kim-koo (백범 김구)");
  console.log(" - Portrait Image: client/public/images/kim-koo.jpg");
  console.log(" - Audio File: client/public/audio/kim-koo_doc-kim-01.mp3");
  console.log("======================================================================");

  const sourceUrl = 'images/kim-koo.jpg';
  const text = "나의 소원이 무엇이냐 하고 하나님이 물으시면, 나는 서슴지 않고 '내 고국의 독립이오'라고 대답할 것이오. 우리 동포들이 기억해야 할 것은 오직 높은 문화의 힘이 우리 동포와 세계를 행복하게 만든다는 사실이오.";

  try {
    const result = await generateDIDVideo({
      sourceUrl,
      text,
      voiceId: 'ko-KR-InJoonNeural'
    });

    console.log('\n✅ D-ID AI Video Generation Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.rawUrl) {
      console.log(`\n🎉 Downloading clean D-ID video from: ${result.rawUrl}`);
      const resp = await fetch(result.rawUrl);
      if (resp.ok) {
        const buffer = Buffer.from(await resp.arrayBuffer());
        const dest = path.join(process.cwd(), 'client/public/videos/kim-koo_talking_avatar.mp4');
        fs.writeFileSync(dest, buffer);
        console.log(`✅ Saved to: ${dest} (${buffer.length} bytes)`);
      }
    }
  } catch (err) {
    console.error('\n❌ D-ID AI Video Generation Error:', err.message);
  }
}

main();
