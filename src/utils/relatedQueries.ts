import { Post } from '../types';
import { tokenizeText } from './searchEngine';

/**
 * Deterministic Related Query Generation Engine
 * Grounded strictly in authentic indexed content from candidate posts.
 * Generates human-searchable phrases without AI, random sentence building, or hallucinated terms.
 */

// Common English stop words and low-signal filler words to ignore when extracting phrases
const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'how', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'was', 'what', 'when', 'where', 'who', 'will', 'with', 'premium', 'ultra',
  'pro', 'super', 'new', 'best', 'top', 'various', 'daily', 'custom', 'official'
]);

// Abstract style modifiers, tools, or metadata labels that should NOT be compounded
// (Prevents "Sony minimal advertising photoshop" anti-pattern)
const ABSTRACT_OR_TOOL_MODIFIERS = new Set([
  'minimal', 'minimalist', 'clean', 'dark', 'light', 'modern', 'abstract',
  'flat', 'retro', 'vintage', 'aesthetic', 'creative', 'simple', 'advertising',
  'commercial', 'branding', 'portfolio', 'showcase', 'concept', 'art', 'design',
  'photoshop', 'figma', 'illustrator', 'blender', 'cinema4d', 'procreate',
  'aftereffects', 'vector', 'digital', 'render', 'illustration', 'graphic'
]);

// Format/medium nouns where compounding [Format] + [Unrelated Noun] produces nonsense
// e.g. "Poster" + "headphones" -> "Poster headphones" is invalid.
const MEDIUM_FORMATS = new Set([
  'poster', 'posters', 'wallpaper', 'wallpapers', 'card', 'cards',
  'template', 'templates', 'banner', 'banners', 'flyer', 'flyers', 'graphic'
]);

// Authentic design deliverables / formats suitable as secondary word in title bigrams
const MEANINGFUL_END_NOUNS = new Set([
  'design', 'poster', 'art', 'packaging', 'branding', 'logo', 'identity',
  'illustration', 'mockup', 'campaign', 'interface', 'ui', 'ux', 'concept',
  'wallpaper', 'render', 'animation', 'typography', 'layout', 'icon', 'icons'
]);

interface QueryCandidate {
  display: string;
  normalized: string;
  score: number;
  wordCount: number;
  isTagMatch: boolean;
}

/**
 * Format query cleanly for display: title case for readable words
 */
