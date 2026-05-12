"use client";

import Link from "next/link";
import { Button } from "@/components/shadcn/ui/button";
import { IconTarget, IconUserPlus, IconMail, IconSend } from "@tabler/icons-react";

export function DashboardQuickActions() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Button asChild className="h-16 text-base font-semibold">
        <Link href="/admin/crm?new=deal">
          <IconTarget className="mr-2 h-5 w-5" />
          New Deal
        </Link>
      </Button>
      <Button variant="outline" asChild className="h-16 text-base font-semibold">
        <Link href="/admin/crm?new=contact">
          <IconUserPlus className="mr-2 h-5 w-5" />
          Add Contact
        </Link>
      </Button>
      <Button variant="outline" asChild className="h-16 text-base font-semibold">
        <Link href="/admin/newsletter/campaigns/create">
          <IconMail className="mr-2 h-5 w-5" />
          Create Newsletter
        </Link>
      </Button>
      <Button variant="outline" asChild className="h-16 text-base font-semibold">
        <Link href="/admin/outreach">
          <IconSend className="mr-2 h-5 w-5" />
          Outreach Campaign
        </Link>
      </Button>
    </div>
  );
}
