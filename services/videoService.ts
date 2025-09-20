// Timestamp: 2024-09-12T10:00:00Z - Refresh
import { Scene, GeminiSceneResponseItem, KenBurnsConfig, AspectRatio } from '../types.ts';
import {
  FALLBACK_FOOTAGE_KEYWORDS,
  AVERAGE_WORDS_PER_SECOND,
  MAX_SCENE_DURATION_SECONDS,
  MIN_SCENE_DURATION_SECONDS,
  TARGET_VIDEO_DURATION_MINUTES
} from '../constants.ts';
import { generateImageWithImagen } from './geminiService.ts';

// Simple hash helper used to derive deterministic offsets for placeholder
// footage searches so different scenes are less likely to return
// identical results from Wikimedia Commons.
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

const MAX_SCENE_PROCESSING_CONCURRENCY = 4;

// Helper to generate Ken Burns configuration for a scene with viral YouTube-style effects
const generateSceneKenBurnsConfig = (duration: number): KenBurnsConfig => {
    // More dramatic scaling for viral appeal
    const baseScale = 1.1 + Math.random() * 0.2; // 1.1 to 1.3 for more impact
    const endScale = Math.min(1.4, baseScale + (duration > 10 ? 0.1 : 0)); // Longer scenes get more zoom
    
    // More dynamic movement patterns
    const movementIntensity = duration > 8 ? 15 : 12; // Longer scenes get more movement
    const endXPercent = (Math.random() - 0.5) * movementIntensity; // -7.5% to +7.5% or -6% to +6%
    const endYPercent = (Math.random() - 0.5) * movementIntensity;
    
    // Strategic origin positioning for better composition
    const originOptions = [
        { x: 0.2, y: 0.2 }, // Top-left
        { x: 0.8, y: 0.2 }, // Top-right  
        { x: 0.2, y: 0.8 }, // Bottom-left
        { x: 0.8, y: 0.8 }, // Bottom-right
        { x: 0.5, y: 0.3 }, // Center-top
        { x: 0.5, y: 0.7 }, // Center-bottom
    ];
    const selectedOrigin = originOptions[Math.floor(Math.random() * originOptions.length)];

    return {
        targetScale: endScale,
        targetXPercent: endXPercent,
        targetYPercent: endYPercent,
        originXRatio: selectedOrigin.x,
        originYRatio: selectedOrigin.y,
        animationDurationS: duration,
    };
};


const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'between', 'about', 'around', 'through', 'across',
  'behind', 'after', 'before', 'into', 'onto', 'off', 'than', 'then', 'this', 'that', 'these', 'those', 'when',
  'where', 'while', 'your', 'their', 'there', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'might',
  'very', 'more', 'some', 'such', 'many', 'much', 'also', 'like', 'just', 'each', 'every', 'being', 'been', 'into',
  'onto', 'among', 'amid', 'amidst', 'during', 'within', 'without', 'because', 'against', 'toward', 'towards', 'our',
  'ours', 'his', 'hers', 'their', 'them', 'they', 'you', 'yourself', 'ourselves', 'himself', 'herself', 'itself',
  'it', 'its', 'we', 'us', 'are', 'was', 'were', 'is', 'am', 'be', 'being', 'been', 'do', 'does', 'did', 'doing',
  'on', 'in', 'at', 'by', 'to', 'of', 'as', 'a', 'an'
]);

const GENERIC_MEDIA_TERMS = [
  'background', 'texture', 'pattern', 'template', 'intro', 'graphic', 'animation', 'loop', 'wallpaper', 'abstract',
  'backdrop', 'placeholder', 'design', 'illustration'
];

interface PlaceholderContext {
  keywords?: string[];
  sceneText?: string;
  imagePrompt?: string;
}

interface WikimediaCandidate {
  url: string;
  type: 'video' | 'image';
  width: number;
  height: number;
  duration?: number;
  title: string;
  snippet?: string;
  description?: string;
}

interface ScoredCandidate extends WikimediaCandidate {
  score: number;
  query: string;
}

