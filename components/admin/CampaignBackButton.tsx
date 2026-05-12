"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/shadcn/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";

/**
 * Client component that renders a back button on campaign detail/new pages.
 * Returns null on all other admin pages so the SiteHeader stays clean.
 * Used as the SiteHeader title in the admin layout.
 */
export function AdminHeaderTitle() {
  const pathname = usePathname();
  const router = useRouter();
  const isCampaignDetail = pathname?.match(/\/admin\/outreach\/campaigns\/[^\/]+$/);
  const isNewCampaign = pathname === "/admin/outreach/campaigns/new";

  if (isCampaignDetail || isNewCampaign) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/admin/outreach/campaigns")}
        className="-ml-2"
      >
        <IconArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>
    );
  }

  return null;
}
