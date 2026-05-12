/**
 * Admin Notification System
 * Sends email notifications to admin based on saved preferences
 */

import { db } from "@/lib/db";
import { adminUsers, adminSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { logger } from "@/lib/logger";

interface AdminSettings {
  notification_email: string | null;
  notify_new_contact: boolean;
  notify_new_subscriber: boolean;
}

interface ContactNotificationData {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  businessName?: string | null;
  notes: string;
  productInterest?: string | null;
  submissionId: string;
}

interface SubscriberNotificationData {
  email: string;
  source?: string;
  subscriberId: string;
}

/**
 * Get admin notification settings
 * Returns settings for the first admin user (single-admin system)
 */
async function getAdminNotificationSettings(): Promise<AdminSettings | null> {
  try {
    // Get the first admin user's id
    const [adminUser] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);

    if (!adminUser) {
      logger.error("No admin user found for notifications");
      return null;
    }

    const [settings] = await db
      .select({
        notificationEmail: adminSettings.notificationEmail,
        notifyNewContact: adminSettings.notifyNewContact,
        notifyNewSubscriber: adminSettings.notifyNewSubscriber,
      })
      .from(adminSettings)
      .where(eq(adminSettings.userId, adminUser.id))
      .limit(1);

    if (!settings) {
      // Return defaults if no settings saved yet
      return {
        notification_email: null,
        notify_new_contact: true,
        notify_new_subscriber: true,
      };
    }

    // Return with defaults for null values, mapped to snake_case for API compatibility
    return {
      notification_email: settings.notificationEmail,
      notify_new_contact: settings.notifyNewContact ?? true,
      notify_new_subscriber: settings.notifyNewSubscriber ?? true,
    };
  } catch (err) {
    logger.error("Failed to fetch admin notification settings:", err);
    return null;
  }
}

/**
 * Send notification for new contact form submission
 */
