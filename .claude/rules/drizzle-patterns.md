# Drizzle ORM Database Patterns

## Client Setup

```typescript
import { db } from "@/lib/db";                    // Singleton Drizzle client (server-only)
import { contacts, deals, stages } from "@/lib/db/schema";  // Schema tables (camelCase columns)
import { eq, and, or, sql, inArray, ilike, gte, lte, desc, asc, isNull, isNotNull } from "drizzle-orm";
```

- `db` uses `postgres` driver with `prepare: false` — server-only, never import in Client Components
- All schema columns are camelCase (`firstName`, `contactStatus`, `createdAt`)
- The underlying database columns are snake_case, but Drizzle maps them automatically

## Query Patterns

### Select with where

```typescript
const rows = await db
  .select()
  .from(contacts)
  .where(eq(contacts.contactStatus, "lead"));
```

### Select single row

```typescript
const [contact] = await db
  .select()
  .from(contacts)
  .where(eq(contacts.id, id))
  .limit(1);

if (!contact) {
  throw new CrmError("Contact not found", 404);
}
```

### Insert

```typescript
const [newContact] = await db
  .insert(contacts)
  .values({
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    contactStatus: "lead",
  })
  .returning();
```

### Update

```typescript
const [updated] = await db
  .update(contacts)
  .set({ contactStatus: "qualified", updatedAt: new Date().toISOString() })
  .where(eq(contacts.id, id))
  .returning();
```

### Delete

```typescript
await db.delete(contacts).where(eq(contacts.id, id));
```

### Count

```typescript
const [{ count }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(contacts)
  .where(eq(contacts.contactStatus, "lead"));
```

### Joins

```typescript
const dealRows = await db
  .select({
    id: deals.id,
    name: deals.name,
    amount: deals.amount,
    stageName: stages.name,
    stageSlug: stages.slug,
  })
  .from(deals)
  .leftJoin(stages, eq(deals.stageId, stages.id))
  .where(eq(deals.contactId, contactId));
```

### Pagination

```typescript
const offset = (page - 1) * limit;
const rows = await db
  .select()
  .from(contacts)
  .orderBy(sql`${contacts.createdAt} DESC`)
  .limit(limit)
  .offset(offset);
```

### Search with ilike

```typescript
const pattern = `%${search}%`;
const rows = await db
  .select()
  .from(contacts)
  .where(
    or(
      ilike(contacts.firstName, pattern),
      ilike(contacts.lastName, pattern),
      ilike(contacts.email, pattern),
    ),
  );
```

### PostgreSQL RPC Functions

```typescript
// Named parameters with :=
const result = await db.execute(
  sql`SELECT * FROM upsert_contact_with_hierarchy_protection(
    p_email := ${email},
    p_first_name := ${firstName},
    p_source := ${source}
  )`,
);

// Positional parameters with type casts
await db.execute(
  sql`SELECT bulk_delete_contacts(${contactIds}::uuid[])`,
);
```

## API Response Mapping

Drizzle returns camelCase. API responses need snake_case for backward compatibility.

### CRM module — manual mapping

```typescript
// Map Drizzle camelCase → API snake_case
const mappedContacts = contactRows.map((c) => ({
  id: c.id,
  first_name: c.firstName,
  last_name: c.lastName,
  email: c.email,
  contact_status: c.contactStatus,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
}));
```

### Outreach module — helper functions

```typescript
import { toSnakeCase, toCamelCase } from "@/lib/outreach/lib/drizzle-helpers";

const apiResponse = toSnakeCase(drizzleRow);   // { firstName } → { first_name }
const drizzleData = toCamelCase(apiInput);      // { first_name } → { firstName }
```

## Error Handling

Drizzle throws errors — there is no `{ data, error }` pattern. Use try/catch.

```typescript
try {
  const [row] = await db
    .insert(contacts)
    .values({ email, firstName })
    .returning();
  return NextResponse.json({ contact: row });
} catch (error: unknown) {
  // Unique constraint violation (e.g., duplicate email)
  if (error instanceof Error && (error as any).code === "23505") {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }
  return NextResponse.json({ error: "Database error" }, { status: 500 });
}
```

## Anti-patterns

- ❌ Using `supabaseAdmin()` or `getSupabaseClient()` (deprecated — use `db`)
- ❌ Snake_case column names in Drizzle queries (use camelCase: `contacts.firstName` not `contacts.first_name`)
- ❌ `{ data, error }` destructuring (Drizzle throws, use try/catch)
- ❌ Importing `db` in Client Components (server-only — enforced by `"server-only"` import)
- ❌ Forgetting `.limit(1)` when expecting a single row
- ❌ Raw table/column name strings (use schema refs: `contacts.email` not `"email"`)
- ❌ Extracting `db.execute` into a variable (always call directly on `db`)
