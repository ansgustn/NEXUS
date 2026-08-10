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

  const queryLower = query.toLowerCase().replace(/[^\w\s가-힣]/g, '');
  const queryTokens = queryLower.split(/\s+/).filter(t => t.length > 0);

  let bestMatch = null;
  let highestScore = 0;

  for (const item of figureCaches) {
    const cacheQueryLower = item.query.toLowerCase().replace(/[^\w\s가-힣]/g, '');
    let score = 0;

    // 1. Exact or Substring match
    if (queryLower === cacheQueryLower) {
      score += 10;
    } else if (queryLower.includes(cacheQueryLower) || cacheQueryLower.includes(queryLower)) {
      score += 6;
    }

    // 2. Keyword token overlap score
    for (const token of queryTokens) {
      if (token.length > 1 && cacheQueryLower.includes(token)) {
        score += 2;
      }
    }

    if (score > highestScore && score >= 4) {
      highestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch) {
    console.log(`🎯 [Intelligent Cache HIT] Match score ${highestScore} for query: "${query}" -> Matched: "${bestMatch.query}"`);
    return {
      isCacheHit: true,
      matchedQuery: bestMatch.query,
      speechText: bestMatch.speechText,
      audioUrl: bestMatch.audioUrl,
      videoUrl: bestMatch.videoUrl,
      cachedAt: bestMatch.createdAt
    };
  }

  console.log(`⚡ [Intelligent Cache MISS] No similar cached video for query: "${query}" -> Triggering Realtime LLM Pipeline`);
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