const cleanWikiHtml = (value?: string): string => {
  if (!value) return '';
  return value
    .replace(/<span class=\"searchmatch\">/g, '')
    .replace(/<\/span>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

const sanitizeWord = (word: string): string =>
  word
    .toLowerCase()
    .replace(/[^a-z0-9\-\s]/g, '')
    .trim();

const extractTokens = (text?: string): string[] => {
  if (!text) return [];
  return text
    .split(/[\s,.;:!?\-]+/)
    .map(sanitizeWord)
    .filter(token => token && token.length > 2 && !STOP_WORDS.has(token));
};

const dedupeStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
};

const limitWords = (text: string, maxWords = 9): string => {
  const words = text.trim().split(/\s+/);
  return words.slice(0, maxWords).join(' ').trim();
};

const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const estimateSceneDurationSeconds = (text: string): number => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return MIN_SCENE_DURATION_SECONDS;
  }

  const words = normalized.split(' ').filter(Boolean);
  const wordCount = words.length;
  const baseDuration = wordCount / AVERAGE_WORDS_PER_SECOND;

  const sentenceBreaks = (normalized.match(/[.!?]/g) ?? []).length;
  const commaBreaks = (normalized.match(/[,;:]/g) ?? []).length;
  const newlineBreaks = (normalized.match(/\n/g) ?? []).length;
  const longWordCount = words.filter(word => word.length >= 9).length;
  const questionMarks = (normalized.match(/\?/g) ?? []).length;
  const exclamationMarks = (normalized.match(/!/g) ?? []).length;

  // Enhanced rhythm calculation for better pacing
  const rhythmPadding = sentenceBreaks * 0.8 + commaBreaks * 0.3 + newlineBreaks * 0.5;
  const emphasisPadding = longWordCount * 0.08;
  const questionPadding = questionMarks * 0.4; // Pause for questions
  const excitementPadding = exclamationMarks * 0.3; // Pause for excitement
  
  // Dynamic energy multiplier based on content complexity
  const complexityFactor = Math.min(0.4, (sentenceBreaks + commaBreaks + newlineBreaks) * 0.04);
  const energyMultiplier = 1 + complexityFactor;

  const estimated = (baseDuration + rhythmPadding + emphasisPadding + questionPadding + excitementPadding + 1.2) * energyMultiplier;
  const clamped = Math.min(
    MAX_SCENE_DURATION_SECONDS,
    Math.max(MIN_SCENE_DURATION_SECONDS, estimated),
  );

  return Number(clamped.toFixed(2));
};

const limitPromptWords = (text: string, maxWords: number): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return normalized;
  const words = normalized.split(' ');
  if (words.length <= maxWords) {
    return normalized.endsWith('.') || normalized.endsWith('!') || normalized.endsWith('?')
      ? normalized
      : `${normalized}.`;
  }
  const trimmed = words.slice(0, maxWords).join(' ').trim();
  return trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')
    ? trimmed
    : `${trimmed}.`;
};

// Calculate total video duration and adjust if needed
const calculateAndAdjustVideoDuration = (scenes: Scene[]): Scene[] => {
  const totalDurationSeconds = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const totalDurationMinutes = totalDurationSeconds / 60;
  
  // If video is too short, extend scene durations proportionally
  if (totalDurationMinutes < TARGET_VIDEO_DURATION_MINUTES.MIN) {
    const multiplier = TARGET_VIDEO_DURATION_MINUTES.MIN / totalDurationMinutes;
    return scenes.map(scene => ({
      ...scene,
      duration: Math.min(MAX_SCENE_DURATION_SECONDS, scene.duration * multiplier)
    }));
  }
  
  // If video is too long, reduce scene durations proportionally
  if (totalDurationMinutes > TARGET_VIDEO_DURATION_MINUTES.MAX) {
    const multiplier = TARGET_VIDEO_DURATION_MINUTES.MAX / totalDurationMinutes;
    return scenes.map(scene => ({
      ...scene,
      duration: Math.max(MIN_SCENE_DURATION_SECONDS, scene.duration * multiplier)
    }));
  }
  
  return scenes;
};

