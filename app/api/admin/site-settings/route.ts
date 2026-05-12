import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, "default"))
      .limit(1);

    return NextResponse.json({ settings: row ?? null });
  } catch (error) {
    logger.error("Site settings fetch error:", error);
    return NextResponse.json({ error: "Failed to load site settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    await db
      .insert(siteSettings)
      .values({
        id: "default",
        businessName: body.businessName ?? null,
        abn: body.abn ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        logoUrl: body.logoUrl ?? null,
        addressStreet: body.addressStreet ?? null,
        addressCity: body.addressCity ?? null,
        addressState: body.addressState ?? null,
        addressPostcode: body.addressPostcode ?? null,
        website: body.website ?? null,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: siteSettings.id,
        set: {
          businessName: body.businessName ?? null,
          abn: body.abn ?? null,
          phone: body.phone ?? null,
          email: body.email ?? null,
          logoUrl: body.logoUrl ?? null,
          addressStreet: body.addressStreet ?? null,
          addressCity: body.addressCity ?? null,
          addressState: body.addressState ?? null,
          addressPostcode: body.addressPostcode ?? null,
          website: body.website ?? null,
          updatedAt: new Date().toISOString(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Site settings save error:", error);
    return NextResponse.json({ error: "Failed to save site settings" }, { status: 500 });
  }
}
