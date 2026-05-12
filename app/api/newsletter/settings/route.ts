import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsletterSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

interface NewsletterSettings {
  branding: {
    logo: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
  };
  sender: {
    name: string;
    email: string;
    replyTo: string;
  };
  template: string;
  footer: {
    companyName: string;
    address: string;
    unsubscribeText: string;
  };
}

/**
 * GET /api/newsletter/settings
 * Retrieve current newsletter settings
 */
export async function GET() {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    if (session.user.role !== "admin" && session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get settings from database
    const [settingsData] = await db.select().from(newsletterSettings).limit(1);

    // If no settings exist yet, return default settings
    if (!settingsData) {
      // NOTE: The 'email' field below is for display/branding purposes only.
      // The actual "from" address used when sending emails is configured in
      // Settings → Integrations → Resend (context: 'newsletter')
      const defaultSettings: NewsletterSettings = {
        branding: {
          logo: "https://__YOUR_DOMAIN__/logo.png",
          primaryColor: "#3B82F6",
          secondaryColor: "#8B5CF6",
          fontFamily: "Inter, sans-serif",
        },
        sender: {
          name: process.env.NEWSLETTER_DEFAULT_SENDER_NAME || "Newsletter",
          email: "newsletter@email.__YOUR_DOMAIN__", // Display only - actual sending address via integration system
          replyTo: process.env.NEWSLETTER_DEFAULT_REPLY_TO || "noreply@example.com",
        },
        template: "curated-brief",
        footer: {
          companyName: "__YOUR_BRAND__",
          address: "Australian Business • ABN 12 340 373 046",
          unsubscribeText: "Unsubscribe from this newsletter",
        },
      };

      return NextResponse.json(defaultSettings);
    }

    // Return settings from individual fields
    return NextResponse.json({
      branding: settingsData.branding,
      sender: settingsData.sender,
      template: settingsData.template,
      footer: settingsData.footer,
    } as NewsletterSettings);
  } catch (error) {
    logger.error("Error fetching settings:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch newsletter settings from database",
        message: error instanceof Error ? error.message : "Unknown database error",
        details: "Could not load newsletter settings. Please try refreshing.",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/newsletter/settings
 * Update newsletter settings
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    if (session.user.role !== "admin" && session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const settings: NewsletterSettings = await request.json();

    // Validate settings
    if (!settings.branding || !settings.sender || !settings.footer) {
      return NextResponse.json({ error: "Invalid settings format" }, { status: 400 });
    }

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(settings.sender.email) || !emailRegex.test(settings.sender.replyTo)) {
      return NextResponse.json(
        { error: "Invalid email addresses in sender configuration" },
        { status: 400 },
      );
    }

    // Check if settings already exist
    const [existing] = await db
      .select({ id: newsletterSettings.id })
      .from(newsletterSettings)
      .limit(1);

    if (existing) {
      // Update existing settings
      await db
        .update(newsletterSettings)
        .set({
          branding: settings.branding,
          sender: settings.sender,
          template: settings.template,
          footer: settings.footer,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(newsletterSettings.id, existing.id));
    } else {
      // Insert new settings
      await db.insert(newsletterSettings).values({
        branding: settings.branding,
        sender: settings.sender,
        template: settings.template,
        footer: settings.footer,
      });
    }

    return NextResponse.json({
      message: "Settings saved successfully",
      settings,
    });
  } catch (error) {
    logger.error("Error saving settings:", error);
    return NextResponse.json(
      {
        error: "Failed to save newsletter settings to database",
        message: error instanceof Error ? error.message : "Unknown database error",
        details: "Could not save settings. Please try again.",
      },
      { status: 500 },
    );
  }
}