const splitSceneTextByDuration = (text: string, maxDurationSeconds: number): string[] => {
  const sanitized = text.replace(/\s+/g, ' ').trim();
  if (!sanitized) return [];

  const maxWordsPerScene = Math.max(
    1,
    Math.round(maxDurationSeconds * AVERAGE_WORDS_PER_SECOND * 0.92),
  );
  const sentenceMatches = sanitized.match(/[^.!?]+[.!?]?/g);
  const sentences = sentenceMatches ? sentenceMatches.map(s => s.trim()).filter(Boolean) : [sanitized];

  const chunks: string[] = [];
  let currentSentences: string[] = [];
  let currentWordCount = 0;

  const flushCurrent = () => {
    if (currentSentences.length === 0) return;
    const combined = currentSentences.join(' ').replace(/\s+/g, ' ').trim();
    if (combined) chunks.push(combined);
    currentSentences = [];
    currentWordCount = 0;
  };

  for (const sentence of sentences) {
    const sentenceWordCount = countWords(sentence);

    if (sentenceWordCount >= maxWordsPerScene * 1.2) {
      // Extremely long sentence - split by words directly
      flushCurrent();
      const words = sentence.split(/\s+/).filter(Boolean);
      for (let start = 0; start < words.length; start += maxWordsPerScene) {
        const slice = words.slice(start, start + maxWordsPerScene).join(' ');
        if (slice) chunks.push(slice.trim());
      }
      continue;
    }

    if (currentWordCount + sentenceWordCount > maxWordsPerScene && currentSentences.length > 0) {
      flushCurrent();
    }

    currentSentences.push(sentence);
    currentWordCount += sentenceWordCount;
  }

  flushCurrent();

  if (chunks.length <= 1) {
    return chunks;
  }

  const minWordThreshold = Math.max(4, Math.round(MIN_SCENE_DURATION_SECONDS * AVERAGE_WORDS_PER_SECOND * 0.6));
  const lastChunkWords = countWords(chunks[chunks.length - 1]);
  if (lastChunkWords < minWordThreshold) {
    const merged = `${chunks[chunks.length - 2]} ${chunks[chunks.length - 1]}`.replace(/\s+/g, ' ').trim();
    chunks.splice(chunks.length - 2, 2, merged);
  }

  return chunks;
};

const deriveKeywordsForChunk = (chunkText: string, baseKeywords: string[]): string[] => {
  const frequencies = new Map<string, number>();
  for (const token of extractTokens(chunkText)) {
    if (!token || GENERIC_MEDIA_TERMS.includes(token)) continue;
    frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }

  const sortedTokens = Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);

  const combined = dedupeStrings([
    ...baseKeywords,
    ...sortedTokens,
  ]);

  const filtered = combined.filter(token => token && !GENERIC_MEDIA_TERMS.includes(token.toLowerCase()));

  if (filtered.length >= 3) return filtered.slice(0, 3);
  if (filtered.length === 2) return filtered;
  if (filtered.length === 1) return [...filtered, `${filtered[0]} focus`];

  const fallbackTokens = chunkText
    .split(/\s+/)
    .map(word => sanitizeWord(word))
    .filter(Boolean);

  const fallback = dedupeStrings(fallbackTokens).filter(word => word.length > 3).slice(0, 2);
  if (fallback.length >= 2) return fallback;
  if (fallback.length === 1) return [fallback[0], `${fallback[0]} details`];
  return ['cinematic storytelling', 'dynamic visuals'];
};

const createPromptForChunk = (
  basePrompt: string | undefined,
  chunkText: string,
  segmentIndex: number,
  totalSegments: number
): string => {
  const focus = limitWords(chunkText, 14);
  const emphasis = focus ? `Highlight ${focus}.` : '';
  const segmentHint = totalSegments > 1 ? `Segment ${segmentIndex + 1} of ${totalSegments}.` : '';

  if (basePrompt && basePrompt.trim().length > 0) {
    const combined = `${basePrompt.trim()} ${segmentHint} ${emphasis}`.replace(/\s+/g, ' ').trim();
    return limitPromptWords(combined, 20);
  }

  const fallbackPrompt = `Cinematic depiction of ${focus || 'the narration moment'}. ${segmentHint}`.trim();
  return limitPromptWords(fallbackPrompt, 20);
};

