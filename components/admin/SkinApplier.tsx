"use client";

import { useEffect } from "react";
import { buildSkinCss } from "@/lib/themes";

export function SkinApplier() {
  useEffect(() => {
    const apply = async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        const skinId = data.skinId || "concrete";
        const css = buildSkinCss(skinId);
        if (!css) return;

        const styleId = "applied-skin";
        let el = document.getElementById(styleId) as HTMLStyleElement | null;
        if (!el) {
          el = document.createElement("style");
          el.id = styleId;
          document.head.appendChild(el);
        }
        el.textContent = css;
      } catch {
        // silently fail — non-critical
      }
    };

    apply();
  }, []);

  return null;
}
