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
                item.mimeType === "text/plain" ||
                item.mimeType === "text/markdown";

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
                      <button
                        onClick={() => loadDriveChildren(item.id, item.name)}
                        className="px-4 py-2 bg-green-700 text-white rounded font-semibold"
                      >
                        Open Folder
                      </button>
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