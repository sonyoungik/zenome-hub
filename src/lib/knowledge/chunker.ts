import {
  KnowledgeChunk,
  KnowledgeCitation,
  KnowledgeSourceRef,
  createKnowledgeChunk,
  estimateTokenCount,
} from "./types";

export interface KnowledgeChunkingOptions {
  maxTokensPerChunk?: number;
  overlapTokens?: number;
  preserveHeadings?: boolean;
  minChunkCharacters?: number;
}

export interface KnowledgeChunkingResult {
  chunks: KnowledgeChunk[];
  totalChunks: number;
  totalTokenEstimate: number;
  warnings: string[];
}

interface TextSection {
  heading?: string;
  text: string;
}

const DEFAULT_MAX_TOKENS_PER_CHUNK = 900;
const DEFAULT_OVERLAP_TOKENS = 120;
const DEFAULT_MIN_CHUNK_CHARACTERS = 120;

export function chunkKnowledgeText(params: {
  itemId: string;
  text: string;
  sourceRef?: KnowledgeSourceRef;
  citations?: KnowledgeCitation[];
  options?: KnowledgeChunkingOptions;
}): KnowledgeChunkingResult {
  const warnings: string[] = [];

  const normalizedText = normalizeText(params.text);

  if (!normalizedText) {
    return {
      chunks: [],
      totalChunks: 0,
      totalTokenEstimate: 0,
      warnings: ["Input text is empty after normalization."],
    };
  }

  const maxTokensPerChunk =
    params.options?.maxTokensPerChunk ?? DEFAULT_MAX_TOKENS_PER_CHUNK;

  const overlapTokens =
    params.options?.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

  const minChunkCharacters =
    params.options?.minChunkCharacters ?? DEFAULT_MIN_CHUNK_CHARACTERS;

  if (maxTokensPerChunk <= 0) {
    throw new Error("maxTokensPerChunk must be greater than 0.");
  }

  if (overlapTokens < 0) {
    throw new Error("overlapTokens must be 0 or greater.");
  }

  if (overlapTokens >= maxTokensPerChunk) {
    throw new Error("overlapTokens must be smaller than maxTokensPerChunk.");
  }

  const sections = params.options?.preserveHeadings === false
    ? [{ text: normalizedText }]
    : splitTextByHeadings(normalizedText);

  const rawChunks: Array<{
    heading?: string;
    text: string;
  }> = [];

  for (const section of sections) {
    const sectionChunks = splitSectionIntoChunks({
      section,
      maxTokensPerChunk,
      overlapTokens,
      minChunkCharacters,
    });

    rawChunks.push(...sectionChunks);
  }

  const chunks = rawChunks.map((chunk, index) =>
    createKnowledgeChunk({
      itemId: params.itemId,
      order: index + 1,
      heading: chunk.heading,
      text: chunk.text,
      sourceRef: params.sourceRef,
      citations: params.citations,
    })
  );

  if (chunks.length === 0) {
    warnings.push("No chunks were created from the provided text.");
  }

  return {
    chunks,
    totalChunks: chunks.length,
    totalTokenEstimate: chunks.reduce(
      (sum, chunk) => sum + (chunk.tokenEstimate ?? estimateTokenCount(chunk.text)),
      0
    ),
    warnings,
  };
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitTextByHeadings(text: string): TextSection[] {
  const lines = text.split("\n");
  const sections: TextSection[] = [];

  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (isLikelyHeading(trimmedLine)) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          text: currentLines.join("\n").trim(),
        });
      }

      currentHeading = trimmedLine;
      currentLines = [trimmedLine];
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      text: currentLines.join("\n").trim(),
    });
  }

  return sections.filter((section) => section.text.length > 0);
}

export function isLikelyHeading(line: string): boolean {
  if (!line) return false;
  if (line.length > 120) return false;

  if (/^#{1,6}\s+/.test(line)) return true;
  if (/^\d+(\.\d+)*[.)]?\s+[A-Z가-힣]/.test(line)) return true;
  if (/^(abstract|introduction|background|methods|materials and methods|results|discussion|conclusion|references)$/i.test(line)) return true;
  if (/^(초록|서론|배경|방법|재료 및 방법|결과|고찰|논의|결론|참고문헌)$/i.test(line)) return true;

  const hasSentencePunctuation = /[.!?。！？]$/.test(line);
  const wordCount = line.split(/\s+/).filter(Boolean).length;

  if (!hasSentencePunctuation && wordCount <= 12 && line.length <= 80) {
    return true;
  }

  return false;
}

