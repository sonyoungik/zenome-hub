import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { folderId } = await req.json();

    const cookieStore = await cookies();

    const accessToken =
      cookieStore.get("google_access_token")?.value;

    const refreshToken =
      cookieStore.get("google_refresh_token")?.value;

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({
      version: "v3",
      auth,
    });

    const files = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields:
        "files(id,name,mimeType,modifiedTime)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const supportedFiles =
      files.data.files?.filter((f) => {
        const mime = f.mimeType || "";

        return (
          mime.includes("document") ||
          mime.includes("presentation") ||
          mime.includes("text") ||
          mime.includes("wordprocessingml") ||
          mime.includes("presentationml")
        );
      }) || [];

    return NextResponse.json({
      folderId,
      fileCount: supportedFiles.length,
      files: supportedFiles,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Folder analysis failed",
      },
      {
        status: 500,
      }
    );
  }
}