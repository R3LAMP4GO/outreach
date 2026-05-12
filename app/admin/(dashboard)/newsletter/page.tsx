"use client";

import { NewsletterSectionCards } from "./components/NewsletterSectionCards";
import { NewslettersTable } from "./components/NewslettersTable";

export default function NewsletterPage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* Header */}
        <div className="px-4 lg:px-6">
          <h1 className="text-3xl font-bold tracking-tight">Newsletter</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered newsletter creation and management
          </p>
        </div>

        {/* KPI Cards */}
        <NewsletterSectionCards />

        {/* Past Newsletters Table */}
        <div className="px-4 lg:px-6">
          <NewslettersTable />
        </div>
      </div>
    </div>
  );
}
