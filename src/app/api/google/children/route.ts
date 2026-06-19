import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get("parentId") || "root";

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

    const drive = google.drive({
      version: "v3",
      auth,
    });

    const result = await drive.files.list({
      pageSize: 100,
      q: `'${parentId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, webViewLink, modifiedTime)",
      orderBy: "folder,name",
    });

    return NextResponse.json({
      parentId,
      items: result.data.files || [],
    });
  } catch (error: any) {
    console.error("GOOGLE DRIVE CHILDREN ERROR:", error);

    return NextResponse.json(
      { error: error.message || "Failed to load Google Drive children." },
      { status: 500 }
    );
  }
}