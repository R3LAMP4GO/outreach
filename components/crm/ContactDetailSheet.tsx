"use client";

import { useCallback, useEffect, useRef, useState } from "react";
/**
 * Contact type from API (snake_case keys matching DB columns).
 * The API returns snake_case JSON from Drizzle camelCase schema.
 */
interface ContactRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  industry: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  website: string | null;
  location: string | null;
  country: string | null;
  contact_status: string | null;
  is_newsletter_subscriber: boolean;
  source: string;
  notes: string | null;
  tags: string[] | null;
  original_source: string | null;
  original_source_detail: string | null;
  original_utm_source: string | null;
  original_utm_medium: string | null;
  original_utm_campaign: string | null;
  latest_source: string | null;
  latest_source_detail: string | null;
  latest_utm_source: string | null;
  latest_utm_medium: string | null;
  latest_utm_campaign: string | null;
  first_touch_date: string | null;
  last_touch_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface TimelineRow {
  id: string;
  contact_id: string;
  event_type: string;
  title: string;
  description: string | null;
  created_at: string | null;
}
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/ui/sheet";
import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { Badge } from "@/components/shadcn/ui/badge";
import { Separator } from "@/components/shadcn/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import { IconMail, IconCalendar, IconBrandLinkedin, IconWorld } from "@tabler/icons-react";
import { toast } from "sonner";
import { getEventStyle } from "@/lib/crm/event-styles";
import { ComposeEmailDialog } from "./ComposeEmailDialog";

interface DealWithStage {
  id: string;
  name: string;
  amount: number | null;
  stage: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
  };
}

interface ContactDetailSheetProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactUpdated?: () => void;
}

