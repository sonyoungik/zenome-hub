import {
  KnowledgeBuildInput,
  KnowledgeBuildResult,
  KnowledgeItem,
  KnowledgeProjectType,
  KnowledgeSourceRef,
  KnowledgeSourceType,
  createKnowledgeItem,
  normalizeKnowledgeSourceType,
} from "./types";

import {
  KnowledgeChunkingOptions,
  chunkKnowledgeText,
} from "./chunker";

export interface KnowledgeBuildFromTextInput {
  projectId: string;
  projectType?: KnowledgeProjectType;
  title: string;
  rawText: string;
  sourceType?: KnowledgeSourceType;
  sourceRef?: KnowledgeSourceRef;
  tags?: string[];
  chunkingOptions?: KnowledgeChunkingOptions;
}

export interface KnowledgeBuildFromTextsInput {
  projectId: string;
  projectType?: KnowledgeProjectType;
  documents: Array<{
    title: string;
    rawText: string;
    sourceType?: KnowledgeSourceType;
    sourceRef?: KnowledgeSourceRef;
    tags?: string[];
  }>;
  chunkingOptions?: KnowledgeChunkingOptions;
}

export interface KnowledgeBuildValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export function buildKnowledgeItemFromText(
  input: KnowledgeBuildFromTextInput
): KnowledgeItem {
  const validation = validateKnowledgeTextInput(input);

  if (!validation.valid) {
    throw new Error(validation.errors.join("\n"));
  }

  const resolvedSourceType =
    input.sourceType ??
    normalizeKnowledgeSourceType(
      input.sourceRef?.mimeType,
      input.sourceRef?.fileName
    );

  const item = createKnowledgeItem({
    projectId: input.projectId,
    projectType: input.projectType ?? "research_project",
    title: input.title,
    sourceType: resolvedSourceType,
    sourceRef: input.sourceRef,
    rawText: input.rawText,
    tags: input.tags,
  });

  const chunkingResult = chunkKnowledgeText({
    itemId: item.itemId,
    text: input.rawText,
    sourceRef: input.sourceRef,
    options: input.chunkingOptions,
  });

  return {
    ...item,
    status: chunkingResult.chunks.length > 0 ? "indexed" : "parsed",
    chunks: chunkingResult.chunks,
    updatedAt: new Date().toISOString(),
  };
}

export function buildKnowledgeItemsFromTexts(
  input: KnowledgeBuildFromTextsInput
): KnowledgeBuildResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const items: KnowledgeItem[] = [];

  if (!input.projectId || !input.projectId.trim()) {
    return {
      projectId: input.projectId,
      items: [],
      warnings,
      errors: ["projectId is required."],
    };
  }

  if (!Array.isArray(input.documents) || input.documents.length === 0) {
    return {
      projectId: input.projectId,
      items: [],
      warnings,
      errors: ["At least one document is required."],
    };
  }

  for (const document of input.documents) {
    try {
      const item = buildKnowledgeItemFromText({
        projectId: input.projectId,
        projectType: input.projectType ?? "research_project",
        title: document.title,
        rawText: document.rawText,
        sourceType: document.sourceType,
        sourceRef: document.sourceRef,
        tags: document.tags,
        chunkingOptions: input.chunkingOptions,
      });

      items.push(item);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown build error.";

      errors.push(`Failed to build knowledge item "${document.title}": ${message}`);
    }
  }

  if (items.length === 0 && errors.length > 0) {
    warnings.push("No knowledge items were created.");
  }

  return {
    projectId: input.projectId,
    items,
    warnings,
    errors,
  };
}

export function validateKnowledgeTextInput(
  input: KnowledgeBuildFromTextInput
): KnowledgeBuildValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!input.projectId || !input.projectId.trim()) {
    errors.push("projectId is required.");
  }

  if (!input.title || !input.title.trim()) {
    errors.push("title is required.");
  }

  if (!input.rawText || !input.rawText.trim()) {
    errors.push("rawText is required.");
  }

  if (input.rawText && input.rawText.trim().length < 100) {
    warnings.push("rawText is very short. Knowledge extraction quality may be limited.");
  }

  if (input.sourceRef?.mimeType || input.sourceRef?.fileName) {
    const detectedSourceType = normalizeKnowledgeSourceType(
      input.sourceRef.mimeType,
      input.sourceRef.fileName
    );

    if (detectedSourceType === "unknown" && !input.sourceType) {
      warnings.push("sourceType could not be inferred from sourceRef.");
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function buildEmptyKnowledgeResult(input: KnowledgeBuildInput): KnowledgeBuildResult {
  return {
    projectId: input.projectId,
    items: [],
    warnings: [
      "No source content was provided. This result only confirms the KnowledgeBuildInput structure.",
    ],
    errors: [],
  };
}

export function flattenKnowledgeItemsText(items: KnowledgeItem[]): string {
  return items
    .map((item) => {
      const title = item.title || "Untitled Knowledge Item";
      const sourceType = item.sourceType || "unknown";
      const text = item.rawText || "";

      return [
        `# ${title}`,
        `Source Type: ${sourceType}`,
        "",
        text,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

export function getKnowledgeItemStats(item: KnowledgeItem): {
  itemId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  status: string;
  rawCharacterCount: number;
  chunkCount: number;
  totalTokenEstimate: number;
} {
  const chunks = item.chunks ?? [];

  return {
    itemId: item.itemId,
    title: item.title,
    sourceType: item.sourceType,
    status: item.status,
    rawCharacterCount: item.rawText?.length ?? 0,
    chunkCount: chunks.length,
    totalTokenEstimate: chunks.reduce(
      (sum, chunk) => sum + (chunk.tokenEstimate ?? 0),
      0
    ),
  };
}

export function getKnowledgeBuildStats(result: KnowledgeBuildResult): {
  projectId: string;
  itemCount: number;
  chunkCount: number;
  totalRawCharacters: number;
  totalTokenEstimate: number;
  warningCount: number;
  errorCount: number;
} {
  return {
    projectId: result.projectId,
    itemCount: result.items.length,
    chunkCount: result.items.reduce(
      (sum, item) => sum + (item.chunks?.length ?? 0),
      0
    ),
    totalRawCharacters: result.items.reduce(
      (sum, item) => sum + (item.rawText?.length ?? 0),
      0
    ),
    totalTokenEstimate: result.items.reduce(
      (sum, item) =>
        sum +
        (item.chunks ?? []).reduce(
          (chunkSum, chunk) => chunkSum + (chunk.tokenEstimate ?? 0),
          0
        ),
      0
    ),
    warningCount: result.warnings?.length ?? 0,
    errorCount: result.errors?.length ?? 0,
  };
}