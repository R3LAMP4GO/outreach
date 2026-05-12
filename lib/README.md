# Database Access — Drizzle ORM

This directory contains the database configuration and shared modules for the application, providing type-safe database access via Drizzle ORM over postgres.js.

## Quick Start

```typescript
// Server-side only (API routes, Server Components, server actions)
import { db } from "@/lib/db";
import { contacts, deals } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

// Select
const rows = await db
  .select()
  .from(contacts)
  .where(eq(contacts.status, "lead"))
  .orderBy(desc(contacts.createdAt));

// Insert
await db.insert(contacts).values({
  email: "user@example.com",
  firstName: "Jane",
  status: "lead",
});

// Update
await db
  .update(contacts)
  .set({ status: "qualified" })
  .where(eq(contacts.id, contactId));

// Raw SQL / RPC calls
const result = await db.execute(
  sql`SELECT * FROM upsert_contact_with_hierarchy_protection(
    p_email := ${email},
    p_first_name := ${firstName},
    p_source := ${source}
  )`
);
```

## Architecture Overview

### Database Client

The project uses a single database client exported from `lib/db/index.ts`:

- **`db`** — Drizzle ORM instance over postgres.js
  - Connects via `DATABASE_URL` (Railway Postgres connection string)
  - Server-only (`import "server-only"` enforced)
  - Schema-aware — all tables available via `db.query.*`
  - `prepare: false` for pooled-connection compatibility

### Schema

Tables are defined in `lib/db/schema.ts` using `pgTable()` with **camelCase** property names mapped to **snake_case** column names:

```typescript
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull(),
  status: text("status").default("subscriber"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
});
```

Relations are defined in `lib/db/relations.ts` for Drizzle's relational query API.

### camelCase ↔ snake_case Convention

- **Schema / TypeScript**: camelCase (`firstName`, `createdAt`)
- **API responses**: snake_case (`first_name`, `created_at`)
- CRM query functions in `lib/crm/*.ts` manually map camelCase results to snake_case for JSON responses
- The outreach module uses helpers from `lib/outreach/lib/drizzle-helpers.ts` (`toSnakeCase`, `toSnakeCaseArray`)

## File Structure

```
lib/
├── db/
│   ├── index.ts          # Drizzle client (db) — primary database access
│   ├── schema.ts          # All table definitions (pgTable)
│   └── relations.ts       # Drizzle relation definitions
├── encryption.ts          # AES-256-GCM encryption for credentials
├── services/
│   ├── credentials.ts     # Encrypted credential storage service
│   └── integration-client.ts  # Integration system client factories
└── README.md              # This file
```

## Query Patterns

### Select with filters

```typescript
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { eq, and, ilike, desc } from "drizzle-orm";

const results = await db
  .select()
  .from(contacts)
  .where(and(eq(contacts.status, "lead"), ilike(contacts.email, `%@example.com`)))
  .orderBy(desc(contacts.createdAt))
  .limit(50);
```

### Relational queries

```typescript
const contact = await db.query.contacts.findFirst({
  where: eq(contacts.id, id),
  with: { deals: true, timelineEvents: true },
});
```

### Insert with returning

```typescript
const [newDeal] = await db
  .insert(deals)
  .values({ contactId, pipelineId, stageId, title: "New Deal" })
  .returning();
```

### Calling PostgreSQL RPC functions

```typescript
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const result = await db.execute(
  sql`SELECT * FROM upsert_contact_with_hierarchy_protection(
    p_email := ${email},
    p_first_name := ${firstName},
    p_last_name := ${lastName},
    p_source := ${source}
  )`
);
```

## Environment Variables

### Required

```bash
# .env.local
DATABASE_URL=postgresql://postgres:[password]@[host]:[port]/[database]
```

**Where to get:** Railway → Postgres service → Variables tab → `DATABASE_URL`

### Validation

- Missing `DATABASE_URL` throws a descriptive error at startup with troubleshooting steps
- The `server-only` import prevents accidental client-side bundling

## Integration System

The application uses an encrypted integration system for managing third-party credentials:

```typescript
import { getResendClient, getResendFromEmail } from "@/lib/services/integration-client";

const resend = await getResendClient();
const fromEmail = await getResendFromEmail("newsletter");
```

**Available integrations:** `getResendClient()`, `getResendFromEmail(context)`, `getAnthropicApiKey()`, `getGoogleApiKey()`, `getPerplexityApiKey()`

See `lib/services/README.md` for integration system documentation.

## Troubleshooting

**Error:** `Missing DATABASE_URL environment variable`
1. Add `DATABASE_URL` to `.env.local`
2. Use the connection string from Railway (Postgres service → Variables → `DATABASE_URL`)
3. Restart the dev server after adding environment variables

**Error:** `This module cannot be imported from a Client Component`
- The `db` module uses `import "server-only"` — move database queries to API routes, Server Components, or server actions

**Build/deploy issues:**
1. Set `DATABASE_URL` in Railway → service → Variables
2. Redeploy after adding environment variables
3. Verify the Railway Postgres service is running and reachable from the app service (same project, private networking)

## Further Reading

- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [postgres.js Documentation](https://github.com/porsager/postgres)
- [CLAUDE.md](../CLAUDE.md) — Project conventions and patterns
