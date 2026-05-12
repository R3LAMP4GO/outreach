"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export interface AdminThemeWrapperProps {
  children: React.ReactNode;
}

export function AdminThemeWrapper({ children }: AdminThemeWrapperProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const { data: session } = useSession();
  const previousPathRef = React.useRef<string>(pathname);
  const hasFetchedTheme = React.useRef<boolean>(false);

  // Fetch saved theme when entering admin
  React.useEffect(() => {
    const isAdmin = pathname.startsWith("/admin");
    const isLoginPage = pathname === "/admin/login";

    if (isAdmin && !isLoginPage && session?.user && !hasFetchedTheme.current) {
      hasFetchedTheme.current = true;

      fetch("/api/admin/settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.preferences?.theme) {
            setTheme(data.preferences.theme);
          }
        })
        .catch((err) => {
          console.error("Failed to load theme preference:", err);
        });
    }

    // Reset fetch flag when leaving admin
    if (!isAdmin && previousPathRef.current.startsWith("/admin")) {
      hasFetchedTheme.current = false;
    }

    previousPathRef.current = pathname;
  }, [pathname, session?.user, setTheme]);

  // Force light mode on public pages
  React.useEffect(() => {
    const isAdmin = pathname.startsWith("/admin");

    if (!isAdmin && theme !== "light") {
      setTheme("light");
    }
  }, [pathname, theme, setTheme]);

  return <>{children}</>;
}