export const normalizeGeminiScenes = (analysis: GeminiSceneResponseItem[]): GeminiSceneResponseItem[] => {
  const normalized: GeminiSceneResponseItem[] = [];

  analysis.forEach(item => {
    const baseKeywords = Array.isArray(item.keywords) ? item.keywords.filter(Boolean) : [];
    const sanitizedText = item.sceneText?.replace(/\s+/g, ' ').trim() || '';
    if (!sanitizedText) {
      return;
    }

    const segments = splitSceneTextByDuration(sanitizedText, MAX_SCENE_DURATION_SECONDS);
    const safeSegments = segments.length > 0 ? segments : [sanitizedText];

    safeSegments.forEach((segmentText, index) => {
      const boundedDuration = estimateSceneDurationSeconds(segmentText);
      normalized.push({
        sceneText: segmentText,
        keywords: deriveKeywordsForChunk(segmentText, baseKeywords),
        imagePrompt: createPromptForChunk(item.imagePrompt, segmentText, index, safeSegments.length),
        duration: boundedDuration,
      });
    });
  });

  return normalized;
};

const buildContextTerms = (context: PlaceholderContext): string[] => {
  const terms: string[] = [];
  if (context.keywords) {
    for (const keyword of context.keywords) {
      const sanitized = sanitizeWord(keyword);
      if (sanitized) terms.push(sanitized);
      terms.push(...extractTokens(keyword));
    }
  }
  terms.push(...extractTokens(context.sceneText));
  terms.push(...extractTokens(context.imagePrompt));
  return dedupeStrings(terms).slice(0, 30);
};

const buildSearchQueries = (context: PlaceholderContext): string[] => {
  const queries: string[] = [];
  const keywordPhrases = (context.keywords || [])
    .map(k => limitWords(k))
    .filter(Boolean);

  if (keywordPhrases.length >= 2) {
    queries.push(limitWords(keywordPhrases.slice(0, 3).join(' ')));
  }
  queries.push(...keywordPhrases);

  const keywords = dedupeStrings(keywordPhrases);
  for (let i = 0; i < Math.min(keywords.length, 4); i++) {
    for (let j = i + 1; j < Math.min(keywords.length, 5); j++) {
      queries.push(limitWords(`${keywords[i]} ${keywords[j]}`));
    }
  }

  const contextFragments: string[] = [];
  if (context.imagePrompt) {
    const fragments = context.imagePrompt.split(/[\.|\n|;|\-]/).map(f => limitWords(f));
    contextFragments.push(...fragments);
  }
  if (context.sceneText) {
    const sentences = context.sceneText.split(/[.?!]/).map(s => limitWords(s));
    contextFragments.push(...sentences);
  }

  queries.push(...contextFragments.filter(f => f && f.split(/\s+/).length >= 2));

  const contextTerms = buildContextTerms(context);
  for (let size = Math.min(4, contextTerms.length); size >= 2; size--) {
    for (let start = 0; start <= contextTerms.length - size && start < 6; start++) {
      const phrase = contextTerms.slice(start, start + size).join(' ');
      queries.push(limitWords(phrase));
    }
  }

  if (contextTerms.length) {
    queries.push(limitWords(`cinematic ${contextTerms.slice(0, 3).join(' ')}`));
    queries.push(limitWords(`dynamic footage of ${contextTerms.slice(0, 3).join(' ')}`));
  }

  queries.push(...FALLBACK_FOOTAGE_KEYWORDS.map(k => `cinematic ${k}`));

  return dedupeStrings(
    queries
      .map(q => q.replace(/\s+/g, ' ').trim())
      .filter(q => q && q.length >= 3)
  ).slice(0, 18);
};

