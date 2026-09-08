import { Post, normalizeCategorySlug } from '../types';

/**
 * Search Tokenization and Word-Weighted Ranking Engine for KROMA
 * Implements real discovery search independent of feed pagination.
 */

// Common stop words to filter out for cleaner token matching
const STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'who',
  'will',
  'with',
]);

/**
 * Normalize and tokenize raw search text
 */
export const tokenizeText = (text?: string): string[] => {
  if (!text || typeof text !== 'string') return [];

  // Unicode normalization (NFKC) + lowercase
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .trim();

  // Replace punctuation and symbols with spaces, except meaningful alphanumeric and internal hyphens
  const cleaned = normalized.replace(/[^a-z0-9\s-]/g, ' ');

  // Split by whitespace
  const rawTokens = cleaned.split(/\s+/).filter(Boolean);

  const tokens = new Set<string>();

  for (const token of rawTokens) {
    const trimmed = token.replace(/^-+|-+$/g, '');
    if (!trimmed || trimmed.length < 2) continue;

    if (!STOP_WORDS.has(trimmed)) {
      tokens.add(trimmed);
    }

    // Also include hyphen split parts if any (e.g. "ui-ux" -> "ui", "ux", "ui-ux")
    if (trimmed.includes('-')) {
      trimmed.split('-').forEach(part => {
        if (part && part.length >= 2 && !STOP_WORDS.has(part)) {
          tokens.add(part);
        }
      });
    }
  }

  return Array.from(tokens);
};

/**
 * Generate searchable metadata tokens for a post document in Firestore
 */
export const generateSearchTokens = (post: Partial<Post>): string[] => {
  const tokenSet = new Set<string>();

  // Title tokens (high priority)
  if (post.title) {
    tokenizeText(post.title).forEach(t => tokenSet.add(t));
  }

  // Tags (high priority)
  if (Array.isArray(post.tags)) {
    post.tags.forEach(tag => {
      tokenizeText(tag).forEach(t => tokenSet.add(t));
    });
  }

  // Style tags (medium/high priority)
  if (Array.isArray(post.styleTags)) {
    post.styleTags.forEach(st => {
      tokenizeText(st).forEach(t => tokenSet.add(t));
    });
  }

  // Tools used (e.g. Figma, Photoshop, Blender)
  if (Array.isArray(post.toolsUsed)) {
    post.toolsUsed.forEach(tool => {
      tokenizeText(tool).forEach(t => tokenSet.add(t));
    });
  }

  // Creator displayName & username
  if (post.creator?.displayName) {
    tokenizeText(post.creator.displayName).forEach(t => tokenSet.add(t));
  }
  if (post.creator?.username) {
    tokenizeText(post.creator.username).forEach(t => tokenSet.add(t));
  }

  // Legacy Category tokens (optional signal if present)
  if (post.category) {
    const normalizedCat = normalizeCategorySlug(post.category);
    tokenizeText(normalizedCat).forEach(t => tokenSet.add(t));
    tokenizeText(post.category).forEach(t => tokenSet.add(t));
  }

  // Key description tokens (first 30 meaningful tokens)
  if (post.description) {
    const descTokens = tokenizeText(post.description);
    descTokens.slice(0, 30).forEach(t => tokenSet.add(t));
  }

  // Limit total token array size to maximum 60 tokens for clean Firestore indexing
  return Array.from(tokenSet).slice(0, 60);
};

/**
 * Score a single post against query tokens using word-weighted hierarchy
 */
