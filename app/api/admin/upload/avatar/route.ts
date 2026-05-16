import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { uploadFile, deleteFile, isStorageConfigured } from "@/lib/storage";
import { randomBytes } from "crypto";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
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

  if (!isStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "File storage is not configured. Set BUCKET_ENDPOINT, BUCKET_MEDIA_ACCESS_KEY_ID, and BUCKET_MEDIA_SECRET_ACCESS_KEY to enable avatar uploads.",
      },
      { status: 503 },
    );
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

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return NextResponse.json(
      { error: "Only PNG, JPG, and WebP images are allowed" },
      { status: 400 },
    );
  }

  const filename = generateFilename(detected.ext);
  const path = `avatars/${filename}`;

  await uploadFile(path, buffer, { contentType: detected.mime });

  // Delete old avatar (best-effort)
  const [user] = await db
    .select({ avatarUrl: adminUsers.avatarUrl })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.user.id))
    .limit(1);

  if (user?.avatarUrl) {
    const oldPath = user.avatarUrl.replace(/^\/api\/media\//, "");
    deleteFile(oldPath).catch(() => {});
  }

  const proxyUrl = `/api/media/avatars/${filename}`;

  await db
    .update(adminUsers)
    .set({ avatarUrl: proxyUrl, updatedAt: new Date().toISOString() })
    .where(eq(adminUsers.id, session.user.id));

  return NextResponse.json({ url: proxyUrl });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  }

  const [user] = await db
    .select({ avatarUrl: adminUsers.avatarUrl })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.user.id))
    .limit(1);

  if (user?.avatarUrl) {
    const oldPath = user.avatarUrl.replace(/^\/api\/media\//, "");
    deleteFile(oldPath).catch(() => {});
  }

  await db
    .update(adminUsers)
    .set({ avatarUrl: null, updatedAt: new Date().toISOString() })
    .where(eq(adminUsers.id, session.user.id));

  return NextResponse.json({ success: true });
}
