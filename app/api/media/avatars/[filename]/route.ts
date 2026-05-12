import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadFile } from "@/lib/storage";

const FILENAME_PATTERN = /^[\w.-]+$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user) {
    return new NextResponse(null, { status: 401 });
  }

  const bytes = await downloadFile(`avatars/${filename}`);
  if (!bytes) {
    return new NextResponse(null, { status: 404 });
  }

  const ext = filename.split(".").pop()?.toLowerCase();
  const contentTypeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  const contentType = contentTypeMap[ext ?? ""] ?? "application/octet-stream";

  return new NextResponse(new Blob([bytes], { type: contentType }), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