export const calculatePostRelevance = (
  post: Post,
  queryTokens: string[],
  rawQuery: string
): { score: number; matchCount: number } => {
  if (!queryTokens || queryTokens.length === 0) {
    return { score: 1, matchCount: 0 };
  }

  const cleanRawQuery = rawQuery.trim().toLowerCase();
  const titleLower = (post.title || '').toLowerCase();
  const descLower = (post.description || '').toLowerCase();
  const categoryLower = (post.category || '').toLowerCase();
  const creatorNameLower = (post.creator?.displayName || '').toLowerCase();
  const creatorUsernameLower = (post.creator?.username || '').toLowerCase();
  const tagsLower = (post.tags || []).map(t => (t || '').toLowerCase());
  const styleTagsLower = (post.styleTags || []).map(t => (t || '').toLowerCase());
  const toolsLower = (post.toolsUsed || []).map(t => (t || '').toLowerCase());

  let score = 0;
  let matchedQueryTokens = 0;

  // 1. Exact full raw query match bonuses
  if (cleanRawQuery.length >= 3) {
    if (titleLower === cleanRawQuery) {
      score += 120; // Exact title match is top tier
    } else if (titleLower.includes(cleanRawQuery)) {
      score += 60; // Exact phrase in title
    }

    if (tagsLower.includes(cleanRawQuery)) {
      score += 50; // Exact tag match
    }

    if (categoryLower && (categoryLower === cleanRawQuery || normalizeCategorySlug(categoryLower) === cleanRawQuery)) {
      score += 35; // Exact category match
    }
  }

  // 2. Individual query token matches across fields
  for (const token of queryTokens) {
    let tokenMatched = false;

    // A. Title match (very high weight)
    if (titleLower.includes(token)) {
      score += 35;
      tokenMatched = true;
    }

    // B. Tag match (high weight)
    if (tagsLower.some(t => t === token || t.includes(token))) {
      score += 25;
      tokenMatched = true;
    }

    // C. Style tag match (medium-high weight)
    if (styleTagsLower.some(st => st.includes(token))) {
      score += 18;
      tokenMatched = true;
    }

    // D. Creative Tools match (medium weight)
    if (toolsLower.some(tool => tool.includes(token))) {
      score += 15;
      tokenMatched = true;
    }

    // E. Creator displayName / username match (medium weight)
    if (creatorNameLower.includes(token) || creatorUsernameLower.includes(token)) {
      score += 15;
      tokenMatched = true;
    }

    // F. Legacy category match (if category present)
    if (categoryLower && categoryLower.includes(token)) {
      score += 15;
      tokenMatched = true;
    }

    // G. Description match (lower weight)
    if (descLower.includes(token)) {
      score += 8;
      tokenMatched = true;
    }

    // H. Prefix / partial match (min 3 chars)
    if (!tokenMatched && token.length >= 3) {
      const prefix = token.slice(0, 3);
      if (
        titleLower.includes(prefix) ||
        tagsLower.some(t => t.includes(prefix)) ||
        (categoryLower && categoryLower.includes(prefix))
      ) {
        score += 5;
        tokenMatched = true;
      }
    }

    if (tokenMatched) {
      matchedQueryTokens++;
    }
  }

  // 3. Match Coverage Multiplier (4/4 matched query words > 2/4 > 1/4)
  if (queryTokens.length > 1 && matchedQueryTokens > 0) {
    const coverage = matchedQueryTokens / queryTokens.length;
    score += coverage * 30;
  }

  // Must match at least one token or phrase to have a positive score
  if (matchedQueryTokens === 0 && score === 0) {
    return { score: 0, matchCount: 0 };
  }

  // 4. Engagement & Recency Tie-Breakers
  const likesWeight = Math.min(post.likesCount || 0, 100) * 0.04;
  const savesWeight = Math.min(post.savesCount || 0, 100) * 0.04;
  score += likesWeight + savesWeight;

  // Recency bonus: post created recently gets a subtle nudge
  const postDate = new Date(post.createdAt || 0).getTime();
  if (!isNaN(postDate)) {
    const ageDays = (Date.now() - postDate) / (1000 * 60 * 60 * 24);
    if (ageDays <= 14) {
      score += 2;
    } else if (ageDays <= 60) {
      score += 1;
    }
  }

  return { score, matchCount: matchedQueryTokens };
};

/**
 * Filter and rank candidates using word-weighted relevance
 */
export const rankPostsByRelevance = (posts: Post[], rawQuery: string): Post[] => {
  if (!rawQuery || !rawQuery.trim()) {
    return [...posts].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  const queryTokens = tokenizeText(rawQuery);
  if (queryTokens.length === 0) {
    return posts;
  }

  const scored: Array<{ post: Post; score: number; matchCount: number }> = [];

  for (const post of posts) {
    const { score, matchCount } = calculatePostRelevance(post, queryTokens, rawQuery);
    if (score > 0) {
      scored.push({ post, score, matchCount });
    }
  }

  // Sort primarily by relevance score descending, then by recency
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.post.createdAt || 0).getTime() - new Date(a.post.createdAt || 0).getTime();
  });

  return scored.map(item => item.post);
};