const wikimediaCandidateCache = new Map<string, Promise<WikimediaCandidate[]>>();

const fetchWikimediaMediaCandidates = async (
  query: string,
  orientation: 'landscape' | 'portrait',
  type: 'video' | 'image',
  offset: number = 0
): Promise<WikimediaCandidate[]> => {
  const cacheKey = `${type}|${orientation}|${query}|${offset}`;
  const cached = wikimediaCandidateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const fetchPromise = (async () => {
    const baseUrl =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
      `&generator=search&gsrsearch=${encodeURIComponent(query)}` +
      `&gsrnamespace=6&gsrprop=snippet|titlesnippet&gsrsort=relevance&gsrlimit=30&gsroffset=${offset}` +
      `&prop=imageinfo|info&inprop=url|displaytitle` +
      `&iiprop=url|size|mime|extmetadata${type === 'video' ? '|duration' : ''}`;

    try {
      const resp = await fetch(baseUrl);
      if (!resp.ok) return [];
      const data = await resp.json();
      const pages = data?.query?.pages;
      if (!pages) return [];
      const results: WikimediaCandidate[] = [];
      const pageEntries = Object.values(pages) as any[];
      for (const page of pageEntries) {
        const info = page?.imageinfo?.[0];
        if (!info || typeof info.url !== 'string' || typeof info.mime !== 'string') continue;
        const isVideo = info.mime.startsWith('video');
        if (type === 'video' && !isVideo) continue;
        if (type === 'image' && isVideo) continue;
        if (orientation === 'landscape' && info.width < info.height) continue;
        if (orientation === 'portrait' && info.height < info.width) continue;

        const durationValue = info.duration;
        let numericDuration: number | undefined = undefined;
        if (typeof durationValue === 'number') {
          numericDuration = durationValue;
        } else if (typeof durationValue === 'string') {
          const parsed = parseFloat(durationValue);
          if (!Number.isNaN(parsed)) numericDuration = parsed;
        }

        const description =
          cleanWikiHtml(
            info.extmetadata?.ImageDescription?.value ||
            info.extmetadata?.ObjectName?.value ||
            info.extmetadata?.Description?.value
          );

        results.push({
          url: info.url,
          type: isVideo ? 'video' : 'image',
          width: info.width,
          height: info.height,
          duration: numericDuration,
          title: cleanWikiHtml(page?.title || ''),
          snippet: cleanWikiHtml(page?.snippet || ''),
          description
        });
      }
      return results;
    } catch (err) {
      console.warn('Error fetching from Wikimedia API:', err);
      return [];
    }
  })();

  const guarded = fetchPromise.catch(error => {
    wikimediaCandidateCache.delete(cacheKey);
    throw error;
  });

  wikimediaCandidateCache.set(cacheKey, guarded);
  return guarded;
};

const scoreCandidate = (
  candidate: WikimediaCandidate,
  contextTerms: string[],
  query: string,
  desiredDuration?: number
): number => {
  const combinedText = `${candidate.title} ${candidate.description || ''} ${candidate.snippet || ''}`.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let score = 0;
  let matchedTerms = 0;

  if (normalizedQuery && combinedText.includes(normalizedQuery)) {
    score += 9;
  } else {
    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
    for (const word of queryWords) {
      if (word.length < 3) continue;
      if (combinedText.includes(word)) {
        matchedTerms += 1;
        score += 2.5;
      }
    }
  }

  for (const term of contextTerms) {
    const normalized = term.toLowerCase();
    if (!normalized || normalized.length < 3) continue;
    if (combinedText.includes(normalized)) {
      matchedTerms += 1;
      score += normalized.split(/\s+/).length > 1 ? 6 : 3;
    }
  }

  if (candidate.type === 'video') {
    score += 1.5;
  }

  if (desiredDuration && candidate.duration) {
    const diff = Math.abs(candidate.duration - desiredDuration);
    score += Math.max(0, 3 - diff / 2);
  }

  const loweredTitle = candidate.title.toLowerCase();
  for (const generic of GENERIC_MEDIA_TERMS) {
    if (loweredTitle.includes(generic) || combinedText.includes(generic)) {
      score -= 2;
    }
  }

  if (matchedTerms === 0) {
    score -= 2.5;
  }

  return score;
};

