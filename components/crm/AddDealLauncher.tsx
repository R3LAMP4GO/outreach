"use client";

/**
 * AddDealLauncher
 *
 * Tiny client wrapper that watches `?new=deal` (and optionally `&stage=<slug>`)
 * in the URL and opens `AddDealDialog`. Mounted on the CRM dashboard so the
 * "New Deal" quick-action from `/admin?...` lands users straight into a
 * pre-opened form.
 *
 * On close, strips the `?new` / `?stage` params from the URL so refreshing the
 * page doesn't re-pop the dialog.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AddDealDialog } from "./AddDealDialog";

export function AddDealLauncher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const newParam = searchParams.get("new");
  const stageParam = searchParams.get("stage") ?? undefined;

  const wantsDealDialog = newParam === "deal";
  const [open, setOpen] = useState(false);

  // Sync local open state with the URL on mount + when the param flips
  useEffect(() => {
    if (wantsDealDialog) {
      setOpen(true);
    }
  }, [wantsDealDialog]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && wantsDealDialog) {
      // Strip `new` and `stage` from the URL so the dialog doesn't re-open
      // on a soft refresh.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      params.delete("stage");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  // Don't render the dialog tree unless we've ever needed it. This keeps
  // the CRM dashboard's first paint free of an unused dialog subtree.
  if (!wantsDealDialog && !open) return null;

  return (
    <AddDealDialog open={open} onOpenChange={handleOpenChange} defaultStageSlug={stageParam} />
  );
}
