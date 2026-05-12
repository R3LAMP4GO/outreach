import { Card, CardContent, CardHeader } from "@/components/shadcn/ui/card";
import { Skeleton } from "@/components/shadcn/ui/skeleton";

export default function NewsletterLoading() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <Skeleton className="h-9 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="px-4 lg:px-6 grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="px-4 lg:px-6">
          <Card>
            <CardContent className="p-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
