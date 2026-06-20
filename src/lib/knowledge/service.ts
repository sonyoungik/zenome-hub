import {
  KnowledgeBuildResult,
  KnowledgeGraph,
  KnowledgeItem,
  KnowledgeProjectType,
  KnowledgeQueryResult,
  KnowledgeSourceRef,
  KnowledgeSourceType,
} from "./types";

import {
  KnowledgeChunkingOptions,
} from "./chunker";

import {
  buildKnowledgeItemsFromTexts,
  getKnowledgeBuildStats,
} from "./builder";

import {
  buildKnowledgeGraph,
  KnowledgeGraphStats,
} from "./graph";

import {
  createKnowledgeSearchIndex,
  searchKnowledgeItems,
} from "./search";

export interface KnowledgeDocumentInput {
  title: string;
  rawText: string;
  sourceType?: KnowledgeSourceType;
  sourceRef?: KnowledgeSourceRef;
  tags?: string[];
}

export interface KnowledgeServiceBuildInput {
  projectId: string;
  projectType?: KnowledgeProjectType;
  documents: KnowledgeDocumentInput[];
  chunkingOptions?: KnowledgeChunkingOptions;
  buildGraph?: boolean;
}

export interface KnowledgeServiceBuildResult {
  projectId: string;
  items: KnowledgeItem[];
  graph?: KnowledgeGraph;
  buildStats: ReturnType<typeof getKnowledgeBuildStats>;
  graphStats?: KnowledgeGraphStats;
  warnings: string[];
  errors: string[];
}

export interface KnowledgeServiceQueryInput {
  projectId: string;
  query: string;
  items: KnowledgeItem[];
  graph?: KnowledgeGraph;
  sourceTypes?: KnowledgeSourceType[];
  tags?: string[];
  limit?: number;
}

export interface KnowledgeServiceQueryResult {
  projectId: string;
  query: string;
  results: KnowledgeQueryResult[];
  graph?: KnowledgeGraph;
  answerContext: string;
}

export function buildKnowledgeBase(
  input: KnowledgeServiceBuildInput
): KnowledgeServiceBuildResult {
  const buildResult: KnowledgeBuildResult = buildKnowledgeItemsFromTexts({
    projectId: input.projectId,
    projectType: input.projectType ?? "research_project",
    documents: input.documents,
    chunkingOptions: input.chunkingOptions,
  });

  const warnings = [...(buildResult.warnings ?? [])];
  const errors = [...(buildResult.errors ?? [])];

  let graph: KnowledgeGraph | undefined;
  let graphStats: KnowledgeGraphStats | undefined;

  if (input.buildGraph !== false && buildResult.items.length > 0) {
    try {
      const graphResult = buildKnowledgeGraph({
        projectId: input.projectId,
        items: buildResult.items,
      });

      graph = graphResult.graph;
      graphStats = graphResult.stats;
      warnings.push(...graphResult.warnings);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown graph build error.";

      errors.push(`Knowledge graph build failed: ${message}`);
    }
  }

  return {
    projectId: input.projectId,
    items: buildResult.items,
    graph,
    buildStats: getKnowledgeBuildStats(buildResult),
    graphStats,
    warnings,
    errors,
  };
}

export function queryKnowledgeBase(
  input: KnowledgeServiceQueryInput
): KnowledgeServiceQueryResult {
  const index = createKnowledgeSearchIndex({
    projectId: input.projectId,
    items: input.items,
  });

  const results = searchKnowledgeItems({
    index,
    input: {
      projectId: input.projectId,
      query: input.query,
      sourceTypes: input.sourceTypes,
      tags: input.tags,
      limit: input.limit ?? 8,
    },
    options: {
      includeRawText: true,
      includeChunks: true,
      minScore: 0.03,
    },
  });

  return {
    projectId: input.projectId,
    query: input.query,
    results,
    graph: input.graph,
    answerContext: createKnowledgeAnswerContext(results),
  };
}

export function createKnowledgeAnswerContext(
  results: KnowledgeQueryResult[]
): string {
  if (results.length === 0) {
    return "No relevant knowledge context was found.";
  }

  return results
    .map((result, index) => {
      const chunks = result.matchingChunks ?? [];

      const chunkText =
        chunks.length > 0
          ? chunks
              .slice(0, 3)
              .map((chunk, chunkIndex) => {
                return [
                  `Chunk ${chunkIndex + 1}`,
                  chunk.heading ? `Heading: ${chunk.heading}` : undefined,
                  chunk.text,
                ]
                  .filter(Boolean)
                  .join("\n");
              })
              .join("\n\n")
          : result.item.rawText?.slice(0, 2000) ?? "";

      return [
        `Knowledge Result ${index + 1}`,
        `Title: ${result.item.title}`,
        `Source Type: ${result.item.sourceType}`,
        `Score: ${result.score ?? 0}`,
        result.rationale ? `Rationale: ${result.rationale}` : undefined,
        "",
        chunkText,
      ]
        .filter((line) => line !== undefined)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

export function createKnowledgeProjectIdFromFolder(folderId: string): string {
  return `drive-folder-${folderId}`;
}

export function createKnowledgeProjectIdFromName(name: string): string {
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `project-${normalizedName || crypto.randomUUID()}`;
}

export function formatKnowledgeServiceBuildReport(
  result: KnowledgeServiceBuildResult
): string {
  const lines: string[] = [];

  lines.push(`Project ID: ${result.projectId}`);
  lines.push(`Items: ${result.buildStats.itemCount}`);
  lines.push(`Chunks: ${result.buildStats.chunkCount}`);
  lines.push(`Raw Characters: ${result.buildStats.totalRawCharacters}`);
  lines.push(`Token Estimate: ${result.buildStats.totalTokenEstimate}`);

  if (result.graphStats) {
    lines.push(`Graph Nodes: ${result.graphStats.nodeCount}`);
    lines.push(`Graph Edges: ${result.graphStats.edgeCount}`);
    lines.push(`Orphan Nodes: ${result.graphStats.orphanNodeCount}`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    result.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    result.errors.forEach((error) => lines.push(`- ${error}`));
  }

  return lines.join("\n");
}