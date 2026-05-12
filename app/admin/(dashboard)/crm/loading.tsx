import { Card, CardContent, CardHeader } from "@/components/shadcn/ui/card";
import { Skeleton } from "@/components/shadcn/ui/skeleton";

export default function CRMLoading() {
  return (
    <div className="flex flex-col w-full">
      <div className="px-6 py-4">
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-64 mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
        <Skeleton className="h-10 w-80" />
      </div>
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
