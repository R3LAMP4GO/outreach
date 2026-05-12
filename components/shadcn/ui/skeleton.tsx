import { cn } from "@/components/shadcn/lib/utils";

// Use HTMLAttributes instead of ComponentProps to avoid @types/react ref conflicts on Vercel
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
