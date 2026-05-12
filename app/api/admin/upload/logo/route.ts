import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { uploadFile, deleteFile } from "@/lib/storage";
import { randomBytes } from "crypto";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

function generateFilename(ext: string): string {
  const timestamp = Date.now();
  const hex = randomBytes(8).toString("hex");
  return `${timestamp}-${hex}.${ext}`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File must be under 2MB" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine MIME type: SVG has no magic bytes so we validate both browser type AND content
  let mimeType: string;
  let ext: string;

  if (file.type === "image/svg+xml") {
    // Verify the buffer actually contains SVG markup (not a renamed HTML/script file)
    const head = buffer.slice(0, 512).toString("utf8").trimStart().toLowerCase();
    const isSvg =
      head.startsWith("<svg") ||
      head.startsWith("<?xml") ||
      head.includes("<svg ") ||
      head.includes("<svg>");
    if (!isSvg) {
      return NextResponse.json(
        { error: "File does not appear to be a valid SVG" },
        { status: 400 },
      );
    }
    mimeType = "image/svg+xml";
    ext = "svg";
  } else {
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      return NextResponse.json(
        { error: "Only PNG, JPG, WebP, and SVG images are allowed" },
        { status: 400 },
      );
    }
    mimeType = detected.mime;
    ext = detected.ext;
  }

  const filename = generateFilename(ext);
  const path = `logos/${filename}`;

  await uploadFile(path, buffer, { contentType: mimeType });

  // Delete old logo (best-effort)
  const [row] = await db
    .select({ logoUrl: siteSettings.logoUrl })
    .from(siteSettings)
    .where(eq(siteSettings.id, "default"))
    .limit(1);

  if (row?.logoUrl) {
    const oldPath = row.logoUrl.replace(/^\/api\/media\//, "");
    deleteFile(oldPath).catch(() => {});
  }

  const proxyUrl = `/api/media/logos/${filename}`;

  await db
    .insert(siteSettings)
    .values({ id: "default", logoUrl: proxyUrl, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: { logoUrl: proxyUrl, updatedAt: new Date().toISOString() },
    });

  return NextResponse.json({ url: proxyUrl });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({ logoUrl: siteSettings.logoUrl })
    .from(siteSettings)
    .where(eq(siteSettings.id, "default"))
    .limit(1);

  if (row?.logoUrl) {
    const oldPath = row.logoUrl.replace(/^\/api\/media\//, "");
    deleteFile(oldPath).catch(() => {});
  }

  await db
    .insert(siteSettings)
    .values({ id: "default", logoUrl: null, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: { logoUrl: null, updatedAt: new Date().toISOString() },
    });

  return NextResponse.json({ success: true });
}
