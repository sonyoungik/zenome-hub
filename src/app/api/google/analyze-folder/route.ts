import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  buildKnowledgeBase,
  createKnowledgeProjectIdFromFolder,
  formatKnowledgeServiceBuildReport,
  normalizeKnowledgeSourceType,
} from "@/lib/knowledge";

export const runtime = "nodejs";

const MAX_FILES = 10;
const MAX_CHARS_PER_FILE = 8000;
const MAX_TOTAL_CHARS = 50000;

const FOLDER_MIME = "application/vnd.google-apps.folder";

const SUPPORTED_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

interface DriveFileItem {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
}

interface AnalyzedFileText {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  text: string;
  error?: string;
}

function stripXmlTags(xml: string) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractPptxText(buffer: Buffer) {
  const JSZipModule = await import("jszip");
  const JSZip = JSZipModule.default;

  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
    .sort();

  const slides: string[] = [];

  for (const fileName of slideFiles) {
    const xml = await zip.files[fileName].async("string");
    const text = stripXmlTags(xml);
    if (text) slides.push(text);
  }

  return slides.join("\n\n--- Slide Break ---\n\n");
}

async function readFileText(drive: any, file: DriveFileItem) {
  const fileId = file.id;
  const mimeType = file.mimeType || "";

  if (!fileId) {
    return "";
  }

  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" }
    );

    return String(res.data || "");
  }

  if (mimeType === "application/vnd.google-apps.presentation") {
    const res = await drive.files.export(
      {
        fileId,
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(res.data as ArrayBuffer);
    return await extractPptxText(buffer);
  }

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    const res = await drive.files.get(
      {
        fileId,
        alt: "media",
        supportsAllDrives: true,
      },
      { responseType: "text" }
    );

    return String(res.data || "");
  }

  const res = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    { responseType: "arraybuffer" }
  );

  const buffer = Buffer.from(res.data as ArrayBuffer);

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value || "";
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return await extractPptxText(buffer);
  }

  return "";
}

function createKnowledgeDocuments(params: {
  folderId: string;
  folderName: string;
  fileTexts: AnalyzedFileText[];
}) {
  return params.fileTexts
    .filter((file) => file.text && file.text.trim().length > 0)
    .map((file) => {
      const sourceType = normalizeKnowledgeSourceType(file.mimeType, file.name);

      return {
        title: file.name || "Untitled Drive File",
        rawText: file.text,
        sourceType,
        sourceRef: {
          sourceId: file.id,
          sourceType,
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
          folderId: params.folderId,
          folderName: params.folderName,
          drivePath: params.folderName ? [params.folderName, file.name] : [file.name],
        },
        tags: [
          "google-drive",
          "folder-analysis",
          sourceType,
          params.folderName || "unnamed-folder",
        ],
      };
    });
}