// Fetches a placeholder image or video URL based on contextual information for a scene.
export const fetchPlaceholderFootageUrl = async (
  contextInput: PlaceholderContext | string[],
  aspectRatio: AspectRatio,
  duration?: number,
  sceneId?: string
): Promise<{ url: string; type: 'video' | 'image' }> => {
  const context: PlaceholderContext = Array.isArray(contextInput)
    ? { keywords: contextInput }
    : { ...contextInput };

  if (!context.keywords || context.keywords.length === 0) {
    const randomFallback = FALLBACK_FOOTAGE_KEYWORDS[hashString(sceneId || `${Date.now()}`) % FALLBACK_FOOTAGE_KEYWORDS.length];
    context.keywords = [randomFallback];
  }

  const orientation = aspectRatio === '16:9' ? 'landscape' : 'portrait';
  const baseOffset = sceneId ? hashString(sceneId) % 40 : Math.floor(Math.random() * 40);

  const contextTerms = buildContextTerms(context);
  const queries = buildSearchQueries(context);
  if (queries.length === 0) {
    queries.push(`cinematic ${context.keywords?.[0] || 'storytelling visuals'}`);
  }

  let bestCandidate: ScoredCandidate | null = null;

  const considerCandidates = (candidates: WikimediaCandidate[], query: string) => {
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate, contextTerms, query, duration);
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { ...candidate, score, query };
      }
    }
  };

  const maxQueriesToTry = Math.min(queries.length, 12);
  for (let i = 0; i < maxQueriesToTry; i++) {
    const query = queries[i];
    const offset = (baseOffset + i * 7) % 60;

    const [videoCandidates, imageCandidates] = await Promise.all([
      fetchWikimediaMediaCandidates(query, orientation, 'video', offset),
      fetchWikimediaMediaCandidates(query, orientation, 'image', offset),
    ]);

    considerCandidates(videoCandidates, query);
    if (bestCandidate && bestCandidate.type === 'video' && bestCandidate.score >= 8) {
      break;
    }

    considerCandidates(imageCandidates, query);
    if (bestCandidate && bestCandidate.score >= 9) {
      break;
    }
  }

  if (bestCandidate) {
    return { url: bestCandidate.url, type: bestCandidate.type };
  }

  const fallbackQuery = `cinematic ${FALLBACK_FOOTAGE_KEYWORDS[baseOffset % FALLBACK_FOOTAGE_KEYWORDS.length]}`;
  const fallbackVideo = await fetchWikimediaMediaCandidates(fallbackQuery, orientation, 'video', baseOffset % 10);
  if (fallbackVideo.length > 0) {
    return { url: fallbackVideo[0].url, type: 'video' };
  }
  const fallbackImage = await fetchWikimediaMediaCandidates(fallbackQuery, orientation, 'image', baseOffset % 10);
  if (fallbackImage.length > 0) {
    return { url: fallbackImage[0].url, type: 'image' };
  }

  return { url: '', type: 'video' };
};

export interface ProcessNarrationOptions {
  useAiGeneratedImages: boolean;
  generateSpecificImageForSceneId?: string; // For updating a single scene's image
}

