"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Icon } from "@tabler/icons-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/shadcn/ui/sidebar";

export function NavSecondary({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon: Icon;
  }[];
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = pathname === item.url || pathname.startsWith(item.url + "/");

        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={isActive}
              asChild
              className="h-11 text-base"
            >
              <Link href={item.url} onClick={() => setOpenMobile(false)}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
