import {
  KnowledgeItem,
  KnowledgeQueryInput,
  KnowledgeQueryResult,
  KnowledgeSourceType,
  KnowledgeChunk,
} from "./types";

export interface KnowledgeSearchIndex {
  projectId: string;
  items: KnowledgeItem[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSearchOptions {
  includeRawText?: boolean;
  includeChunks?: boolean;
  caseSensitive?: boolean;
  minScore?: number;
}

export interface KnowledgeSearchMatch {
  itemId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  score: number;
  matchedFields: string[];
  matchingChunks: KnowledgeChunk[];
  rationale: string;
}

const DEFAULT_RESULT_LIMIT = 10;
const DEFAULT_MIN_SCORE = 0.05;

export function createKnowledgeSearchIndex(params: {
  projectId: string;
  items: KnowledgeItem[];
}): KnowledgeSearchIndex {
  const now = new Date().toISOString();

  return {
    projectId: params.projectId,
    items: params.items,
    createdAt: now,
    updatedAt: now,
  };
}

export function searchKnowledgeItems(params: {
  index: KnowledgeSearchIndex;
  input: KnowledgeQueryInput;
  options?: KnowledgeSearchOptions;
}): KnowledgeQueryResult[] {
  if (!params.input.query || !params.input.query.trim()) {
    return [];
  }

  const limit = params.input.limit ?? DEFAULT_RESULT_LIMIT;
  const minScore = params.options?.minScore ?? DEFAULT_MIN_SCORE;

  const queryTerms = tokenizeSearchQuery(
    params.input.query,
    params.options?.caseSensitive ?? false
  );

  if (queryTerms.length === 0) {
    return [];
  }

  const filteredItems = params.index.items.filter((item) =>
    isKnowledgeItemEligible(item, {
      projectId: params.input.projectId,
      sourceTypes: params.input.sourceTypes,
      tags: params.input.tags,
    })
  );

  const matches = filteredItems
    .map((item) =>
      scoreKnowledgeItem({
        item,
        queryTerms,
        options: params.options,
      })
    )
    .filter((match) => match.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return matches.map((match) => ({
    item: params.index.items.find((item) => item.itemId === match.itemId)!,
    matchingChunks: match.matchingChunks,
    score: match.score,
    rationale: match.rationale,
  }));
}

export function scoreKnowledgeItem(params: {
  item: KnowledgeItem;
  queryTerms: string[];
  options?: KnowledgeSearchOptions;
}): KnowledgeSearchMatch {
  const caseSensitive = params.options?.caseSensitive ?? false;
  const includeRawText = params.options?.includeRawText ?? true;
  const includeChunks = params.options?.includeChunks ?? true;

  const matchedFields: string[] = [];
  const matchingChunks: KnowledgeChunk[] = [];

  let score = 0;

  const titleScore = scoreTextAgainstTerms({
    text: params.item.title,
    queryTerms: params.queryTerms,
    weight: 4,
    caseSensitive,
  });

  if (titleScore > 0) {
    score += titleScore;
    matchedFields.push("title");
  }

  const tagText = (params.item.tags ?? []).join(" ");

  const tagScore = scoreTextAgainstTerms({
    text: tagText,
    queryTerms: params.queryTerms,
    weight: 3,
    caseSensitive,
  });

  if (tagScore > 0) {
    score += tagScore;
    matchedFields.push("tags");
  }

  const summaryText = [
    params.item.summary?.shortSummary,
    params.item.summary?.detailedSummary,
    ...(params.item.summary?.keyFindings ?? []),
    ...(params.item.summary?.limitations ?? []),
    ...(params.item.summary?.researchQuestions ?? []),
    ...(params.item.summary?.suggestedNextActions ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  const summaryScore = scoreTextAgainstTerms({
    text: summaryText,
    queryTerms: params.queryTerms,
    weight: 3,
    caseSensitive,
  });

  if (summaryScore > 0) {
    score += summaryScore;
    matchedFields.push("summary");
  }

  const citationText = (params.item.citations ?? [])
    .map((citation) =>
      [
        citation.title,
        citation.authors?.join(" "),
        citation.journal,
        citation.year?.toString(),
        citation.doi,
        citation.pmid,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ");

  const citationScore = scoreTextAgainstTerms({
    text: citationText,
    queryTerms: params.queryTerms,
    weight: 3,
    caseSensitive,
  });

  if (citationScore > 0) {
    score += citationScore;
    matchedFields.push("citations");
  }

  const entityText = (params.item.entities ?? [])
    .map((entity) =>
      [
        entity.name,
        entity.type,
        entity.aliases?.join(" "),
        entity.description,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ");

  const entityScore = scoreTextAgainstTerms({
    text: entityText,
    queryTerms: params.queryTerms,
    weight: 3,
    caseSensitive,
  });

  if (entityScore > 0) {
    score += entityScore;
    matchedFields.push("entities");
  }

  if (includeRawText) {
    const rawTextScore = scoreTextAgainstTerms({
      text: params.item.rawText ?? "",
      queryTerms: params.queryTerms,
      weight: 1,
      caseSensitive,
    });

    if (rawTextScore > 0) {
      score += rawTextScore;
      matchedFields.push("rawText");
    }
  }

  if (includeChunks) {
    for (const chunk of params.item.chunks ?? []) {
      const chunkScore = scoreTextAgainstTerms({
        text: chunk.text,
        queryTerms: params.queryTerms,
        weight: 2,
        caseSensitive,
      });

      if (chunkScore > 0) {
        score += chunkScore;
        matchingChunks.push(chunk);
      }
    }
  }

  const normalizedScore = normalizeScore(score, params.queryTerms.length);

  return {
    itemId: params.item.itemId,
    title: params.item.title,
    sourceType: params.item.sourceType,
    score: normalizedScore,
    matchedFields,
    matchingChunks: matchingChunks.slice(0, 5),
    rationale: createSearchRationale({
      title: params.item.title,
      score: normalizedScore,
      matchedFields,
      matchingChunkCount: matchingChunks.length,
    }),
  };
}

export function isKnowledgeItemEligible(
  item: KnowledgeItem,
  filters: {
    projectId: string;
    sourceTypes?: KnowledgeSourceType[];
    tags?: string[];
  }
): boolean {
  if (item.projectId !== filters.projectId) {
    return false;
  }

  if (
    filters.sourceTypes &&
    filters.sourceTypes.length > 0 &&
    !filters.sourceTypes.includes(item.sourceType)
  ) {
    return false;
  }

  if (filters.tags && filters.tags.length > 0) {
    const itemTags = new Set((item.tags ?? []).map((tag) => tag.toLowerCase()));

    const hasAtLeastOneTag = filters.tags.some((tag) =>
      itemTags.has(tag.toLowerCase())
    );

    if (!hasAtLeastOneTag) {
      return false;
    }
  }

  return true;
}

export function tokenizeSearchQuery(
  query: string,
  caseSensitive = false
): string[] {
  const normalizedQuery = caseSensitive ? query : query.toLowerCase();

  return normalizedQuery
    .split(/[\s,.;:()[\]{}"'`~!@#$%^&*+=|\\/<>?]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

export function scoreTextAgainstTerms(params: {
  text: string;
  queryTerms: string[];
  weight: number;
  caseSensitive?: boolean;
}): number {
  if (!params.text) return 0;

  const text = params.caseSensitive ? params.text : params.text.toLowerCase();

  let score = 0;

  for (const term of params.queryTerms) {
    const occurrences = countOccurrences(text, term);

    if (occurrences > 0) {
      score += params.weight * Math.min(occurrences, 10);
    }
  }

  return score;
}

export function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;

  let count = 0;
  let position = 0;

  while (true) {
    const foundPosition = text.indexOf(term, position);

    if (foundPosition === -1) {
      break;
    }

    count += 1;
    position = foundPosition + term.length;
  }

  return count;
}

export function normalizeScore(rawScore: number, queryTermCount: number): number {
  if (rawScore <= 0 || queryTermCount <= 0) return 0;

  const adjusted = rawScore / Math.max(1, queryTermCount);
  const normalized = adjusted / (adjusted + 20);

  return Number(normalized.toFixed(4));
}

export function createSearchRationale(params: {
  title: string;
  score: number;
  matchedFields: string[];
  matchingChunkCount: number;
}): string {
  const fieldText =
    params.matchedFields.length > 0
      ? params.matchedFields.join(", ")
      : "none";

  return [
    `Matched item: ${params.title}`,
    `Score: ${params.score}`,
    `Matched fields: ${fieldText}`,
    `Matching chunks: ${params.matchingChunkCount}`,
  ].join(" | ");
}

export function getTopMatchingChunks(params: {
  item: KnowledgeItem;
  query: string;
  limit?: number;
  caseSensitive?: boolean;
}): KnowledgeChunk[] {
  const queryTerms = tokenizeSearchQuery(
    params.query,
    params.caseSensitive ?? false
  );

  const scoredChunks = (params.item.chunks ?? [])
    .map((chunk) => ({
      chunk,
      score: scoreTextAgainstTerms({
        text: chunk.text,
        queryTerms,
        weight: 1,
        caseSensitive: params.caseSensitive ?? false,
      }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit ?? 5);

  return scoredChunks.map((entry) => entry.chunk);
}

export function summarizeSearchResults(results: KnowledgeQueryResult[]): string {
  if (results.length === 0) {
    return "No matching knowledge items were found.";
  }

  return results
    .map((result, index) => {
      const chunkCount = result.matchingChunks?.length ?? 0;

      return [
        `${index + 1}. ${result.item.title}`,
        `Source Type: ${result.item.sourceType}`,
        `Score: ${result.score ?? 0}`,
        `Matching Chunks: ${chunkCount}`,
        result.rationale ? `Rationale: ${result.rationale}` : undefined,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}