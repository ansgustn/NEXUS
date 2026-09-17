import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORICAL_DOCS_PATH = path.join(__dirname, '../data/historical_docs.json');

let cachedDocs = null;
let lastMtime = 0;

/**
 * Load historical documents with automatic cache invalidation if file changes on disk
 */
export function getHistoricalDocs() {
  try {
    if (!fs.existsSync(HISTORICAL_DOCS_PATH)) {
      return [];
    }
    const stat = fs.statSync(HISTORICAL_DOCS_PATH);
    if (!cachedDocs || stat.mtimeMs > lastMtime) {
      const data = fs.readFileSync(HISTORICAL_DOCS_PATH, 'utf-8');
      cachedDocs = JSON.parse(data);
      lastMtime = stat.mtimeMs;
      console.log(`📚 [RAG Engine] Loaded ${cachedDocs.length} historical documents from disk.`);
    }
    return cachedDocs;
  } catch (err) {
    console.error(`[RAG Engine Error] Failed to read historical docs:`, err.message);
    return cachedDocs || [];
  }
}

/**
 * Core distinguishing keywords per historical topic (Heavy Anchor Weights)
 */
const TOPIC_ANCHOR_KEYWORDS = {
  // 충무공 이순신
  '거북선': { topicId: 'doc-yi-02', weight: 30 },
  '거북선의': { topicId: 'doc-yi-02', weight: 30 },
  '어떤구조': { topicId: 'doc-yi-02', weight: 25 },
  '구조': { topicId: 'doc-yi-02', weight: 20 },
  '용머리': { topicId: 'doc-yi-02', weight: 25 },
  '용두': { topicId: 'doc-yi-02', weight: 25 },
  '쇠송곳': { topicId: 'doc-yi-02', weight: 25 },
  '송곳': { topicId: 'doc-yi-02', weight: 20 },
  '철갑': { topicId: 'doc-yi-02', weight: 20 },
  '돌격선': { topicId: 'doc-yi-02', weight: 25 },
  '판옥선': { topicId: 'doc-yi-02', weight: 20 },
  '귀선': { topicId: 'doc-yi-02', weight: 25 },
  '덮개': { topicId: 'doc-yi-02', weight: 20 },
  '건조': { topicId: 'doc-yi-02', weight: 20 },

  '12척': { topicId: 'doc-yi-01', weight: 30 },
  '열두척': { topicId: 'doc-yi-01', weight: 30 },
  '명량': { topicId: 'doc-yi-01', weight: 30 },
  '명량해전': { topicId: 'doc-yi-01', weight: 30 },
  '명량대첩': { topicId: 'doc-yi-01', weight: 30 },
  '울돌목': { topicId: 'doc-yi-01', weight: 25 },
  '필사즉생': { topicId: 'doc-yi-01', weight: 25 },

  '난중일기': { topicId: 'doc-yi-03', weight: 30 },
  '일기': { topicId: 'doc-yi-03', weight: 20 },
  '한산섬': { topicId: 'doc-yi-03', weight: 25 },
  '수루': { topicId: 'doc-yi-03', weight: 25 },
  '어머니': { topicId: 'doc-yi-03', weight: 20 },

  '학익진': { topicId: 'doc-yi-04', weight: 30 },
  '한산도': { topicId: 'doc-yi-04', weight: 30 },
  '한산도대첩': { topicId: 'doc-yi-04', weight: 30 },
  '전법': { topicId: 'doc-yi-04', weight: 20 },
  '진법': { topicId: 'doc-yi-04', weight: 20 },

  // 세종대왕
  '훈민정음': { topicId: 'doc-sejong-01', weight: 30 },
  '한글': { topicId: 'doc-sejong-01', weight: 30 },
  '나랏말싸미': { topicId: 'doc-sejong-01', weight: 30 },
  '스물여덟': { topicId: 'doc-sejong-01', weight: 25 },
  '집현전': { topicId: 'doc-sejong-01', weight: 20 },

  '측우기': { topicId: 'doc-sejong-02', weight: 30 },
  '앙부일구': { topicId: 'doc-sejong-02', weight: 30 },
  '자격루': { topicId: 'doc-sejong-02', weight: 30 },
  '장영실': { topicId: 'doc-sejong-02', weight: 30 },
  '해시계': { topicId: 'doc-sejong-02', weight: 25 },
  '물시계': { topicId: 'doc-sejong-02', weight: 25 },
  '과학': { topicId: 'doc-sejong-02', weight: 20 },

  '애민': { topicId: 'doc-sejong-03', weight: 25 },
  '백성을 위한': { topicId: 'doc-sejong-03', weight: 25 },
  '정책': { topicId: 'doc-sejong-03', weight: 20 },

  // 백범 김구
  '소원': { topicId: 'doc-kim-01', weight: 30 },
  '나의 소원': { topicId: 'doc-kim-01', weight: 30 },
  '백범일지': { topicId: 'doc-kim-01', weight: 30 },

  '상하이': { topicId: 'doc-kim-02', weight: 30 },
  '임시정부': { topicId: 'doc-kim-02', weight: 30 },
  '윤봉길': { topicId: 'doc-kim-02', weight: 30 },
  '이봉창': { topicId: 'doc-kim-02', weight: 30 },
  '의거': { topicId: 'doc-kim-02', weight: 25 },

  '문화': { topicId: 'doc-kim-03', weight: 25 },
  '문화의 힘': { topicId: 'doc-kim-03', weight: 30 },
  '오직 가지고 싶은 것': { topicId: 'doc-kim-03', weight: 30 },

  '아름다운 나라': { topicId: 'doc-kim-04', weight: 30 },
  '세계에서 가장 아름다운': { topicId: 'doc-kim-04', weight: 30 },

  // 유관순 열사
  '아우내': { topicId: 'doc-yu-01', weight: 30 },
  '만세운동': { topicId: 'doc-yu-01', weight: 30 },
  '천안': { topicId: 'doc-yu-01', weight: 25 },
  '태극기': { topicId: 'doc-yu-01', weight: 25 },

  '서대문형무소': { topicId: 'doc-yu-02', weight: 30 },
  '옥중': { topicId: 'doc-yu-02', weight: 30 },
  '손톱': { topicId: 'doc-yu-02', weight: 30 },
  '고문': { topicId: 'doc-yu-02', weight: 25 },

  '청년': { topicId: 'doc-yu-03', weight: 30 },
  '젊은이': { topicId: 'doc-yu-03', weight: 30 },
  '당부': { topicId: 'doc-yu-03', weight: 25 },
  '미래': { topicId: 'doc-yu-03', weight: 20 },

  // 신사임당
  '초충도': { topicId: 'doc-shin-01', weight: 30 },
  '풀벌레': { topicId: 'doc-shin-01', weight: 30 },
  '그림': { topicId: 'doc-shin-01', weight: 20 },
  '나비': { topicId: 'doc-shin-01', weight: 25 },

  '율곡': { topicId: 'doc-shin-02', weight: 30 },
  '이이': { topicId: 'doc-shin-02', weight: 30 },
  '교육': { topicId: 'doc-shin-02', weight: 25 },
  '교육관': { topicId: 'doc-shin-02', weight: 25 },

  '자연': { topicId: 'doc-shin-03', weight: 25 },
  '시문': { topicId: 'doc-shin-03', weight: 25 },
  '시조': { topicId: 'doc-shin-03', weight: 25 },
  '풍경': { topicId: 'doc-shin-03', weight: 20 },
  '바람': { topicId: 'doc-shin-03', weight: 20 },

  // --- 화폐 / 지폐 / 초상화 (인물별 화폐 주제) ---
  '오만원': { topicId: 'doc-shin-04', weight: 40 },
  '5만원': { topicId: 'doc-shin-04', weight: 40 },
  '오만원권': { topicId: 'doc-shin-04', weight: 45 },
  '5만원권': { topicId: 'doc-shin-04', weight: 45 },

  '만원': { topicId: 'doc-sejong-04', weight: 40 },
  '1만원': { topicId: 'doc-sejong-04', weight: 40 },
  '만원권': { topicId: 'doc-sejong-04', weight: 45 },
  '1만원권': { topicId: 'doc-sejong-04', weight: 45 },

  '백원': { topicId: 'doc-yi-04', weight: 40 },
  '100원': { topicId: 'doc-yi-04', weight: 40 },
  '백원짜리': { topicId: 'doc-yi-04', weight: 45 },
  '동전': { topicId: 'doc-yi-04', weight: 35 },
  '주화': { topicId: 'doc-yi-04', weight: 35 },

  '십만원': { topicId: 'doc-kim-04', weight: 40 },
  '10만원': { topicId: 'doc-kim-04', weight: 40 },
  '십만원권': { topicId: 'doc-kim-04', weight: 45 },
  '10만원권': { topicId: 'doc-kim-04', weight: 45 }
};

