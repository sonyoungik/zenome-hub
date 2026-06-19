import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("google_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Google Drive is not connected." },
        { status: 401 }
      );
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({
      version: "v3",
      auth,
    });

    const result = await drive.files.list({
      pageSize: 100,
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id, name, webViewLink, modifiedTime)",
      orderBy: "name",
    });

    return NextResponse.json({
      folders: result.data.files || [],
    });
  } catch (error: any) {
    console.error("GOOGLE DRIVE FOLDERS ERROR:", error);

    return NextResponse.json(
      { error: error.message || "Failed to load Google Drive folders." },
      { status: 500 }
    );
  }
}