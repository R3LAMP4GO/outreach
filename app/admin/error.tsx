"use client";

import { useEffect } from "react";

/**
 * Admin Error Boundary
 * Catches rendering errors in admin routes.
 * Shows more technical detail since it's admin-only.
 * Uses default export as required by Next.js App Router convention.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Error</h1>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            An error occurred while rendering this admin page.
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4 space-y-2">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {error.message || "Unknown error"}
          </p>
          {error.digest && (
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">
              Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="
              px-6 py-2.5
              rounded-lg
              text-sm font-medium
              text-white
              bg-gray-900 dark:bg-gray-100 dark:text-gray-900
              hover:bg-gray-800 dark:hover:bg-gray-200
              active:scale-95
              transition-all duration-200
              cursor-pointer
            "
          >
            Try Again
          </button>
          <a
            href="/admin"
            className="
              px-6 py-2.5
              rounded-lg
              text-sm font-medium
              text-gray-700 dark:text-gray-300
              bg-white dark:bg-gray-800
              border border-gray-300 dark:border-gray-600
              hover:bg-gray-50 dark:hover:bg-gray-700
              active:scale-95
              transition-all duration-200
            "
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
