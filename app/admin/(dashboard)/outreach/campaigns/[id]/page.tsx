"use client";

import DOMPurify from "isomorphic-dompurify";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
// Table rendering is inline (CRM-style), no TanStack needed
// DnD removed - using inline CRM-style tables
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/shadcn/ui/card";
import { Button } from "@/components/shadcn/ui/button";
import { Badge } from "@/components/shadcn/ui/badge";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import { Checkbox } from "@/components/shadcn/ui/checkbox";
import { Separator } from "@/components/shadcn/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/shadcn/ui/command";
import { Calendar } from "@/components/shadcn/ui/calendar";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/ui/dropdown-menu";
import { Input as SearchInput } from "@/components/shadcn/ui/input";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/shadcn/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcn/ui/tooltip";
import { CampaignOwnerSelect } from "@/components/outreach/campaign-owner-select";
import { CampaignTagsInput } from "@/components/outreach/campaign-tags-input";
import { GmailLogo } from "@/components/icons/gmail-logo";
import { OutlookLogo } from "@/components/icons/outlook-logo";
import {
  Loader2,
  Pause,
  Play,
  Pencil,
  Trash2,
  Plus,
  Copy,
  Users,
  Send,
  MailOpen,
  MessageCircle,
  CheckCircle,
  MousePointerClick,
  AlertCircle,
  ChevronDown,
  Eye,
  Save,
  FileText,
  Code,
  Calendar as CalendarIcon,
  MoreVertical,
  Search,
  Handshake,
  HeartCrack,
  Frown,
  Check,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Type as TypeIcon,
  Smile,
  LinkIcon,
  ImageIcon,
  Eraser,
  Sparkles,
  FileCode,
  MailMinus,
  Brain,
  Filter,
  UserPlus,
  User,
  Building2,
  Shield,
  // Status icons
  SquareCheck,
  Link2,
  Mail,
  CircleMinus,
  Megaphone,
  Clock,
  AlertTriangle,
  WifiOff,
  GitBranch,
  Zap,
  CircleCheck,
  type LucideIcon,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TiptapLink from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import TiptapImage from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/shadcn/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/ui/toggle-group";
import { DeleteConfirmDialog } from "@/components/shadcn/ui/delete-confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/shadcn/ui/sheet";
import { ScrollArea } from "@/components/shadcn/ui/scroll-area";

type CampaignStatus = "draft" | "active" | "paused" | "completed";
type ContactStatus =
  // System-controlled statuses (read-only, set by automation)
  | "reply_received"
  | "link_clicked"
  | "completed_no_reply"
  | "email_opened"
  | "no_emails_opened"
  | "unsubscribed"
  | "bounced"
  | "skipped"
  | "contacted"
  | "not_yet_contacted"
  | "risky"
  | "invalid"
  | "valid"
  | "in_subsequence"
  | "completed"
  // Manual lead statuses (user can set these)
  | "lead"
  | "interested"
  | "meeting_booked"
  | "meeting_complete"
  | "won"
  | "out_of_office"
  | "wrong_person"
  | "not_interested"
  | "lost"
  // Legacy (keep for backwards compatibility)
  | "pending"
  | "active"
  | "paused"
  | "replied";

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  description: string | null;
  from_email: string;
  from_name: string | null;
  email_2_delay: number;
  email_3_delay: number;
  test_mode: boolean | null;
  total_contacts: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_replied: number;
  total_bounced: number;
  created_at: string;
  owner_id: string | null;
  tags: string[] | null;
  // Options fields
  track_opens: boolean;
  track_clicks: boolean;
  stop_on_auto_reply: boolean;
  insert_unsubscribe_header: boolean;
  text_only: boolean;
  text_only_first: boolean;
  stop_company_on_reply: boolean;
  max_new_leads_per_day: number | null;
  // Per-campaign sequence templates (the shell wrapping each contact's AI body)
  email_1_template: string;
  email_2_template: string;
  email_3_template: string;
  email_1_subject_template: string | null;
  email_2_subject_template: string | null;
  email_3_subject_template: string | null;
}

interface Contact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  seniority: string | null;
  phone: string | null;
  location: string | null;
  industry: string | null;
  company_size: string | null;
  company_revenue: number | null;
  founded_year: number | null;
  website_url: string | null;
  linkedin_url: string | null;
  email_provider: string | null;
  email_security_gateway: string | null;
  security_tier: string | null;
  security_level: string | null;
  research_report: string | null;
  timezone: string | null;
  opt_out: boolean;
  status: ContactStatus;
  current_step: number;
  next_send_at: string | null;
  email_1_subject: string;
  email_1_body: string;
  email_2_subject: string | null;
  email_2_body: string;
  email_3_subject: string;
  email_3_body: string;
  email_1_sent_at: string | null;
  email_2_sent_at: string | null;
  email_3_sent_at: string | null;
}

interface ScheduleFormData {
  send_window_start: string;
  send_window_end: string;
  send_days: string[];
  timezone_mode: "recipient" | "fixed";
  fixed_timezone: string;
  max_emails_per_day: number;
  spacing_minutes: number;
}

interface OptionsFormData {
  test_mode: boolean;
  track_opens: boolean;
  track_clicks: boolean;
  stop_on_auto_reply: boolean;
  insert_unsubscribe_header: boolean;
  stop_company_on_reply: boolean;
  text_only: boolean;
  text_only_first: boolean;
  max_new_leads_per_day: number | null;
  min_send_interval_minutes: number;
  random_send_interval_minutes: number;
  cc_recipients: string;
  bcc_recipients: string;
}

const campaignStatusColors: Record<CampaignStatus, string> = {
  draft: "bg-gray-500",
  active: "bg-green-500",
  paused: "bg-yellow-500",
  completed: "bg-blue-500",
};

// Status configuration with icon, color (icon color), and label
interface StatusConfig {
  icon: LucideIcon;
  color: string; // Tailwind text color class
  bgColor: string; // Tailwind background color class
  label: string;
}

const contactStatusConfig: Record<ContactStatus, StatusConfig> = {
  // Email Activity Statuses
  reply_received: {
    icon: SquareCheck,
    color: "text-green-500",
    bgColor: "bg-green-50",
    label: "Reply received",
  },
  link_clicked: {
    icon: Link2,
    color: "text-green-500",
    bgColor: "bg-green-50",
    label: "Link clicked",
  },
  completed_no_reply: {
    icon: SquareCheck,
    color: "text-cyan-500",
    bgColor: "bg-cyan-50",
    label: "Completed, No reply",
  },
  email_opened: {
    icon: MailOpen,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    label: "Email opened, No reply",
  },
  no_emails_opened: {
    icon: Mail,
    color: "text-yellow-500",
    bgColor: "bg-yellow-50",
    label: "No emails opened",
  },
  unsubscribed: {
    icon: HeartCrack,
    color: "text-pink-500",
    bgColor: "bg-pink-50",
    label: "Unsubscribed",
  },
  bounced: {
    icon: AlertCircle,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    label: "Bounced",
  },
  skipped: {
    icon: CircleMinus,
    color: "text-red-500",
    bgColor: "bg-red-50",
    label: "Skipped",
  },
  // Lead Statuses
  contacted: {
    icon: Megaphone,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    label: "Contacted",
  },
  not_yet_contacted: {
    icon: Clock,
    color: "text-gray-700",
    bgColor: "bg-gray-100",
    label: "Not yet contacted",
  },
  risky: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    label: "Risky",
  },
  invalid: {
    icon: WifiOff,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    label: "Invalid",
  },
  valid: {
    icon: Link2,
    color: "text-green-500",
    bgColor: "bg-green-50",
    label: "Valid",
  },
  in_subsequence: {
    icon: GitBranch,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    label: "In Subsequence",
  },
  completed: {
    icon: CircleCheck,
    color: "text-green-500",
    bgColor: "bg-green-50",
    label: "Completed",
  },
  // Manual lead statuses (user can set these)
  lead: {
    icon: Users,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    label: "Lead",
  },
  interested: {
    icon: Zap,
    color: "text-lime-500",
    bgColor: "bg-lime-50",
    label: "Interested",
  },
  meeting_booked: {
    icon: Zap,
    color: "text-pink-500",
    bgColor: "bg-pink-50",
    label: "Meeting booked",
  },
  meeting_complete: {
    icon: Zap,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    label: "Meeting complete",
  },
  won: {
    icon: Zap,
    color: "text-green-500",
    bgColor: "bg-green-50",
    label: "Won",
  },
  out_of_office: {
    icon: Zap,
    color: "text-cyan-400",
    bgColor: "bg-cyan-50",
    label: "Out of office",
  },
  wrong_person: {
    icon: Zap,
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    label: "Wrong person",
  },
  not_interested: {
    icon: Zap,
    color: "text-rose-500",
    bgColor: "bg-rose-50",
    label: "Not interested",
  },
  lost: {
    icon: Zap,
    color: "text-red-500",
    bgColor: "bg-red-50",
    label: "Lost",
  },
  // Legacy statuses (backwards compatibility)
  pending: {
    icon: Clock,
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    label: "Pending",
  },
  active: {
    icon: Zap,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    label: "Active",
  },
  paused: {
    icon: Pause,
    color: "text-gray-400",
    bgColor: "bg-gray-100",
    label: "Paused",
  },
  replied: {
    icon: SquareCheck,
    color: "text-green-500",
    bgColor: "bg-green-50",
    label: "Replied",
  },
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ===== Sequence Editor Components =====

interface SequenceStep {
  stepNumber: number;
  subject: string;
  body: string;
  delayDays: number;
}

interface SequenceStepCardProps {
  step: SequenceStep;
  isActive: boolean;
  onClick: () => void;
  onDelayChange: (value: number) => void;
}

