import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPPORTED_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export async function POST(req: Request) {
  try {
    const { folderId, folderName } = await req.json();

    if (!folderId) {
      return NextResponse.json(
        { error: "folderId is required." },
        { status: 400 }
      );
    }

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

    const items = result.data.files || [];

    const folders = items.filter(
      (item) => item.mimeType === "application/vnd.google-apps.folder"
    );

    const supportedFiles = items.filter((item) =>
      SUPPORTED_MIME_TYPES.includes(item.mimeType || "")
    );

    const unsupportedFiles = items.filter((item) => {
      const mimeType = item.mimeType || "";
      return (
        mimeType !== "application/vnd.google-apps.folder" &&
        !SUPPORTED_MIME_TYPES.includes(mimeType)
      );
    });

    return NextResponse.json({
      folderId,
      folderName: folderName || "",
      totalItemCount: items.length,
      folderCount: folders.length,
      supportedFileCount: supportedFiles.length,
      unsupportedFileCount: unsupportedFiles.length,
      folders,
      files: supportedFiles,
      unsupportedFiles,
      note: "This endpoint performs metadata-based folder analysis. Full content-based multi-file analysis will be added in the next step.",
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