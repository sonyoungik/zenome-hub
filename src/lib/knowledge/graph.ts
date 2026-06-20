import {
  KnowledgeEntity,
  KnowledgeEntityType,
  KnowledgeGraph,
  KnowledgeItem,
  KnowledgeRelation,
  KnowledgeRelationType,
} from "./types";

export interface KnowledgeGraphBuildInput {
  projectId: string;
  items: KnowledgeItem[];
  existingGraph?: KnowledgeGraph;
}

export interface KnowledgeGraphBuildResult {
  graph: KnowledgeGraph;
  stats: KnowledgeGraphStats;
  warnings: string[];
}

export interface KnowledgeGraphStats {
  projectId: string;
  nodeCount: number;
  edgeCount: number;
  itemCount: number;
  orphanNodeCount: number;
}

export interface EntityCandidate {
  name: string;
  type: KnowledgeEntityType;
  description?: string;
  sourceItemId: string;
  sourceChunkId?: string;
  confidence?: number;
}

export interface RelationCandidate {
  sourceEntityName: string;
  targetEntityName: string;
  sourceEntityType?: KnowledgeEntityType;
  targetEntityType?: KnowledgeEntityType;
  type: KnowledgeRelationType;
  label?: string;
  evidence?: string;
  sourceItemId: string;
  sourceChunkId?: string;
  confidence?: number;
}

export function buildKnowledgeGraph(
  input: KnowledgeGraphBuildInput
): KnowledgeGraphBuildResult {
  const warnings: string[] = [];

  if (!input.projectId || !input.projectId.trim()) {
    throw new Error("projectId is required.");
  }

  if (!Array.isArray(input.items)) {
    throw new Error("items must be an array.");
  }

  const baseGraph: KnowledgeGraph =
    input.existingGraph ?? createEmptyKnowledgeGraph(input.projectId);

  const entityCandidates = collectEntityCandidatesFromItems(input.items);
  const relationCandidates = collectRelationCandidatesFromItems(input.items);
  const relationEntityCandidates =
    collectEntityCandidatesFromRelations(relationCandidates);

  let nodes = [...baseGraph.nodes];
  let edges = [...baseGraph.edges];

  for (const candidate of [
    ...entityCandidates,
    ...relationEntityCandidates,
  ]) {
    nodes = upsertKnowledgeEntity(nodes, candidate);
  }

  for (const candidate of relationCandidates) {
    const sourceEntity = findEntityByNameAndType(
      nodes,
      candidate.sourceEntityName,
      candidate.sourceEntityType
    );

    const targetEntity = findEntityByNameAndType(
      nodes,
      candidate.targetEntityName,
      candidate.targetEntityType
    );

    if (!sourceEntity || !targetEntity) {
      warnings.push(
        `Skipped relation because entity was not found: ${candidate.sourceEntityName} -> ${candidate.targetEntityName}`
      );
      continue;
    }

    edges = upsertKnowledgeRelation(edges, {
      sourceEntityId: sourceEntity.entityId,
      targetEntityId: targetEntity.entityId,
      type: candidate.type,
      label: candidate.label,
      evidence: candidate.evidence,
      sourceItemId: candidate.sourceItemId,
      sourceChunkId: candidate.sourceChunkId,
      confidence: candidate.confidence,
    });
  }

  const graph: KnowledgeGraph = {
    ...baseGraph,
    nodes,
    edges,
    updatedAt: new Date().toISOString(),
  };

  return {
    graph,
    stats: getKnowledgeGraphStats(graph, input.items.length),
    warnings,
  };
}