export async function notifyNewContact(data: ContactNotificationData): Promise<boolean> {
  try {
    const settings = await getAdminNotificationSettings();

    if (!settings || !settings.notify_new_contact || !settings.notification_email) {
      logger.info("Contact notifications disabled or no email configured");
      return false;
    }

    // Get Resend API key from environment
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      logger.error("RESEND_API_KEY not configured in environment");
      return false;
    }

    const resend = new Resend(resendApiKey);
    const fromEmail = process.env.DEFAULT_FROM_EMAIL || "__YOUR_FROM_EMAIL__";
    const fullName = `${data.firstName} ${data.lastName}`;
    const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/admin/contacts`;

    await resend.emails.send({
      from: fromEmail,
      to: settings.notification_email,
      subject: `New Contact: ${fullName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #f9fafb; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
              <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin: 0 0 16px 0;">
                New Contact Form Submission
              </h2>

              <div style="background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px 0;"><strong>Name:</strong> ${fullName}</p>
                <p style="margin: 0 0 8px 0;"><strong>Email:</strong> <a href="mailto:${data.email}" style="color: #3B82F6;">${data.email}</a></p>
                <p style="margin: 0 0 8px 0;"><strong>Mobile:</strong> <a href="tel:${data.mobile}" style="color: #3B82F6;">${data.mobile}</a></p>
                ${data.businessName ? `<p style="margin: 0 0 8px 0;"><strong>Business:</strong> ${data.businessName}</p>` : ""}
                ${data.productInterest ? `<p style="margin: 0 0 8px 0;"><strong>Product Interest:</strong> ${data.productInterest}</p>` : ""}
              </div>

              <div style="background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px 0;"><strong>Message:</strong></p>
                <p style="margin: 0; color: #666; white-space: pre-wrap;">${data.notes}</p>
              </div>

              <div style="text-align: center; margin-top: 20px;">
                <a href="${adminUrl}" style="display: inline-block; background-color: #3B82F6; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">
                  View in Dashboard
                </a>
              </div>
            </div>

            <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 16px;">
              This is an automated notification from __YOUR_BRAND__
            </p>
          </body>
        </html>
      `,
    });

    logger.info("Contact notification sent to:", settings.notification_email);
    return true;
  } catch (error) {
    logger.error("Failed to send contact notification:", error);
    return false;
  }
}

/**
 * Send monthly newsletter reminder on last day of month
 */
export async function notifyNewsletterReminder(): Promise<boolean> {
  try {
    const settings = await getAdminNotificationSettings();

    if (!settings || !settings.notification_email) {
      logger.info("Newsletter reminder: no email configured");
      return false;
    }

    // Get Resend API key from environment
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      logger.error("RESEND_API_KEY not configured in environment");
      return false;
    }

    const resend = new Resend(resendApiKey);
    const fromEmail = process.env.DEFAULT_FROM_EMAIL || "__YOUR_FROM_EMAIL__";
    const createUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/admin/outreach/campaigns/new`;
    const today = new Date();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const currentMonth = monthNames[today.getMonth()];

    await resend.emails.send({
      from: fromEmail,
      to: settings.notification_email,
      subject: `📝 Time to create your ${currentMonth} newsletter!`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 40px 24px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 12px 0;">
                Monthly Newsletter Reminder
              </h1>
              <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 0;">
                It's the last day of ${currentMonth}!
              </p>
            </div>

            <div style="background: #f9fafb; border-radius: 12px; padding: 32px 24px; margin-top: 20px; border: 1px solid #e5e7eb;">
              <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin: 0 0 16px 0;">
                Time to share what you built this month!
              </h2>

              <p style="color: #666; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
                Your subscribers are waiting to hear about:
              </p>

              <ul style="color: #666; font-size: 15px; line-height: 1.8; margin: 0 0 24px 0; padding-left: 20px;">
                <li>What you built or launched</li>
                <li>Problems you solved</li>
                <li>New features or improvements</li>
                <li>Lessons learned</li>
                <li>What's coming next</li>
              </ul>

              <div style="text-align: center; margin-top: 32px;">
                <a href="${createUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                  Create Newsletter →
                </a>
              </div>

              <p style="color: #9CA3AF; font-size: 13px; text-align: center; margin: 20px 0 0 0;">
                Takes just 5 minutes with AI assistance
              </p>
            </div>

            <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 20px;">
              Monthly reminder • Last day of every month
            </p>
          </body>
        </html>
      `,
    });

    logger.info("Newsletter reminder sent to:", settings.notification_email);
    return true;
  } catch (error) {
    logger.error("Failed to send newsletter reminder:", error);
    return false;
  }
}

/**
 * Check if today is the last day of the month
 */
export function isLastDayOfMonth(): boolean {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // If tomorrow is the 1st, today is the last day of the month
  return tomorrow.getDate() === 1;
}

/**
 * Send notification for new verified newsletter subscriber
 */
export async function notifyNewSubscriber(data: SubscriberNotificationData): Promise<boolean> {
  try {
    const settings = await getAdminNotificationSettings();

    if (!settings || !settings.notify_new_subscriber || !settings.notification_email) {
      logger.info("Subscriber notifications disabled or no email configured");
      return false;
    }

    // Get Resend API key from environment
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      logger.error("RESEND_API_KEY not configured in environment");
      return false;
    }

    const resend = new Resend(resendApiKey);
    const fromEmail = process.env.DEFAULT_FROM_EMAIL || "__YOUR_FROM_EMAIL__";
    const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/admin/subscribers`;

    await resend.emails.send({
      from: fromEmail,
      to: settings.notification_email,
      subject: `New Subscriber: ${data.email}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #f9fafb; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
              <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin: 0 0 16px 0;">
                New Newsletter Subscriber
              </h2>

              <div style="background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px 0;"><strong>Email:</strong> <a href="mailto:${data.email}" style="color: #3B82F6;">${data.email}</a></p>
                ${data.source ? `<p style="margin: 0;"><strong>Source:</strong> ${data.source}</p>` : ""}
              </div>

              <p style="color: #666; font-size: 14px; margin: 0 0 16px 0;">
                A new subscriber has verified their email address and is now on your mailing list.
              </p>

              <div style="text-align: center; margin-top: 20px;">
                <a href="${adminUrl}" style="display: inline-block; background-color: #3B82F6; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">
                  View Subscribers
                </a>
              </div>
            </div>

            <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 16px;">
              This is an automated notification from __YOUR_BRAND__
            </p>
          </body>
        </html>
      `,
    });

    logger.info("Subscriber notification sent to:", settings.notification_email);
    return true;
  } catch (error) {
    logger.error("Failed to send subscriber notification:", error);
    return false;
  }
}
