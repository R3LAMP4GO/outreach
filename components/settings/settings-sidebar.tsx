"use client";

import {
  IconBell,
  IconBuildingStore,
  IconMenu2,
  IconPalette,
  IconPlug,
  IconShield,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/shadcn/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/shadcn/ui/sheet";
import { cn } from "@/lib/utils";
import { useSiteSettings } from "@/lib/site-settings-context";

const NAV_SECTIONS = [
  {
    label: "ACCOUNT",
    items: [
      { title: "Profile", href: "/admin/settings/profile", icon: IconUser },
      { title: "Security", href: "/admin/settings/security", icon: IconShield },
    ],
  },
  {
    label: "MANAGEMENT",
    items: [{ title: "Users", href: "/admin/settings/users", icon: IconUsers }],
  },
  {
    label: "BUSINESS",
    items: [{ title: "Business", href: "/admin/settings/business", icon: IconBuildingStore }],
  },
  {
    label: "PREFERENCES",
    items: [
      { title: "Notifications", href: "/admin/settings/notifications", icon: IconBell },
      { title: "Appearance", href: "/admin/settings/appearance", icon: IconPalette },
    ],
  },
  {
    label: "DEVELOPER",
    items: [{ title: "Integrations", href: "/admin/settings/integrations", icon: IconPlug }],
  },
];

function NavItems({ onSelect }: { onSelect?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </p>
          {section.items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onSelect}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function SettingsSidebar() {
  const [open, setOpen] = useState(false);
  const { settings } = useSiteSettings();
  const logoSrc = settings.logoUrl || "/logos/logo.svg";
  const displayName = settings.businessName || "__YOUR_BRAND__";

  return (
    <>
      {/* Mobile: sheet trigger */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="shadow-sm gap-2">
              <IconMenu2 className="size-4" />
              Menu
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoSrc}
                  alt={displayName}
                  className="h-14 w-14 shrink-0 rounded-xl object-contain"
                />
                <div>
                  <SheetTitle>{displayName}</SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Settings</p>
                </div>
              </div>
            </SheetHeader>
            <div className="px-4 py-4">
              <NavItems onSelect={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: fixed aside */}
      <aside className="hidden w-48 shrink-0 lg:block">
        <NavItems />
      </aside>
    </>
  );
}
