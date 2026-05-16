import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { verifySync } from "otplib";
import { decryptCredential } from "@/lib/encryption";
import { db } from "@/lib/db";
import { adminUsers, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "@/lib/auth.config";
import { logger } from "@/lib/logger";
import {
  FAILED_LOGIN_DELAY_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCKOUT_DURATION_MS,
} from "@/lib/constants";

// Timing attack mitigation: Add artificial delay on failed attempts
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Full NextAuth setup — Node runtime only.
 *
 * This module pulls in providers + events that depend on Node-only APIs
 * (bcryptjs, postgres.js via `@/lib/db`, node:crypto via `@/lib/encryption`).
 * It must NEVER be imported by `middleware.ts` — middleware uses the
 * Edge-safe `authConfig` from `lib/auth.config.ts` directly.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  events: {
    async signOut(message) {
      // Log logout event - token available in JWT strategy
      const token = "token" in message ? message.token : null;
      if (!token?.sub) return;

      // Log the logout event
      try {
        await db.insert(adminAuditLog).values({
          userId: token.sub,
          action: "logout",
          resourceType: "session",
          details: { method: "manual" },
        });
      } catch (err) {
        logger.error("Failed to log logout event:", err);
      }
    },
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "2FA Code", type: "text", optional: true },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        // Normalize email for consistent matching
        const normalizedEmail = (credentials.email as string).toLowerCase().trim();

        /**
         * SECURITY NOTE: Using db (Drizzle) with direct database connection
         *
         * This is intentional and necessary because:
         * 1. Authentication happens BEFORE a user session exists
         * 2. Direct database access bypasses RLS to fetch user data for credential verification
         * 3. No user input is directly executed (email is validated and normalized)
         */

        // Fetch user from database
        let user;
        try {
          const [result] = await db
            .select()
            .from(adminUsers)
            .where(eq(adminUsers.email, normalizedEmail))
            .limit(1);
          user = result;
        } catch {
          await delay(FAILED_LOGIN_DELAY_MS);
          throw new Error("Invalid credentials");
        }

        if (!user) {
          // Timing attack mitigation: Delay to prevent user enumeration
          await delay(FAILED_LOGIN_DELAY_MS);
          throw new Error("Invalid credentials");
        }

        // Check account status
        if (!user.isActive) {
          throw new Error("Account is disabled");
        }

        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
          throw new Error("Account is temporarily locked. Try again later.");
        }

        // Verify password
        const isValidPassword = await compare(credentials.password as string, user.passwordHash);

        if (!isValidPassword) {
          // Increment failed attempts
          const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
          try {
            await db
              .update(adminUsers)
              .set({
                failedLoginAttempts: newFailedAttempts,
                lockedUntil:
                  newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
                    ? new Date(Date.now() + ACCOUNT_LOCKOUT_DURATION_MS).toISOString()
                    : null,
              })
              .where(eq(adminUsers.id, user.id));
          } catch (err) {
            logger.error("Failed to update failed login attempts:", err);
          }

          // Timing attack mitigation: Delay before throwing error
          await delay(FAILED_LOGIN_DELAY_MS);
          throw new Error("Invalid credentials");
        }

        // Verify TOTP if enabled
        if (user.totpEnabled) {
          const totpCode = credentials.totpCode as string | undefined;

          if (!totpCode) {
            throw new Error("2FA code is required");
          }

          if (!user.totpSecret) {
            throw new Error("2FA is not properly configured");
          }

          // Decrypt the TOTP secret (supports legacy plaintext secrets)
          let totpSecret: string;
          try {
            const parsed = JSON.parse(user.totpSecret);
            // If JSON-parseable, it must be an encrypted envelope — decrypt it.
            // If decryption fails (tampered ciphertext), throw rather than falling
            // through to use corrupted data as a plaintext secret.
            totpSecret = decryptCredential(parsed.ev, parsed.iv, parsed.tag);
          } catch (totpErr) {
            // Only treat as legacy plaintext if JSON.parse itself failed
            // (i.e. the stored value is not a JSON envelope at all).
            if (totpErr instanceof SyntaxError) {
              totpSecret = user.totpSecret;
            } else {
              // Decryption failed on a valid JSON envelope — corrupted or tampered data
              throw new Error("2FA configuration is corrupted. Contact administrator.");
            }
          }

          const isTotpValid = verifySync({
            token: totpCode,
            secret: totpSecret,
          }).valid;

          if (!isTotpValid) {
            // Increment failed attempts for invalid TOTP
            const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
            try {
              await db
                .update(adminUsers)
                .set({
                  failedLoginAttempts: newFailedAttempts,
                  lockedUntil:
                    newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
                      ? new Date(Date.now() + ACCOUNT_LOCKOUT_DURATION_MS).toISOString()
                      : null,
                })
                .where(eq(adminUsers.id, user.id));
            } catch (err) {
              logger.error("Failed to update failed login attempts:", err);
            }

            // Timing attack mitigation: Delay before throwing error
            await delay(FAILED_LOGIN_DELAY_MS);
            throw new Error("Invalid 2FA code");
          }
        }

        // Reset failed attempts on successful login
        try {
          await db
            .update(adminUsers)
            .set({
              failedLoginAttempts: 0,
              lockedUntil: null,
              lastLoginAt: new Date().toISOString(),
            })
            .where(eq(adminUsers.id, user.id));
        } catch (err) {
          logger.error("Failed to reset login attempts:", err);
        }

        // Log the login
        try {
          await db.insert(adminAuditLog).values({
            userId: user.id,
            action: "login",
            resourceType: "session",
            details: { method: "credentials" },
          });
        } catch (err) {
          logger.error("Failed to log login event:", err);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as "admin" | "super_admin",
          totpEnabled: user.totpEnabled || false,
          avatarUrl: user.avatarUrl ?? null,
        };
      },
    }),
  ],
});

// Re-export the Edge-safe config for callers who only need the config object
// (e.g. tests that don't want to instantiate NextAuth).
export { authConfig };