export function createEmptyKnowledgeGraph(projectId: string): KnowledgeGraph {
  const now = new Date().toISOString();

  return {
    graphId: crypto.randomUUID(),
    projectId,
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function collectEntityCandidatesFromItems(
  items: KnowledgeItem[]
): EntityCandidate[] {
  const candidates: EntityCandidate[] = [];

  for (const item of items) {
    if (item.entities && item.entities.length > 0) {
      for (const entity of item.entities) {
        candidates.push({
          name: entity.name,
          type: entity.type,
          description: entity.description,
          sourceItemId: item.itemId,
          confidence: entity.confidence,
        });
      }
    }

    candidates.push({
      name: item.title,
      type: inferEntityTypeFromKnowledgeItem(item),
      description: item.summary?.shortSummary,
      sourceItemId: item.itemId,
      confidence: 0.8,
    });

    const citationCandidates = extractCitationEntitiesFromItem(item);
    candidates.push(...citationCandidates);
  }

  return deduplicateEntityCandidates(candidates);
}

export function collectEntityCandidatesFromRelations(
  relationCandidates: RelationCandidate[]
): EntityCandidate[] {
  const candidates: EntityCandidate[] = [];

  for (const relation of relationCandidates) {
    candidates.push({
      name: relation.sourceEntityName,
      type: relation.sourceEntityType ?? "unknown",
      description: `Source entity inferred from relation: ${relation.type}`,
      sourceItemId: relation.sourceItemId,
      sourceChunkId: relation.sourceChunkId,
      confidence: relation.confidence ?? 0.5,
    });

    candidates.push({
      name: relation.targetEntityName,
      type: relation.targetEntityType ?? "unknown",
      description: `Target entity inferred from relation: ${relation.type}`,
      sourceItemId: relation.sourceItemId,
      sourceChunkId: relation.sourceChunkId,
      confidence: relation.confidence ?? 0.5,
    });
  }

  return deduplicateEntityCandidates(candidates);
}

export function collectRelationCandidatesFromItems(
  items: KnowledgeItem[]
): RelationCandidate[] {
  const candidates: RelationCandidate[] = [];

  for (const item of items) {
    const itemEntityType = inferEntityTypeFromKnowledgeItem(item);

    if (item.citations && item.citations.length > 0) {
      for (const citation of item.citations) {
        if (citation.title) {
          candidates.push({
            sourceEntityName: item.title,
            targetEntityName: citation.title,
            sourceEntityType: itemEntityType,
            targetEntityType: "paper",
            type: "mentions",
            label: "mentions cited paper",
            evidence: citation.title,
            sourceItemId: item.itemId,
            confidence: 0.7,
          });
        }

        if (citation.journal) {
          candidates.push({
            sourceEntityName: citation.title ?? item.title,
            targetEntityName: citation.journal,
            sourceEntityType: citation.title ? "paper" : itemEntityType,
            targetEntityType: "journal",
            type: "published_in",
            label: "published in",
            evidence: citation.journal,
            sourceItemId: item.itemId,
            confidence: 0.8,
          });
        }

        if (citation.authors && citation.authors.length > 0 && citation.title) {
          for (const author of citation.authors) {
            candidates.push({
              sourceEntityName: citation.title,
              targetEntityName: author,
              sourceEntityType: "paper",
              targetEntityType: "author",
              type: "authored_by",
              label: "authored by",
              evidence: author,
              sourceItemId: item.itemId,
              confidence: 0.8,
            });
          }
        }
      }
    }

    const chunkRelations = extractBasicRelationsFromChunks(item);
    candidates.push(...chunkRelations);
  }

  return deduplicateRelationCandidates(candidates);
}

export function upsertKnowledgeEntity(
  nodes: KnowledgeEntity[],
  candidate: EntityCandidate
): KnowledgeEntity[] {
  const normalizedName = normalizeEntityName(candidate.name);

  if (!normalizedName) return nodes;

  const existingIndex = nodes.findIndex(
    (node) =>
      normalizeEntityName(node.name) === normalizedName &&
      node.type === candidate.type
  );

  if (existingIndex >= 0) {
    const existing = nodes[existingIndex];

    const merged: KnowledgeEntity = {
      ...existing,
      description: existing.description ?? candidate.description,
      sourceItemIds: mergeUniqueValues(existing.sourceItemIds, [
        candidate.sourceItemId,
      ]),
      sourceChunkIds: mergeUniqueValues(
        existing.sourceChunkIds,
        candidate.sourceChunkId ? [candidate.sourceChunkId] : []
      ),
      confidence: Math.max(
        existing.confidence ?? 0,
        candidate.confidence ?? 0
      ),
    };

    return [
      ...nodes.slice(0, existingIndex),
      merged,
      ...nodes.slice(existingIndex + 1),
    ];
  }

  const entity: KnowledgeEntity = {
    entityId: crypto.randomUUID(),
    name: candidate.name.trim(),
    type: candidate.type,
    description: candidate.description,
    sourceItemIds: [candidate.sourceItemId],
    sourceChunkIds: candidate.sourceChunkId ? [candidate.sourceChunkId] : [],
    confidence: candidate.confidence ?? 0.5,
  };

  return [...nodes, entity];
}

export function upsertKnowledgeRelation(
  edges: KnowledgeRelation[],
  input: {
    sourceEntityId: string;
    targetEntityId: string;
    type: KnowledgeRelationType;
    label?: string;
    evidence?: string;
    sourceItemId: string;
    sourceChunkId?: string;
    confidence?: number;
  }
): KnowledgeRelation[] {
  const existingIndex = edges.findIndex(
    (edge) =>
      edge.sourceEntityId === input.sourceEntityId &&
      edge.targetEntityId === input.targetEntityId &&
      edge.type === input.type
  );

  if (existingIndex >= 0) {
    const existing = edges[existingIndex];

    const merged: KnowledgeRelation = {
      ...existing,
      label: existing.label ?? input.label,
      evidence: existing.evidence ?? input.evidence,
      sourceItemIds: mergeUniqueValues(existing.sourceItemIds, [
        input.sourceItemId,
      ]),
      sourceChunkIds: mergeUniqueValues(
        existing.sourceChunkIds,
        input.sourceChunkId ? [input.sourceChunkId] : []
      ),
      confidence: Math.max(existing.confidence ?? 0, input.confidence ?? 0),
    };

    return [
      ...edges.slice(0, existingIndex),
      merged,
      ...edges.slice(existingIndex + 1),
    ];
  }

  const relation: KnowledgeRelation = {
    relationId: crypto.randomUUID(),
    sourceEntityId: input.sourceEntityId,
    targetEntityId: input.targetEntityId,
    type: input.type,
    label: input.label,
    evidence: input.evidence,
    sourceItemIds: [input.sourceItemId],
    sourceChunkIds: input.sourceChunkId ? [input.sourceChunkId] : [],
    confidence: input.confidence ?? 0.5,
  };

  return [...edges, relation];
}

export function findEntityByNameAndType(
  nodes: KnowledgeEntity[],
  name: string,
  type?: KnowledgeEntityType
): KnowledgeEntity | undefined {
  const normalizedName = normalizeEntityName(name);

  return nodes.find((node) => {
    const sameName = normalizeEntityName(node.name) === normalizedName;
    const sameType = type ? node.type === type : true;

    return sameName && sameType;
  });
}

export function inferEntityTypeFromKnowledgeItem(
  item: KnowledgeItem
): KnowledgeEntityType {
  if (item.sourceType === "pubmed_record") return "paper";

  const lowerTitle = item.title.toLowerCase();
  const lowerTags = (item.tags ?? []).map((tag) => tag.toLowerCase());

  if (lowerTags.includes("paper") || lowerTags.includes("논문")) return "paper";
  if (lowerTags.includes("patent") || lowerTags.includes("특허")) return "patent";
  if (lowerTags.includes("experiment") || lowerTags.includes("실험")) {
    return "experiment";
  }
  if (lowerTags.includes("project") || lowerTags.includes("프로젝트")) {
    return "project";
  }
  if (lowerTags.includes("research note") || lowerTags.includes("연구노트")) {
    return "project";
  }

  if (
    lowerTitle.includes("patent") ||
    lowerTitle.includes("claim") ||
    lowerTitle.includes("특허") ||
    lowerTitle.includes("청구항")
  ) {
    return "patent";
  }

  if (
    lowerTitle.includes("experiment") ||
    lowerTitle.includes("protocol") ||
    lowerTitle.includes("실험") ||
    lowerTitle.includes("프로토콜")
  ) {
    return "experiment";
  }

  if (
    lowerTitle.includes("paper") ||
    lowerTitle.includes("article") ||
    lowerTitle.includes("논문")
  ) {
    return "paper";
  }

  return "project";
}

export function extractCitationEntitiesFromItem(
  item: KnowledgeItem
): EntityCandidate[] {
  const candidates: EntityCandidate[] = [];

  for (const citation of item.citations ?? []) {
    if (citation.title) {
      candidates.push({
        name: citation.title,
        type: "paper",
        description: createCitationDescription(citation),
        sourceItemId: item.itemId,
        confidence: 0.8,
      });
    }

    if (citation.journal) {
      candidates.push({
        name: citation.journal,
        type: "journal",
        sourceItemId: item.itemId,
        confidence: 0.8,
      });
    }

    for (const author of citation.authors ?? []) {
      candidates.push({
        name: author,
        type: "author",
        sourceItemId: item.itemId,
        confidence: 0.8,
      });
    }
  }

  return candidates;
}

export function extractBasicRelationsFromChunks(
  item: KnowledgeItem
): RelationCandidate[] {
  const candidates: RelationCandidate[] = [];
  const chunks = item.chunks ?? [];
  const itemEntityType = inferEntityTypeFromKnowledgeItem(item);

  for (const chunk of chunks) {
    const text = chunk.text.toLowerCase();

    if (text.includes("microneedle") || text.includes("마이크로니들")) {
      candidates.push({
        sourceEntityName: item.title,
        targetEntityName: "Microneedle",
        sourceEntityType: itemEntityType,
        targetEntityType: "technology",
        type: "mentions",
        label: "mentions technology",
        evidence: chunk.text.slice(0, 300),
        sourceItemId: item.itemId,
        sourceChunkId: chunk.chunkId,
        confidence: 0.6,
      });
    }

    if (
      text.includes("hollow microneedle") ||
      text.includes("hollow-type microneedle") ||
      text.includes("hollow-type") ||
      text.includes("중공형 마이크로니들")
    ) {
      candidates.push({
        sourceEntityName: item.title,
        targetEntityName: "Hollow Microneedle",
        sourceEntityType: itemEntityType,
        targetEntityType: "technology",
        type: "mentions",
        label: "mentions technology",
        evidence: chunk.text.slice(0, 300),
        sourceItemId: item.itemId,
        sourceChunkId: chunk.chunkId,
        confidence: 0.7,
      });
    }

    if (
      text.includes("drug delivery") ||
      text.includes("transdermal") ||
      text.includes("경피") ||
      text.includes("약물전달")
    ) {
      candidates.push({
        sourceEntityName: item.title,
        targetEntityName: "Transdermal Drug Delivery",
        sourceEntityType: itemEntityType,
        targetEntityType: "method",
        type: "mentions",
        label: "mentions method",
        evidence: chunk.text.slice(0, 300),
        sourceItemId: item.itemId,
        sourceChunkId: chunk.chunkId,
        confidence: 0.6,
      });
    }

    if (
      text.includes("mechanical strength") ||
      text.includes("insertion reliability") ||
      text.includes("clogging risk") ||
      text.includes("dose control") ||
      text.includes("기계적 강도") ||
      text.includes("삽입 신뢰성") ||
      text.includes("막힘") ||
      text.includes("용량 제어")
    ) {
      candidates.push({
        sourceEntityName: item.title,
        targetEntityName: "Device Performance Risk",
        sourceEntityType: itemEntityType,
        targetEntityType: "risk",
        type: "mentions",
        label: "mentions risk",
        evidence: chunk.text.slice(0, 300),
        sourceItemId: item.itemId,
        sourceChunkId: chunk.chunkId,
        confidence: 0.6,
      });
    }
  }

  return candidates;
}

export function getKnowledgeGraphStats(
  graph: KnowledgeGraph,
  itemCount: number
): KnowledgeGraphStats {
  const connectedNodeIds = new Set<string>();

  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.sourceEntityId);
    connectedNodeIds.add(edge.targetEntityId);
  }

  const orphanNodeCount = graph.nodes.filter(
    (node) => !connectedNodeIds.has(node.entityId)
  ).length;

  return {
    projectId: graph.projectId,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    itemCount,
    orphanNodeCount,
  };
}