export async function POST(req: Request) {
  try {
    const { folderId, folderName } = await req.json();

    if (!folderId) {
      return NextResponse.json(
        { error: "folderId is required." },
        { status: 400 }
      );
    }

    const resolvedFolderName = folderName || "";

    const cookieStore = await cookies();
    const accessToken = cookieStore.get("google_access_token")?.value;
    const refreshToken = cookieStore.get("google_refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        { error: "Google Drive is not connected." },
        { status: 401 }
      );
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: "v3", auth });

    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
      pageSize: 100,
      orderBy: "folder,name",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const items = (result.data.files || []) as DriveFileItem[];

    const folders = items.filter((item) => item.mimeType === FOLDER_MIME);

    const supportedFiles = items.filter((item) =>
      SUPPORTED_MIME_TYPES.includes(item.mimeType || "")
    );

    const unsupportedFiles = items.filter((item) => {
      const mimeType = item.mimeType || "";
      return mimeType !== FOLDER_MIME && !SUPPORTED_MIME_TYPES.includes(mimeType);
    });

    const filesToRead = supportedFiles.slice(0, MAX_FILES);

    const fileTexts: AnalyzedFileText[] = [];

    let totalChars = 0;

    for (const file of filesToRead) {
      try {
        if (totalChars >= MAX_TOTAL_CHARS) break;

        const rawText = await readFileText(drive, file);
        const remaining = MAX_TOTAL_CHARS - totalChars;
        const clippedText = rawText.slice(0, Math.min(MAX_CHARS_PER_FILE, remaining));

        totalChars += clippedText.length;

        fileTexts.push({
          id: file.id || "",
          name: file.name || "",
          mimeType: file.mimeType || "",
          modifiedTime: file.modifiedTime || "",
          webViewLink: file.webViewLink || "",
          text: clippedText,
        });
      } catch (error: any) {
        fileTexts.push({
          id: file.id || "",
          name: file.name || "",
          mimeType: file.mimeType || "",
          modifiedTime: file.modifiedTime || "",
          webViewLink: file.webViewLink || "",
          text: "",
          error:
            error?.response?.data?.error?.message ||
            error?.message ||
            "Failed to read file.",
        });
      }
    }

    const knowledgeDocuments = createKnowledgeDocuments({
      folderId,
      folderName: resolvedFolderName,
      fileTexts,
    });

    const knowledgeProjectId = createKnowledgeProjectIdFromFolder(folderId);

    const knowledgeBase =
      knowledgeDocuments.length > 0
        ? buildKnowledgeBase({
            projectId: knowledgeProjectId,
            projectType: "research_project",
            documents: knowledgeDocuments,
            buildGraph: true,
            chunkingOptions: {
              maxTokensPerChunk: 900,
              overlapTokens: 120,
              preserveHeadings: true,
            },
          })
        : undefined;

    return NextResponse.json({
      folderId,
      folderName: resolvedFolderName,
      totalItemCount: items.length,
      folderCount: folders.length,
      supportedFileCount: supportedFiles.length,
      unsupportedFileCount: unsupportedFiles.length,
      analyzedFileCount: fileTexts.filter((file) => file.text).length,
      maxFiles: MAX_FILES,
      maxCharsPerFile: MAX_CHARS_PER_FILE,
      maxTotalChars: MAX_TOTAL_CHARS,
      folders,
      files: supportedFiles,
      unsupportedFiles,
      fileTexts,
      knowledgeBase: knowledgeBase
        ? {
            projectId: knowledgeBase.projectId,
            itemCount: knowledgeBase.buildStats.itemCount,
            chunkCount: knowledgeBase.buildStats.chunkCount,
            totalRawCharacters: knowledgeBase.buildStats.totalRawCharacters,
            totalTokenEstimate: knowledgeBase.buildStats.totalTokenEstimate,
            graphStats: knowledgeBase.graphStats,
            warnings: knowledgeBase.warnings,
            errors: knowledgeBase.errors,
            buildReport: formatKnowledgeServiceBuildReport(knowledgeBase),
            items: knowledgeBase.items.map((item) => ({
              itemId: item.itemId,
              title: item.title,
              sourceType: item.sourceType,
              status: item.status,
              chunkCount: item.chunks?.length ?? 0,
              tags: item.tags ?? [],
              sourceRef: item.sourceRef,
            })),
            graph: knowledgeBase.graph
              ? {
                  graphId: knowledgeBase.graph.graphId,
                  projectId: knowledgeBase.graph.projectId,
                  nodeCount: knowledgeBase.graph.nodes.length,
                  edgeCount: knowledgeBase.graph.edges.length,
                  nodes: knowledgeBase.graph.nodes,
                  edges: knowledgeBase.graph.edges,
                }
              : undefined,
          }
        : {
            projectId: knowledgeProjectId,
            itemCount: 0,
            chunkCount: 0,
            warnings: ["No readable file text was available for Knowledge Base creation."],
            errors: [],
          },
      note: "PDF is currently excluded from content extraction. DOCX, PPTX, Google Docs, Google Slides, TXT, and Markdown are supported.",
    });
  } catch (error: any) {
    console.error("GOOGLE ANALYZE FOLDER ERROR:", error);

    return NextResponse.json(
      {
        error:
          error?.response?.data?.error?.message ||
          error?.message ||
          "Folder analysis failed.",
        detail: String(error),
      },
      { status: error?.response?.status || 500 }
    );
  }
}