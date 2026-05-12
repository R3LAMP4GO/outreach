import { redirect } from "next/navigation";

export default function OutreachPage() {
  // Redirect to campaigns page
  redirect("/admin/outreach/campaigns");
}