const FIGURE_CURRENCY_DOCS = {
  'shin-saimdang': 'doc-shin-04',
  'king-sejong': 'doc-sejong-04',
  'yi-sun-sin': 'doc-yi-04',
  'kim-koo': 'doc-kim-04',
  'yu-gwan-sun': 'doc-yu-04'
};

const GENERIC_QUESTION_WORDS = new Set([
  '생각', '어떻게', '말씀', '대해', '알려', '무엇', '어떤', '있나요', '했나요',
  '인가요', '하나요', '궁금', '이야기', '소감', '의견', '시', '순리', '마음'
]);

/**
 * Retrieve the most accurate Historical RAG Document for a figure and query
 * Returns { matchedDoc, score, isConfident, matchDetails }
 */
export function retrieveRAGDocument(figureId, userQuery) {
  if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
    return { matchedDoc: null, score: 0, isConfident: false };
  }

  const docs = getHistoricalDocs();
  const figureDocs = docs.filter(d => d.figureId === figureId);
  if (figureDocs.length === 0) {
    return { matchedDoc: null, score: 0, isConfident: false };
  }

  const cleanQuery = userQuery.trim().toLowerCase();
  const queryNoSpace = cleanQuery.replace(/\s+/g, '');
  const queryTokens = cleanQuery.split(/\s+/).filter(t => t.length >= 2);

  let bestDoc = null;
  let highestScore = 0;
  let matchReason = '';

  const currencyDocId = FIGURE_CURRENCY_DOCS[figureId];
  const isCurrencyQuery = ['화폐', '지폐', '초상화', '지폐인물', '화폐인물', '한국은행', '돈에', '얼굴이'].some(kw => 
    cleanQuery.includes(kw) || queryNoSpace.includes(kw)
  );

  for (const doc of figureDocs) {
    let score = 0;
    const reasons = [];

    // 1. Currency Query Direct Router
    if (isCurrencyQuery && currencyDocId && doc.id === currencyDocId) {
      score += 50;
      reasons.push(`CurrencyAnchorRouter(+50)`);
    }

    // 2. Topic Anchor Keyword Check (Highest Precision)
    for (const [kw, anchor] of Object.entries(TOPIC_ANCHOR_KEYWORDS)) {
      if (anchor.topicId === doc.id) {
        if (cleanQuery.includes(kw.toLowerCase()) || queryNoSpace.includes(kw.toLowerCase())) {
          score += anchor.weight;
          reasons.push(`Anchor("${kw}": +${anchor.weight})`);
        }
      }
    }

    // 3. Keywords in doc metadata (Guarded against single-syllable & generic conversational words)
    if (Array.isArray(doc.keywords)) {
      for (const kw of doc.keywords) {
        const kwLower = kw.toLowerCase();
        if (kwLower.length < 2 || GENERIC_QUESTION_WORDS.has(kwLower)) {
          continue; // Skip generic verbs/adverbs like '생각', '어떻게', '시'
        }
        if (cleanQuery.includes(kwLower) || queryNoSpace.includes(kwLower)) {
          score += 10;
          reasons.push(`Keyword("${kw}": +10)`);
        }
        for (const token of queryTokens) {
          if (token.length >= 2 && !GENERIC_QUESTION_WORDS.has(token) && (token.includes(kwLower) || kwLower.includes(token))) {
            score += 3;
          }
        }
      }
    }

    // 4. Topic string overlap
    const docTopicLower = doc.topic.toLowerCase();
    if (cleanQuery.includes(docTopicLower) || docTopicLower.includes(cleanQuery)) {
      score += 15;
      reasons.push(`TopicMatch(+15)`);
    }
    for (const token of queryTokens) {
      if (!GENERIC_QUESTION_WORDS.has(token) && docTopicLower.includes(token)) {
        score += 4;
      }
    }

    // 5. Source Text / Speech Template stem overlap
    for (const token of queryTokens) {
      if (token.length >= 2 && !GENERIC_QUESTION_WORDS.has(token) && doc.sourceText.includes(token)) {
        score += 1;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestDoc = doc;
      matchReason = reasons.join(', ');
    }
  }

  // A score of >= 10 represents a clear, confident historical topic match
  const isConfident = highestScore >= 10;

  if (isConfident && bestDoc) {
    console.log(`🎯 [RAG Match Success] Figure: '${figureId}' | Query: "${userQuery}" -> Doc: '${bestDoc.id}' (${bestDoc.topic}) | Score: ${highestScore} | [${matchReason}]`);
  } else {
    console.log(`⚡ [RAG No Direct Topic Match] Figure: '${figureId}' | Query: "${userQuery}" | Score: ${highestScore} (Proceed to Conversational Persona)`);
  }

  return {
    matchedDoc: isConfident ? bestDoc : null,
    score: highestScore,
    isConfident,
    matchReason
  };
}
