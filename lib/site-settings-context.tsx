"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type SiteSettings = {
  logoUrl: string | null;
  businessName: string | null;
};

type SiteSettingsContextValue = {
  settings: SiteSettings;
  refresh: () => void;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
  settings: { logoUrl: null, businessName: null },
  refresh: () => {},
});

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>({
    logoUrl: null,
    businessName: null,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/site-settings");
      const data = await res.json();
      if (res.ok && data.settings) {
        setSettings({
          logoUrl: data.settings.logoUrl ?? null,
          businessName: data.settings.businessName ?? null,
        });
      }
    } catch {
      // silently fail — non-critical
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SiteSettingsContext.Provider value={{ settings, refresh }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
