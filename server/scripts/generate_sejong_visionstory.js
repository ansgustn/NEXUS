import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateVisionStoryVideo } from '../services/visionstoryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("======================================================================");
  console.log("[King Sejong VisionStory AI Video Generation Pipeline]");
  console.log(" - Figure: king-sejong (세종대왕)");
  console.log(" - Portrait Image: client/public/images/세종.jpg");
  console.log(" - Audio File: client/public/audio/king-sejong_speech.mp3");
  console.log(" - Dialogue Text: 백성들이 제 뜻을 글로 표현하지 못하는 것이 참으로 안타까웠느니라...");
  console.log("======================================================================");

  const imagePath = 'images/세종.jpg';
  const audioPath = 'audio/king-sejong_speech.mp3';
  const text = '백성들이 제 뜻을 글로 표현하지 못하는 것이 참으로 안타까웠느니라. 하여 집현전 학사들과 머리를 맞대어 누구나 쉬이 익혀 쓸 수 있는 스물여덟 자를 만들었으니, 이것이 훈민정음이니라.';

  try {
    const result = await generateVisionStoryVideo({
      figureId: 'king-sejong',
      imagePath,
      audioPath,
      text
    });

    console.log("\n✅ VisionStory AI Video Generation Result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(`\n[VisionStory API Note]: ${err.message}`);
  }
}

main();
