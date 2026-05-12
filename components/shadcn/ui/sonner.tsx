"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg group-[.toaster]:px-4 group-[.toaster]:py-3",
          title:
            "group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:whitespace-nowrap",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:border-green-200 group-[.toaster]:bg-green-50 dark:group-[.toaster]:border-green-800 dark:group-[.toaster]:bg-green-950/50",
          error:
            "group-[.toaster]:border-red-200 group-[.toaster]:bg-red-50 dark:group-[.toaster]:border-red-800 dark:group-[.toaster]:bg-red-950/50",
          warning:
            "group-[.toaster]:border-yellow-200 group-[.toaster]:bg-yellow-50 dark:group-[.toaster]:border-yellow-800 dark:group-[.toaster]:bg-yellow-950/50",
          info: "group-[.toaster]:border-blue-200 group-[.toaster]:bg-blue-50 dark:group-[.toaster]:border-blue-800 dark:group-[.toaster]:bg-blue-950/50",
        },
      }}
      icons={{
        success: (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
            <CircleCheckIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          </div>
        ),
        info: (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
            <InfoIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </div>
        ),
        warning: (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/50">
            <TriangleAlertIcon className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
          </div>
        ),
        error: (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
            <OctagonXIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          </div>
        ),
        loading: <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
