import path from 'path';
import { fileURLToPath } from 'url';
import { generateVisionStoryVideo } from '../services/visionstoryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("======================================================================");
  console.log("[Kim Koo VisionStory AI Video Generation Pipeline (v-talk)]");
  console.log(" - Figure: kim-koo (백범 김구)");
  console.log(" - Model: v-talk");
  console.log(" - Portrait Image: client/public/images/kim-koo.webp");
  console.log(" - Audio File: client/public/audio/kim-koo_doc-kim-01.mp3");
  console.log(" - Dialogue Text: 나의 소원이 무엇이냐 하고 하나님이 물으시면...");
  console.log("======================================================================");

  const imagePath = 'images/kim-koo.jpg';
  const audioPath = 'audio/kim-koo_doc-kim-01.mp3';
  const text = "나의 소원이 무엇이냐 하고 하나님이 물으시면, 나는 서슴지 않고 '내 고국의 독립이오'라고 대답할 것이오. 우리 동포들이 기억해야 할 것은 오직 높은 문화의 힘이 우리 동포와 세계를 행복하게 만든다는 사실이오.";

  try {
    const result = await generateVisionStoryVideo({
      figureId: 'kim-koo',
      imagePath,
      audioPath,
      text,
      modelId: 'vs_character_v4'
    });

    console.log('\n✅ VisionStory AI Video Generation Result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('\n❌ VisionStory AI Video Generation Error:', err.message);
  }
}

main();
