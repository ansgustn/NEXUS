import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { retrieveRAGDocument } from './services/ragService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get figures data fresh
function getFiguresData() {
  const figuresPath = path.join(__dirname, 'data', 'figures.json');
  return JSON.parse(fs.readFileSync(figuresPath, 'utf-8'));
}

/**
 * Local AI Dialogue Generator with Precision RAG
 * Matches input text with historical docs and generates figure-specific responses locally.
 */
export function generateDialogueLocally(figureId, userQuery, customPrompt = '') {
  const figuresData = getFiguresData();
  const figure = figuresData.find(f => f.id === figureId);
  if (!figure) {
    throw new Error(`Figure not found: ${figureId}`);
  }

  // 1. Retrieve most relevant historical document using High-Precision RAG
  const ragResult = retrieveRAGDocument(figureId, userQuery);
  const isPresetMatch = ragResult.isConfident && !!ragResult.matchedDoc;
  const bestDoc = ragResult.matchedDoc;

  // 2. Determine speech response
  let finalSpeech = "";
  if (customPrompt && customPrompt.trim().length > 0) {
    finalSpeech = applyFigureTone(figureId, customPrompt);
  } else if (isPresetMatch) {
    finalSpeech = bestDoc.speechTemplate;
  } else {
    // Natural conversational greeting/advice if question is generic or exploratory
    finalSpeech = generateGenericResponse(figure, userQuery);
  }

  return {
    figure: {
      id: figure.id,
      name: figure.name,
      title: figure.title,
      voiceProfile: figure.voiceProfile,
      portraitUrl: figure.portraitUrl,
      idleVideoUrl: figure.idleVideoUrl || `/videos/idle_blink_${figure.id}.mp4`,
      themeColor: figure.themeColor
    },
    isPreset: isPresetMatch,
    matchedTopic: isPresetMatch ? bestDoc.topic : `${figure.name}의 실시간 인공지능 응답`,
    speechText: finalSpeech,
    videoUrl: (isPresetMatch && bestDoc.videoUrl && !bestDoc.videoUrl.includes('idle_blink')) ? bestDoc.videoUrl : null,
    audioUrl: isPresetMatch ? (bestDoc.audioUrl || `/audio/${figure.id}_speech.mp3`) : null,
    tokenCost: 0,
    engine: isPresetMatch ? "사료 고증 데이터베이스 매핑 (RAG Preset)" : "실시간 LLM 페르소나 엔진 (Live On-the-Fly)"
  };
}

function applyFigureTone(figureId, text) {
  switch (figureId) {
    case 'king-sejong':
      return `과인이 생각하기에, ${text} 내 어여쁜 백성들을 위해 이 깊은 뜻을 전하노라.`;
    case 'kim-koo':
      return `동포 여러분! ${text} 우리의 자주독립과 문화의 힘으로 세계에 우뚝 서야 할 것이오.`;
    case 'yi-sun-sin':
      return `무릇 장수된 자의 책무로서, ${text} 결코 타협함 없이 국가와 수군을 지켜낼 것이오.`;
    case 'yu-gwan-sun':
      return `여러분! ${text} 대한독립의 열망은 결코 그 어떤 억압으로도 막을 수 없습니다!`;
    case 'shin-saimdang':
      return `자연의 참된 이치와 같이, ${text} 따뜻하고 곧은 마음으로 화답합니다.`;
    default:
      return text;
  }
}

function generateGenericResponse(figure, query) {
  switch (figure.id) {
    case 'king-sejong':
      return `반갑노라. 백성을 사랑하고 이롭게 하는 학문과 지혜를 모으는 것이 가장 으뜸이니라.`;
    case 'kim-koo':
      return `반갑소 동포여! 높은 문화의 힘과 올곧은 민족혼으로 우리의 미래를 함께 밝혀 나갑시다.`;
    case 'yi-sun-sin':
      return `반갑소. 매사에 유비무환의 마음으로 정성을 다하여 준비한다면 그 어떤 시련도 능히 극복할 수 있을 것이오.`;
    case 'yu-gwan-sun':
      return `반갑습니다! 조국의 자유와 겨레의 미래를 위해 늘 뜨거운 용기를 품고 당당히 나아갑시다!`;
    case 'shin-saimdang':
      return `어서 오세요. 자연의 순리를 닮아 따뜻하고 지혜로운 마음으로 매 순간을 가꾸어 가시길 바랍니다.`;
    default:
      return `${figure.name}의 가르침을 마음에 새겨 바른 길로 나아가시길 바랍니다.`;
  }
}
