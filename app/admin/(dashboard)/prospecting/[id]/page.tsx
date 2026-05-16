/**
 * Prospect detail page (server component).
 *
 * The cockpit for working a single prospect:
 *
 *   - Sticky header card           \u2014 business name, location, industry,
 *                                      phone, website, stage badge + edit-
 *                                      in-place toggle.
 *   - Actions row                   \u2014 Call (tel:), SMS (Quo dialog),
 *                                      Email (mailto:), Mark called, Promote.
 *   - SEO report card               \u2014 iframe embed when ready; queued /
 *                                      generating / failed states otherwise.
 *   - Cap video card                \u2014 URL input (extractCapVideoId on
 *                                      change), `<iframe>` embed, engagement
 *                                      strip aggregated from
 *                                      `videoEngagementEvents`.
 *   - Timeline                      \u2014 unified activity feed for the prospect
 *                                      + all its contacts.
 *
 *   - Right column: Employees, Follow-ups, Meta.
 *
 * Visual rhythm (card paddings, header sizes, badge tones) is copied
 * verbatim from `ContactDetailSheet.tsx`, `prospects-table.tsx`, and the
 * prospecting list page so the new view reads as a sibling of those screens.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";

import { Button } from "@/components/shadcn/ui/button";
import { getProspectDetail } from "@/lib/prospects/queries";

import { ActionsRow } from "./components/actions-row";
import { CapVideoCard } from "./components/cap-video-card";
import { EmployeesCard } from "./components/employees-card";
import { FollowUpsCard } from "./components/follow-ups-card";
import { MetaCard } from "./components/meta-card";
import { ProspectHeader } from "./components/prospect-header";
import { SeoReportCard } from "./components/seo-report-card";
import { TimelineList } from "./components/timeline-list";

interface ProspectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProspectDetailPage({ params }: ProspectDetailPageProps) {
  const { id } = await params;
  const detail = await getProspectDetail(id);

  if (!detail) {
    notFound();
  }

  const { prospect, contacts, followUps, timelineEvents, engagementStats } = detail;

  // Primary contact email drives the Email button enabled state + the
  // "Promote to CRM" gate (an email-captured contact is required).
  const primaryContact =
    contacts.find((c) => c.isPrimaryContact) ?? contacts.find((c) => Boolean(c.email));
  const primaryContactEmail = primaryContact?.email ?? null;
  const hasEmailContact = contacts.some((c) => Boolean(c.email));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/admin/prospecting">
            <IconArrowLeft className="h-4 w-4 mr-1" />
            Back to prospecting
          </Link>
        </Button>
      </div>

      <ProspectHeader prospect={prospect} />

      <ActionsRow
        prospectId={prospect.id}
        businessName={prospect.businessName}
        phone={prospect.phone}
        primaryContactEmail={primaryContactEmail}
        hasEmailContact={hasEmailContact}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-2 min-w-0">
          <SeoReportCard
            prospectId={prospect.id}
            status={prospect.seoReportStatus}
            reportUrl={prospect.seoReportUrl}
            reportError={prospect.seoReportError}
          />
          <CapVideoCard
            prospectId={prospect.id}
            capVideoId={prospect.capVideoId}
            capVideoUrl={prospect.capVideoUrl}
            engagement={engagementStats}
          />
          <TimelineList events={timelineEvents} />
        </div>
        <div className="space-y-6 lg:col-span-1 min-w-0">
          <EmployeesCard prospectId={prospect.id} contacts={contacts} />
          <FollowUpsCard prospectId={prospect.id} followUps={followUps} />
          <MetaCard prospect={prospect} />
        </div>
      </div>
    </div>
  );
}
