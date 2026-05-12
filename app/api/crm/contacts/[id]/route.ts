import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { getContact, updateContact } from "@/lib/crm/contacts";
import { CrmError } from "@/lib/crm/types";

const contactPatchSchema = z
  .object({
    email: z.string().email("Invalid email format").optional(),
    phone: z.string().max(50, "Phone too long").optional().nullable(),
    notes: z.string().max(10000, "Notes too long").optional().nullable(),
    first_name: z.string().max(255, "First name too long").optional().nullable(),
    last_name: z.string().max(255, "Last name too long").optional().nullable(),
    company: z.string().max(255, "Company name too long").optional().nullable(),
    job_title: z.string().max(255, "Job title too long").optional().nullable(),
    contact_status: z.enum(["subscriber", "lead", "qualified", "customer"]).optional(),
    linkedin_url: z
      .string()
      .url("Invalid LinkedIn URL")
      .max(500, "LinkedIn URL too long")
      .optional()
      .nullable()
      .or(z.literal("")),
    website: z
      .string()
      .url("Invalid website URL")
      .max(500, "Website URL too long")
      .optional()
      .nullable()
      .or(z.literal("")),
    industry: z.string().max(255, "Industry too long").optional().nullable(),
    seniority: z.string().max(255, "Seniority too long").optional().nullable(),
    location: z.string().max(255, "Location too long").optional().nullable(),
    country: z.string().max(255, "Country too long").optional().nullable(),
    is_newsletter_subscriber: z.boolean().optional(),
    tags: z.array(z.string().max(100, "Tag too long")).optional().nullable(),
  })
  .strip();

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { id } = await context.params;
    const result = await getContact(id);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching contact:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const parseResult = contactPatchSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const result = await updateContact(id, parseResult.data);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating contact:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