export function ContactDetailSheet({
  contactId,
  open,
  onOpenChange,
  onContactUpdated,
}: ContactDetailSheetProps) {
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [deals, setDeals] = useState<DealWithStage[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const [formData, setFormData] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    company: string;
    job_title: string;
    industry: string;
    seniority: string;
    linkedin_url: string;
    website: string;
    location: string;
    country: string;
    contact_status: string;
    is_newsletter_subscriber: boolean | null;
    notes: string;
  }>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
    job_title: "",
    industry: "",
    seniority: "",
    linkedin_url: "",
    website: "",
    location: "",
    country: "",
    contact_status: "",
    is_newsletter_subscriber: null,
    notes: "",
  });

  const initialFormData = useRef(formData);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/crm/contacts/${contactId}`);

      if (!response.ok) throw new Error("Failed to fetch contact");

      const data = await response.json();
      setContact(data.contact);
      setDeals(data.deals || []);
      setTimeline(data.timeline || []);

      const loaded = {
        first_name: data.contact.first_name || "",
        last_name: data.contact.last_name || "",
        email: data.contact.email || "",
        phone: data.contact.phone || "",
        company: data.contact.company || "",
        job_title: data.contact.job_title || "",
        industry: data.contact.industry || "",
        seniority: data.contact.seniority || "",
        linkedin_url: data.contact.linkedin_url || "",
        website: data.contact.website || "",
        location: data.contact.location || "",
        country: data.contact.country || "",
        contact_status: data.contact.contact_status || "",
        is_newsletter_subscriber: data.contact.is_newsletter_subscriber ?? null,
        notes: data.contact.notes || "",
      };
      setFormData(loaded);
      initialFormData.current = loaded;
    } catch (err) {
      console.error("Error fetching contact:", err);
      toast.error("Failed to load contact");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    if (contactId && open) {
      fetchContact();
    }
  }, [contactId, open, fetchContact]);

  const handleSave = async () => {
    if (!contactId) return;

    try {
      setSaving(true);

      // Only include fields the user actually changed (diff against initial values)
      const initial = initialFormData.current;
      const changedData: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(formData)) {
        const initialValue = initial[key as keyof typeof initial];
        if (value !== initialValue) {
          // Convert empty strings to null for optional fields to avoid overwriting DB nulls
          // Email is required and not nullable — exclude from null coercion
          changedData[key] = value === "" && key !== "email" ? null : value;
        }
      }

      // Nothing changed — skip the request
      if (Object.keys(changedData).length === 0) {
        toast.info("No changes to save");
        return;
      }

      const response = await fetch(`/api/crm/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changedData),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Failed to update contact");
        return;
      }

      setContact(data.contact);
      // Update initial snapshot so subsequent saves correctly detect changes
      initialFormData.current = { ...formData };
      toast.success("Contact updated successfully");
      onContactUpdated?.();
    } catch (err) {
      console.error("Error updating contact:", err);
      toast.error("Failed to update contact");
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      subscriber: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
      lead: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
      qualified: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
      customer: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
    };
    return colors[status] || "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      contact_form: "Contact Form",
      newsletter: "Newsletter",
      cal_com: "Cal.com",
      outreach: "Outreach",
      manual: "Manual",
      n8n_import: "N8N Import",
    };
    return labels[source] || source;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  if (!contactId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        {loading ? (
          <SheetHeader>
            <SheetTitle>Loading...</SheetTitle>
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading contact...</p>
            </div>
          </SheetHeader>
        ) : contact ? (
          <>
            <SheetHeader>
              <SheetTitle>
                {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email}
              </SheetTitle>
              <SheetDescription asChild>
                <span className="flex items-center gap-2 mt-2 text-muted-foreground text-sm flex-wrap">
                  <Badge className={getStatusColor(contact.contact_status ?? "")}>
                    {contact.contact_status || "unknown"}
                  </Badge>
                  <Badge variant="outline">{getSourceLabel(contact.source)}</Badge>
                  <span className="text-xs">
                    Added {new Date(contact.created_at ?? "").toLocaleDateString()}
                  </span>
                </span>
              </SheetDescription>
            </SheetHeader>

            {/* Quick links */}
            {(contact.linkedin_url || contact.website) && (
              <div className="flex gap-2 mt-2">
                {contact.linkedin_url &&
                  (/^https?:\/\//.test(contact.linkedin_url) ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
                        <IconBrandLinkedin className="h-4 w-4 mr-1" />
                        LinkedIn
                      </a>
                    </Button>
                  ) : (
                    <span className="inline-flex items-center text-sm text-muted-foreground">
                      <IconBrandLinkedin className="h-4 w-4 mr-1" />
                      {contact.linkedin_url}
                    </span>
                  ))}
                {contact.website &&
                  (/^https?:\/\//.test(contact.website) ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={contact.website} target="_blank" rel="noopener noreferrer">
                        <IconWorld className="h-4 w-4 mr-1" />
                        Website
                      </a>
                    </Button>
                  ) : (
                    <span className="inline-flex items-center text-sm text-muted-foreground">
                      <IconWorld className="h-4 w-4 mr-1" />
                      {contact.website}
                    </span>
                  ))}
              </div>
            )}

            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">
                  Details
                </TabsTrigger>
                <TabsTrigger value="deals" className="flex-1">
                  Deals ({deals.length})
                </TabsTrigger>
                <TabsTrigger value="attribution" className="flex-1">
                  Attribution
                </TabsTrigger>
                <TabsTrigger value="activity" className="flex-1">
                  Activity
                </TabsTrigger>
              </TabsList>

              {/* ── Details Tab ── */}
              <TabsContent value="details" className="space-y-6 mt-6">
                {/* Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    />
                  </div>
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <Separator />

                {/* Company Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="job_title">Job Title</Label>
                    <Input
                      id="job_title"
                      value={formData.job_title}
                      onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={formData.industry}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seniority">Seniority</Label>
                    <Input
                      id="seniority"
                      placeholder="e.g. C-Level, VP, Director"
                      value={formData.seniority}
                      onChange={(e) => setFormData({ ...formData, seniority: e.target.value })}
                    />
                  </div>
                </div>

                <Separator />

                {/* Links */}
                <div className="space-y-2">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    placeholder="https://linkedin.com/in/..."
                    value={formData.linkedin_url}
                    onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    placeholder="https://..."
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>

                <Separator />

                {/* Location */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      placeholder="City, State"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>
                </div>

                {/* Status & Newsletter */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.contact_status}
                      onValueChange={(value) => setFormData({ ...formData, contact_status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="subscriber">Subscriber</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newsletter">Newsletter</Label>
                    <Select
                      value={
                        formData.is_newsletter_subscriber === true
                          ? "subscribed"
                          : formData.is_newsletter_subscriber === false
                            ? "unsubscribed"
                            : "unknown"
                      }
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          is_newsletter_subscriber:
                            value === "subscribed" ? true : value === "unsubscribed" ? false : null,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {formData.is_newsletter_subscriber === null && (
                          <SelectItem value="unknown" disabled>
                            Unknown
                          </SelectItem>
                        )}
                        <SelectItem value="subscribed">Subscribed</SelectItem>
                        <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    rows={4}
                    placeholder="Add notes about this contact..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                <Separator />

                {/* Quick Actions */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Quick Actions</Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <IconCalendar className="h-4 w-4 mr-2" />
                      Schedule Meeting
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={!contact?.email}
                      onClick={() => setComposeOpen(true)}
                    >
                      <IconMail className="h-4 w-4 mr-2" />
                      Send Email
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Save */}
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </TabsContent>

              {/* ── Deals Tab ── */}
              <TabsContent value="deals" className="mt-6">
                {deals.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No deals associated with this contact
                  </div>
                ) : (
                  <div className="space-y-3">
                    {deals.map((deal) => (
                      <div
                        key={deal.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-sm">{deal.name}</p>
                          {deal.stage && (
                            <Badge
                              variant="secondary"
                              className="mt-1 text-xs text-white"
                              style={
                                deal.stage.color ? { backgroundColor: deal.stage.color } : undefined
                              }
                            >
                              {deal.stage.name}
                            </Badge>
                          )}
                        </div>
                        {deal.amount != null && (
                          <span className="text-sm font-medium text-muted-foreground">
                            ${deal.amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── Attribution Tab ── */}
              <TabsContent value="attribution" className="mt-6 space-y-6">
                {/* Source Attribution */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Source Attribution</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <AttributionField label="Original Source" value={contact.original_source} />
                    <AttributionField
                      label="Original Detail"
                      value={contact.original_source_detail}
                    />
                    <AttributionField label="Latest Source" value={contact.latest_source} />
                    <AttributionField label="Latest Detail" value={contact.latest_source_detail} />
                  </div>
                </div>

                <Separator />

                {/* UTM Tracking */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">UTM Tracking — Original</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <AttributionField label="Source" value={contact.original_utm_source} />
                    <AttributionField label="Medium" value={contact.original_utm_medium} />
                    <AttributionField label="Campaign" value={contact.original_utm_campaign} />
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">UTM Tracking — Latest</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <AttributionField label="Source" value={contact.latest_utm_source} />
                    <AttributionField label="Medium" value={contact.latest_utm_medium} />
                    <AttributionField label="Campaign" value={contact.latest_utm_campaign} />
                  </div>
                </div>

                <Separator />

                {/* Touch Dates */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Touch Points</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <AttributionField
                      label="First Touch"
                      value={
                        contact.first_touch_date
                          ? new Date(contact.first_touch_date).toLocaleDateString()
                          : null
                      }
                    />
                    <AttributionField
                      label="Last Touch"
                      value={
                        contact.last_touch_date
                          ? new Date(contact.last_touch_date).toLocaleDateString()
                          : null
                      }
                    />
                  </div>
                </div>

                {/* Tags */}
                {contact.tags && contact.tags.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-foreground">Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {contact.tags.map((tag: string) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ── Activity Tab ── */}
              <TabsContent value="activity" className="mt-6">
                {timeline.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No activity recorded yet
                  </div>
                ) : (
                  <div className="space-y-4">
                    {timeline.map((event) => {
                      const { icon: EventIcon, color, bg } = getEventStyle(event.event_type);
                      return (
                        <div key={event.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`rounded-full p-2 ${bg}`}>
                              <EventIcon className={`h-3 w-3 ${color}`} />
                            </div>
                          </div>
                          <div className="flex-1 pb-4">
                            <p className="text-sm font-medium">{event.title}</p>
                            {event.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {event.description}
                              </p>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(event.created_at ?? "")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Contact not found</SheetTitle>
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">This contact could not be loaded.</p>
            </div>
          </SheetHeader>
        )}
      </SheetContent>
      {contact?.email && (
        <ComposeEmailDialog
          contactId={contact.id}
          contactEmail={contact.email}
          contactName={[contact.first_name, contact.last_name].filter(Boolean).join(" ") || null}
          open={composeOpen}
          onOpenChange={setComposeOpen}
          onSent={() => {
            // Refresh timeline so the new email_sent event shows up.
            void fetchContact();
            onContactUpdated?.();
          }}
        />
      )}
    </Sheet>
  );
}

function AttributionField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}