function splitSectionIntoChunks(params: {
  section: TextSection;
  maxTokensPerChunk: number;
  overlapTokens: number;
  minChunkCharacters: number;
}): Array<{
  heading?: string;
  text: string;
}> {
  const sectionText = params.section.text;
  const sectionTokenEstimate = estimateTokenCount(sectionText);

  if (sectionTokenEstimate <= params.maxTokensPerChunk) {
    return [
      {
        heading: params.section.heading,
        text: sectionText,
      },
    ];
  }

  const paragraphs = sectionText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: Array<{
    heading?: string;
    text: string;
  }> = [];

  let currentParagraphs: string[] = [];
  let currentTokenEstimate = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokenEstimate = estimateTokenCount(paragraph);

    if (paragraphTokenEstimate > params.maxTokensPerChunk) {
      if (currentParagraphs.length > 0) {
        chunks.push({
          heading: params.section.heading,
          text: currentParagraphs.join("\n\n"),
        });

        currentParagraphs = [];
        currentTokenEstimate = 0;
      }

      const sentenceChunks = splitLongParagraphIntoChunks({
        paragraph,
        maxTokensPerChunk: params.maxTokensPerChunk,
        overlapTokens: params.overlapTokens,
      });

      for (const sentenceChunk of sentenceChunks) {
        chunks.push({
          heading: params.section.heading,
          text: sentenceChunk,
        });
      }

      continue;
    }

    const wouldExceedLimit =
      currentTokenEstimate + paragraphTokenEstimate > params.maxTokensPerChunk;

    if (wouldExceedLimit && currentParagraphs.length > 0) {
      chunks.push({
        heading: params.section.heading,
        text: currentParagraphs.join("\n\n"),
      });

      const overlapParagraphs = getOverlapParagraphs({
        paragraphs: currentParagraphs,
        overlapTokens: params.overlapTokens,
      });

      currentParagraphs = overlapParagraphs;
      currentTokenEstimate = estimateTokenCount(currentParagraphs.join("\n\n"));
    }

    currentParagraphs.push(paragraph);
    currentTokenEstimate += paragraphTokenEstimate;
  }

  if (currentParagraphs.length > 0) {
    const finalText = currentParagraphs.join("\n\n");

    if (
      chunks.length > 0 &&
      finalText.length < params.minChunkCharacters
    ) {
      const previousChunk = chunks[chunks.length - 1];
      previousChunk.text = `${previousChunk.text}\n\n${finalText}`;
    } else {
      chunks.push({
        heading: params.section.heading,
        text: finalText,
      });
    }
  }

  return chunks;
}

function splitLongParagraphIntoChunks(params: {
  paragraph: string;
  maxTokensPerChunk: number;
  overlapTokens: number;
}): string[] {
  const sentences = params.paragraph
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return splitTextByCharacterWindow({
      text: params.paragraph,
      maxTokensPerChunk: params.maxTokensPerChunk,
      overlapTokens: params.overlapTokens,
    });
  }

  const chunks: string[] = [];
  let currentSentences: string[] = [];
  let currentTokenEstimate = 0;

  for (const sentence of sentences) {
    const sentenceTokenEstimate = estimateTokenCount(sentence);

    if (
      currentTokenEstimate + sentenceTokenEstimate > params.maxTokensPerChunk &&
      currentSentences.length > 0
    ) {
      chunks.push(currentSentences.join(" "));

      const overlapSentences = getOverlapSentences({
        sentences: currentSentences,
        overlapTokens: params.overlapTokens,
      });

      currentSentences = overlapSentences;
      currentTokenEstimate = estimateTokenCount(currentSentences.join(" "));
    }

    currentSentences.push(sentence);
    currentTokenEstimate += sentenceTokenEstimate;
  }

  if (currentSentences.length > 0) {
    chunks.push(currentSentences.join(" "));
  }

  return chunks;
}

function splitTextByCharacterWindow(params: {
  text: string;
  maxTokensPerChunk: number;
  overlapTokens: number;
}): string[] {
  const maxCharacters = params.maxTokensPerChunk * 4;
  const overlapCharacters = params.overlapTokens * 4;
  const step = Math.max(1, maxCharacters - overlapCharacters);

  const chunks: string[] = [];

  for (let start = 0; start < params.text.length; start += step) {
    const end = Math.min(start + maxCharacters, params.text.length);
    chunks.push(params.text.slice(start, end).trim());

    if (end >= params.text.length) break;
  }

  return chunks.filter(Boolean);
}

function getOverlapParagraphs(params: {
  paragraphs: string[];
  overlapTokens: number;
}): string[] {
  if (params.overlapTokens <= 0) return [];

  const overlapParagraphs: string[] = [];
  let tokenCount = 0;

  for (let i = params.paragraphs.length - 1; i >= 0; i -= 1) {
    const paragraph = params.paragraphs[i];
    const paragraphTokens = estimateTokenCount(paragraph);

    if (tokenCount + paragraphTokens > params.overlapTokens) {
      break;
    }

    overlapParagraphs.unshift(paragraph);
    tokenCount += paragraphTokens;
  }

  return overlapParagraphs;
}

function getOverlapSentences(params: {
  sentences: string[];
  overlapTokens: number;
}): string[] {
  if (params.overlapTokens <= 0) return [];

  const overlapSentences: string[] = [];
  let tokenCount = 0;

  for (let i = params.sentences.length - 1; i >= 0; i -= 1) {
    const sentence = params.sentences[i];
    const sentenceTokens = estimateTokenCount(sentence);

    if (tokenCount + sentenceTokens > params.overlapTokens) {
      break;
    }

    overlapSentences.unshift(sentence);
    tokenCount += sentenceTokens;
  }

  return overlapSentences;
}