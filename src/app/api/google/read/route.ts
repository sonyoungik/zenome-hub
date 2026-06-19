import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { fileId, mimeType, name } = await req.json();

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

    let text = "";

    if (mimeType === "application/vnd.google-apps.document") {
      const res = await drive.files.export(
        {
          fileId,
          mimeType: "text/plain",
        },
        { responseType: "text" }
      );

      text = res.data as string;
    } else if (
      mimeType === "text/plain" ||
      mimeType === "text/markdown"
    ) {
      const res = await drive.files.get(
        {
          fileId,
          alt: "media",
        },
        { responseType: "text" }
      );

      text = res.data as string;
    } else {
      return NextResponse.json(
        {
          error:
            "현재 버전에서는 Google Docs, TXT, Markdown 파일만 본문 분석을 지원합니다.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      fileId,
      name,
      mimeType,
      text,
    });
  } catch (error: any) {
    console.error("GOOGLE READ ERROR:", error);

    return NextResponse.json(
      { error: error.message || "Failed to read Google Drive file." },
      { status: 500 }
    );
  }
}