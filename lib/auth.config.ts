import type { NextAuthConfig } from "next-auth";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";

// Extend the built-in session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: "admin" | "super_admin";
      totpEnabled: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string | null;
    role: "admin" | "super_admin";
    totpEnabled: boolean;
  }
}

/**
 * Edge-safe NextAuth config.
 *
 * This file is imported by `middleware.ts` (Edge runtime). It must not
 * transitively import anything that depends on Node-only APIs:
 *   - `lib/db` (postgres.js)
 *   - `lib/encryption` (node:crypto)
 *   - `bcryptjs`
 *
 * The full config — providers, events.signOut — lives in `lib/auth.ts`,
 * which spreads this config and is used by route handlers / server code.
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },

  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");
      const isOnAuthPage =
        nextUrl.pathname === "/admin/login" ||
        nextUrl.pathname.startsWith("/admin/invite/") ||
        nextUrl.pathname.startsWith("/admin/reset-password");

      if (isOnAdmin) {
        if (isOnAuthPage) return true;
        if (isLoggedIn) return true;
        return false;
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.totpEnabled = user.totpEnabled;
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "super_admin";
        session.user.totpEnabled = token.totpEnabled as boolean;
      }
      return session;
    },
  },

  // Providers are intentionally empty here. The full provider list (Credentials)
  // is added in `lib/auth.ts` so middleware never bundles bcryptjs/db/encryption.
  providers: [],

  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },

  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        // Optional explicit domain for production (e.g. ".yourdomain.com" to share
        // cookies across subdomains). Leave AUTH_COOKIE_DOMAIN unset to use a
        // host-only cookie — the correct default for localhost and most deployments.
        ...(process.env.AUTH_COOKIE_DOMAIN ? { domain: process.env.AUTH_COOKIE_DOMAIN } : {}),
      },
    },
  },
};
