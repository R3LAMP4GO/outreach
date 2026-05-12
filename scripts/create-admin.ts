/**
 * Create Initial Admin User
 *
 * Usage: npx tsx scripts/create-admin.ts
 *
 * This script creates the first super_admin user for the application.
 * It should only be run once during initial setup.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { adminUsers, adminAuditLog } from "../lib/db/schema";
import { eq, count } from "drizzle-orm";
import { hash } from "bcryptjs";
import * as readline from "readline";

const SALT_ROUNDS = 12;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing environment variable: DATABASE_URL");
  process.exit(1);
}

const client = postgres(databaseUrl, { prepare: false });
const db = drizzle({ client });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain a lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain an uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain a number");
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("Password must contain a special character");
  }

  return { valid: errors.length === 0, errors };
}

async function main() {
  console.log("\n🔐 Create Initial Admin User\n");

  // Check if admin users already exist
  const [result] = await db.select({ total: count() }).from(adminUsers);

  if (result.total > 0) {
    console.log("⚠️  Admin users already exist in the database.");
    const proceed = await question("Do you want to create another super_admin? (y/N): ");
    if (proceed.toLowerCase() !== "y") {
      console.log("Cancelled.");
      rl.close();
      process.exit(0);
    }
  }

  // Get user input
  let email = "";
  while (!email) {
    email = await question("Email: ");
    if (!validateEmail(email)) {
      console.log("❌ Invalid email format");
      email = "";
    }
  }

  // Check if email already exists
  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log("❌ A user with this email already exists");
    rl.close();
    process.exit(1);
  }

  const name = await question("Full Name: ");
  if (!name) {
    console.log("❌ Name is required");
    rl.close();
    process.exit(1);
  }

  let password = "";
  while (!password) {
    password = await question("Password: ");
    const validation = validatePassword(password);
    if (!validation.valid) {
      console.log("❌ Password requirements:");
      validation.errors.forEach((e) => console.log(`   - ${e}`));
      password = "";
    }
  }

  const confirmPassword = await question("Confirm Password: ");
  if (password !== confirmPassword) {
    console.log("❌ Passwords do not match");
    rl.close();
    process.exit(1);
  }

  // Hash password
  console.log("\n⏳ Creating user...");
  const passwordHash = await hash(password, SALT_ROUNDS);

  // Create user
  const [user] = await db
    .insert(adminUsers)
    .values({
      email,
      name,
      passwordHash,
      role: "super_admin",
      isActive: true,
    })
    .returning();

  if (!user) {
    console.log("❌ Failed to create user");
    rl.close();
    process.exit(1);
  }

  // Log the action
  await db.insert(adminAuditLog).values({
    userId: user.id,
    action: "create_admin",
    resourceType: "user",
    resourceId: user.id,
    details: { method: "cli_script", role: "super_admin" },
  });

  console.log("\n✅ Super admin created successfully!\n");
  console.log(`   Email: ${email}`);
  console.log(`   Name: ${name}`);
  console.log(`   Role: super_admin`);
  console.log("\nYou can now log in at /admin/login\n");

  rl.close();
  await client.end();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