const formatDisplayQuery = (phrase: string): string => {
  const trimmed = phrase.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/).map(w => {
    if (w.length <= 1) return w;
    if (w === w.toUpperCase() && w.length <= 4) return w; // Acronyms: UI, UX, 3D
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  return words.join(' ');
};

/**
 * Clean a string into words, preserving alphanumeric tokens
 */
const cleanWords = (text: string): string[] => {
  if (!text) return [];
  return text
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
};

/**
 * Extract authentic 2-word and 3-word n-grams from a post title
 */
const extractTitlePhrases = (title: string): string[] => {
  const words = cleanWords(title);
  if (words.length < 2) return [];

  const phrases = new Set<string>();

  for (let i = 0; i < words.length; i++) {
    const w1 = words[i];
    const w1Lower = w1.toLowerCase();
    if (STOP_WORDS.has(w1Lower)) continue;

    // Consecutive Bigrams (2 words)
    if (i + 1 < words.length) {
      const w2 = words[i + 1];
      const w2Lower = w2.toLowerCase();
      if (!STOP_WORDS.has(w2Lower)) {
        // High quality bigram if ends in a meaningful noun or is a known subject pair
        if (MEANINGFUL_END_NOUNS.has(w2Lower) || w1Lower === 'product' || w1Lower === 'graphic' || w1Lower === 'visual') {
          phrases.add(`${w1} ${w2}`);
        }
      }
    }

    // Meaningful skip bigrams: [Subject] + [Design/Poster] (e.g. "Headphone ... Design" -> "Headphone Design")
    if (i + 2 < words.length) {
      const w3 = words[i + 2];
      const w3Lower = w3.toLowerCase();
      if (MEANINGFUL_END_NOUNS.has(w3Lower)) {
        phrases.add(`${w1} ${w3}`);
      }
    }
    if (i + 3 < words.length) {
      const w4 = words[i + 3];
      const w4Lower = w4.toLowerCase();
      if (MEANINGFUL_END_NOUNS.has(w4Lower)) {
        phrases.add(`${w1} ${w4}`);
      }
    }
  }

  return Array.from(phrases);
};

/**
 * Deterministically generate content-grounded related queries
 *
 * @param rawQuery - What the user typed (e.g. "Sony", "son", "head", "poster")
 * @param candidatePosts - Pre-filtered, bounded candidate posts matching the query
 * @param maxSuggestions - Maximum number of related queries to return (default 6, range 5-8)
 */
export const buildRelatedQueries = (
  rawQuery: string,
  candidatePosts: Post[],
  maxSuggestions: number = 6
): string[] => {
  const cleanQuery = rawQuery.trim();
  if (!cleanQuery || cleanQuery.length < 2 || !candidatePosts || candidatePosts.length === 0) {
    return [];
  }

  const qLower = cleanQuery.toLowerCase();
  const qTokens = tokenizeText(cleanQuery);

  // Map of candidate query candidates keyed by normalized lowercase string
  const candidatesMap = new Map<string, QueryCandidate>();

  // Identify canonical entity if query is a prefix (e.g. "son" -> "Sony")
  let canonicalEntity: string | null = null;
  for (const post of candidatePosts) {
    const allWords = cleanWords(`${post.title} ${(post.tags || []).join(' ')}`);
    for (const w of allWords) {
      if (w.toLowerCase().startsWith(qLower) && w.length >= qLower.length) {
        if (!canonicalEntity || w.length < canonicalEntity.length) {
          canonicalEntity = w;
        }
      }
    }
  }

  const queryEntityDisplay = canonicalEntity
    ? canonicalEntity.charAt(0).toUpperCase() + canonicalEntity.slice(1).toLowerCase()
    : cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1).toLowerCase();
  const queryEntityLower = queryEntityDisplay.toLowerCase();

  // Helper to add or score a candidate
  const addCandidate = (
    phrase: string,
    baseScore: number,
    isTagMatch: boolean = false
  ) => {
    const trimmed = phrase.trim();
    if (!trimmed) return;

    const normalized = trimmed.toLowerCase();

    // Rejection rules:
    // 1. Cannot be identical to current user input or pure query entity
    if (normalized === qLower) return;
    if (normalized === queryEntityLower) return;

    // 2. Length limits: 3 to 40 characters
    if (normalized.length < 3 || normalized.length > 40) return;

    // 3. Word count limits: 1 to 4 words
    const words = normalized.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (wordCount < 1 || wordCount > 4) return;

    // 4. Must not be purely stop words
    if (words.every(w => STOP_WORDS.has(w))) return;

    // 5. Must not start or end with dangling punctuation
    if (/^[^\w]|([^\w]$)/.test(normalized)) return;

    const display = formatDisplayQuery(phrase);

    const existing = candidatesMap.get(normalized);
    if (existing) {
      existing.score += Math.min(baseScore * 0.4, 40);
      if (isTagMatch) existing.isTagMatch = true;
    } else {
      candidatesMap.set(normalized, {
        display,
        normalized,
        score: baseScore,
        wordCount,
        isTagMatch,
      });
    }
  };

  // Inspect each candidate post to extract authentic phrases
  for (const post of candidatePosts) {
    const postTags = Array.isArray(post.tags) ? post.tags : [];
    const postTitle = post.title || '';

    // =========================================================================
    // 1. Direct Tag Matches (Highest Authenticity Signal)
    // =========================================================================
    for (const tag of postTags) {
      const tagLower = tag.toLowerCase().trim();
      if (!tagLower || tagLower.length < 3) continue;

      // Tag starts with query (e.g. "headphones" starts with "head")
      if (tagLower.startsWith(qLower)) {
        addCandidate(tag, 180, true);
      } else if (tagLower.includes(qLower)) {
        // Tag contains query (e.g. "wireless headphones" contains "head", "product poster" contains "poster")
        addCandidate(tag, 160, true);
      }
    }

    // =========================================================================
    // 2. Title Subphrases (N-grams) that directly contain query or entity
    // =========================================================================
    const titlePhrases = extractTitlePhrases(postTitle);
    for (const tp of titlePhrases) {
      const tpLower = tp.toLowerCase();
      if (tpLower.startsWith(qLower)) {
        addCandidate(tp, 150, false);
      } else if (tpLower.includes(qLower)) {
        addCandidate(tp, 130, false);
      }
    }

    // =========================================================================
    // 3. Grounded Compound Query Generation: [Query Entity] + [Concrete Post Tag]
    // =========================================================================
    const postTextLower = `${postTitle} ${postTags.join(' ')}`.toLowerCase();
    const postMatchesEntity =
      postTextLower.includes(qLower) ||
      (queryEntityLower && postTextLower.includes(queryEntityLower));

    // Only compound if query entity is NOT a medium format like "poster" or "wallpaper"
    const isMediumFormat = MEDIUM_FORMATS.has(queryEntityLower) || MEDIUM_FORMATS.has(qLower);

    if (postMatchesEntity && !isMediumFormat) {
      for (const tag of postTags) {
        const tagTrim = tag.trim();
        const tagLower = tagTrim.toLowerCase();
        if (!tagLower || tagLower.length < 3) continue;

        // Skip if tag already contains query to avoid duplicates
        if (tagLower.includes(qLower) || (queryEntityLower && tagLower.includes(queryEntityLower))) {
          continue;
        }

        // Avoid pure abstract adjectives or software tools alone
        const tagWords = tagLower.split(/\s+/).filter(Boolean);
        if (tagWords.length === 1 && ABSTRACT_OR_TOOL_MODIFIERS.has(tagWords[0])) {
          continue;
        }

        // Do not compound if the tag is itself a brand token
        if (tagLower === 'sony' || tagLower === 'apple' || tagLower === 'nike') {
          continue;
        }

        if (tagWords.length > 3) continue;

        // Compound phrase: Query Entity + Tag (e.g. "Sony headphones", "Sony wireless headphones", "Sony poster design")
        const compoundPhrase = `${queryEntityDisplay} ${tagTrim}`;

        addCandidate(compoundPhrase, 165, true);
      }

      // Also compound query entity with relevant title subphrases (e.g. "Sony" + "Poster Design")
      for (const tp of titlePhrases) {
        const tpLower = tp.toLowerCase();
        if (tpLower.includes(qLower) || (queryEntityLower && tpLower.includes(queryEntityLower))) {
          continue;
        }
        const tpWords = tpLower.split(/\s+/).filter(Boolean);
        if (tpWords.length > 2) continue;

        const compoundPhrase = `${queryEntityDisplay} ${tp}`;
        addCandidate(compoundPhrase, 135, false);
      }
    }
  }

  if (candidatesMap.size === 0) {
    return [];
  }

  // =========================================================================
  // 4. Deterministic Scoring & Ranking of Candidates
  // =========================================================================
  const scoredList = Array.from(candidatesMap.values());

  for (const candidate of scoredList) {
    const cLower = candidate.normalized;

    // Signal A: Exact prefix match with query or canonical entity (+30)
    if (cLower.startsWith(qLower) || (queryEntityLower && cLower.startsWith(queryEntityLower))) {
      candidate.score += 30;
    }

    // Signal B: Query tokens matching (+20)
    if (qTokens.length > 0 && qTokens.every(token => cLower.includes(token))) {
      candidate.score += 20;
    }

    // Signal C: Tag matches get higher priority than cut fragments (+30)
    if (candidate.isTagMatch) {
      candidate.score += 30;
    }

    // Signal D: Natural query length bonus (prefer concise, focused human queries)
    if (candidate.wordCount === 2) {
      candidate.score += 35;
    } else if (candidate.wordCount === 1) {
      candidate.score += 25;
    } else if (candidate.wordCount === 3) {
      candidate.score += 10;
    } else {
      candidate.score -= 25;
    }
  }

  // Sort candidates by score descending
  scoredList.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.display.localeCompare(b.display);
  });

  // Deduplicate near-duplicates (e.g. singular vs plural: "Sony headphone" vs "Sony headphones")
  const finalSuggestions: string[] = [];
  const seenRoots = new Set<string>();

  for (const item of scoredList) {
    const root = item.normalized.replace(/s\b/g, '');
    if (seenRoots.has(root)) {
      continue;
    }
    seenRoots.add(root);
    finalSuggestions.push(item.display);

    if (finalSuggestions.length >= Math.min(Math.max(maxSuggestions, 5), 8)) {
      break;
    }
  }

  return finalSuggestions;
};

