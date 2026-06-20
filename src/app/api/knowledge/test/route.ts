import { NextResponse } from "next/server";

import {
  buildKnowledgeBase,
  formatKnowledgeServiceBuildReport,
  queryKnowledgeBase,
} from "@/lib/knowledge";

export async function GET() {
  try {
    const sampleDocuments = [
      {
        title: "Hollow Microneedle Platform Overview",
        rawText: [
          "Hollow microneedle technology enables minimally invasive transdermal drug delivery.",
          "The platform can be used for liquid formulation delivery through micro-scale channels.",
          "Important design factors include needle geometry, mechanical strength, insertion reliability, clogging risk, and dose control.",
          "For a research assistant workflow, hollow microneedle documents should be indexed into knowledge chunks and connected to related technologies.",
        ].join("\n\n"),
        sourceType: "manual_note" as const,
        tags: ["microneedle", "hollow microneedle", "drug delivery"],
      },
      {
        title: "Transdermal Drug Delivery Research Note",
        rawText: [
          "Transdermal drug delivery systems aim to deliver therapeutic agents across the skin barrier.",
          "Microneedles can improve delivery efficiency by bypassing the stratum corneum.",
          "A knowledge base should connect formulation, device structure, manufacturing process, experimental validation, and clinical application.",
        ].join("\n\n"),
        sourceType: "manual_note" as const,
        tags: ["transdermal", "drug delivery", "research note"],
      },
    ];

    const buildResult = buildKnowledgeBase({
      projectId: "test-knowledge-project",
      projectType: "technology_development",
      documents: sampleDocuments,
      buildGraph: true,
    });

    const queryResult = queryKnowledgeBase({
      projectId: buildResult.projectId,
      query: "hollow microneedle drug delivery",
      items: buildResult.items,
      graph: buildResult.graph,
      limit: 5,
    });

    return NextResponse.json({
      ok: true,
      message: "Knowledge Base test completed successfully.",
      buildReport: formatKnowledgeServiceBuildReport(buildResult),
      buildStats: buildResult.buildStats,
      graphStats: buildResult.graphStats,
      warnings: buildResult.warnings,
      errors: buildResult.errors,
      query: queryResult.query,
      resultCount: queryResult.results.length,
      answerContext: queryResult.answerContext,
      results: queryResult.results.map((result) => ({
        title: result.item.title,
        sourceType: result.item.sourceType,
        score: result.score,
        rationale: result.rationale,
        matchingChunkCount: result.matchingChunks?.length ?? 0,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Knowledge Base test error.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      {
        status: 500,
      }
    );
  }
}