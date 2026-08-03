import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local database files
const figuresData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'figures.json'), 'utf-8'));
const docsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'historical_docs.json'), 'utf-8'));

/**
 * Local AI Dialogue Generator (0 Token Cloud API Cost)
 * Matches input text with historical docs and generates figure-specific responses locally.
 */
export function generateDialogueLocally(figureId, userQuery, customPrompt = '') {
  const figure = figuresData.find(f => f.id === figureId);
  if (!figure) {
    throw new Error(`Figure not found: ${figureId}`);
  }

  // Filter docs for this figure
  const figureDocs = docsData.filter(d => d.figureId === figureId);

  // Simple token matching & local intent score
  const queryTokens = userQuery ? userQuery.toLowerCase().split(/\s+/) : [];
  let bestDoc = null;
  let highestScore = -1;

  for (const doc of figureDocs) {
    let score = 0;
    for (const kw of doc.keywords) {
      if (userQuery && userQuery.includes(kw)) {
        score += 3;
      }
      for (const token of queryTokens) {
        if (token.includes(kw) || kw.includes(token)) {
          score += 1;
        }
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestDoc = doc;
    }
  }

  // Default doc fallback if score is zero or user empty prompt
  if (!bestDoc || highestScore === 0) {
    bestDoc = figureDocs[0] || {
      topic: `${figure.name}의 가르침`,
      speechTemplate: figure.description,
      sourceText: `${figure.name}의 역사 기록 데이터베이스`
    };
  }

  // Format response in the tone of historical figure
  let finalSpeech = "";
  if (customPrompt && customPrompt.trim().length > 0) {
    // Custom prompt processing in figure tone
    finalSpeech = applyFigureTone(figureId, customPrompt);
  } else if (highestScore > 0) {
    finalSpeech = bestDoc.speechTemplate;
  } else {
    // Dynamic greeting & introduction if random question
    finalSpeech = generateGenericResponse(figure, userQuery, bestDoc);
  }

  return {
    figure: {
      id: figure.id,
      name: figure.name,
      title: figure.title,
      voiceProfile: figure.voiceProfile,
      portraitUrl: figure.portraitUrl,
      themeColor: figure.themeColor
    },
    matchedTopic: bestDoc.topic,
    speechText: finalSpeech,
    historicalReference: bestDoc.sourceText,
    tokenCost: 0,
    engine: "Local NLP/SLM Engine (Offline Zero-Token)"
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

function generateGenericResponse(figure, query, doc) {
  switch (figure.id) {
    case 'king-sejong':
      return `경이 물어본 바에 답하노니, ${doc.speechTemplate} 백성을 위한 학문과 이치가 가장 으뜸이니라.`;
    case 'kim-koo':
      return `반갑소 동포여! ${doc.speechTemplate} 겨레의 독립과 문화의 힘이 가장 중요하오.`;
    case 'yi-sun-sin':
      return `반갑도다. ${doc.speechTemplate} 그 어떤 난관이 있어도 불굴의 의지를 가져야 함을 명심하라.`;
    case 'yu-gwan-sun':
      return `반갑습니다! ${doc.speechTemplate} 우리 모두 겨레의 자유와 정의를 위해 당당히 나아갑시다!`;
    case 'shin-saimdang':
      return `어서 오세요. ${doc.speechTemplate} 마음 속에 고요함과 따뜻함을 담아 거닐어 보세요.`;
    default:
      return doc.speechTemplate;
  }
}