/**
 * Find content-grounded related queries from actual post metadata and real search history.
 * Strictly checks:
 * 1. Post titles, tags, styleTags, toolsUsed, category
 * 2. Real recorded search queries from search analytics
 *
 * If no authentic metadata matches or relates to the query, returns an empty array [].
 * Absolutely no generic fallback chips or artificial expansions.
 */
export const findGroundedRelatedQueries = (
  rawQuery: string,
  allPosts: Post[],
  realSearchTerms: string[] = [],
  maxSuggestions: number = 6
): string[] => {
  const cleanQuery = rawQuery.trim();
  if (!cleanQuery || cleanQuery.length < 2 || !allPosts || allPosts.length === 0) {
    return [];
  }

  const qLower = cleanQuery.toLowerCase();
  const qTokens = cleanQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

  // Find posts where ANY metadata field contains the query or key tokens
  const candidatePosts = allPosts.filter(post => {
    const titleLower = (post.title || '').toLowerCase();
    const tagsLower = Array.isArray(post.tags) ? post.tags.map(t => t.toLowerCase()) : [];
    const styleTagsLower = Array.isArray(post.styleTags) ? post.styleTags.map(t => t.toLowerCase()) : [];
    const toolsLower = Array.isArray(post.toolsUsed) ? post.toolsUsed.map(t => t.toLowerCase()) : [];
    const catLower = typeof post.category === 'string' ? post.category.toLowerCase() : '';

    // Full query match in any field
    if (
      titleLower.includes(qLower) ||
      tagsLower.some(t => t.includes(qLower)) ||
      styleTagsLower.some(t => t.includes(qLower)) ||
      toolsLower.some(t => t.includes(qLower)) ||
      catLower.includes(qLower)
    ) {
      return true;
    }

    // Token match in any field (only if tokens exist)
    if (qTokens.length > 0) {
      return qTokens.some(token =>
        titleLower.includes(token) ||
        tagsLower.some(t => t.includes(token)) ||
        styleTagsLower.some(t => t.includes(token)) ||
        toolsLower.some(t => t.includes(token))
      );
    }

    return false;
  });

  // If zero posts have any matching metadata, candidatePosts will be empty
  const suggestions: string[] = [];

  if (candidatePosts.length > 0) {
    const derived = buildRelatedQueries(cleanQuery, candidatePosts, maxSuggestions);
    for (const d of derived) {
      if (!suggestions.includes(d)) {
        suggestions.push(d);
      }
    }
  }

  // Also include matching real recorded search terms if any
  if (Array.isArray(realSearchTerms) && realSearchTerms.length > 0) {
    for (const term of realSearchTerms) {
      const tLower = term.trim().toLowerCase();
      if (tLower === qLower) continue;
      if (
        tLower.includes(qLower) ||
        (qTokens.length > 0 && qTokens.some(tok => tLower.includes(tok)))
      ) {
        const display = formatDisplayQuery(term);
        if (!suggestions.some(s => s.toLowerCase() === tLower)) {
          suggestions.push(display);
        }
      }
    }
  }

  // Strictly enforce that all returned suggestions are actually related to the user's query
  const strictlyRelated = suggestions.filter(item => {
    const itemLower = item.toLowerCase();
    if (itemLower.includes(qLower)) return true;
    if (qTokens.length > 0 && qTokens.some(tok => itemLower.includes(tok))) return true;
    return false;
  });

  return strictlyRelated.slice(0, maxSuggestions);
};

