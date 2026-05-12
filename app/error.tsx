"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-semibold">500</h1>
      <p className="mt-2 text-muted-foreground">Something went wrong.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-md border px-4 py-2 text-sm"
      >
        Try again
      </button>
      {error.digest && <p className="mt-4 text-xs text-muted-foreground">ID: {error.digest}</p>}
    </div>
  );
}
