import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OUTPUT_FOLDER_NAME = "PROF_TATE_RO_Outputs";

async function findOrCreateOutputFolder(drive: any) {
  const list = await drive.files.list({
    q: `'root' in parents and name='${OUTPUT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existing = list.data.files?.[0];

  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: {
      name: OUTPUT_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  return created.data.id;
}

export async function POST(req: Request) {
  try {
    const { title, content } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "title and content are required." },
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
    const docs = google.docs({ version: "v1", auth });

    const folderId = await findOrCreateOutputFolder(drive);

    const doc = await docs.documents.create({
      requestBody: { title },
    });

    const documentId = doc.data.documentId;

    if (!documentId) {
      return NextResponse.json(
        { error: "Failed to create Google Docs document." },
        { status: 500 }
      );
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      },
    });

    const fileMeta = await drive.files.get({
      fileId: documentId,
      fields: "parents",
      supportsAllDrives: true,
    });

    const previousParents = fileMeta.data.parents?.join(",");

    await drive.files.update({
      fileId: documentId,
      addParents: folderId,
      removeParents: previousParents,
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });

    const file = await drive.files.get({
      fileId: documentId,
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });

    return NextResponse.json({
      documentId,
      name: file.data.name,
      webViewLink: file.data.webViewLink,
      folderName: OUTPUT_FOLDER_NAME,
    });
  } catch (error: any) {
    console.error("GOOGLE CREATE DOC ERROR:", error);

    return NextResponse.json(
      {
        error:
          error?.response?.data?.error?.message ||
          error?.message ||
          "Failed to create Google Docs document.",
        detail: String(error),
      },
      { status: error?.response?.status || 500 }
    );
  }
}