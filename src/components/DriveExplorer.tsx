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

const FOLDER_MIME = "application/vnd.google-apps.folder";

export default function DriveExplorer() {
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
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

                  <div className="flex gap-3 mt-3">
                    {isFolder && (
                      <button
                        onClick={() => loadDriveChildren(item.id, item.name)}
                        className="px-4 py-2 bg-green-700 text-white rounded font-semibold"
                      >
                        Open Folder
                      </button>
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