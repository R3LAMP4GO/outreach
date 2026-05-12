"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/shadcn/ui/sonner";

export interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider
      refetchInterval={5 * 60} // Refetch session every 5 minutes
      refetchOnWindowFocus={true}
    >
      {children}
      <Toaster />
    </SessionProvider>
  );
}
