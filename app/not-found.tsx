import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-semibold">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found.</p>
      <Link href="/admin" className="mt-6 text-sm underline">
        Go to admin
      </Link>
    </div>
  );
}
