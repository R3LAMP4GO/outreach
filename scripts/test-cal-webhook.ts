/**
 * Test script for Cal.com webhook handler
 * Run with: npx tsx scripts/test-cal-webhook.ts
 */

import crypto from "crypto";
import { config } from "dotenv";

// Load environment variables from .env.local
config({ path: ".env.local" });

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/webhooks/cal";
const WEBHOOK_SECRET = process.env.CAL_WEBHOOK_SECRET || "";

// Create test payload
function createTestPayload(eventType: string = "BOOKING_CREATED") {
  return {
    triggerEvent: eventType,
    createdAt: new Date().toISOString(),
    payload: {
      uid: `test-booking-${Date.now()}`,
      bookingId: Date.now(),
      type: "consultation",
      title: "Test Consultation",
      description: "Test booking for webhook verification",
      startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endTime: new Date(Date.now() + 90000000).toISOString(),
      attendees: [
        {
          email: "test@example.com", // Change this to match a real submission email
          name: "Test User",
          timeZone: "Australia/Sydney",
        },
      ],
      organizer: {
        email: process.env.TEST_ORGANIZER_EMAIL || "organizer@example.com",
        name: "Test Organizer",
        timeZone: "Australia/Sydney",
      },
      metadata: {},
    },
  };
}

// Create HMAC signature
function createSignature(payload: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// Send test webhook
async function sendTestWebhook(eventType: string = "BOOKING_CREATED") {
  const payload = createTestPayload(eventType);
  const payloadString = JSON.stringify(payload);
  const signature = createSignature(payloadString, WEBHOOK_SECRET);

  console.log("\n========================================");
  console.log(`Testing ${eventType} webhook`);
  console.log("========================================");
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("Signature:", signature);
  console.log("----------------------------------------");

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cal-signature-256": signature,
      },
      body: payloadString,
    });

    const data = await response.json();

    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log("✅ Webhook test PASSED");
    } else {
      console.log("❌ Webhook test FAILED");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Run tests
async function main() {
  console.log("\nCal.com Webhook Test Script");
  console.log("============================\n");
  console.log("Webhook URL:", WEBHOOK_URL);
  console.log("Secret configured:", WEBHOOK_SECRET ? "Yes" : "No");

  // Test health check first
  console.log("\n--- Testing health check ---");
  try {
    const healthResponse = await fetch(WEBHOOK_URL);
    const healthData = await healthResponse.json();
    console.log("Health check:", healthData);
  } catch (error) {
    console.error("Health check failed:", error);
  }

  // Test BOOKING_CREATED
  await sendTestWebhook("BOOKING_CREATED");

  // Test invalid signature
  console.log("\n--- Testing invalid signature ---");
  const payload = createTestPayload();
  const payloadString = JSON.stringify(payload);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cal-signature-256": "sha256=invalid",
      },
      body: payloadString,
    });

    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(data, null, 2));

    if (response.status === 401) {
      console.log("✅ Invalid signature correctly rejected");
    } else {
      console.log("❌ Should have rejected invalid signature");
    }
  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n========================================");
  console.log("Tests completed");
  console.log("========================================\n");
}

main().catch(console.error);