export function normalizeEntityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function deduplicateEntityCandidates(
  candidates: EntityCandidate[]
): EntityCandidate[] {
  const seen = new Set<string>();
  const deduplicated: EntityCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${normalizeEntityName(candidate.name)}::${candidate.type}`;

    if (seen.has(key)) continue;

    seen.add(key);
    deduplicated.push(candidate);
  }

  return deduplicated;
}

function deduplicateRelationCandidates(
  candidates: RelationCandidate[]
): RelationCandidate[] {
  const seen = new Set<string>();
  const deduplicated: RelationCandidate[] = [];

  for (const candidate of candidates) {
    const key = [
      normalizeEntityName(candidate.sourceEntityName),
      normalizeEntityName(candidate.targetEntityName),
      candidate.type,
    ].join("::");

    if (seen.has(key)) continue;

    seen.add(key);
    deduplicated.push(candidate);
  }

  return deduplicated;
}

function mergeUniqueValues(
  currentValues: string[] | undefined,
  newValues: string[]
): string[] {
  return Array.from(new Set([...(currentValues ?? []), ...newValues]));
}

function createCitationDescription(citation: {
  authors?: string[];
  journal?: string;
  year?: number;
  doi?: string;
  pmid?: string;
}): string {
  const parts: string[] = [];

  if (citation.authors && citation.authors.length > 0) {
    parts.push(`Authors: ${citation.authors.join(", ")}`);
  }

  if (citation.journal) {
    parts.push(`Journal: ${citation.journal}`);
  }

  if (citation.year) {
    parts.push(`Year: ${citation.year}`);
  }

  if (citation.doi) {
    parts.push(`DOI: ${citation.doi}`);
  }

  if (citation.pmid) {
    parts.push(`PMID: ${citation.pmid}`);
  }

  return parts.join(" | ");
}