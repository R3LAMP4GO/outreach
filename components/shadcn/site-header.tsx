import { SidebarTrigger } from "@/components/shadcn/ui/sidebar";
import { Separator } from "@/components/shadcn/ui/separator";

interface SiteHeaderProps {
  title?: React.ReactNode;
}

export function SiteHeader({ title }: SiteHeaderProps) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        {title && (
          <>
            <Separator orientation="vertical" className="mr-2 h-4" />
            {typeof title === "string" ? (
              <h1 className="text-base font-medium text-foreground">{title}</h1>
            ) : (
              title
            )}
          </>
        )}
      </div>
    </header>
  );
}
