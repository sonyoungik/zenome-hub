import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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
        { fileId, mimeType: "text/plain" },
        { responseType: "text" }
      );

      text = res.data as string;
    } else if (mimeType === "application/vnd.google-apps.presentation") {
      const res = await drive.files.export(
        {
          fileId,
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
        { responseType: "arraybuffer" }
      );

      const buffer = Buffer.from(res.data as ArrayBuffer);
      text = await extractPptxText(buffer);
    } else if (mimeType === "text/plain" || mimeType === "text/markdown") {
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "text" }
      );

      text = res.data as string;
    } else {
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      );

      const buffer = Buffer.from(res.data as ArrayBuffer);

      if (mimeType === "application/pdf") {
        const pdfModule = await import("pdf-parse");
        const { PDFParse } = pdfModule;

        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        text = parsed.text;
        await parser.destroy();
      } else if (
        mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const mammoth = await import("mammoth");
        const parsed = await mammoth.extractRawText({ buffer });
        text = parsed.value;
      } else if (
        mimeType ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ) {
        text = await extractPptxText(buffer);
      } else {
        return NextResponse.json(
          { error: `Unsupported file type: ${mimeType}` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      fileId,
      name,
      mimeType,
      text: text.slice(0, 60000),
    });
  } catch (error: any) {
    console.error("GOOGLE READ ERROR:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to read Google Drive file.",
        detail: String(error),
      },
      { status: 500 }
    );
  }
}