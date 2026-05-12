"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import {
  IconPlus,
  IconLoader2,
  IconDots,
  IconEye,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
  IconCopy,
  IconArchive,
  IconUsers,
  IconSend,
  IconSearch,
  IconMailOpened,
  IconMessageCircle,
} from "@tabler/icons-react";
import { CreateCampaignDialog } from "@/components/outreach/create-campaign-dialog";

type CampaignStatus = "draft" | "active" | "paused" | "completed";

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  test_mode: boolean | null;
  from_email: string;
  from_name: string | null;
  total_contacts: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_replied: number;
  total_bounced: number;
  total_unsubscribed: number;
  created_at: string;
}

const statusColors: Record<CampaignStatus, string> = {
  draft: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const offset = page * pageSize;
    const params = new URLSearchParams({
      limit: pageSize.toString(),
      offset: offset.toString(),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);

    let cancelled = false;

    fetch(`/api/outreach/campaigns?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setCampaigns(data.campaigns || []);
          setTotalCount(data.total || 0);
        }
      })
      .catch((err) => {
        if (!cancelled && err?.name !== "AbortError") {
          console.error("Error fetching campaigns:", err);
          toast.error("Failed to load campaigns");
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [page, pageSize, debouncedSearch, refreshKey]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    return {
      total: campaigns.length,
      active: campaigns.filter((c) => c.status === "active").length,
      draft: campaigns.filter((c) => c.status === "draft").length,
      completed: campaigns.filter((c) => c.status === "completed").length,
    };
  }, [campaigns]);

  const toggleCampaignStatus = async (campaign: Campaign) => {
    setUpdating(campaign.id);
    try {
      const newStatus = campaign.status === "active" ? "paused" : "active";
      const res = await fetch(`/api/outreach/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        if (newStatus === "active" && campaign.test_mode === true) {
          toast.warning(
            `Campaign activated in TEST MODE \u2014 no real emails will be sent. Toggle test mode off in Options.`,
            { duration: 10000 },
          );
        } else {
          toast.success(`Campaign ${newStatus === "active" ? "activated" : "paused"}`);
        }
        triggerRefresh();
      } else {
        toast.error("Failed to update campaign status");
      }
    } catch (error) {
      console.error("Error updating campaign:", error);
      toast.error("Failed to update campaign");
    }
    setUpdating(null);
  };

  const deleteCampaign = async (id: string) => {
    try {
      const res = await fetch(`/api/outreach/campaigns/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Campaign deleted");
        triggerRefresh();
        setDeleteDialogOpen(false);
        setCampaignToDelete(null);
      } else {
        toast.error("Failed to delete campaign");
      }
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast.error("Failed to delete campaign");
    }
  };

  const bulkDelete = async () => {
    try {
      await Promise.all(
        selectedRows.map((campaignId) =>
          fetch(`/api/outreach/campaigns/${campaignId}`, { method: "DELETE" }),
        ),
      );
      toast.success(`Deleted ${selectedRows.length} campaign(s)`);
      setSelectedRows([]);
      setBulkDeleteDialogOpen(false);
      triggerRefresh();
    } catch (error) {
      console.error("Error deleting campaigns:", error);
      toast.error("Failed to delete campaigns");
    }
  };

  const bulkActivate = async () => {
    try {
      const responses = await Promise.all(
        selectedRows.map((campaignId) =>
          fetch(`/api/outreach/campaigns/${campaignId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "active" }),
          }),
        ),
      );
      const bodies = await Promise.all(
        responses.map((r) =>
          r.ok
            ? (r.json().catch(() => ({})) as Promise<{ activated?: number }>)
            : Promise.resolve({} as { activated?: number }),
        ),
      );
      const totalActivated = bodies.reduce((sum, b) => sum + (b.activated ?? 0), 0);
      const testModeNames = campaigns
        .filter((c) => selectedRows.includes(c.id) && c.test_mode === true)
        .map((c) => c.name);
      if (testModeNames.length > 0) {
        const list =
          testModeNames.length <= 3
            ? testModeNames.join(", ")
            : `${testModeNames.slice(0, 3).join(", ")} and ${testModeNames.length - 3} more`;
        toast.warning(
          `Activated ${selectedRows.length} campaign(s) \u00b7 ${totalActivated} enrolled, but ${testModeNames.length} are in TEST MODE and will not send real emails (${list}). Toggle test mode off in Options.`,
          { duration: 10000 },
        );
      } else {
        toast.success(
          `Activated ${selectedRows.length} campaign(s) \u00b7 ${totalActivated} contacts enrolled`,
        );
      }
      setSelectedRows([]);
      triggerRefresh();
    } catch (error) {
      console.error("Error activating campaigns:", error);
      toast.error("Failed to activate campaigns");
    }
  };

  const bulkPause = async () => {
    try {
      await Promise.all(
        selectedRows.map((campaignId) =>
          fetch(`/api/outreach/campaigns/${campaignId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "paused" }),
          }),
        ),
      );
      toast.success(`Paused ${selectedRows.length} campaign(s)`);
      setSelectedRows([]);
      triggerRefresh();
    } catch (error) {
      console.error("Error pausing campaigns:", error);
      toast.error("Failed to pause campaigns");
    }
  };

  const formatDate = useCallback((date: string) => {
    return new Date(date).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, []);

  const calculateRate = useCallback((numerator: number, denominator: number, decimals = 0) => {
    if (denominator === 0) return "0%";
    const rate = (numerator / denominator) * 100;
    return `${rate.toFixed(decimals)}%`;
  }, []);

  const getRateColor = useCallback((rate: number) => {
    if (rate >= 30) return "text-green-600 dark:text-green-400";
    if (rate >= 15) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  }, []);

  const toggleSelectAll = () => {
    if (selectedRows.length === campaigns.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(campaigns.map((c) => c.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id],
    );
  };

  const handleRowClick = (campaignId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest('[role="checkbox"]')
    ) {
      return;
    }
    router.push(`/admin/outreach/campaigns/${campaignId}`);
  };

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-6 lg:px-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Campaigns</h1>
          <p className="text-base text-muted-foreground">Manage your email outreach campaigns</p>
        </div>

        <div className="flex items-center gap-2">
          {selectedRows.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="default">
                  Bulk Actions ({selectedRows.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={bulkActivate}>
                  <IconPlayerPlay className="w-4 h-4 mr-2" />
                  Activate Selected
                </DropdownMenuItem>
                <DropdownMenuItem onClick={bulkPause}>
                  <IconPlayerPause className="w-4 h-4 mr-2" />
                  Pause Selected
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <IconArchive className="w-4 h-4 mr-2" />
                  Archive Selected
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setBulkDeleteDialogOpen(true)}
                >
                  <IconTrash className="w-4 h-4 mr-2" />
                  Delete Selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="default" onClick={() => setCreateDialogOpen(true)}>
            <IconPlus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 px-4 lg:px-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <IconUsers className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">All campaigns created</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <IconSend className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently sending</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft Campaigns</CardTitle>
            <IconMailOpened className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
            <p className="text-xs text-muted-foreground mt-1">In preparation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Campaigns</CardTitle>
            <IconMessageCircle className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">Finished campaigns</p>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      <div className="px-4 lg:px-6 pb-6">
        {loading ? (
          <Card className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </Card>
        ) : campaigns.length === 0 ? (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="rounded-full bg-muted p-3">
                <IconPlus className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">No campaigns yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Create your first campaign to get started with email outreach
                </p>
              </div>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <IconPlus className="w-4 h-4 mr-2" />
                Create Campaign
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="relative flex-1 max-w-sm">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left w-10">
                        <input
                          type="checkbox"
                          checked={selectedRows.length === campaigns.length && campaigns.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-600"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Campaign
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Contacts
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Sent
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Open Rate
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Reply Rate
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Unsub Rate
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Created
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaigns.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                          No campaigns found
                        </td>
                      </tr>
                    ) : (
                      campaigns.map((campaign) => {
                        const openRate =
                          campaign.total_sent > 0
                            ? (campaign.total_opened / campaign.total_sent) * 100
                            : 0;
                        const replyRate =
                          campaign.total_sent > 0
                            ? (campaign.total_replied / campaign.total_sent) * 100
                            : 0;
                        // Unsub rate is over total_sent — only contacts who actually
                        // received an email had the chance to unsubscribe.
                        const unsubRate =
                          campaign.total_sent > 0
                            ? ((campaign.total_unsubscribed ?? 0) / campaign.total_sent) * 100
                            : 0;

                        return (
                          <tr
                            key={campaign.id}
                            className="hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={(e) => handleRowClick(campaign.id, e)}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedRows.includes(campaign.id)}
                                onChange={() => toggleSelectRow(campaign.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border-gray-600"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-sm text-foreground">
                                {campaign.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {campaign.from_name} &lt;{campaign.from_email}&gt;
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColors[campaign.status]}`}
                                >
                                  {campaign.status}
                                </span>
                                {campaign.test_mode === true && (
                                  <span
                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-yellow-500 text-white"
                                    title="Worker logs sends but doesn't deliver. Toggle off in Options."
                                  >
                                    Test mode
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-medium">
                              {campaign.total_contacts}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="text-sm font-medium">{campaign.total_sent}</div>
                              <div className="text-xs text-muted-foreground">
                                {calculateRate(campaign.total_sent, campaign.total_contacts)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className={`text-sm font-semibold ${getRateColor(openRate)}`}>
                                {calculateRate(campaign.total_opened, campaign.total_sent, 1)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {campaign.total_opened} opens
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className={`text-sm font-semibold ${getRateColor(replyRate)}`}>
                                {calculateRate(campaign.total_replied, campaign.total_sent, 1)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {campaign.total_replied} replies
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div
                                className={`text-sm font-semibold ${
                                  unsubRate >= 1
                                    ? "text-red-600 dark:text-red-400"
                                    : unsubRate > 0
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-foreground"
                                }`}
                              >
                                {calculateRate(
                                  campaign.total_unsubscribed ?? 0,
                                  campaign.total_sent,
                                  1,
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {campaign.total_unsubscribed ?? 0} unsubs
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {formatDate(campaign.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                  <Link href={`/admin/outreach/campaigns/${campaign.id}`}>
                                    <IconEye className="w-4 h-4" />
                                    <span className="sr-only">View</span>
                                  </Link>
                                </Button>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <IconDots className="w-4 h-4" />
                                      <span className="sr-only">More</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem asChild>
                                      <Link href={`/admin/outreach/campaigns/${campaign.id}`}>
                                        <IconEye className="w-4 h-4 mr-2" />
                                        View Campaign
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled>
                                      <IconPencil className="w-4 h-4 mr-2" />
                                      Edit Campaign
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled>
                                      <IconCopy className="w-4 h-4 mr-2" />
                                      Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => toggleCampaignStatus(campaign)}
                                      disabled={updating === campaign.id}
                                    >
                                      {updating === campaign.id ? (
                                        <>
                                          <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Updating...
                                        </>
                                      ) : campaign.status === "active" ? (
                                        <>
                                          <IconPlayerPause className="w-4 h-4 mr-2" />
                                          Pause Campaign
                                        </>
                                      ) : (
                                        <>
                                          <IconPlayerPlay className="w-4 h-4 mr-2" />
                                          Activate Campaign
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled>
                                      <IconArchive className="w-4 h-4 mr-2" />
                                      Archive
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        setCampaignToDelete(campaign.id);
                                        setDeleteDialogOpen(true);
                                      }}
                                    >
                                      <IconTrash className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-3 mt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {totalCount > 0 ? page * pageSize + 1 : 0} to{" "}
                    {Math.min((page + 1) * pageSize, totalCount)} of {totalCount} campaigns
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page</span>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(v) => {
                        setPageSize(Number(v));
                        setPage(0);
                      }}
                    >
                      <SelectTrigger className="w-[70px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="flex-1 sm:flex-none"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * pageSize >= totalCount}
                    className="flex-1 sm:flex-none"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Campaign Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this campaign? This action cannot be undone and will
              remove all associated contacts and data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => campaignToDelete && deleteCampaign(campaignToDelete)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedRows.length} Campaigns</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedRows.length} campaign(s)? This action cannot
              be undone and will remove all associated contacts and data from these campaigns.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={bulkDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete {selectedRows.length} Campaign(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Campaign Dialog */}
      <CreateCampaignDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  );
}
