"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/shadcn/ui/card";
import { Button } from "@/components/shadcn/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/ui/table";
import { Badge } from "@/components/shadcn/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/shadcn/ui/dropdown-menu";
import { MoreVertical, TrendingUp, Eye, Copy, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { toast } from "sonner";

interface Newsletter {
  id: string;
  subject: string;
  sentAt: string | null;
  status: "draft" | "scheduled" | "sent";
  stats: {
    openRate: number;
    clickRate: number;
    totalRecipients: number;
  };
}

export function NewslettersTable() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNewsletters = async () => {
    try {
      const response = await fetch("/api/newsletter");
      if (response.ok) {
        const data = await response.json();
        setNewsletters(data.newsletters || []);
      }
    } catch (error) {
      console.error("Failed to fetch newsletters:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNewsletters();
  }, []);

  const handleView = (_newsletter: Newsletter) => {
    // TODO: Open sidebar with newsletter details
    toast.info("View newsletter (sidebar coming soon)");
  };

  const handleClone = async (_newsletter: Newsletter) => {
    toast.info("Clone feature coming soon");
  };

  const handleDelete = async (newsletter: Newsletter) => {
    if (!confirm("Are you sure you want to delete this newsletter?")) {
      return;
    }

    try {
      const response = await fetch(`/api/newsletter/${newsletter.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Newsletter deleted");
        fetchNewsletters(); // Refresh list
      } else {
        toast.error("Failed to delete newsletter");
      }
    } catch {
      toast.error("An error occurred");
    }
  };

  const getStatusBadge = (status: Newsletter["status"]) => {
    const variants = {
      draft: "secondary",
      scheduled: "default",
      sent: "outline",
    } as const;

    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Past Newsletters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Past Newsletters</CardTitle>
      </CardHeader>
      <CardContent>
        {newsletters.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No newsletters yet</p>
            <p className="text-sm mt-2">Create your first newsletter above!</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Sent</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newsletters.map((newsletter) => (
                  <TableRow key={newsletter.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{newsletter.subject}</TableCell>
                    <TableCell>{getStatusBadge(newsletter.status)}</TableCell>
                    <TableCell>
                      {newsletter.sentAt ? format(new Date(newsletter.sentAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-medium">
                          {newsletter.stats?.openRate?.toFixed(1) || "0.0"}%
                        </span>
                        {newsletter.stats?.openRate > 40 && (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {newsletter.stats?.clickRate?.toFixed(1) || "0.0"}%
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleView(newsletter)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleClone(newsletter)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Clone
                          </DropdownMenuItem>
                          {newsletter.status === "draft" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(newsletter)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
