import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadFile } from "@/lib/storage";

// Reports are written by the `generate-seo-report` worker handler as
// `<prospectId>.html`. Restrict the path segment to safe characters so a
// crafted filename can't escape the storage key prefix.
const FILENAME_PATTERN = /^[\w.-]+\.html$/;

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

  const bytes = await downloadFile(`reports/${filename}`);
  if (!bytes) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Blob([bytes], { type: "text/html" }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
      // Defence in depth — reports are rendered by an external CLI and
      // should never become an XSS vector for the admin session.
      "Content-Security-Policy": "default-src 'self'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
