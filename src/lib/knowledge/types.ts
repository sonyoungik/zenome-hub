export type KnowledgeSourceType =
  | "google_doc"
  | "google_slide"
  | "docx"
  | "pptx"
  | "txt"
  | "markdown"
  | "folder_metadata"
  | "folder_analysis"
  | "multi_file_aggregation"
  | "manual_note"
  | "pubmed_record"
  | "unknown";

export type KnowledgeProjectType =
  | "research_project"
  | "technology_development"
  | "literature_review"
  | "patent_analysis"
  | "proposal"
  | "experiment"
  | "general";

export type KnowledgeItemStatus =
  | "raw"
  | "parsed"
  | "summarized"
  | "indexed"
  | "graph_ready"
  | "error";

export type KnowledgeImportanceLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type KnowledgeEntityType =
  | "paper"
  | "author"
  | "journal"
  | "institution"
  | "technology"
  | "material"
  | "method"
  | "device"
  | "drug"
  | "disease"
  | "gene"
  | "protein"
  | "patent"
  | "project"
  | "experiment"
  | "claim"
  | "risk"
  | "unknown";

export type KnowledgeRelationType =
  | "mentions"
  | "supports"
  | "contradicts"
  | "extends"
  | "uses"
  | "compares_with"
  | "belongs_to"
  | "authored_by"
  | "published_in"
  | "derived_from"
  | "related_to";

export interface KnowledgeSourceRef {
  sourceId: string;
  sourceType: KnowledgeSourceType;
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  webViewLink?: string;
  folderId?: string;
  folderName?: string;
  drivePath?: string[];
}

export interface KnowledgeCitation {
  citationId: string;
  title?: string;
  authors?: string[];
  journal?: string;
  year?: number;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  pmid?: string;
  url?: string;
  sourceRef?: KnowledgeSourceRef;
}

export interface KnowledgeChunk {
  chunkId: string;
  itemId: string;
  order: number;
  heading?: string;
  text: string;
  tokenEstimate?: number;
  sourceRef?: KnowledgeSourceRef;
  citations?: KnowledgeCitation[];
}

export interface KnowledgeSummary {
  shortSummary: string;
  detailedSummary?: string;
  keyFindings?: string[];
  limitations?: string[];
  researchQuestions?: string[];
  suggestedNextActions?: string[];
}

export interface KnowledgeEntity {
  entityId: string;
  name: string;
  type: KnowledgeEntityType;
  aliases?: string[];
  description?: string;
  sourceItemIds?: string[];
  sourceChunkIds?: string[];
  confidence?: number;
}

export interface KnowledgeRelation {
  relationId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: KnowledgeRelationType;
  label?: string;
  evidence?: string;
  sourceItemIds?: string[];
  sourceChunkIds?: string[];
  confidence?: number;
}

export interface KnowledgeGraph {
  graphId: string;
  projectId: string;
  nodes: KnowledgeEntity[];
  edges: KnowledgeRelation[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeItem {
  itemId: string;
  projectId: string;
  projectType: KnowledgeProjectType;
  title: string;
  sourceType: KnowledgeSourceType;
  status: KnowledgeItemStatus;
  importance?: KnowledgeImportanceLevel;
  sourceRef?: KnowledgeSourceRef;
  rawText?: string;
  chunks?: KnowledgeChunk[];
  summary?: KnowledgeSummary;
  citations?: KnowledgeCitation[];
  entities?: KnowledgeEntity[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface KnowledgeProject {
  projectId: string;
  name: string;
  type: KnowledgeProjectType;
  description?: string;
  rootFolderId?: string;
  rootFolderName?: string;
  tags?: string[];
  itemIds?: string[];
  graphId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBuildInput {
  projectId: string;
  projectType?: KnowledgeProjectType;
  sourceRefs: KnowledgeSourceRef[];
  includeSubfolders?: boolean;
  maxFiles?: number;
  maxDepth?: number;
}

export interface KnowledgeBuildResult {
  projectId: string;
  items: KnowledgeItem[];
  graph?: KnowledgeGraph;
  warnings?: string[];
  errors?: string[];
}

export interface KnowledgeQueryInput {
  projectId: string;
  query: string;
  sourceTypes?: KnowledgeSourceType[];
  tags?: string[];
  limit?: number;
}

export interface KnowledgeQueryResult {
  item: KnowledgeItem;
  matchingChunks?: KnowledgeChunk[];
  score?: number;
  rationale?: string;
}

export function createKnowledgeItem(params: {
  projectId: string;
  projectType?: KnowledgeProjectType;
  title: string;
  sourceType: KnowledgeSourceType;
  sourceRef?: KnowledgeSourceRef;
  rawText?: string;
  tags?: string[];
}): KnowledgeItem {
  const now = new Date().toISOString();

  return {
    itemId: crypto.randomUUID(),
    projectId: params.projectId,
    projectType: params.projectType ?? "research_project",
    title: params.title,
    sourceType: params.sourceType,
    status: params.rawText ? "parsed" : "raw",
    sourceRef: params.sourceRef,
    rawText: params.rawText,
    tags: params.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createKnowledgeChunk(params: {
  itemId: string;
  order: number;
  text: string;
  heading?: string;
  sourceRef?: KnowledgeSourceRef;
  citations?: KnowledgeCitation[];
}): KnowledgeChunk {
  return {
    chunkId: crypto.randomUUID(),
    itemId: params.itemId,
    order: params.order,
    heading: params.heading,
    text: params.text,
    tokenEstimate: estimateTokenCount(params.text),
    sourceRef: params.sourceRef,
    citations: params.citations ?? [],
  };
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function normalizeKnowledgeSourceType(mimeType?: string, fileName?: string): KnowledgeSourceType {
  const lowerMime = mimeType?.toLowerCase() ?? "";
  const lowerName = fileName?.toLowerCase() ?? "";

  if (lowerMime.includes("google-apps.document")) return "google_doc";
  if (lowerMime.includes("google-apps.presentation")) return "google_slide";
  if (lowerMime.includes("wordprocessingml.document") || lowerName.endsWith(".docx")) return "docx";
  if (lowerMime.includes("presentationml.presentation") || lowerName.endsWith(".pptx")) return "pptx";
  if (lowerMime.includes("text/plain") || lowerName.endsWith(".txt")) return "txt";
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) return "markdown";

  return "unknown";
}