function SequenceStepCard({ step, isActive, onClick, onDelayChange }: SequenceStepCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all duration-200 ${
        isActive
          ? "border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
          : "opacity-60 hover:opacity-80"
      }`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-3">
        <h3 className="text-base font-bold">Step {step.stepNumber}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Subject */}
      <div className="p-4 pt-3">
        <div className="bg-muted/50 border rounded-md px-4 py-6">
          <p className="text-sm text-foreground line-clamp-2">{step.subject || "(No subject)"}</p>
        </div>

        <div className="flex justify-center mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-auto px-2 py-1 gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-blue-600 font-bold text-base">+</span>
            <span className="text-foreground font-semibold">Add variant</span>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Footer */}
      <div className="flex items-center gap-2 p-4 pt-3 text-sm font-semibold text-foreground">
        <span>Send next message in</span>
        <Input
          type="number"
          min="0"
          value={step.delayDays}
          className="h-7 w-14 px-2 text-sm text-center font-semibold"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            const value = parseInt(e.target.value) || 0;
            onDelayChange(value);
          }}
        />
        <span>Days</span>
      </div>
    </Card>
  );
}

// Lead variable definitions from outreach_contacts table
const LEAD_VARIABLES = [
  { label: "First Name", value: "{{first_name}}" },
  { label: "Last Name", value: "{{last_name}}" },
  { label: "Email", value: "{{email}}" },
  { label: "Company", value: "{{company}}" },
  { label: "Job Title", value: "{{job_title}}" },
  { label: "Phone", value: "{{phone}}" },
  { label: "Location", value: "{{location}}" },
  { label: "Website URL", value: "{{website_url}}" },
  { label: "LinkedIn URL", value: "{{linkedin_url}}" },
  { label: "Timezone", value: "{{timezone}}" },
  { label: "Research Report", value: "{{research_report}}" },
  { label: "Unsubscribe URL", value: "{{unsubscribe_url}}" },
];

/**
 * Clean malformed AI-generated anchor markup. Mirror of cleanAnchors() in
 * lib/outreach/sending/template.ts — same regex, same behaviour, so the
 * Preview agrees with what actually gets sent.
 *
 * Handles two AI artefacts:
 *   1. `<a href="URL">URL<br>—</a>` — the closing `</a>` is in the wrong place,
 *      pulling the line break and signature lines into the link text. We
 *      split the anchor at the first `<br>` so the link only wraps its URL.
 *   2. `<a href="...">—</a>` — a standalone anchor wrapping a single em-dash
 *      or other punctuation. Unwrapped so the punctuation renders as plain text.
 */
function cleanAnchors(html: string): string {
  if (!html) return html;
  const splitRegex = /(<a\b[^>]*>)([\s\S]*?)(<br\s*\/?>)([\s\S]*?)(<\/a>)/gi;
  let prev: string;
  let cur = html;
  do {
    prev = cur;
    cur = cur.replace(
      splitRegex,
      (_, open, before, br, after, close) => `${open}${before}${close}${br}${after}`,
    );
  } while (cur !== prev);

  cur = cur.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (match, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (!text || /^[—–\-\u2026\s.,;:!?•·]+$/.test(text)) return inner;
    return match;
  });

  return cur;
}

/**
 * Substitute every `{{token}}` in `input` using values from the given contact
 * plus baked-in sample values for sequence-level tokens (signature, unsub
 * footer). Unknown tokens are left intact so they're visible in the preview.
 *
 * Mirrors the server-side template renderer (lib/outreach/sending/template.ts)
 * for the Preview dialog — same token names, same shape.
 */
function renderPreviewTokens(input: string, contact: Contact | undefined): string {
  if (!contact) return input;
  const samples: Record<string, string> = {
    // Lead-level (real values from the first contact)
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    email: contact.email,
    company: contact.company ?? "",
    job_title: contact.job_title ?? "",
    phone: contact.phone ?? "",
    location: contact.location ?? "",
    website_url: contact.website_url ?? "",
    linkedin_url: contact.linkedin_url ?? "",
    timezone: contact.timezone ?? "",
    research_report: contact.research_report ?? "",
    unsubscribe_url: "https://__YOUR_DOMAIN__/unsubscribe/preview",
    // Sequence-level (real per-step content from the contact's row)
    email_1_body: contact.email_1_body ?? "",
    email_2_body: contact.email_2_body ?? "",
    email_3_body: contact.email_3_body ?? "",
    email_1_subject: contact.email_1_subject ?? "",
    email_2_subject: contact.email_2_subject ?? "",
    email_3_subject: contact.email_3_subject ?? "",
    // Sample sequence chrome — final email shows the real ones at send time
    signature: '<p>—<br>Jake Schepis<br><a href="https://__YOUR_DOMAIN__">__YOUR_DOMAIN__</a></p>',
    unsubscribe_link:
      '<p style="font-size:12px;color:#888;margin-top:24px;">To unsubscribe, <a href="https://__YOUR_DOMAIN__/unsubscribe/preview">click here</a>.</p>',
    // Legacy aliases
    email_body: contact.email_1_body ?? "",
    email_subject: contact.email_1_subject ?? "",
  };
  // Step 1: when a block-level token (body, signature, unsubscribe footer) sits
  // alone inside a <p> tag like `<p>{{signature}}</p>`, replace the whole <p>
  // wrapper with the token's value. Otherwise the value's own <p> children get
  // nested inside the template's <p> and paragraph margins collapse — body and
  // signature run together with no spacing. Mirror of substituteOnce() in
  // lib/outreach/sending/template.ts.
  const blockTokens = new Set([
    "email_body",
    "email_1_body",
    "email_2_body",
    "email_3_body",
    "signature",
    "unsubscribe_link",
  ]);
  const blockWrapRe =
    /<p\b[^>]*>\s*\{\{(email_body|email_[123]_body|signature|unsubscribe_link)\}\}\s*<\/p>/g;
  let substituted = input.replace(blockWrapRe, (match, key: string) =>
    blockTokens.has(key) && key in samples ? samples[key] : match,
  );
  // Step 2: replace any remaining {{token}} (inline cases) with sample values.
  substituted = substituted.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in samples ? samples[key] : match,
  );
  // Step 3: strip empty <p></p> / <p><br></p> / <p>&nbsp;</p> blocks. TipTap
  // and AI-generated bodies leave these around; they render as visible blank
  // lines in the preview. Mirror of EMPTY_P_REGEX in template.ts.
  substituted = substituted.replace(/<p\b[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\s)*\s*<\/p>/gi, "");
  // Step 4: clean malformed anchor markup from the AI body.
  return cleanAnchors(substituted);
}

interface VariableOption {
  label: string;
  value: string;
}

interface VariableGroup {
  label: string;
  items: VariableOption[];
}

interface EmailEditorProps {
  step: SequenceStep;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
  /** Optional grouped variable list. Defaults to LEAD_VARIABLES only. */
  variableGroups?: VariableGroup[];
  /** Contact whose real values feed the Preview dialog substitution. */
  previewContact?: Contact;
}

function EmailEditor({
  step,
  onSubjectChange,
  onBodyChange,
  onSave,
  isSaving,
  variableGroups,
  previewContact,
}: EmailEditorProps) {
  // Flatten the variable groups into a single list for keyboard navigation /
  // index-based selection in the {{ autocomplete popup.
  const allVariables = (variableGroups ?? [{ label: "Lead", items: LEAD_VARIABLES }]).flatMap(
    (g) => g.items,
  );
  const editorVariableGroups = variableGroups ?? [{ label: "Lead", items: LEAD_VARIABLES }];
  const [subject, setSubject] = useState(step.subject);
  const [showCodeView, setShowCodeView] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDisplayText, setLinkDisplayText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Floating variables popup state
  const [variablesPopupOpen, setVariablesPopupOpen] = useState(false);
  const [variablesPopupPosition, setVariablesPopupPosition] = useState({ x: 0, y: 0 });
  const [variablesSelectedIndex, setVariablesSelectedIndex] = useState(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const _variablesPopupRef = useRef<HTMLDivElement>(null);

  // TipTap editor setup
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "text-blue-600 underline cursor-pointer",
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: "Write your email content here...",
      }),
      TiptapImage,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: step.body || "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onBodyChange(editor.getHTML());

      // Detect {{ typed and show variables popup
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(Math.max(0, from - 2), from, "");
      if (textBefore === "{{" && editorContainerRef.current) {
        const coords = editor.view.coordsAtPos(from);
        const containerRect = editorContainerRef.current.getBoundingClientRect();
        setVariablesPopupPosition({
          x: coords.left - containerRect.left,
          y: coords.bottom - containerRect.top + 8,
        });
        setVariablesSelectedIndex(0);
        setVariablesPopupOpen(true);
      }
    },
  });

  const insertVariable = (variable: string) => {
    if (editor) {
      // Check if {{ was typed before cursor and delete it before inserting the full variable
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(Math.max(0, from - 2), from, "");
      if (textBefore === "{{") {
        editor
          .chain()
          .focus()
          .deleteRange({ from: from - 2, to: from })
          .insertContent(variable)
          .run();
      } else {
        editor.chain().focus().insertContent(variable).run();
      }
      setVariablesPopupOpen(false);
    }
  };

  // Keyboard navigation for variables popup
  useEffect(() => {
    if (!variablesPopupOpen || !editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setVariablesSelectedIndex((prev) => (prev < allVariables.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setVariablesSelectedIndex((prev) => (prev > 0 ? prev - 1 : allVariables.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        insertVariable(allVariables[variablesSelectedIndex].value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setVariablesPopupOpen(false);
        editor.commands.focus();
      }
    };

    // Capture phase so we intercept before TipTap handles the key
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variablesPopupOpen, variablesSelectedIndex, editor]);

  // Update editor content when step changes
  useEffect(() => {
    if (editor && step.body !== editor.getHTML()) {
      editor.commands.setContent(step.body || "");
    }
    setSubject(step.subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.stepNumber]);

  const handleSubjectChange = (value: string) => {
    setSubject(value);
    onSubjectChange(value);
  };

  // Show variables popup at cursor position
  const showVariablesAtCursor = () => {
    if (!editor || !editorContainerRef.current) return;

    // Get cursor position from TipTap
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);

    // Get container position for relative positioning
    const containerRect = editorContainerRef.current.getBoundingClientRect();

    // Calculate position relative to container
    const x = coords.left - containerRect.left;
    const y = coords.bottom - containerRect.top + 8; // 8px below cursor

    setVariablesPopupPosition({ x, y });
    setVariablesPopupOpen(true);
  };

  const insertVariableToSubject = (variable: string) => {
    const newSubject = subject + variable;
    setSubject(newSubject);
    onSubjectChange(newSubject);
  };

  const handleInsertLink = () => {
    if (editor && linkUrl) {
      if (linkDisplayText) {
        editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkDisplayText}</a>`).run();
      } else {
        editor.chain().focus().setLink({ href: linkUrl }).run();
      }
      setLinkDialogOpen(false);
      setLinkDisplayText("");
      setLinkUrl("");
    }
  };

  const insertUnsubscribeLink = () => {
    if (editor) {
      editor
        .chain()
        .focus()
        .insertContent(
          'If you\'d prefer not to receive these emails, <a href="{{unsubscribe_url}}">unsubscribe here</a>.',
        )
        .run();
    }
  };

  const cleanHtml = () => {
    if (editor) {
      const text = editor.getText();
      editor.commands.setContent(`<p>${text}</p>`);
    }
  };

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Subject Section */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground shrink-0">Subject</span>
          <Input
            value={subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            placeholder="Enter email subject..."
            className="flex-1"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="shrink-0">
                <Code className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {editorVariableGroups.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((v) => (
                    <DropdownMenuItem
                      key={v.value}
                      onClick={() => insertVariableToSubject(v.value)}
                    >
                      {v.label}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 shrink-0"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        </div>
      </div>

      <div className="px-4">
        <Separator />
      </div>

      {/* Body Section with TipTap or Code View */}
      <div ref={editorContainerRef} className="flex-1 p-4 overflow-y-auto min-h-0 relative">
        {showCodeView ? (
          <Textarea
            value={editor.getHTML()}
            onChange={(e) => editor.commands.setContent(e.target.value)}
            className="w-full h-full font-mono text-sm resize-none"
            placeholder="<p>HTML content...</p>"
          />
        ) : (
          <>
            {/* Main Editor */}
            <EditorContent
              editor={editor}
              className="prose prose-sm max-w-none min-h-[200px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[200px]"
            />

            {/* Floating Variables Popup */}
            {variablesPopupOpen && (
              <>
                {/* Backdrop to close popup */}
                <div className="fixed inset-0 z-40" onClick={() => setVariablesPopupOpen(false)} />
                {/* Popup menu */}
                <div
                  className="absolute z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[180px]"
                  style={{
                    left: variablesPopupPosition.x,
                    top: variablesPopupPosition.y,
                  }}
                >
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">
                    Insert Variable
                  </div>
                  {(() => {
                    let flatIdx = 0;
                    return editorVariableGroups.map((group, gi) => (
                      <div key={group.label}>
                        {gi > 0 && <div className="border-t my-1" />}
                        <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {group.label}
                        </div>
                        {group.items.map((v) => {
                          const idx = flatIdx++;
                          return (
                            <button
                              key={v.value}
                              className={`w-full px-3 py-1.5 text-sm text-left transition-colors ${
                                idx === variablesSelectedIndex
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent hover:text-accent-foreground"
                              }`}
                              onClick={() => insertVariable(v.value)}
                              onMouseEnter={() => setVariablesSelectedIndex(idx)}
                            >
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="px-4">
        <Separator />
      </div>

      {/* Bottom Toolbar */}
      <div className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" className="gap-2" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>

          <Button size="sm" variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            AI Tools
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Templates
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>Introduction</DropdownMenuItem>
              <DropdownMenuItem>Follow-up</DropdownMenuItem>
              <DropdownMenuItem>Re-engagement</DropdownMenuItem>
              <DropdownMenuItem>Meeting Request</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" className="gap-2" onClick={showVariablesAtCursor}>
            <Code className="h-4 w-4" />
            Variables
          </Button>

          <Button size="sm" variant="outline" className="gap-2" onClick={insertUnsubscribeLink}>
            <MailMinus className="h-4 w-4" />
            Unsubscribe
          </Button>

          {/* More Text - Icon only with tooltip and dropdown */}
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <DropdownMenuTrigger asChild>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                      <TypeIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                </DropdownMenuTrigger>
                <TooltipContent>More Text</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleBold().run()}>
                <Bold className="h-4 w-4 mr-2" /> Bold
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleItalic().run()}>
                <Italic className="h-4 w-4 mr-2" /> Italic
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleUnderline().run()}>
                <UnderlineIcon className="h-4 w-4 mr-2" /> Underline
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleStrike().run()}>
                <Strikethrough className="h-4 w-4 mr-2" /> Strikethrough
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleBulletList().run()}>
                <List className="h-4 w-4 mr-2" /> Bullet List
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                <ListOrdered className="h-4 w-4 mr-2" /> Numbered List
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => editor.chain().focus().setTextAlign("left").run()}>
                <AlignLeft className="h-4 w-4 mr-2" /> Align Left
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setTextAlign("center").run()}>
                <AlignCenter className="h-4 w-4 mr-2" /> Align Center
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setTextAlign("right").run()}>
                <AlignRight className="h-4 w-4 mr-2" /> Align Right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => editor.chain().focus().unsetAllMarks().run()}>
                <Eraser className="h-4 w-4 mr-2" /> Clear Formatting
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Color Picker - Icon only with tooltip */}
          <Popover>
            <TooltipProvider>
              <Tooltip>
                <PopoverTrigger asChild>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                      <Palette className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                </PopoverTrigger>
                <TooltipContent>Text Color</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-5 gap-1">
                {[
                  "#000000",
                  "#374151",
                  "#DC2626",
                  "#EA580C",
                  "#CA8A04",
                  "#16A34A",
                  "#0891B2",
                  "#2563EB",
                  "#7C3AED",
                  "#DB2777",
                ].map((color) => (
                  <button
                    key={color}
                    className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => editor.chain().focus().setColor(color).run()}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Clean HTML - Icon only with tooltip */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={cleanHtml}>
                  <Eraser className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clean HTML</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Insert Link - Icon only with tooltip */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setLinkDialogOpen(true)}
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Insert Link</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* More Rich - Icon only with tooltip and dropdown */}
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <DropdownMenuTrigger asChild>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                </DropdownMenuTrigger>
                <TooltipContent>More Rich</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={insertUnsubscribeLink}>
                <MailMinus className="h-4 w-4 mr-2" /> Insert Unsubscribe Link
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const url = prompt("Enter image URL:");
                  if (url) editor.chain().focus().setImage({ src: url }).run();
                }}
              >
                <ImageIcon className="h-4 w-4 mr-2" /> Insert Image
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const emoji = prompt("Enter emoji:");
                  if (emoji) editor.chain().focus().insertContent(emoji).run();
                }}
              >
                <Smile className="h-4 w-4 mr-2" /> Emoticons
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Code View - Icon only with tooltip */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={showCodeView ? "secondary" : "outline"}
                  className="h-8 w-8 p-0"
                  onClick={() => setShowCodeView(!showCodeView)}
                >
                  <FileCode className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Code View</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Email Preview Dialog — substitutes against previewContact's real values
          (the first lead in the campaign). Shows what THIS lead will receive. */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Subject: {renderPreviewTokens(subject, previewContact)}
              {previewContact ? (
                <span className="block text-[11px] mt-1">
                  Showing as it will render for <strong>{previewContact.email}</strong>
                </span>
              ) : (
                <span className="block text-[11px] mt-1 text-amber-600">
                  No leads in this campaign yet — showing tokens unresolved.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-md p-6 bg-white text-gray-900 text-sm">
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  renderPreviewTokens(editor?.getHTML() ?? "", previewContact),
                ),
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insert Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
            <DialogDescription>Add a hyperlink to your email content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="display-text">Display Text (optional)</Label>
              <Input
                id="display-text"
                placeholder="Click here"
                value={linkDisplayText}
                onChange={(e) => setLinkDisplayText(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">Web Address (URL)</Label>
              <Input
                id="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInsertLink} disabled={!linkUrl}>
              Insert Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sequence-level variables exposed by the campaign template engine.
// Each lead's AI-written subject/body lives in outreach_contacts; the template
// pulls them in via these tokens.
const SEQUENCE_VARIABLES = [
  { label: "Email 1 — Subject", value: "{{email_1_subject}}" },
  { label: "Email 1 — Body", value: "{{email_1_body}}" },
  { label: "Email 2 — Subject", value: "{{email_2_subject}}" },
  { label: "Email 2 — Body", value: "{{email_2_body}}" },
  { label: "Email 3 — Subject", value: "{{email_3_subject}}" },
  { label: "Email 3 — Body", value: "{{email_3_body}}" },
  { label: "Signature", value: "{{signature}}" },
  { label: "Unsubscribe Link", value: "{{unsubscribe_link}}" },
];

interface SequenceTemplateEditorProps {
  contacts: Contact[];
  campaign: Campaign;
  onCampaignUpdated?: (campaign: Campaign) => void;
}

/**
 * Campaign-level Sequence template editor.
 *
 * Each campaign owns three body templates + three subject templates (one per
 * step). The lead-written content (already pre-filled per row in
 * outreach_contacts.email_N_{body,subject}) is slotted in via per-step tokens
 * like {{email_1_body}} / {{email_1_subject}}. The Preview substitutes against
 * the first contact's real values so you see the finished email.
 */
function SequenceTemplateEditor({
  contacts,
  campaign,
  onCampaignUpdated,
}: SequenceTemplateEditorProps) {
  const initialSequence: SequenceStep[] = [
    {
      stepNumber: 1,
      subject: campaign.email_1_subject_template ?? "{{email_1_subject}}",
      body: campaign.email_1_template ?? "{{email_1_body}}",
      delayDays: 0,
    },
    {
      stepNumber: 2,
      subject: campaign.email_2_subject_template ?? "{{email_2_subject}}",
      body: campaign.email_2_template ?? "{{email_2_body}}",
      delayDays: campaign.email_2_delay,
    },
    {
      stepNumber: 3,
      subject: campaign.email_3_subject_template ?? "{{email_3_subject}}",
      body: campaign.email_3_template ?? "{{email_3_body}}",
      delayDays: campaign.email_3_delay,
    },
  ];

  const [sequence, setSequence] = useState<SequenceStep[]>(initialSequence);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);

  const currentStep = sequence.find((s) => s.stepNumber === activeStep);
  const previewContact = contacts[0];

  const handleSubjectChange = (value: string) => {
    setSequence((prev) =>
      prev.map((s) => (s.stepNumber === activeStep ? { ...s, subject: value } : s)),
    );
  };

  const handleBodyChange = (value: string) => {
    setSequence((prev) =>
      prev.map((s) => (s.stepNumber === activeStep ? { ...s, body: value } : s)),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const [s1, s2, s3] = sequence;
      const updatePayload = {
        email_1_template: s1?.body ?? "",
        email_2_template: s2?.body ?? "",
        email_3_template: s3?.body ?? "",
        email_1_subject_template: s1?.subject?.trim() || null,
        email_2_subject_template: s2?.subject?.trim() || null,
        email_3_subject_template: s3?.subject?.trim() || null,
      };
      const response = await fetch(`/api/outreach/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save");
      }
      const data = await response.json().catch(() => null);
      if (data?.campaign && onCampaignUpdated) {
        onCampaignUpdated(data.campaign as Campaign);
      }
      toast.success("Sequence templates saved");
    } catch (error) {
      console.error("Error saving sequence templates:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save sequence templates");
    } finally {
      setIsSaving(false);
    }
  };

  const variableGroups: VariableGroup[] = [
    { label: "Sequence", items: SEQUENCE_VARIABLES },
    { label: "Lead", items: LEAD_VARIABLES },
  ];

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-[340px_1fr] gap-6 min-h-0">
      {/* Left Sidebar */}
      <div className="flex flex-col min-h-0 gap-3">
        <p className="text-[11px] text-muted-foreground">
          Campaign-wide template. Per-lead content is slotted in via tokens like
          <code className="px-1">{`{{email_1_body}}`}</code>. Preview uses the first lead&apos;s
          real data.
        </p>
        <div className="space-y-2 overflow-y-auto pr-2 flex-1 min-h-0">
          {sequence.map((step) => (
            <SequenceStepCard
              key={step.stepNumber}
              step={step}
              isActive={activeStep === step.stepNumber}
              onClick={() => setActiveStep(step.stepNumber)}
              onDelayChange={(value) => {
                setSequence((prev) =>
                  prev.map((s) =>
                    s.stepNumber === step.stepNumber ? { ...s, delayDays: value } : s,
                  ),
                );
              }}
            />
          ))}
        </div>
      </div>

      {/* Right Side - Email Editor */}
      <div className="flex flex-col h-full">
        <Card className="flex flex-col h-full">
          <CardContent className="p-0 flex flex-col h-full">
            {currentStep && (
              <EmailEditor
                key={currentStep.stepNumber}
                step={currentStep}
                onSubjectChange={handleSubjectChange}
                onBodyChange={handleBodyChange}
                onSave={handleSave}
                isSaving={isSaving}
                variableGroups={variableGroups}
                previewContact={previewContact}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || "https://__YOUR_DOMAIN__";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [_loadingContacts, setLoadingContacts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [selectedContactRows, setSelectedContactRows] = useState<string[]>([]);
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const [debouncedLeadSearch, setDebouncedLeadSearch] = useState("");
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPerPage, setLeadsPerPage] = useState(20);
  // Faceted filters on the Leads tab — multi-select, applied server-side via the
  // GET /campaigns/[id] route's status[] / step[] params.
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterStep, setFilterStep] = useState<number[]>([]);
  const activeFilterCount = filterStatus.length + filterStep.length;
  const [chartTimeRange, setChartTimeRange] = useState("90d");
  const [chartData, setChartData] = useState<
    Array<{ date: string; sent: number; opened: number; clicked: number; replied: number }>
  >([]);
  const [chartLoading, setChartLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("overview");

  // Lead detail sheet
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isLeadSheetOpen, setIsLeadSheetOpen] = useState(false);
  const [leadDetailTab, setLeadDetailTab] = useState<"details" | "activities">("details");
  const [editedContact, setEditedContact] = useState<Partial<Contact>>({});

  // Schedule management
  const [schedules, setSchedules] = useState<
    Array<{
      id: string;
      name: string;
      send_window_start: string;
      send_window_end: string;
      send_days: string[];
      timezone: string;
      is_active: boolean;
    }>
  >([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  // Campaign date range
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Delete confirmation dialogs
  const [deleteScheduleDialog, setDeleteScheduleDialog] = useState<{
    open: boolean;
    id: string;
    name: string;
  }>({
    open: false,
    id: "",
    name: "",
  });
  const [deleteCampaignDialog, setDeleteCampaignDialog] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);

  // Multi-select accounts state
  const [availableAccounts, setAvailableAccounts] = useState<
    Array<{
      id: string;
      email: string;
      name: string;
      signatureHtml?: string | null;
      signaturePlainText?: string | null;
    }>
  >([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [newAccountDialogOpen, setNewAccountDialogOpen] = useState(false);
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountSignatureHtml, setNewAccountSignatureHtml] = useState("");
  const [newAccountSignaturePlain, setNewAccountSignaturePlain] = useState("");
  const [savingNewAccount, setSavingNewAccount] = useState(false);

  // Edit-signature dialog state
  const [editSignatureAccountId, setEditSignatureAccountId] = useState<string | null>(null);
  const [editSignatureHtml, setEditSignatureHtml] = useState("");
  const [editSignaturePlain, setEditSignaturePlain] = useState("");
  const [savingSignature, setSavingSignature] = useState(false);

  const toggleAccount = (accountId: string) => {
    const newSelection = selectedAccountIds.includes(accountId)
      ? selectedAccountIds.filter((id) => id !== accountId)
      : [...selectedAccountIds, accountId];

    setSelectedAccountIds(newSelection);

    // Save to API
    fetch(`/api/outreach/campaigns/${campaignId}/sender-accounts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderIds: newSelection }),
    }).catch((err) => console.error("Error saving sender accounts:", err));
  };

  const fetchSenderAccounts = useCallback(async () => {
    try {
      // Fetch all available accounts
      const allRes = await fetch("/api/outreach/sender-accounts");
      if (allRes.ok) {
        const allData = await allRes.json();
        setAvailableAccounts(allData.accounts || []);
      }

      // Fetch campaign-specific selections
      const campaignRes = await fetch(`/api/outreach/campaigns/${campaignId}/sender-accounts`);
      if (campaignRes.ok) {
        const campaignData = await campaignRes.json();
        const selectedIds = (campaignData.accounts || []).map((acc: { id: string }) => acc.id);
        setSelectedAccountIds(selectedIds);
      }
    } catch (error) {
      console.error("Error fetching sender accounts:", error);
    }
  }, [campaignId]);

  const handleAddNewAccount = async () => {
    if (!newAccountEmail || !newAccountName) {
      toast.error("Email prefix and name are required");
      return;
    }

    setSavingNewAccount(true);
    try {
      const res = await fetch("/api/outreach/sender-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailPrefix: newAccountEmail,
          name: newAccountName,
          signature_html: newAccountSignatureHtml.trim() || null,
          signature_plain_text: newAccountSignaturePlain.trim() || null,
        }),
      });

      if (res.ok) {
        toast.success("Sender account added successfully");
        setNewAccountDialogOpen(false);
        setNewAccountEmail("");
        setNewAccountName("");
        setNewAccountSignatureHtml("");
        setNewAccountSignaturePlain("");
        fetchSenderAccounts();
      } else {
        toast.error("Failed to add sender account");
      }
    } catch (error) {
      console.error("Error adding sender account:", error);
      toast.error("Failed to add sender account");
    } finally {
      setSavingNewAccount(false);
    }
  };

  const openEditSignatureDialog = (accountId: string) => {
    const account = availableAccounts.find((a) => a.id === accountId);
    if (!account) return;
    setEditSignatureAccountId(accountId);
    setEditSignatureHtml(account.signatureHtml ?? "");
    setEditSignaturePlain(account.signaturePlainText ?? "");
  };

  const handleSaveSignature = async () => {
    if (!editSignatureAccountId) return;
    setSavingSignature(true);
    try {
      const res = await fetch(`/api/outreach/sender-accounts/${editSignatureAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature_html: editSignatureHtml.trim() || null,
          signature_plain_text: editSignaturePlain.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Signature saved");
        setEditSignatureAccountId(null);
        fetchSenderAccounts();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save signature");
      }
    } catch (error) {
      console.error("Error saving signature:", error);
      toast.error("Failed to save signature");
    } finally {
      setSavingSignature(false);
    }
  };

  // Fetch schedules from API
  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/schedules`);
      if (!res.ok) {
        throw new Error(`Failed to fetch schedules: ${res.status}`);
      }
      const data = await res.json();

      if (data.schedules && data.schedules.length > 0) {
        setSchedules(data.schedules);
        setSelectedScheduleId(data.schedules[0].id);

        // Update form with first schedule's data
        const firstSchedule = data.schedules[0];

        // Strip seconds from time values (07:00:00 -> 07:00)
        const startTime = firstSchedule.send_window_start.substring(0, 5);
        const endTime = firstSchedule.send_window_end.substring(0, 5);

        scheduleForm.reset({
          send_window_start: startTime,
          send_window_end: endTime,
          send_days: firstSchedule.send_days,
          timezone_mode: "fixed",
          fixed_timezone: firstSchedule.timezone,
          max_emails_per_day: 50,
          spacing_minutes: 5,
        });
      }
    } catch (error) {
      console.error("Error fetching schedules:", error);
      toast.error("Failed to load schedules");
    }
    setLoadingSchedules(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const handleAddSchedule = async () => {
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New schedule",
          send_window_start: "09:00",
          send_window_end: "17:00",
          send_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          timezone: "Australia/Perth",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSchedules((prev) => [...prev, data.schedule]);
        setSelectedScheduleId(data.schedule.id);

        // Strip seconds from time values and load into form
        const startTime = data.schedule.send_window_start.substring(0, 5);
        const endTime = data.schedule.send_window_end.substring(0, 5);

        scheduleForm.reset({
          send_window_start: startTime,
          send_window_end: endTime,
          send_days: data.schedule.send_days,
          timezone_mode: "fixed",
          fixed_timezone: data.schedule.timezone,
          max_emails_per_day: 50,
          spacing_minutes: 5,
        });

        toast.success("Schedule created");
      } else {
        toast.error("Failed to create schedule");
      }
    } catch (error) {
      console.error("Error creating schedule:", error);
      toast.error("Failed to create schedule");
    }
  };

  // Open delete schedule dialog
  const openDeleteScheduleDialog = (id: string, name: string) => {
    if (schedules.length <= 1) {
      toast.error("Cannot delete the last schedule");
      return;
    }
    setDeleteScheduleDialog({ open: true, id, name });
  };

  // Confirm delete schedule
  const handleDeleteSchedule = async () => {
    const id = deleteScheduleDialog.id;
    setDeletingSchedule(true);

    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/schedules/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const remainingSchedules = schedules.filter((s) => s.id !== id);
        setSchedules(remainingSchedules);

        // If we deleted the currently selected schedule, switch to the first remaining one
        if (selectedScheduleId === id && remainingSchedules.length > 0) {
          const nextSchedule = remainingSchedules[0];
          setSelectedScheduleId(nextSchedule.id);

          // Load the next schedule into the form
          const startTime = nextSchedule.send_window_start.substring(0, 5);
          const endTime = nextSchedule.send_window_end.substring(0, 5);

          scheduleForm.reset({
            send_window_start: startTime,
            send_window_end: endTime,
            send_days: nextSchedule.send_days,
            timezone_mode: "fixed",
            fixed_timezone: nextSchedule.timezone,
            max_emails_per_day: 50,
            spacing_minutes: 5,
          });
        }

        toast.success("Schedule deleted");
        setDeleteScheduleDialog({ open: false, id: "", name: "" });
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete schedule");
      }
    } catch (error) {
      console.error("Error deleting schedule:", error);
      toast.error("Failed to delete schedule");
    } finally {
      setDeletingSchedule(false);
    }
  };

  const handleScheduleNameChange = async (id: string, newName: string) => {
    // Update local state immediately for responsive UI
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, name: newName } : s)));

    // Debounce the API call (simple approach - could use a proper debounce utility)
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });

      if (!res.ok) {
        toast.error("Failed to update schedule name");
      }
    } catch (error) {
      console.error("Error updating schedule name:", error);
      toast.error("Failed to update schedule name");
    }
  };

  const handleScheduleSelect = (id: string) => {
    setSelectedScheduleId(id);
    const schedule = schedules.find((s) => s.id === id);

    if (schedule) {
      // Strip seconds from time values (07:00:00 -> 07:00)
      const startTime = schedule.send_window_start.substring(0, 5);
      const endTime = schedule.send_window_end.substring(0, 5);

      scheduleForm.reset({
        send_window_start: startTime,
        send_window_end: endTime,
        send_days: schedule.send_days,
        timezone_mode: "fixed",
        fixed_timezone: schedule.timezone,
        max_emails_per_day: 50,
        spacing_minutes: 5,
      });
    }
  };

  const handleSetScheduleActive = async (id: string) => {
    try {
      // Single PATCH call — server atomically deactivates other schedules first
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      });

      if (!res.ok) {
        toast.error("Failed to set schedule as active");
        return;
      }

      // Update local state
      setSchedules((prev) => prev.map((s) => ({ ...s, is_active: s.id === id })));

      toast.success("Schedule set as active");
    } catch (error) {
      console.error("Error setting schedule active:", error);
      toast.error("Failed to set schedule as active");
    }
  };

  // Schedule form
  const scheduleForm = useForm<ScheduleFormData>({
    defaultValues: {
      send_window_start: "09:00",
      send_window_end: "17:00",
      send_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      timezone_mode: "recipient",
      fixed_timezone: "Australia/Perth",
      max_emails_per_day: 50,
      spacing_minutes: 5,
    },
  });

  // Options form
  const optionsForm = useForm<OptionsFormData>({
    defaultValues: {
      test_mode: true,
      track_opens: true,
      track_clicks: true,
      stop_on_auto_reply: true,
      insert_unsubscribe_header: true,
      stop_company_on_reply: false,
      text_only: false,
      text_only_first: false,
      max_new_leads_per_day: null,
      min_send_interval_minutes: 7,
      random_send_interval_minutes: 5,
      cc_recipients: "",
      bcc_recipients: "",
    },
  });

  const fetchCampaign = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch campaign: ${res.status}`);
      }
      const data = await res.json();

      if (data.campaign) {
        // Store campaign data without contacts (contacts fetched separately)
        const { contacts: _contacts, ...campaignData } = data.campaign;
        setCampaign(campaignData as Campaign);
        // Load campaign dates from database
        if (data.campaign.start_date) {
          setStartDate(new Date(data.campaign.start_date));
        }
        if (data.campaign.end_date) {
          setEndDate(new Date(data.campaign.end_date));
        }
        // Load options into form
        optionsForm.reset({
          test_mode: data.campaign.test_mode ?? true,
          track_opens: data.campaign.track_opens ?? true,
          track_clicks: data.campaign.track_clicks ?? true,
          stop_on_auto_reply: data.campaign.stop_on_auto_reply ?? true,
          insert_unsubscribe_header: data.campaign.insert_unsubscribe_header ?? true,
          stop_company_on_reply: data.campaign.stop_company_on_reply ?? false,
          text_only: data.campaign.text_only ?? false,
          text_only_first: data.campaign.text_only_first ?? false,
          max_new_leads_per_day: data.campaign.max_new_leads_per_day ?? null,
          min_send_interval_minutes: data.campaign.min_send_interval_minutes ?? 7,
          random_send_interval_minutes: data.campaign.random_send_interval_minutes ?? 5,
          cc_recipients: (data.campaign.cc_recipients ?? []).join(", "),
          bcc_recipients: (data.campaign.bcc_recipients ?? []).join(", "),
        });
      }
    } catch (error) {
      console.error("Error fetching campaign:", error);
      toast.error("Failed to load campaign data");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Fetch contacts with server-side search and pagination
  const fetchContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const offset = (leadsPage - 1) * leadsPerPage;
      const params = new URLSearchParams({
        limit: leadsPerPage.toString(),
        offset: offset.toString(),
      });
      if (debouncedLeadSearch) params.set("search", debouncedLeadSearch);
      if (filterStatus.length > 0) params.set("status", filterStatus.join(","));
      if (filterStep.length > 0) params.set("step", filterStep.join(","));

      const res = await fetch(`/api/outreach/campaigns/${campaignId}?${params}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch contacts: ${res.status}`);
      }
      const data = await res.json();
      if (data.campaign) {
        setContacts(data.campaign.contacts || []);
        setContactsTotal(data.campaign.total_contacts ?? 0);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error("Failed to load contacts");
    }
    setLoadingContacts(false);
  }, [campaignId, leadsPage, leadsPerPage, debouncedLeadSearch, filterStatus, filterStep]);

  useEffect(() => {
    fetchCampaign();
    fetchSchedules();
    fetchSenderAccounts();
  }, [fetchCampaign, fetchSchedules, fetchSenderAccounts]);

  // Fetch contacts when search/pagination changes
  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounce lead search — reset to page 1 on new search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLeadSearch(leadSearchQuery);
      setLeadsPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [leadSearchQuery]);

  // Sync editedContact when selectedContact changes
  useEffect(() => {
    if (selectedContact) {
      setEditedContact({ ...selectedContact });
    } else {
      setEditedContact({});
    }
  }, [selectedContact]);

  // Auto-save timeout ref
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update a field in editedContact with auto-save
  const updateContactField = (field: keyof Contact, value: string) => {
    const newEditedContact = { ...editedContact, [field]: value };
    setEditedContact(newEditedContact);

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Auto-save after 500ms of no changes
    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (!selectedContact) return;

      try {
        // Only send the changed field, not the entire contact object
        const res = await fetch(`/api/outreach/contacts/${selectedContact.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to save");
        }

        const { contact: updatedContact } = await res.json();
        // Update local state silently
        setContacts((prev) => prev.map((c) => (c.id === updatedContact.id ? updatedContact : c)));
        setSelectedContact(updatedContact);
        // Show success toast for user feedback
        toast.success("Changes saved");
      } catch (error) {
        console.error("Auto-save error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to save changes";
        toast.error(`Save failed: ${errorMessage}`);
      }
    }, 500);
  };

  const toggleCampaignStatus = async () => {
    if (!campaign) return;

    setUpdating(true);
    try {
      const newStatus = campaign.status === "active" ? "paused" : "active";
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        if (newStatus === "active") {
          const body = (await res.json().catch(() => ({}))) as {
            activated?: number;
            capHit?: boolean;
          };
          const activated = body.activated ?? 0;
          if (campaign.test_mode === true) {
            toast.warning(
              `Campaign activated in TEST MODE — ${activated} contacts enrolled, but no real emails will be sent. Toggle test mode off in Options.`,
              { duration: 10000 },
            );
          } else if (body.capHit) {
            toast.error(
              `Campaign activated · ${activated} enrolled (cap reached — more contacts remain)`,
            );
          } else if (activated > 0) {
            toast.success(`Campaign activated · ${activated} contacts enrolled`);
          } else {
            toast.success("Campaign activated");
          }
        } else {
          toast.success("Campaign paused");
        }
        fetchCampaign();
      } else {
        toast.error("Failed to update campaign status");
      }
    } catch (error) {
      console.error("Error updating campaign:", error);
      toast.error("Failed to update campaign status");
    }
    setUpdating(false);
  };

  // Confirm delete campaign
  const deleteCampaign = async () => {
    setDeletingCampaign(true);

    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Campaign deleted");
        router.push("/admin/outreach/campaigns");
      } else {
        toast.error("Failed to delete campaign");
      }
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast.error("Failed to delete campaign");
    } finally {
      setDeletingCampaign(false);
      setDeleteCampaignDialog(false);
    }
  };

  const updateCampaignDates = async (
    start: Date | undefined | null,
    end: Date | undefined | null,
  ) => {
    try {
      const payload: { start_date?: string | null; end_date?: string | null } = {};

      // Convert dates to ISO strings or null
      // undefined means "don't update", null means "clear the field"
      if (start !== undefined) {
        payload.start_date = start ? start.toISOString() : null;
      }
      if (end !== undefined) {
        payload.end_date = end ? end.toISOString() : null;
      }

      const res = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("Campaign dates updated");
        fetchCampaign(); // Refresh campaign data
      } else {
        toast.error("Failed to update campaign dates");
      }
    } catch (error) {
      console.error("Error updating campaign dates:", error);
      toast.error("Failed to update campaign dates");
    }
  };

  const handleScheduleSave = async (data: ScheduleFormData) => {
    if (!selectedScheduleId) {
      toast.error("No schedule selected");
      return;
    }

    const payload = {
      send_window_start: data.send_window_start,
      send_window_end: data.send_window_end,
      send_days: data.send_days,
      timezone: data.fixed_timezone,
    };

    try {
      const res = await fetch(
        `/api/outreach/campaigns/${campaignId}/schedules/${selectedScheduleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const responseData = await res.json();

        // Update local state with server response
        setSchedules((prev) =>
          prev.map((s) => (s.id === selectedScheduleId ? responseData.schedule : s)),
        );

        // Strip seconds from time values for form (07:00:00 -> 07:00)
        const startTime = responseData.schedule.send_window_start.substring(0, 5);
        const endTime = responseData.schedule.send_window_end.substring(0, 5);

        // Also update the form with the saved values to keep in sync
        scheduleForm.reset({
          send_window_start: startTime,
          send_window_end: endTime,
          send_days: responseData.schedule.send_days,
          timezone_mode: "fixed",
          fixed_timezone: responseData.schedule.timezone,
          max_emails_per_day: data.max_emails_per_day,
          spacing_minutes: data.spacing_minutes,
        });

        toast.success("Schedule settings saved");
      } else {
        const errorData = await res.json();
        console.error("Error response:", errorData);
        toast.error(errorData.error || "Failed to save schedule settings");
      }
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast.error("Failed to save schedule settings");
    }
  };

  const handleOptionsSave = async (data: OptionsFormData) => {
    try {
      const { cc_recipients, bcc_recipients, ...rest } = data;
      const payload = {
        ...rest,
        cc_recipients: cc_recipients
          ? cc_recipients
              .split(",")
              .map((e) => e.trim())
              .filter(Boolean)
          : [],
        bcc_recipients: bcc_recipients
          ? bcc_recipients
              .split(",")
              .map((e) => e.trim())
              .filter(Boolean)
          : [],
      };
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        setCampaign(result.campaign);
        toast.success("Campaign options saved");
      } else {
        toast.error("Failed to save campaign options");
      }
    } catch (error) {
      console.error("Error saving options:", error);
      toast.error("Failed to save campaign options");
    }
  };

  const calculateRate = (numerator: number, denominator: number) => {
    if (denominator === 0) return "0%";
    return `${Math.round((numerator / denominator) * 100)}%`;
  };

  const getContactName = (contact: Contact) => {
    if (contact.first_name || contact.last_name) {
      return `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
    }
    return contact.email;
  };

  const toggleSelectAllContacts = () => {
    if (selectedContactRows.length === contacts.length) {
      setSelectedContactRows([]);
    } else {
      setSelectedContactRows(contacts.map((c) => c.id));
    }
  };

  const toggleSelectContactRow = (id: string) => {
    setSelectedContactRows((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id],
    );
  };

  // Contacts are now filtered and paginated server-side
  const leadsTotalPages = Math.ceil(contactsTotal / leadsPerPage);

  // Campaign Performance Chart Data — fetched from
  // GET /api/outreach/campaigns/[campaignId]/performance?range=<7d|30d|90d>.
  // Server returns daily buckets of {sent, opened, clicked, replied} computed
  // from outreach_contacts (sent_at columns), outreach_email_events, and
  // outreach_replies.
  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;

    const load = async () => {
      setChartLoading(true);
      try {
        const res = await fetch(
          `/api/outreach/campaigns/${campaignId}/performance?range=${chartTimeRange}`,
        );
        if (!res.ok) {
          if (!cancelled) setChartData([]);
          return;
        }
        const json = (await res.json()) as {
          data: Array<{
            date: string;
            sent: number;
            opened: number;
            clicked: number;
            replied: number;
          }>;
        };
        if (!cancelled) setChartData(json.data ?? []);
      } catch (error) {
        console.error("Error loading campaign performance:", error);
        if (!cancelled) setChartData([]);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [campaignId, chartTimeRange]);

  const chartConfig = {
    sent: {
      label: "Sent",
      color: "#3b82f6", // Blue
    },
    opened: {
      label: "Opened",
      color: "#8b5cf6", // Purple
    },
    clicked: {
      label: "Clicked",
      color: "#f59e0b", // Amber
    },
    replied: {
      label: "Replied",
      color: "#10b981", // Green
    },
  } satisfies ChartConfig;

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">Campaign not found</p>
          <Button onClick={() => router.push("/admin/outreach/campaigns")}>
            Back to Campaigns
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={`@container/main p-6 ${activeTab === "sequence" ? "h-[calc(100vh-var(--header-height))] flex flex-col overflow-hidden" : ""}`}
    >
      {/* Header */}
      <div className={`mb-6 ${activeTab === "sequence" ? "shrink-0" : ""}`}>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
          <Badge className={`${campaignStatusColors[campaign.status]} text-white`}>
            {campaign.status}
          </Badge>
          {campaign.test_mode && (
            <Badge
              className="bg-yellow-500 text-white"
              title="Worker logs sends but doesn't deliver. Toggle off in Options."
            >
              Test mode
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className={`w-full ${activeTab === "sequence" ? "flex-1 flex flex-col min-h-0" : ""}`}
      >
        <div className="flex items-center justify-between mb-4">
          <TabsList
            className={`justify-start w-[50%] ${activeTab === "sequence" ? "shrink-0" : ""}`}
          >
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="sequence">Sequence</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={toggleCampaignStatus}
              disabled={updating}
              className="px-6"
            >
              {updating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : campaign.status === "active" ? (
                <>
                  <Pause className="w-4 h-4 mr-2 text-orange-500" />
                  Pause campaign
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2 text-green-500" />
                  Resume campaign
                </>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Campaign
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteCampaignDialog(true)}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Campaign
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 px-4 lg:px-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                <Users className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campaign.total_contacts}</div>
                <p className="text-xs text-muted-foreground mt-1">Contacts in campaign</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
                <Send className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campaign.total_sent}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {calculateRate(campaign.total_sent, campaign.total_contacts)} of contacts reached
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Email Opens</CardTitle>
                <MailOpen className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campaign.total_opened}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {calculateRate(campaign.total_opened, campaign.total_sent)} open rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Replies Received</CardTitle>
                <MessageCircle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campaign.total_replied}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {calculateRate(campaign.total_replied, campaign.total_sent)} reply rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4 lg:px-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Delivered</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campaign.total_delivered}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {calculateRate(campaign.total_delivered, campaign.total_sent)} delivery rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Link Clicks</CardTitle>
                <MousePointerClick className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campaign.total_clicked}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {calculateRate(campaign.total_clicked, campaign.total_opened)} click-through rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bounced</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campaign.total_bounced}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {calculateRate(campaign.total_bounced, campaign.total_sent)} bounce rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Campaign Performance Chart */}
          <div className="px-4 lg:px-6">
            <Card className="@container/card">
              <CardHeader>
                <CardTitle>Campaign Performance</CardTitle>
                <CardDescription>
                  {chartTimeRange === "90d"
                    ? "Total for the last 3 months"
                    : chartTimeRange === "30d"
                      ? "Total for the last 30 days"
                      : "Total for the last 7 days"}
                </CardDescription>
                <CardAction>
                  <ToggleGroup
                    type="single"
                    value={chartTimeRange}
                    onValueChange={(value) => value && setChartTimeRange(value)}
                    variant="outline"
                    className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
                  >
                    <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
                    <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
                    <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
                  </ToggleGroup>
                  <Select value={chartTimeRange} onValueChange={setChartTimeRange}>
                    <SelectTrigger
                      className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
                      size="sm"
                      aria-label="Select a time range"
                    >
                      <SelectValue placeholder="Last 3 months" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="90d" className="rounded-lg">
                        Last 3 months
                      </SelectItem>
                      <SelectItem value="30d" className="rounded-lg">
                        Last 30 days
                      </SelectItem>
                      <SelectItem value="7d" className="rounded-lg">
                        Last 7 days
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </CardAction>
              </CardHeader>
              <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="fillSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="fillOpened" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="fillClicked" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="fillReplied" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={32}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                      }}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => {
                            return new Date(value).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                          }}
                          indicator="dot"
                        />
                      }
                    />
                    <Area
                      dataKey="replied"
                      type="natural"
                      fill="url(#fillReplied)"
                      stroke="#10b981"
                      stackId="a"
                    />
                    <Area
                      dataKey="clicked"
                      type="natural"
                      fill="url(#fillClicked)"
                      stroke="#f59e0b"
                      stackId="a"
                    />
                    <Area
                      dataKey="opened"
                      type="natural"
                      fill="url(#fillOpened)"
                      stroke="#8b5cf6"
                      stackId="a"
                    />
                    <Area
                      dataKey="sent"
                      type="natural"
                      fill="url(#fillSent)"
                      stroke="#3b82f6"
                      stackId="a"
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Leads */}
        <TabsContent value="leads" className="space-y-4">
          {contacts.length === 0 ? (
            <Card className="p-12">
              <div className="text-center text-muted-foreground">
                No contacts in this campaign yet
              </div>
            </Card>
          ) : (
            <>
              {/* Stats Bar + Actions */}
              <div className="flex items-center gap-4">
                <Card className="w-fit">
                  <CardContent className="flex items-center gap-3 py-2 px-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{campaign.total_contacts}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <p className="font-medium">Total number of leads</p>
                            <p className="text-xs text-muted-foreground">
                              This value is updated every 5 minutes
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <Handshake className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{campaign.total_sent}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <p className="font-medium">Sequence started: {campaign.total_sent}</p>
                            <p className="text-xs text-muted-foreground">
                              {campaign.total_contacts > 0
                                ? Math.round((campaign.total_sent / campaign.total_contacts) * 100)
                                : 0}
                              % of total leads
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <HeartCrack className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">0</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <p className="font-medium">Unsubscribe: 0</p>
                            <p className="text-xs text-muted-foreground">0% of total leads</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <Frown className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{campaign.total_bounced}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <p className="font-medium">Bounced leads: {campaign.total_bounced}</p>
                            <p className="text-xs text-muted-foreground">
                              {campaign.total_contacts > 0
                                ? Math.round(
                                    (campaign.total_bounced / campaign.total_contacts) * 100,
                                  )
                                : 0}
                              % of contacts
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <Check className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {contacts.filter((c) => c.status === "completed").length}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <p className="font-medium">
                              Total complete leads:{" "}
                              {contacts.filter((c) => c.status === "completed").length}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {campaign.total_contacts > 0
                                ? Math.round(
                                    (contacts.filter((c) => c.status === "completed").length /
                                      campaign.total_contacts) *
                                      100,
                                  )
                                : 0}
                              % of total leads
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardContent>
                </Card>

                <div className="flex items-center gap-2 ml-auto">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" aria-label="Filter leads">
                        <Filter className="w-4 h-4 mr-2" />
                        Filters
                        {activeFilterCount > 0 && (
                          <>
                            <Separator orientation="vertical" className="mx-2 h-4" />
                            <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                              {activeFilterCount}
                            </Badge>
                          </>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[260px] p-0" align="end">
                      <Command>
                        <CommandInput placeholder="Filter leads…" />
                        <CommandList className="max-h-[420px]">
                          <CommandEmpty>No filters match.</CommandEmpty>
                          <CommandGroup heading="Status">
                            {(Object.keys(contactStatusConfig) as ContactStatus[]).map(
                              (statusKey) => {
                                const config = contactStatusConfig[statusKey];
                                const isSelected = filterStatus.includes(statusKey);
                                return (
                                  <CommandItem
                                    key={`status-${statusKey}`}
                                    value={`status ${config.label}`}
                                    onSelect={() => {
                                      setFilterStatus((prev) =>
                                        prev.includes(statusKey)
                                          ? prev.filter((s) => s !== statusKey)
                                          : [...prev, statusKey],
                                      );
                                      setLeadsPage(1);
                                    }}
                                  >
                                    <div
                                      className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${
                                        isSelected
                                          ? "bg-primary text-primary-foreground"
                                          : "opacity-50 [&_svg]:invisible"
                                      }`}
                                    >
                                      <Check className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <span>{config.label}</span>
                                  </CommandItem>
                                );
                              },
                            )}
                          </CommandGroup>
                          <CommandSeparator />
                          <CommandGroup heading="Step">
                            {[1, 2, 3].map((stepNum) => {
                              const isSelected = filterStep.includes(stepNum);
                              return (
                                <CommandItem
                                  key={`step-${stepNum}`}
                                  value={`step ${stepNum}`}
                                  onSelect={() => {
                                    setFilterStep((prev) =>
                                      prev.includes(stepNum)
                                        ? prev.filter((s) => s !== stepNum)
                                        : [...prev, stepNum],
                                    );
                                    setLeadsPage(1);
                                  }}
                                >
                                  <div
                                    className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${
                                      isSelected
                                        ? "bg-primary text-primary-foreground"
                                        : "opacity-50 [&_svg]:invisible"
                                    }`}
                                  >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                  </div>
                                  <span>Step {stepNum}</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                          {activeFilterCount > 0 && (
                            <>
                              <CommandSeparator />
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    setFilterStatus([]);
                                    setFilterStep([]);
                                    setLeadsPage(1);
                                  }}
                                  className="justify-center text-center"
                                >
                                  Clear filters
                                </CommandItem>
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="sm">
                    <Brain className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Leads
                  </Button>
                </div>
              </div>

              {/* Leads Table */}
              <Card>
                <CardHeader>
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <SearchInput
                      placeholder="Search by email..."
                      value={leadSearchQuery}
                      onChange={(e) => setLeadSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border border-border rounded-lg overflow-x-auto">
                    <table className="w-full min-w-[1600px]">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 text-left w-10">
                            <input
                              type="checkbox"
                              checked={
                                selectedContactRows.length === contacts.length &&
                                contacts.length > 0
                              }
                              onChange={toggleSelectAllContacts}
                              className="rounded border-gray-600"
                            />
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Contact
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Email Provider
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Security Gateway
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Status
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Step
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Industry
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Company
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Email
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Mobile
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Location
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            Website
                          </th>
                          <th className="px-8 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                            LinkedIn
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {contacts.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className="px-4 py-8 text-center text-muted-foreground"
                            >
                              No contacts found
                            </td>
                          </tr>
                        ) : (
                          contacts.map((contact) => {
                            const statusConfig =
                              contactStatusConfig[contact.status] || contactStatusConfig.lead;
                            const StatusIcon = statusConfig.icon;

                            return (
                              <tr
                                key={contact.id}
                                className="hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => {
                                  setSelectedContact(contact);
                                  setIsLeadSheetOpen(true);
                                }}
                              >
                                <td className="px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedContactRows.includes(contact.id)}
                                    onChange={() => toggleSelectContactRow(contact.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded border-gray-600"
                                  />
                                </td>
                                <td className="px-8 py-3 text-center">
                                  <div className="font-medium text-sm whitespace-nowrap">
                                    {getContactName(contact)}
                                  </div>
                                  {contact.seniority && (
                                    <div className="text-xs text-muted-foreground">
                                      {contact.seniority}
                                    </div>
                                  )}
                                </td>
                                <td className="px-8 py-3 text-center text-sm">
                                  {contact.email_provider ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border whitespace-nowrap">
                                      {contact.email_provider
                                        .toLowerCase()
                                        .includes("microsoft") && (
                                        <OutlookLogo className="h-3.5 w-3.5 shrink-0" />
                                      )}
                                      {(contact.email_provider.toLowerCase().includes("google") ||
                                        contact.email_provider.toLowerCase().includes("gmail")) && (
                                        <GmailLogo className="h-3.5 w-3.5 shrink-0" />
                                      )}
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {contact.email_provider}
                                      </span>
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-8 py-3 text-center text-sm">
                                  {contact.email_security_gateway ? (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted/50 border border-border whitespace-nowrap">
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {contact.email_security_gateway}
                                      </span>
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-8 py-3 text-center">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border whitespace-nowrap">
                                    <StatusIcon className={`h-3.5 w-3.5 ${statusConfig.color}`} />
                                    <span className="text-xs font-medium">
                                      {statusConfig.label}
                                    </span>
                                  </span>
                                </td>
                                <td className="px-8 py-3 text-center">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                                          <div className="flex items-center gap-1">
                                            {[1, 2, 3].map((step) => {
                                              const isDone =
                                                contact.status === "completed" ||
                                                contact.current_step >= 3;
                                              const isSent = isDone || contact.current_step >= step;
                                              return (
                                                <span
                                                  key={step}
                                                  className={`inline-block w-2 h-2 rounded-full ${
                                                    isSent
                                                      ? "bg-green-500"
                                                      : "bg-gray-300 dark:bg-gray-600"
                                                  }`}
                                                />
                                              );
                                            })}
                                          </div>
                                          <span className="text-xs font-medium text-muted-foreground">
                                            {contact.status === "completed" ||
                                            contact.current_step >= 3
                                              ? "Done"
                                              : `Step ${contact.current_step + 1}`}
                                          </span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="text-xs">
                                        <div className="space-y-1">
                                          <p>
                                            Email 1:{" "}
                                            {contact.email_1_sent_at
                                              ? format(
                                                  new Date(contact.email_1_sent_at),
                                                  "MMM d, yyyy h:mm a",
                                                )
                                              : "Not sent"}
                                          </p>
                                          <p>
                                            Email 2:{" "}
                                            {contact.email_2_sent_at
                                              ? format(
                                                  new Date(contact.email_2_sent_at),
                                                  "MMM d, yyyy h:mm a",
                                                )
                                              : "Not sent"}
                                          </p>
                                          <p>
                                            Email 3:{" "}
                                            {contact.email_3_sent_at
                                              ? format(
                                                  new Date(contact.email_3_sent_at),
                                                  "MMM d, yyyy h:mm a",
                                                )
                                              : "Not sent"}
                                          </p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </td>
                                <td className="px-8 py-3 text-center text-sm text-muted-foreground whitespace-nowrap">
                                  {contact.industry || "—"}
                                </td>
                                <td className="px-8 py-3 text-center text-sm text-muted-foreground whitespace-nowrap">
                                  {contact.company || "—"}
                                </td>
                                <td className="px-8 py-3 text-center text-sm text-muted-foreground whitespace-nowrap">
                                  {contact.email}
                                </td>
                                <td className="px-8 py-3 text-center text-sm text-muted-foreground whitespace-nowrap">
                                  {contact.phone || "—"}
                                </td>
                                <td className="px-8 py-3 text-center text-sm text-muted-foreground whitespace-nowrap">
                                  {contact.location || "—"}
                                </td>
                                <td className="px-8 py-3 text-center text-sm text-muted-foreground whitespace-nowrap">
                                  {contact.website_url ? (
                                    <a
                                      href={contact.website_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {contact.website_url
                                        .replace(/^https?:\/\/(www\.)?/, "")
                                        .replace(/\/$/, "")}
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-8 py-3 text-center text-sm text-muted-foreground whitespace-nowrap">
                                  {contact.linkedin_url ? (
                                    <a
                                      href={contact.linkedin_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {contact.linkedin_url
                                        .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")
                                        .replace(/\/$/, "")}
                                    </a>
                                  ) : (
                                    "—"
                                  )}
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
                        Showing {contactsTotal > 0 ? (leadsPage - 1) * leadsPerPage + 1 : 0} to{" "}
                        {Math.min(leadsPage * leadsPerPage, contactsTotal)} of {contactsTotal}{" "}
                        contacts
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Rows per page</span>
                        <Select
                          value={leadsPerPage.toString()}
                          onValueChange={(v) => {
                            setLeadsPerPage(Number(v));
                            setLeadsPage(1);
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
                        disabled={leadsPage <= 1}
                        onClick={() => setLeadsPage((p) => p - 1)}
                        className="flex-1 sm:flex-none"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={leadsPage >= leadsTotalPages}
                        onClick={() => setLeadsPage((p) => p + 1)}
                        className="flex-1 sm:flex-none"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Tab 3: Sequence — campaign-level template editor. Each step's
            template references per-lead AI content via {{email_N_body}} /
            {{email_N_subject}} tokens. Preview substitutes against the first
            lead's real values. */}
        <TabsContent value="sequence" className="flex-1 min-h-0 overflow-hidden">
          <SequenceTemplateEditor
            contacts={contacts}
            campaign={campaign}
            onCampaignUpdated={(updated) => setCampaign(updated)}
          />
        </TabsContent>

        {/* Tab 4: Schedule */}
        <TabsContent value="schedule">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            {/* Left Sidebar */}
            <div className="space-y-4">
              {/* Campaign Dates */}
              <div className="space-y-0">
                {/* Start Date */}
                <div className="flex items-center gap-3 py-3">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Start</span>
                  <div className="h-4 w-px bg-border" />
                  <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                    <PopoverTrigger asChild>
                      <span className="text-sm text-blue-600 cursor-pointer hover:underline">
                        {startDate ? format(startDate, "MMM d, yyyy") : "Now"}
                      </span>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        className="rounded-lg border"
                      />
                      <div className="flex items-center justify-between p-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setStartDate(undefined);
                            setStartDateOpen(false);
                            updateCampaignDates(null, undefined); // Pass null to clear the field
                          }}
                        >
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setStartDateOpen(false);
                            updateCampaignDates(startDate, undefined); // Pass undefined for end to not update it
                          }}
                        >
                          Apply
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                {/* End Date */}
                <div className="flex items-center gap-3 py-3">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">End</span>
                  <div className="h-4 w-px bg-border" />
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <span className="text-sm text-blue-600 cursor-pointer hover:underline">
                        {endDate ? format(endDate, "MMM d, yyyy") : "No end date"}
                      </span>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        className="rounded-lg border"
                      />
                      <div className="flex items-center justify-between p-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEndDate(undefined);
                            setEndDateOpen(false);
                            updateCampaignDates(undefined, null); // Pass null to clear the field
                          }}
                        >
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setEndDateOpen(false);
                            updateCampaignDates(undefined, endDate); // Pass undefined for start to not update it
                          }}
                        >
                          Apply
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Separator />
              </div>

              {/* Schedule List */}
              <div className="space-y-2 pt-2">
                {loadingSchedules ? (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    Loading schedules...
                  </div>
                ) : schedules.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    No schedules yet
                  </div>
                ) : (
                  <TooltipProvider>
                    {schedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        onClick={() => handleScheduleSelect(schedule.id)}
                        className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                          selectedScheduleId === schedule.id
                            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-foreground" />
                          <span className="text-sm font-medium text-foreground flex-1">
                            {schedule.name}
                          </span>
                          {schedule.is_active && (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] px-1.5 py-0">
                              Active
                            </Badge>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteScheduleDialog(schedule.id, schedule.name);
                                }}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {selectedScheduleId === schedule.id && !schedule.is_active && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 text-xs h-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetScheduleActive(schedule.id);
                            }}
                          >
                            Set as Active
                          </Button>
                        )}
                      </div>
                    ))}
                  </TooltipProvider>
                )}

                <Button
                  type="button"
                  onClick={handleAddSchedule}
                  className="w-full justify-center bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Add schedule
                </Button>
              </div>
            </div>

            {/* Right Main Area */}
            {!selectedScheduleId ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <CalendarIcon className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">
                  Select or add a schedule to configure
                </p>
              </div>
            ) : (
              <form onSubmit={scheduleForm.handleSubmit(handleScheduleSave)} className="space-y-6">
                {/* Schedule Name Card */}
                <Card className="p-8">
                  <Label className="text-base font-semibold text-foreground mb-4 block">
                    Schedule Name
                  </Label>
                  <div className="border rounded-lg px-4 py-2">
                    <Input
                      placeholder="Enter schedule name"
                      value={schedules.find((s) => s.id === selectedScheduleId)?.name || ""}
                      onChange={(e) => {
                        handleScheduleNameChange(selectedScheduleId, e.target.value);
                      }}
                      className="text-base h-7 border-0 p-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </Card>

                {/* Timing Card */}
                <Card className="p-8">
                  <Label className="text-base font-semibold text-foreground mb-4 block">
                    Timing
                  </Label>
                  <div className="flex gap-3">
                    {/* From */}
                    <div className="flex-1 border rounded-lg px-3 py-1.5">
                      <span className="text-xs text-muted-foreground block mb-0.5">From</span>
                      <Select
                        value={scheduleForm.watch("send_window_start")}
                        onValueChange={(value) => {
                          scheduleForm.setValue("send_window_start", value, { shouldDirty: true });
                        }}
                      >
                        <SelectTrigger className="h-auto p-0 border-0 shadow-none focus:ring-0 text-sm font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="06:00">6:00 AM</SelectItem>
                          <SelectItem value="07:00">7:00 AM</SelectItem>
                          <SelectItem value="08:00">8:00 AM</SelectItem>
                          <SelectItem value="09:00">9:00 AM</SelectItem>
                          <SelectItem value="10:00">10:00 AM</SelectItem>
                          <SelectItem value="11:00">11:00 AM</SelectItem>
                          <SelectItem value="12:00">12:00 PM</SelectItem>
                          <SelectItem value="13:00">1:00 PM</SelectItem>
                          <SelectItem value="14:00">2:00 PM</SelectItem>
                          <SelectItem value="15:00">3:00 PM</SelectItem>
                          <SelectItem value="16:00">4:00 PM</SelectItem>
                          <SelectItem value="17:00">5:00 PM</SelectItem>
                          <SelectItem value="18:00">6:00 PM</SelectItem>
                          <SelectItem value="19:00">7:00 PM</SelectItem>
                          <SelectItem value="20:00">8:00 PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* To */}
                    <div className="flex-1 border rounded-lg px-3 py-1.5">
                      <span className="text-xs text-muted-foreground block mb-0.5">To</span>
                      <Select
                        value={scheduleForm.watch("send_window_end")}
                        onValueChange={(value) => {
                          scheduleForm.setValue("send_window_end", value, { shouldDirty: true });
                        }}
                      >
                        <SelectTrigger className="h-auto p-0 border-0 shadow-none focus:ring-0 text-sm font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="08:00">8:00 AM</SelectItem>
                          <SelectItem value="09:00">9:00 AM</SelectItem>
                          <SelectItem value="10:00">10:00 AM</SelectItem>
                          <SelectItem value="11:00">11:00 AM</SelectItem>
                          <SelectItem value="12:00">12:00 PM</SelectItem>
                          <SelectItem value="13:00">1:00 PM</SelectItem>
                          <SelectItem value="14:00">2:00 PM</SelectItem>
                          <SelectItem value="15:00">3:00 PM</SelectItem>
                          <SelectItem value="16:00">4:00 PM</SelectItem>
                          <SelectItem value="17:00">5:00 PM</SelectItem>
                          <SelectItem value="18:00">6:00 PM</SelectItem>
                          <SelectItem value="19:00">7:00 PM</SelectItem>
                          <SelectItem value="20:00">8:00 PM</SelectItem>
                          <SelectItem value="21:00">9:00 PM</SelectItem>
                          <SelectItem value="22:00">10:00 PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Timezone */}
                    <div className="flex-[2] border rounded-lg px-3 py-1.5">
                      <span className="text-xs text-muted-foreground block mb-0.5">Timezone</span>
                      <Select
                        value={scheduleForm.watch("fixed_timezone")}
                        onValueChange={(value) =>
                          scheduleForm.setValue("fixed_timezone", value, { shouldDirty: true })
                        }
                      >
                        <SelectTrigger className="h-auto p-0 border-0 shadow-none focus:ring-0 text-sm font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Australia/Perth">Perth (UTC+08:00)</SelectItem>
                          <SelectItem value="Australia/Sydney">Sydney (UTC+10:00)</SelectItem>
                          <SelectItem value="America/New_York">New York (UTC-05:00)</SelectItem>
                          <SelectItem value="Europe/London">London (UTC+00:00)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>

                {/* Days Card */}
                <Card className="p-6">
                  <Label className="text-base font-semibold text-foreground mb-4 block">Days</Label>
                  <div className="flex flex-wrap gap-6">
                    {WEEKDAYS.map((day) => (
                      <div key={day} className="flex items-center gap-3">
                        <Checkbox
                          id={`day-${day}`}
                          className="h-5 w-5"
                          checked={scheduleForm.watch("send_days")?.includes(day)}
                          onCheckedChange={(checked) => {
                            const current = scheduleForm.getValues("send_days") || [];
                            if (checked) {
                              scheduleForm.setValue("send_days", [...current, day]);
                            } else {
                              scheduleForm.setValue(
                                "send_days",
                                current.filter((d) => d !== day),
                              );
                            }
                          }}
                        />
                        <Label
                          htmlFor={`day-${day}`}
                          className="text-base font-normal cursor-pointer"
                        >
                          {day}
                        </Label>
                      </div>
                    ))}
                  </div>
                </Card>

                <Button type="submit" size="lg" className="text-base">
                  Save
                </Button>
              </form>
            )}
          </div>
        </TabsContent>

        {/* Tab 5: Options */}
        <TabsContent value="options" className="space-y-6 max-w-4xl mx-auto">
          {/* Section 0: API Integration */}
          <div className="bg-white dark:bg-background border border-border rounded-lg p-8 shadow-md">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-foreground">API Integration</h3>
                  <Badge variant="outline" className="text-xs font-mono">
                    POST
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Use this endpoint to import contacts from N8N
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md text-gray-700 dark:text-gray-300 break-all">
                    {baseUrl}/api/outreach/import/{campaignId}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const url = `${baseUrl}/api/outreach/import/${campaignId}`;
                        await navigator.clipboard.writeText(url);
                        toast.success("Endpoint URL copied to clipboard!");
                      } catch (_error) {
                        toast.error("Failed to copy URL. Please copy manually.");
                      }
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Accounts to use */}
          <div className="bg-white dark:bg-background border border-border rounded-lg p-8 shadow-md">
            <div className="flex items-start justify-between gap-8">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">Accounts to use</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Select one or more accounts to send emails from
                </p>
              </div>
              <div className="flex-1 space-y-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="w-full min-h-[50px] px-3 py-2 border border-input rounded-md bg-background hover:bg-accent/50 cursor-pointer transition-colors flex flex-wrap gap-2 items-center">
                      {selectedAccountIds.length > 0 ? (
                        availableAccounts
                          .filter((acc) => selectedAccountIds.includes(acc.id))
                          .map((account) => (
                            <Badge
                              key={account.id}
                              variant="secondary"
                              className="px-2.5 py-1 text-xs font-normal bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-0"
                            >
                              {account.email}
                              <button
                                className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAccount(account.id);
                                }}
                              >
                                ×
                              </button>
                            </Badge>
                          ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Select accounts...</span>
                      )}
                      <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-[500px] p-0" align="start">
                    <div className="max-h-[300px] overflow-y-auto">
                      {availableAccounts.map((account) => (
                        <div
                          key={account.id}
                          className={`px-4 py-3 hover:bg-accent cursor-pointer transition-colors border-b last:border-0 flex items-start justify-between gap-2 ${
                            selectedAccountIds.includes(account.id) ? "bg-accent/50" : ""
                          }`}
                          onClick={() => toggleAccount(account.id)}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{account.email}</div>
                            <div className="text-xs text-muted-foreground">
                              {account.name}
                              {account.signatureHtml || account.signaturePlainText ? (
                                <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                  • signature set
                                </span>
                              ) : (
                                <span className="ml-2 text-amber-600 dark:text-amber-400">
                                  • no signature
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-xs h-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditSignatureDialog(account.id);
                            }}
                          >
                            Edit signature
                          </Button>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setNewAccountDialogOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Account
                </Button>
              </div>
            </div>
          </div>

          {/* Section 2: Open Tracking */}
          <div className="bg-white dark:bg-background border border-border rounded-lg p-8 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Open Tracking</h3>
                <p className="text-sm text-muted-foreground mt-1">Track email opens</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="link-tracking"
                    checked={optionsForm.watch("track_clicks")}
                    onCheckedChange={(checked) => {
                      optionsForm.setValue("track_clicks", checked === true);
                      handleOptionsSave({
                        ...optionsForm.getValues(),
                        track_clicks: checked === true,
                      });
                    }}
                  />
                  <Label htmlFor="link-tracking" className="text-sm font-normal cursor-pointer">
                    Link tracking
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={optionsForm.watch("track_opens") ? "outline" : "default"}
                    size="sm"
                    className={`text-sm font-medium ${!optionsForm.watch("track_opens") ? "bg-gray-600 hover:bg-gray-700 text-white" : ""}`}
                    onClick={() => {
                      optionsForm.setValue("track_opens", false);
                      handleOptionsSave({ ...optionsForm.getValues(), track_opens: false });
                    }}
                  >
                    Disable
                  </Button>
                  <Button
                    variant={optionsForm.watch("track_opens") ? "default" : "outline"}
                    size="sm"
                    className={`text-sm font-medium ${optionsForm.watch("track_opens") ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                    onClick={() => {
                      optionsForm.setValue("track_opens", true);
                      handleOptionsSave({ ...optionsForm.getValues(), track_opens: true });
                    }}
                  >
                    Enable
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Delivery Optimization */}
          <div className="bg-white dark:bg-background border border-border rounded-lg p-8 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">Delivery Optimization</h3>
                  <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0 text-xs px-2 py-0.5">
                    Recommended
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Disables open tracking for better deliverability
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="text-only-all"
                    checked={optionsForm.watch("text_only")}
                    onCheckedChange={(checked) => {
                      optionsForm.setValue("text_only", checked === true);
                      handleOptionsSave({
                        ...optionsForm.getValues(),
                        text_only: checked === true,
                      });
                    }}
                  />
                  <Label htmlFor="text-only-all" className="text-sm font-normal cursor-pointer">
                    Send emails as text-only (no HTML)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="text-only-first"
                    checked={optionsForm.watch("text_only_first")}
                    onCheckedChange={(checked) => {
                      optionsForm.setValue("text_only_first", checked === true);
                      handleOptionsSave({
                        ...optionsForm.getValues(),
                        text_only_first: checked === true,
                      });
                    }}
                  />
                  <Label htmlFor="text-only-first" className="text-sm font-normal cursor-pointer">
                    Send first email as text-only
                  </Label>
                  <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-0 text-xs px-2 py-0.5">
                    Pro
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Daily Limit */}
          <div className="bg-white dark:bg-background border border-border rounded-lg p-8 shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">Daily Limit</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Max number of new leads to contact per day for this campaign
                </p>
              </div>
              <Input
                type="number"
                value={optionsForm.watch("max_new_leads_per_day") ?? ""}
                placeholder="∞"
                className="w-24 h-12 text-center text-2xl font-semibold bg-gray-50 border border-gray-300 shadow-sm"
                min="1"
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value, 10) : null;
                  optionsForm.setValue("max_new_leads_per_day", value);
                }}
                onBlur={() => {
                  handleOptionsSave(optionsForm.getValues());
                }}
              />
            </div>
          </div>

          {/* Section 6: Show advanced options */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-center text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20"
              >
                <ChevronDown className="w-4 h-4 mr-1" />
                Show advanced options
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-6 space-y-8">
              {/* CRM Section */}
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-foreground">CRM</h2>
                <p className="text-sm text-muted-foreground">Manage Campaign Ownership</p>
                <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                  <CampaignOwnerSelect
                    campaignId={campaignId}
                    currentOwnerId={campaign?.owner_id || null}
                  />
                </div>
              </div>

              {/* Custom Tags Section */}
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">Custom Tags</h3>
                <p className="text-sm text-muted-foreground">
                  Tags are used to group and organize your campaigns
                </p>
                <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                  <CampaignTagsInput
                    campaignId={campaignId}
                    currentTags={campaign?.tags || []}
                    onTagsChange={(tags) => {
                      if (campaign) {
                        setCampaign({ ...campaign, tags });
                      }
                    }}
                  />
                </div>
              </div>

              {/* Sending Pattern Section */}
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">Sending Pattern</h3>
                <p className="text-sm text-muted-foreground">
                  Specify how you want each email to go out
                </p>

                {/* Time Gap Between Emails */}
                <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        Time Gap Between Emails
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Configure delays between sending emails
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="min-interval" className="text-sm font-medium">
                          Minimum
                        </Label>
                        <Input
                          id="min-interval"
                          type="number"
                          value={optionsForm.watch("min_send_interval_minutes")}
                          className="w-20 h-9 text-center bg-gray-50 border border-gray-300 shadow-sm"
                          min="1"
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 1;
                            optionsForm.setValue("min_send_interval_minutes", val);
                          }}
                          onBlur={() => handleOptionsSave(optionsForm.getValues())}
                        />
                        <span className="text-sm text-muted-foreground">min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="random-interval" className="text-sm font-medium">
                          Random
                        </Label>
                        <Input
                          id="random-interval"
                          type="number"
                          value={optionsForm.watch("random_send_interval_minutes")}
                          className="w-20 h-9 text-center bg-gray-50 border border-gray-300 shadow-sm"
                          min="0"
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            optionsForm.setValue("random_send_interval_minutes", val);
                          }}
                          onBlur={() => handleOptionsSave(optionsForm.getValues())}
                        />
                        <span className="text-sm text-muted-foreground">min</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stop Company on Reply Section */}
              <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Stop Campaign for Company on Reply
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Stops the campaign automatically for all leads from a company if a reply is
                      received from any of them
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={optionsForm.watch("stop_company_on_reply") ? "outline" : "default"}
                      size="sm"
                      className={`text-sm font-medium ${!optionsForm.watch("stop_company_on_reply") ? "bg-gray-600 hover:bg-gray-700 text-white" : ""}`}
                      onClick={() => {
                        optionsForm.setValue("stop_company_on_reply", false);
                        handleOptionsSave({
                          ...optionsForm.getValues(),
                          stop_company_on_reply: false,
                        });
                      }}
                    >
                      Disable
                    </Button>
                    <Button
                      variant={optionsForm.watch("stop_company_on_reply") ? "default" : "outline"}
                      size="sm"
                      className={`text-sm font-medium ${optionsForm.watch("stop_company_on_reply") ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                      onClick={() => {
                        optionsForm.setValue("stop_company_on_reply", true);
                        handleOptionsSave({
                          ...optionsForm.getValues(),
                          stop_company_on_reply: true,
                        });
                      }}
                    >
                      Enable
                    </Button>
                  </div>
                </div>
              </div>

              {/* Insert Unsubscribe Link Header Section */}
              <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Insert Unsubscribe Link Header
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Adds RFC 8058 unsubscribe headers to emails for better compliance and
                      deliverability
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={
                        optionsForm.watch("insert_unsubscribe_header") ? "outline" : "default"
                      }
                      size="sm"
                      className={`text-sm font-medium ${!optionsForm.watch("insert_unsubscribe_header") ? "bg-gray-600 hover:bg-gray-700 text-white" : ""}`}
                      onClick={() => {
                        optionsForm.setValue("insert_unsubscribe_header", false);
                        handleOptionsSave({
                          ...optionsForm.getValues(),
                          insert_unsubscribe_header: false,
                        });
                      }}
                    >
                      Disable
                    </Button>
                    <Button
                      variant={
                        optionsForm.watch("insert_unsubscribe_header") ? "default" : "outline"
                      }
                      size="sm"
                      className={`text-sm font-medium ${optionsForm.watch("insert_unsubscribe_header") ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                      onClick={() => {
                        optionsForm.setValue("insert_unsubscribe_header", true);
                        handleOptionsSave({
                          ...optionsForm.getValues(),
                          insert_unsubscribe_header: true,
                        });
                      }}
                    >
                      Enable
                    </Button>
                  </div>
                </div>
              </div>

              {/* Test Mode Section */}
              <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Test mode</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      When enabled, the worker logs each send but does <strong>not</strong> actually
                      deliver any emails. Turn this off before activating a real campaign.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={optionsForm.watch("test_mode") ? "outline" : "default"}
                      size="sm"
                      className={`text-sm font-medium ${!optionsForm.watch("test_mode") ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                      onClick={() => {
                        optionsForm.setValue("test_mode", false);
                        handleOptionsSave({ ...optionsForm.getValues(), test_mode: false });
                      }}
                    >
                      Off &mdash; send real emails
                    </Button>
                    <Button
                      variant={optionsForm.watch("test_mode") ? "default" : "outline"}
                      size="sm"
                      className={`text-sm font-medium ${optionsForm.watch("test_mode") ? "bg-yellow-600 hover:bg-yellow-700 text-white" : ""}`}
                      onClick={() => {
                        optionsForm.setValue("test_mode", true);
                        handleOptionsSave({ ...optionsForm.getValues(), test_mode: true });
                      }}
                    >
                      On &mdash; skip sends
                    </Button>
                  </div>
                </div>
              </div>

              {/* Stop Sending Emails on Auto-Reply Section (wired to same stop_on_auto_reply field) */}
              <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Stop Sending Emails on Auto-Reply
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Automatically detects out-of-office and vacation auto-replies and ignores them
                      (won&apos;t stop sequence)
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={optionsForm.watch("stop_on_auto_reply") ? "outline" : "default"}
                      size="sm"
                      className={`text-sm font-medium ${!optionsForm.watch("stop_on_auto_reply") ? "bg-gray-600 hover:bg-gray-700 text-white" : ""}`}
                      onClick={() => {
                        optionsForm.setValue("stop_on_auto_reply", false);
                        handleOptionsSave({
                          ...optionsForm.getValues(),
                          stop_on_auto_reply: false,
                        });
                      }}
                    >
                      Disable
                    </Button>
                    <Button
                      variant={optionsForm.watch("stop_on_auto_reply") ? "default" : "outline"}
                      size="sm"
                      className={`text-sm font-medium ${optionsForm.watch("stop_on_auto_reply") ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                      onClick={() => {
                        optionsForm.setValue("stop_on_auto_reply", true);
                        handleOptionsSave({ ...optionsForm.getValues(), stop_on_auto_reply: true });
                      }}
                    >
                      Enable
                    </Button>
                  </div>
                </div>
              </div>

              {/* CC and BCC Recipients Section */}
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">
                  Add CC and BCC recipients to all emails
                </h3>
                <p className="text-sm text-muted-foreground">
                  Recipients added here are copied on every email.
                </p>

                {/* CC Recipients */}
                <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-foreground">CC Recipients</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Send a copy of the email to the addresses listed in the field
                      </p>
                    </div>
                    <div className="ml-8 flex-1">
                      <Input
                        id="cc-recipients"
                        type="text"
                        placeholder="email1@example.com, email2@example.com"
                        className="bg-gray-50 border border-gray-300 shadow-sm"
                        value={optionsForm.watch("cc_recipients")}
                        onChange={(e) => optionsForm.setValue("cc_recipients", e.target.value)}
                        onBlur={() => handleOptionsSave(optionsForm.getValues())}
                      />
                    </div>
                  </div>
                </div>

                {/* BCC Recipients */}
                <div className="bg-white dark:bg-background border border-border rounded-lg p-6 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-foreground">BCC Recipients</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Send a copy of the email to certain recipients without the other recipients
                        knowing about it
                      </p>
                    </div>
                    <div className="ml-8 flex-1">
                      <Input
                        id="bcc-recipients"
                        type="text"
                        placeholder="email1@example.com, email2@example.com"
                        className="bg-gray-50 border border-gray-300 shadow-sm"
                        value={optionsForm.watch("bcc_recipients")}
                        onChange={(e) => optionsForm.setValue("bcc_recipients", e.target.value)}
                        onBlur={() => handleOptionsSave(optionsForm.getValues())}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>
      </Tabs>

      {/* Delete Schedule Dialog */}
      <DeleteConfirmDialog
        open={deleteScheduleDialog.open}
        onOpenChange={(open) => setDeleteScheduleDialog({ ...deleteScheduleDialog, open })}
        title="Delete Schedule"
        itemName={deleteScheduleDialog.name}
        onConfirm={handleDeleteSchedule}
        loading={deletingSchedule}
      />

      {/* Delete Campaign Dialog */}
      <DeleteConfirmDialog
        open={deleteCampaignDialog}
        onOpenChange={setDeleteCampaignDialog}
        title="Delete Campaign"
        itemName={campaign?.name}
        description="Are you sure you want to delete this campaign? All contacts, sequences, and analytics data will be permanently removed."
        onConfirm={deleteCampaign}
        loading={deletingCampaign}
      />

      {/* Add New Sender Account Dialog */}
      <Dialog open={newAccountDialogOpen} onOpenChange={setNewAccountDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-950">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">
              Add New Sender Account
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Add a new sender email to use for this campaign. The domain is verified in Resend.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor="email-prefix"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                Email Address
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email-prefix"
                  type="text"
                  placeholder="hello"
                  value={newAccountEmail}
                  onChange={(e) => setNewAccountEmail(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-300 shadow-sm text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                  @email.__YOUR_DOMAIN__
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                e.g. hello, contact, info, support
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="sender-name"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                Sender Name
              </Label>
              <Input
                id="sender-name"
                type="text"
                placeholder="John Smith"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                className="bg-gray-50 border border-gray-300 shadow-sm text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Your name as it appears to recipients
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="new-signature-html"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                Signature (HTML) — optional
              </Label>
              <Textarea
                id="new-signature-html"
                rows={5}
                placeholder='<p>—<br>John Smith<br><a href="https://example.com">example.com</a></p>'
                value={newAccountSignatureHtml}
                onChange={(e) => setNewAccountSignatureHtml(e.target.value)}
                className="font-mono text-xs bg-gray-50 border border-gray-300 shadow-sm text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Injected into emails wherever the template contains {`{{signature}}`}.
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="new-signature-plain"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                Signature (plain text) — optional
              </Label>
              <Textarea
                id="new-signature-plain"
                rows={4}
                placeholder={"--\nJohn Smith\nexample.com"}
                value={newAccountSignaturePlain}
                onChange={(e) => setNewAccountSignaturePlain(e.target.value)}
                className="font-mono text-xs bg-gray-50 border border-gray-300 shadow-sm text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Used when sending plain-text emails. Falls back to HTML-stripped signature if blank.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewAccountDialogOpen(false);
                setNewAccountEmail("");
                setNewAccountName("");
                setNewAccountSignatureHtml("");
                setNewAccountSignaturePlain("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddNewAccount}
              disabled={savingNewAccount || !newAccountEmail || !newAccountName}
            >
              {savingNewAccount ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Account"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sender Signature Dialog */}
      <Dialog
        open={editSignatureAccountId !== null}
        onOpenChange={(open) => {
          if (!open) setEditSignatureAccountId(null);
        }}
      >
        <DialogContent className="sm:max-w-[600px] bg-white dark:bg-gray-950">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">
              Edit sender signature
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Signatures are injected wherever the campaign template contains {`{{signature}}`}.
              HTML is sanitised at send time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label
                htmlFor="edit-signature-html"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                Signature (HTML)
              </Label>
              <Textarea
                id="edit-signature-html"
                rows={6}
                value={editSignatureHtml}
                onChange={(e) => setEditSignatureHtml(e.target.value)}
                className="font-mono text-xs bg-gray-50 border border-gray-300 shadow-sm text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="edit-signature-plain"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                Signature (plain text)
              </Label>
              <Textarea
                id="edit-signature-plain"
                rows={5}
                value={editSignaturePlain}
                onChange={(e) => setEditSignaturePlain(e.target.value)}
                className="font-mono text-xs bg-gray-50 border border-gray-300 shadow-sm text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Used for plain-text sends. Falls back to HTML-stripped signature if blank.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSignatureAccountId(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSignature} disabled={savingSignature}>
              {savingSignature ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save signature"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Sheet */}
      <Sheet open={isLeadSheetOpen} onOpenChange={setIsLeadSheetOpen}>
        <SheetContent side="right" className="w-full sm:w-[625px] sm:max-w-[675px] p-0">
          {selectedContact && (
            <>
              {/* Header */}
              <SheetHeader className="p-6 pb-4 border-b">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center text-white font-semibold text-lg">
                    {selectedContact.first_name?.[0]?.toUpperCase() ||
                      selectedContact.email[0]?.toUpperCase()}
                    {selectedContact.last_name?.[0]?.toUpperCase() || ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-lg truncate">{selectedContact.email}</SheetTitle>
                    {(selectedContact.first_name || selectedContact.last_name) && (
                      <p className="text-sm text-muted-foreground truncate">
                        {selectedContact.first_name} {selectedContact.last_name}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status Dropdown */}
                <div className="mt-4">
                  <Select
                    value={editedContact.status || selectedContact.status || "lead"}
                    onValueChange={(value) => updateContactField("status", value)}
                  >
                    <SelectTrigger className="w-[220px] bg-background border-border shadow-sm">
                      <div className="flex items-center gap-2">
                        {(() => {
                          // Show the ACTUAL status from database
                          const currentStatus = (editedContact.status ||
                            selectedContact.status) as ContactStatus;
                          const config = contactStatusConfig[currentStatus];
                          if (config) {
                            const StatusIcon = config.icon;
                            return (
                              <>
                                <StatusIcon className={`size-4 ${config.color}`} />
                                <span>{config.label}</span>
                              </>
                            );
                          }
                          // Fallback for unknown status
                          return (
                            <span className="text-muted-foreground">
                              {currentStatus || "Select status"}
                            </span>
                          );
                        })()}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "lead",
                        "interested",
                        "meeting_booked",
                        "meeting_complete",
                        "won",
                        "out_of_office",
                        "wrong_person",
                        "not_interested",
                        "lost",
                      ].map((status) => {
                        const config = contactStatusConfig[status as ContactStatus];
                        const StatusIcon = config?.icon;
                        return (
                          <SelectItem key={status} value={status}>
                            <div className="flex items-center gap-2">
                              {StatusIcon && <StatusIcon className={`h-4 w-4 ${config.color}`} />}
                              <span>{config?.label || status}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </SheetHeader>

              {/* Tabs */}
              <div className="border-b">
                <div className="flex">
                  <button
                    onClick={() => setLeadDetailTab("details")}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      leadDetailTab === "details"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Lead Details
                  </button>
                  <button
                    onClick={() => setLeadDetailTab("activities")}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      leadDetailTab === "activities"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Activities
                  </button>
                </div>
              </div>

              {/* Content */}
              <ScrollArea className="h-[calc(100vh-350px)]">
                {leadDetailTab === "details" ? (
                  <div className="p-6 space-y-6">
                    {/* Section 1: Contact Information */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Contact Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* First Name & Last Name */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              First Name
                            </Label>
                            <Input
                              value={editedContact.first_name || ""}
                              onChange={(e) => updateContactField("first_name", e.target.value)}
                              placeholder="Enter first name"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Last Name
                            </Label>
                            <Input
                              value={editedContact.last_name || ""}
                              onChange={(e) => updateContactField("last_name", e.target.value)}
                              placeholder="Enter last name"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Email</Label>
                          <Input
                            value={editedContact.email || ""}
                            onChange={(e) => updateContactField("email", e.target.value)}
                            placeholder="Enter email"
                            type="email"
                            className="bg-background border-border shadow-sm"
                          />
                        </div>

                        {/* Phone */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Phone</Label>
                          <Input
                            value={editedContact.phone || ""}
                            onChange={(e) => updateContactField("phone", e.target.value)}
                            placeholder="Enter phone number"
                            className="bg-background border-border shadow-sm"
                          />
                        </div>

                        {/* Job Title & Seniority */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Job Title
                            </Label>
                            <Input
                              value={editedContact.job_title || ""}
                              onChange={(e) => updateContactField("job_title", e.target.value)}
                              placeholder="Enter job title"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Seniority
                            </Label>
                            <Input
                              value={editedContact.seniority || ""}
                              onChange={(e) => updateContactField("seniority", e.target.value)}
                              placeholder="e.g., Partner, Director"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Section 2: Company Details */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Company Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Company Name */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Company Name
                          </Label>
                          <Input
                            value={editedContact.company || ""}
                            onChange={(e) => updateContactField("company", e.target.value)}
                            placeholder="Enter company name"
                            className="bg-background border-border shadow-sm"
                          />
                        </div>

                        {/* Industry & Location */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Industry
                            </Label>
                            <Input
                              value={editedContact.industry || ""}
                              onChange={(e) => updateContactField("industry", e.target.value)}
                              placeholder="e.g., Legal Services"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Location
                            </Label>
                            <Input
                              value={editedContact.location || ""}
                              onChange={(e) => updateContactField("location", e.target.value)}
                              placeholder="e.g., Sydney, AU"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                        </div>

                        {/* Company Size & Revenue */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Company Size
                            </Label>
                            <Input
                              value={editedContact.company_size || ""}
                              onChange={(e) => updateContactField("company_size", e.target.value)}
                              placeholder="e.g., 50-200"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Revenue
                            </Label>
                            <Input
                              value={editedContact.company_revenue || ""}
                              onChange={(e) =>
                                updateContactField("company_revenue", e.target.value)
                              }
                              placeholder="e.g., $5M-$10M"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                        </div>

                        {/* Founded Year */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Founded Year
                          </Label>
                          <Input
                            value={editedContact.founded_year || ""}
                            onChange={(e) => updateContactField("founded_year", e.target.value)}
                            placeholder="e.g., 1998"
                            className="bg-background border-border shadow-sm"
                          />
                        </div>

                        {/* Website URL */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Website
                          </Label>
                          <div className="relative">
                            <Input
                              value={editedContact.website_url || ""}
                              onChange={(e) => updateContactField("website_url", e.target.value)}
                              placeholder="https://example.com"
                              className="bg-background border-border shadow-sm pr-10"
                            />
                            {editedContact.website_url && (
                              <a
                                href={editedContact.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-700"
                              >
                                <Link2 className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* LinkedIn URL */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            LinkedIn
                          </Label>
                          <div className="relative">
                            <Input
                              value={editedContact.linkedin_url || ""}
                              onChange={(e) => updateContactField("linkedin_url", e.target.value)}
                              placeholder="https://linkedin.com/company/..."
                              className="bg-background border-border shadow-sm pr-10"
                            />
                            {editedContact.linkedin_url && (
                              <a
                                href={editedContact.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-700"
                              >
                                <Link2 className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Section 3: Email Security */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Email Security Profile
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Email Provider */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Email Provider
                          </Label>
                          <Input
                            value={editedContact.email_provider || ""}
                            onChange={(e) => updateContactField("email_provider", e.target.value)}
                            placeholder="e.g., Microsoft 365, Gmail"
                            className="bg-background border-border shadow-sm"
                          />
                        </div>

                        {/* Security Gateway */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Security Gateway
                          </Label>
                          <Input
                            value={editedContact.email_security_gateway || ""}
                            onChange={(e) =>
                              updateContactField("email_security_gateway", e.target.value)
                            }
                            placeholder="e.g., Mimecast, MailGuard"
                            className="bg-background border-border shadow-sm"
                          />
                        </div>

                        {/* Security Tier */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Security Tier
                          </Label>
                          <Input
                            value={editedContact.security_tier || ""}
                            onChange={(e) => updateContactField("security_tier", e.target.value)}
                            placeholder="e.g., Tier 1 - Enterprise Gateway"
                            className="bg-background border-border shadow-sm"
                          />
                          {editedContact.security_tier && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {editedContact.security_tier.includes("Tier 1") &&
                                "High security - Full gateway suite"}
                              {editedContact.security_tier.includes("Tier 2") &&
                                "Medium-high security - Managed DMARC"}
                              {editedContact.security_tier.includes("Tier 3") &&
                                "Medium security - Regional protection"}
                              {editedContact.security_tier.includes("Tier 4") &&
                                "Basic security - Native only"}
                              {editedContact.security_tier.includes("Tier 5") && "Minimal security"}
                            </p>
                          )}
                        </div>

                        {/* Security Level */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Security Level
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              value={editedContact.security_level || ""}
                              onChange={(e) => updateContactField("security_level", e.target.value)}
                              placeholder="e.g., High, Medium, Low"
                              className="bg-background border-border shadow-sm flex-1"
                            />
                            {editedContact.security_level && (
                              <Badge
                                variant={
                                  editedContact.security_level === "High" ||
                                  editedContact.security_level === "Medium-High"
                                    ? "default"
                                    : editedContact.security_level === "Medium"
                                      ? "secondary"
                                      : "destructive"
                                }
                                className="self-center"
                              >
                                {editedContact.security_level}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Section 4: Personalised Body — the AI-written paragraph
                        slotted into the campaign template's {{email_body}} token. */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Personalised Body
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Email 1 */}
                        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                          <h4 className="text-sm font-medium">Email 1 - Initial Outreach</h4>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Subject
                            </Label>
                            <Input
                              value={editedContact.email_1_subject || ""}
                              onChange={(e) =>
                                updateContactField("email_1_subject", e.target.value)
                              }
                              placeholder="Enter email 1 subject"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Body
                            </Label>
                            <Textarea
                              value={editedContact.email_1_body || ""}
                              onChange={(e) => updateContactField("email_1_body", e.target.value)}
                              placeholder="Enter email 1 body"
                              rows={4}
                              className="bg-background border-border shadow-sm resize-none"
                            />
                          </div>
                        </div>

                        {/* Email 2 */}
                        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                          <h4 className="text-sm font-medium">Email 2 - Follow-up</h4>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Subject
                            </Label>
                            <Input
                              value={editedContact.email_2_subject || ""}
                              onChange={(e) =>
                                updateContactField("email_2_subject", e.target.value)
                              }
                              placeholder="Enter email 2 subject"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Body
                            </Label>
                            <Textarea
                              value={editedContact.email_2_body || ""}
                              onChange={(e) => updateContactField("email_2_body", e.target.value)}
                              placeholder="Enter email 2 body"
                              rows={4}
                              className="bg-background border-border shadow-sm resize-none"
                            />
                          </div>
                        </div>

                        {/* Email 3 */}
                        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                          <h4 className="text-sm font-medium">Email 3 - Final Touch</h4>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Subject
                            </Label>
                            <Input
                              value={editedContact.email_3_subject || ""}
                              onChange={(e) =>
                                updateContactField("email_3_subject", e.target.value)
                              }
                              placeholder="Enter email 3 subject"
                              className="bg-background border-border shadow-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Body
                            </Label>
                            <Textarea
                              value={editedContact.email_3_body || ""}
                              onChange={(e) => updateContactField("email_3_body", e.target.value)}
                              placeholder="Enter email 3 body"
                              rows={4}
                              className="bg-background border-border shadow-sm resize-none"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Section 5: Additional Information */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Additional Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Timezone */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Timezone
                          </Label>
                          <Input
                            value={editedContact.timezone || ""}
                            onChange={(e) => updateContactField("timezone", e.target.value)}
                            placeholder="e.g., Australia/Sydney"
                            className="bg-background border-border shadow-sm"
                          />
                        </div>

                        {/* Research Report */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Research Report
                          </Label>
                          {editedContact.research_report &&
                          editedContact.research_report.trim() !== "" ? (
                            <div className="bg-muted/50 border border-border rounded-md p-3 shadow-sm">
                              <div className="text-sm text-foreground space-y-2 whitespace-pre-wrap">
                                {editedContact.research_report
                                  ?.replace(/<br\s*\/?>/gi, "\n") // Convert BR tags to newlines
                                  .replace(/\r\n/g, "\n") // Normalize line endings
                                  .split("\n")
                                  .map((line: string, idx: number) => {
                                    // Check if line starts with dash (bullet point)
                                    const isDashLine = line.trim().startsWith("-");
                                    if (isDashLine) {
                                      const content = line.trim().substring(1).trim();
                                      return (
                                        <div key={idx} className="flex gap-2 items-start">
                                          <span className="text-muted-foreground mt-0.5">•</span>
                                          <span className="flex-1">{content}</span>
                                        </div>
                                      );
                                    }
                                    // Regular line
                                    return line.trim() ? (
                                      <p key={idx}>{line}</p>
                                    ) : (
                                      <div key={idx} className="h-2" />
                                    );
                                  })}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-muted/50 border border-border rounded-md p-3 text-sm text-muted-foreground italic">
                              No research report available
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="p-6">
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No activities yet
                    </p>
                  </div>
                )}
              </ScrollArea>

              {/* Fixed Footer */}
              <div className="border-t p-4 mt-auto">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // TODO: Implement add variable functionality
                    toast.info("Add Variable feature coming soon");
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Variable
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
