/**
 * Admin root layout - Forces dynamic rendering for all admin pages
 * Required because admin pages use client-side context (SidebarProvider)
 * which React 19 doesn't allow during static generation
 */

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