export const processNarrationToScenes = async (
  narrationAnalysis: GeminiSceneResponseItem[],
  aspectRatio: AspectRatio,
  options: ProcessNarrationOptions,
  onProgress: (message: string, valueWithinStage: number, stage: 'ai_image' | 'placeholder_image' | 'finalizing', current?: number, total?: number, errorMsg?: string) => void,
  existingScenes?: Scene[] // For updating a single image in existing scenes
): Promise<Scene[]> => {
  const baseScenes: Scene[] = existingScenes && !options.generateSpecificImageForSceneId ? [...existingScenes] : [];
  const totalScenes = narrationAnalysis.length;
  let scenesToProcess = narrationAnalysis;
  let targetSceneId: string | null = null;
  let targetSceneIndex: number | null = null;

  // If we are only updating a single image
  if (options.generateSpecificImageForSceneId && existingScenes) {
    const sceneToUpdateIndex = existingScenes.findIndex(s => s.id === options.generateSpecificImageForSceneId);
    if (sceneToUpdateIndex !== -1) {
      // Find the corresponding item from narrationAnalysis (if ID match isn't direct)
      // This part assumes narrationAnalysis contains the *original* analysis items,
      // and we match by index if IDs are not perfectly aligned or available in narrationAnalysis items.
      // For simplicity, we'll assume the scene ID corresponds or we re-use its existing imagePrompt.
      const analysisItemForScene = narrationAnalysis.find(item => item.sceneText === existingScenes[sceneToUpdateIndex].sceneText) ||
                                   { ...existingScenes[sceneToUpdateIndex], duration: existingScenes[sceneToUpdateIndex].duration }; // Fallback to existing data if not found

      scenesToProcess = [analysisItemForScene as GeminiSceneResponseItem]; // Process only this one item
      targetSceneId = existingScenes[sceneToUpdateIndex].id;
      targetSceneIndex = sceneToUpdateIndex;
    } else {
      console.warn("Scene to update image for not found:", options.generateSpecificImageForSceneId);
      return existingScenes; // No change
    }
  }
  const timestamp = Date.now();

  const totalToProcess = scenesToProcess.length;
  if (totalToProcess === 0) {
    onProgress('All scene visuals processed.', 1, 'finalizing', totalScenes, totalScenes);
    return baseScenes;
  }

  const sceneProgress = new Array<number>(totalToProcess).fill(0);
  const aggregateProgressUpdate = (
    index: number,
    progressValue: number,
    stage: 'ai_image' | 'placeholder_image',
    message: string,
    errorMsg?: string
  ) => {
    const clamped = Math.max(0, Math.min(1, progressValue));
    sceneProgress[index] = Math.max(sceneProgress[index], clamped);
    const aggregated = sceneProgress.reduce((sum, value) => sum + value, 0) / totalToProcess;
    onProgress(message, aggregated, stage, Math.min(index + 1, totalToProcess), totalToProcess, errorMsg);
  };

  const processSingleScene = async (
    item: GeminiSceneResponseItem,
    index: number,
    reportProgress: (
      progress: number,
      stage: 'ai_image' | 'placeholder_image',
      message: string,
      errorMsg?: string
    ) => void
  ): Promise<Scene> => {
    const sceneId = targetSceneId && totalToProcess === 1 ? targetSceneId : `scene-${index}-${timestamp}`;
    let footageUrl = '';
    let footageType: 'image' | 'video' = 'image';
    let imageGenError: string | undefined;

    const rawDuration = item.duration > 0 ? item.duration : calculateDurationFromText(item.sceneText);
    const normalizedDuration = Number.isFinite(rawDuration)
      ? Number(rawDuration.toFixed(2))
      : MIN_SCENE_DURATION_SECONDS;
    const validatedDuration = Math.min(
      MAX_SCENE_DURATION_SECONDS,
      Math.max(MIN_SCENE_DURATION_SECONDS, normalizedDuration),
    );
    const sceneNumber = index + 1;

    let currentStage: 'ai_image' | 'placeholder_image' = options.useAiGeneratedImages ? 'ai_image' : 'placeholder_image';
    reportProgress(0.05, currentStage, `Preparing scene ${sceneNumber}/${totalToProcess} visuals...`);

    if (options.useAiGeneratedImages && item.imagePrompt) {
      currentStage = 'ai_image';
      reportProgress(0.2, 'ai_image', `Generating AI image for scene ${sceneNumber}/${totalToProcess}...`);
      try {
        const imagenResult = await generateImageWithImagen(item.imagePrompt, sceneId);
        if (imagenResult.base64Image) {
          footageUrl = imagenResult.base64Image;
          footageType = 'image';
          reportProgress(0.85, 'ai_image', `AI image ready for scene ${sceneNumber}/${totalToProcess}.`);
        } else {
          imageGenError = imagenResult.userFriendlyError || 'AI image generation failed. Using placeholder.';
          console.warn(imageGenError, 'Prompt:', item.imagePrompt);
          reportProgress(0.4, 'ai_image', imageGenError, imageGenError);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'AI image generation failed. Using placeholder.';
        imageGenError = errMsg;
        console.warn('AI image generation threw an error. Falling back to placeholder.', error);
        reportProgress(0.4, 'ai_image', errMsg, errMsg);
      }
    }

    if (!footageUrl) {
      currentStage = 'placeholder_image';
      const placeholderStart = options.useAiGeneratedImages ? 0.45 : 0.2;
      reportProgress(placeholderStart, 'placeholder_image', `Fetching placeholder for scene ${sceneNumber}/${totalToProcess}...`, imageGenError);
      const placeholder = await fetchPlaceholderFootageUrl(
        { keywords: item.keywords, sceneText: item.sceneText, imagePrompt: item.imagePrompt },
        aspectRatio,
        validatedDuration,
        sceneId
      );
      footageUrl = placeholder.url;
      footageType = placeholder.type;
      reportProgress(0.85, 'placeholder_image', `Placeholder ready for scene ${sceneNumber}/${totalToProcess}.`, imageGenError);
    }

    const kenBurnsConfig = generateSceneKenBurnsConfig(validatedDuration);
    reportProgress(1, currentStage, `Scene ${sceneNumber}/${totalToProcess} visuals ready.`, imageGenError);

    return {
      id: sceneId,
      sceneText: item.sceneText,
      keywords: item.keywords,
      imagePrompt: item.imagePrompt,
      duration: validatedDuration,
      footageUrl,
      footageType,
      kenBurnsConfig,
    };
  };

  const results = new Array<Scene>(totalToProcess);
  let nextIndex = 0;
  const concurrency = Math.min(MAX_SCENE_PROCESSING_CONCURRENCY, Math.max(1, totalToProcess));

  const workers = Array.from({ length: concurrency }, () =>
    (async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= totalToProcess) {
          break;
        }
        const item = scenesToProcess[currentIndex];
        const scene = await processSingleScene(item, currentIndex, (progress, stage, message, errorMsg) =>
          aggregateProgressUpdate(currentIndex, progress, stage, message, errorMsg)
        );
        results[currentIndex] = scene;
      }
    })()
  );

  await Promise.all(workers);

  onProgress('All scene visuals processed.', 1, 'finalizing', totalScenes, totalScenes);

  const generatedScenes = results.filter((scene): scene is Scene => Boolean(scene));

  if (targetSceneId && existingScenes && targetSceneIndex !== null && generatedScenes[0]) {
    const replacement = { ...generatedScenes[0], id: targetSceneId };
    const updatedScenes = existingScenes.map((scene, idx) => {
      if (idx !== targetSceneIndex) {
        return scene;
      }
      return {
        ...scene,
        sceneText: replacement.sceneText,
        keywords: replacement.keywords,
        imagePrompt: replacement.imagePrompt,
        duration: replacement.duration,
        footageUrl: replacement.footageUrl,
        footageType: replacement.footageType,
        kenBurnsConfig: replacement.kenBurnsConfig,
      };
    });
    return updatedScenes;
  }

  const finalScenes = baseScenes.length > 0 ? [...baseScenes, ...generatedScenes] : generatedScenes;
  
  // Adjust video duration to meet target range (7-17 minutes)
  const adjustedScenes = calculateAndAdjustVideoDuration(finalScenes);
  
  return adjustedScenes;
};

export const calculateDurationFromText = (text: string): number => {
  if (!text || text.trim() === '') {
    return MIN_SCENE_DURATION_SECONDS;
  }
  return estimateSceneDurationSeconds(text);
};
