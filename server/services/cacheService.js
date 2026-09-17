import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_PATH = path.join(__dirname, '../data/cached_dialogues.json');

// Ensure cache file exists
if (!fs.existsSync(CACHE_PATH)) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify([], null, 2), 'utf-8');
}

/**
 * Load all cached dialogues from disk
 */
export function getCachedDialogues() {
  try {
    const data = fs.readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

/**
 * Search semantic similarity in Cache DB for a given figureId and query
 */
export function findSimilarCachedDialogue(figureId, query) {
  if (!query || query.trim().length === 0) return null;

  const caches = getCachedDialogues();
  const figureCaches = caches.filter(c => c.figureId === figureId);

  // Conversational filler & polite stop words to ignore when measuring content similarity
  const STOP_WORDS = new Set([
    '대해', '대해서', '대하여', '대한', '관해', '관하여', '관한',
    '말씀', '말씀해', '말씀해주세요', '알려', '알려주세요', '이야기', '부탁드립니다', '선생님',
    '어떠', '어떠했나요', '어떠셨나요', '어떻게', '무엇', '무엇인가요', '무엇이었나요', '어떤',
    '인가요', '있나요', '하나요', '했나요', '생각', '생각하시나요', '소감', '소감을', '의견',
    '주세요', '나누어주세요', '있으신가요', '하신가요', '까닭은', '이유는', '이유가', '당신', '당신의',
    '일에', '대답', '답변', '해주세요'
  ]);

  const queryLower = query.toLowerCase().replace(/[^\w\s가-힣]/g, '').trim();
  const queryNoSpace = queryLower.replace(/\s+/g, '');
  const queryTokens = queryLower
    .split(/\s+/)
    .map(t => t.replace(/^(당신의|당신은|당신이|당신에게)/, ''))
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

  let bestMatch = null;
  let highestScore = 0;

  for (const item of figureCaches) {
    const cacheQueryLower = item.query.toLowerCase().replace(/[^\w\s가-힣]/g, '').trim();
    const cacheNoSpace = cacheQueryLower.replace(/\s+/g, '');
    let score = 0;

    // 1. Exact Match
    if (queryLower === cacheQueryLower || queryNoSpace === cacheNoSpace) {
      score += 50;
    } 
    // 2. Substring Match
    else if (queryNoSpace.includes(cacheNoSpace) || cacheNoSpace.includes(queryNoSpace)) {
      score += 35;
    }

    // 3. Meaningful Non-Stop Token Overlap (length >= 2)
    let tokenMatches = 0;
    for (const token of queryTokens) {
      if (cacheQueryLower.includes(token)) {
        score += 15;
        tokenMatches += 1;
      }
    }

    // High confidence threshold (>= 40) or at least 2 substantive token matches to avoid false matches
    if (score > highestScore && (score >= 40 || (score >= 30 && tokenMatches >= 2))) {
      highestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch) {
    console.log(`🎯 [Intelligent Cache HIT] Match score ${Math.round(highestScore)} for query: "${query}" -> Matched: "${bestMatch.query}"`);
    return {
      isCacheHit: true,
      matchedQuery: bestMatch.query,
      speechText: bestMatch.speechText,
      audioUrl: bestMatch.audioUrl,
      videoUrl: bestMatch.videoUrl,
      cachedAt: bestMatch.createdAt
    };
  }

  console.log(`⚡ [Intelligent Cache MISS] No similar cached dialogue for query: "${query}" -> Proceeding to RAG/LLM Pipeline`);
  return null;
}

/**
 * Save newly generated LLM Answer + TTS Audio + Image-to-Video MP4 to Cache DB
 */
export function saveToSimilarityCache({ figureId, query, speechText, audioUrl, videoUrl }) {
  if (!figureId || !query || !speechText) return;

  try {
    const caches = getCachedDialogues();

    // Check if duplicate query already exists
    const existingIndex = caches.findIndex(c => c.figureId === figureId && c.query.trim() === query.trim());

    const cacheItem = {
      id: `cache_${Date.now()}`,
      figureId,
      query: query.trim(),
      speechText,
      audioUrl,
      videoUrl,
      createdAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      caches[existingIndex] = cacheItem;
    } else {
      caches.push(cacheItem);
    }

    fs.writeFileSync(CACHE_PATH, JSON.stringify(caches, null, 2), 'utf-8');
    console.log(`💾 [Intelligent Cache SAVED] Cached Q&A + Video bundle for '${figureId}': "${query}" (Total items: ${caches.length})`);
  } catch (err) {
    console.error(`[Cache Save Error]:`, err.message);
  }
}
