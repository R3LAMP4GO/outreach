"use client";

import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/shadcn/ui/button";
import { buildSkinCss, SKINS } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SkinPickerProps {
  currentSkinId: string;
}

const SKIN_LIST = Object.values(SKINS);
const PREVIEW_STYLE_ID = "skin-preview";

function applyPreview(skinId: string) {
  const css = buildSkinCss(skinId);
  let el = document.getElementById(PREVIEW_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = PREVIEW_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function removePreview() {
  document.getElementById(PREVIEW_STYLE_ID)?.remove();
}

export function SkinPicker({ currentSkinId }: SkinPickerProps) {
  const [savedSkin, setSavedSkin] = useState(currentSkinId);
  const [previewSkin, setPreviewSkin] = useState(currentSkinId);
  const [isPending, startTransition] = useTransition();

  const hasChanges = previewSkin !== savedSkin;

  useEffect(() => {
    return () => {
      removePreview();
    };
  }, []);

  function handleSelect(skinId: string) {
    if (skinId === previewSkin) return;
    setPreviewSkin(skinId);
    applyPreview(skinId);
  }

  const handleSave = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skinId: previewSkin }),
        });
        if (!res.ok) {
          toast.error("Failed to save colour scheme");
          return;
        }
        setSavedSkin(previewSkin);
        toast.success("Colour scheme saved");
        // Keep the preview style — it matches what's now saved
      } catch {
        toast.error("Failed to save colour scheme");
      }
    });
  }, [previewSkin]);

  const handleCancel = useCallback(() => {
    setPreviewSkin(savedSkin);
    if (savedSkin === currentSkinId) {
      removePreview();
    } else {
      applyPreview(savedSkin);
    }
  }, [savedSkin, currentSkinId]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SKIN_LIST.map((skin) => {
          const isActive = previewSkin === skin.id;
          return (
            <button
              key={skin.id}
              type="button"
              disabled={isPending}
              onClick={() => handleSelect(skin.id)}
              className={cn(
                "relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted",
                isPending && "opacity-60",
              )}
            >
              {isActive && <CheckCircle2 className="absolute top-2 right-2 size-4 text-primary" />}
              <div className="flex gap-1">
                {skin.preview.map((color, i) => (
                  <div
                    key={i}
                    className="size-5 rounded-full border border-border/50"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div>
                <p className="text-sm font-medium">{skin.name}</p>
                <p className="text-xs text-muted-foreground">{skin.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {hasChanges && (
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={isPending} className="shadow-sm">
            {isPending ? "Saving..." : "Save colour scheme"}
          </Button>
          <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
