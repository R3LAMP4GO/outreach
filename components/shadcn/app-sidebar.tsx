"use client";

import * as React from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  IconBuildingStore,
  IconDashboard,
  IconInbox,
  IconMail,
  IconNews,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

import { NavMain } from "@/components/shadcn/nav-main";
import { NavSecondary } from "@/components/shadcn/nav-secondary";
import { NavUser } from "@/components/shadcn/nav-user";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { NotificationProvider } from "@/components/notifications/notification-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/shadcn/ui/sidebar";
import { useSiteSettings } from "@/lib/site-settings-context";

const DEFAULT_LOGO = "/logos/logo.svg";
const DEFAULT_NAME = "__YOUR_BRAND__";

const data = {
  navMain: [
    { title: "Dashboard", href: "/admin", icon: IconDashboard, exact: true },
    { title: "Inbox", href: "/admin/inbox", icon: IconInbox },
    { title: "Prospecting", href: "/admin/prospecting", icon: IconBuildingStore },
    { title: "Outreach", href: "/admin/outreach", icon: IconMail },
    { title: "CRM", href: "/admin/crm", icon: IconUsers },
    { title: "Newsletter", href: "/admin/newsletter", icon: IconNews },
  ],
  navSecondary: [{ title: "Settings", url: "/admin/settings", icon: IconSettings }],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();
  const { settings } = useSiteSettings();

  const logoSrc = settings.logoUrl || DEFAULT_LOGO;
  const displayName = settings.businessName || DEFAULT_NAME;
  const isCustomLogo = !!settings.logoUrl;

  // Split name: first word on line 1, rest on line 2
  const nameParts = displayName.split(" ");
  const nameLine1 = nameParts[0] ?? "";
  const nameLine2 = nameParts.slice(1).join(" ");

  const user = {
    name: session?.user?.name || "Admin",
    email:
      session?.user?.email || process.env.NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL || "admin@example.com",
    avatar: "/android-chrome-192x192.png",
  };

  return (
    <NotificationProvider>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader className="pt-0 md:pt-3.5">
          {/* Expanded: logo + stacked name on left, bell + trigger on right */}
          <div className="flex items-start justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-14 w-14 md:h-12 md:w-12 shrink-0 block">
                {isCustomLogo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={logoSrc}
                    alt={displayName}
                    className="h-full w-full rounded-lg object-contain"
                  />
                ) : (
                  <Image
                    src={DEFAULT_LOGO}
                    alt={displayName}
                    width={48}
                    height={48}
                    className="h-full w-full rounded-lg"
                  />
                )}
              </span>
              <div className="flex flex-col leading-tight font-[family-name:var(--font-playfair)] tracking-tight">
                <span className="text-2xl font-extrabold text-foreground md:text-xl md:font-extrabold">
                  {nameLine1}
                </span>
                {nameLine2 && (
                  <span className="text-2xl font-extrabold text-foreground md:text-xl md:font-extrabold">
                    {nameLine2}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 -mt-1">
              <NotificationBell />
              <SidebarTrigger className="text-foreground" />
            </div>
          </div>

          {/* Collapsed: logo centered, then bell + trigger stacked */}
          <div className="hidden flex-col items-center gap-2 py-1 group-data-[collapsible=icon]:flex">
            {isCustomLogo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoSrc}
                alt={displayName}
                className="h-11 w-11 shrink-0 rounded-lg object-contain"
              />
            ) : (
              <Image
                src={DEFAULT_LOGO}
                alt={displayName}
                width={44}
                height={44}
                className="shrink-0 rounded-lg"
              />
            )}
            <div className="flex flex-col items-center gap-1 pt-1">
              <NotificationBell />
              <SidebarTrigger className="text-foreground" />
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <NavMain items={data.navMain} />
        </SidebarContent>
        <SidebarFooter>
          <NavSecondary items={data.navSecondary} />
          <NavUser user={user} />
        </SidebarFooter>
      </Sidebar>
    </NotificationProvider>
  );
}
