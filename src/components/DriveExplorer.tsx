"use client";

import { useState } from "react";

type DriveItem = {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
};

type DrivePathItem = {
  id: string;
  name: string;
};

type DriveExplorerProps = {
  onSendToAI: (prompt: string) => void;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

export default function DriveExplorer({ onSendToAI }: DriveExplorerProps) {
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [folderLoadingId, setFolderLoadingId] = useState<string | null>(null);
  const [analyzingFileId, setAnalyzingFileId] = useState<string | null>(null);

  const [drivePath, setDrivePath] = useState<DrivePathItem[]>([
    { id: "root", name: "Root" },
  ]);

  async function loadDriveChildren(parentId = "root", folderName = "Root") {
    setDriveLoading(true);

    try {
      const res = await fetch(
        `/api/google/children?parentId=${encodeURIComponent(parentId)}`
      );

      const data = await res.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      setDriveItems(data.items || []);

      if (parentId === "root") {
        setDrivePath([{ id: "root", name: "Root" }]);
      } else {
        setDrivePath((prev) => {
          const existsIndex = prev.findIndex((item) => item.id === parentId);

          if (existsIndex >= 0) {
            return prev.slice(0, existsIndex + 1);
          }

          return [...prev, { id: parentId, name: folderName }];
        });
      }
    } catch (error) {
      console.error(error);
      alert("Drive folder loading failed.");
    } finally {
      setDriveLoading(false);
    }
  }

  async function openDrivePath(index: number) {
    const target = drivePath[index];
    if (!target) return;

    setDrivePath((prev) => prev.slice(0, index + 1));
    await loadDriveChildren(target.id, target.name);
  }

  async function sendFileToAI(item: DriveItem) {
    if (!item.mimeType) return;

    setAnalyzingFileId(item.id);

    try {
      const res = await fetch("/api/google/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId: item.id,
          mimeType: item.mimeType,
          name: item.name,
        }),
      });

      const data = await res.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      const prompt = `다음 Google Drive 파일을 분석해줘.

파일명: ${data.name}
MIME Type: ${data.mimeType}

분석 요청:
1. 핵심 내용 요약
2. 주요 개념과 키워드
3. 연구/강의/자문 업무에 활용할 수 있는 포인트
4. 후속 작업 제안
5. 필요하면 표로 정리

파일 본문:
${data.text}`;

      onSendToAI(prompt);
      alert("파일 내용이 AI Command에 입력되었습니다. Run AI를 클릭하십시오.");
    } catch (error) {
      console.error(error);
      alert("File analysis preparation failed.");
    } finally {
      setAnalyzingFileId(null);
    }
  }

  async function analyzeFolder(item: DriveItem) {
    setFolderLoadingId(item.id);

    try {
      const res = await fetch("/api/google/analyze-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folderId: item.id,
          folderName: item.name,
        }),
      });

      const data = await res.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      const folderList = (data.folders || [])
        .map(
          (folder: DriveItem, index: number) =>
            `${index + 1}. [Folder] ${folder.name}
Modified: ${folder.modifiedTime || "unknown"}`
        )
        .join("\n\n");

      const supportedFileList = (data.files || [])
        .map(
          (file: DriveItem, index: number) =>
            `${index + 1}. [Supported File] ${file.name}
MIME Type: ${file.mimeType || "unknown"}
Modified: ${file.modifiedTime || "unknown"}`
        )
        .join("\n\n");

      const unsupportedFileList = (data.unsupportedFiles || [])
        .map(
          (file: DriveItem, index: number) =>
            `${index + 1}. [Unsupported File] ${file.name}
MIME Type: ${file.mimeType || "unknown"}
Modified: ${file.modifiedTime || "unknown"}`
        )
        .join("\n\n");

      const fileTextBlocks = (data.fileTexts || [])
        .map((file: any, index: number) => {
          if (file.error) {
            return `### File ${index + 1}: ${file.name}
MIME Type: ${file.mimeType}
Read Error: ${file.error}`;
          }

          return `### File ${index + 1}: ${file.name}
MIME Type: ${file.mimeType}
Modified: ${file.modifiedTime || "unknown"}

${file.text}`;
        })
        .join("\n\n==============================\n\n");

      const prompt = `다음 Google Drive 폴더를 연구 프로젝트 단위로 통합 분석해줘.

폴더명: ${item.name}
폴더 ID: ${item.id}

폴더 요약:
- 전체 항목 수: ${data.totalItemCount}
- 하위 폴더 수: ${data.folderCount}
- 분석 지원 파일 수: ${data.supportedFileCount}
- 현재 미지원 파일 수: ${data.unsupportedFileCount}
- 실제 본문 추출 파일 수: ${data.analyzedFileCount}
- 파일별 최대 추출 문자 수: ${data.maxCharsPerFile}
- 전체 최대 추출 문자 수: ${data.maxTotalChars}

하위 폴더 목록:
${folderList || "없음"}

분석 지원 파일 목록:
${supportedFileList || "없음"}

현재 미지원 파일 목록:
${unsupportedFileList || "없음"}

아래는 폴더 내 지원 파일에서 추출한 본문이다.

${fileTextBlocks || "본문을 추출한 파일이 없음"}

분석 요청:
1. 이 폴더의 전체 연구 주제와 목적을 추정해줘.
2. 포함된 자료를 논문, 특허, 발표자료, 보고서, 실험자료, 사업자료 관점에서 분류해줘.
3. 핵심 기술 키워드와 반복 등장 개념을 도출해줘.
4. 논문화 가능성이 높은 주제를 3개 이상 제안해줘.
5. 특허 또는 사업화 가능성이 있는 주제를 3개 이상 제안해줘.
6. 현재 자료에서 부족한 점과 추가 수집이 필요한 자료를 제안해줘.
7. 후속 연구계획, 실험계획, 보고서 작성 방향을 제안해줘.
8. 박사과정 대학원생이 공부할 수 있도록 학습 로드맵 형태로 정리해줘.
9. 마지막에 실행 가능한 Action Item을 표로 정리해줘.

주의:
PDF는 현재 본문 추출 대상에서 제외되어 있다.
분석은 현재 추출 가능한 문서 본문과 파일 메타데이터를 근거로 수행하라.`;

      onSendToAI(prompt);
      alert("폴더 본문 통합 분석 프롬프트가 AI Command에 입력되었습니다. Run AI를 클릭하십시오.");
    } catch (error) {
      console.error(error);
      alert("Folder content analysis failed.");
    } finally {
      setFolderLoadingId(null);
    }
  }

  return (
    <section className="mt-8 border border-green-500 rounded-xl p-5">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold text-green-400">
          Google Drive Explorer
        </h2>

        <button
          onClick={() => loadDriveChildren("root", "Root")}
          disabled={driveLoading}
          className="ml-auto px-4 py-2 bg-green-600 text-white rounded font-semibold disabled:opacity-50"
        >
          {driveLoading ? "Loading Drive..." : "Open Drive Root"}
        </button>
      </div>

      {driveItems.length > 0 && (
        <>
          <div className="mt-4 text-sm text-green-200">
            {drivePath.map((item, index) => (
              <span key={item.id}>
                <button
                  onClick={() => openDrivePath(index)}
                  className="underline text-green-300"
                >
                  {item.name}
                </button>
                {index < drivePath.length - 1 && <span> / </span>}
              </span>
            ))}
          </div>

          <div className="space-y-4 mt-5">
            {driveItems.map((item) => {
              const isFolder = item.mimeType === FOLDER_MIME;

              const canAnalyze =
                item.mimeType === "application/vnd.google-apps.document" ||
                item.mimeType === "application/vnd.google-apps.presentation" ||
                item.mimeType === "text/plain" ||
                item.mimeType === "text/markdown" ||
                item.mimeType ===
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                item.mimeType ===
                  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

              return (
                <div
                  key={item.id}
                  className="border border-green-500 rounded-lg p-4 bg-neutral-950"
                >
                  <button
                    onClick={() =>
                      isFolder ? loadDriveChildren(item.id, item.name) : null
                    }
                    className="text-left"
                  >
                    <h3 className="text-lg font-semibold text-green-300">
                      {isFolder ? "[Folder] " : "[File] "}
                      {item.name}
                    </h3>
                  </button>

                  <p className="mt-1 text-sm text-green-100">
                    Type: {item.mimeType}
                  </p>

                  <p className="mt-1 text-sm text-green-100">
                    Modified: {item.modifiedTime}
                  </p>

                  <div className="flex flex-wrap gap-3 mt-3">
                    {isFolder && (
                      <>
                        <button
                          onClick={() => loadDriveChildren(item.id, item.name)}
                          className="px-4 py-2 bg-green-700 text-white rounded font-semibold"
                        >
                          Open Folder
                        </button>

                        <button
                          onClick={() => analyzeFolder(item)}
                          disabled={folderLoadingId === item.id}
                          className="px-4 py-2 bg-yellow-400 text-black rounded font-semibold disabled:opacity-50"
                        >
                          {folderLoadingId === item.id
                            ? "Reading Folder..."
                            : "Analyze Folder"}
                        </button>
                      </>
                    )}

                    {!isFolder && canAnalyze && (
                      <button
                        onClick={() => sendFileToAI(item)}
                        disabled={analyzingFileId === item.id}
                        className="px-4 py-2 bg-yellow-400 text-black rounded font-semibold disabled:opacity-50"
                      >
                        {analyzingFileId === item.id
                          ? "Preparing..."
                          : "Send to AI Command"}
                      </button>
                    )}

                    {!isFolder && !canAnalyze && (
                      <span className="px-4 py-2 border border-green-700 text-green-300 rounded">
                        Analysis not supported yet
                      </span>
                    )}

                    {item.webViewLink && (
                      <a
                        href={item.webViewLink}
                        target="_blank"
                        className="px-4 py-2 bg-green-600 text-white rounded font-semibold"
                      >
                        Open in Google Drive
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}