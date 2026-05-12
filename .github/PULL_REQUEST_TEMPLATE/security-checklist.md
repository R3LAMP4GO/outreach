## Security Checklist

Before requesting review, verify the following:

### Input & Data Handling
- [ ] All user input validated server-side (Zod schemas in `lib/validations.ts`)
- [ ] Database queries use Drizzle ORM parameterized methods or `sql` tagged templates
- [ ] No raw SQL with string interpolation (use `sql` template from `drizzle-orm`)
- [ ] Pagination parameters validated (page >= 1, limit capped)

### Authentication & Authorization
- [ ] New API routes check `getServerSession()` for authenticated endpoints
- [ ] Database queries use `db` from `@/lib/db` (Drizzle ORM) — not deprecated Supabase clients
- [ ] Auth checks (`getServerSession()`) performed before any database operations (Drizzle connects directly to PostgreSQL, bypassing RLS — application-layer auth is the security boundary)

### Error Handling
- [ ] Error responses do not expose internal details, stack traces, or database errors
- [ ] 400 vs 500 status codes used appropriately
- [ ] Server-side logging for detailed errors (Pino)

### Secrets & Configuration
- [ ] No hardcoded secrets, API keys, or passwords in code
- [ ] No secrets logged or included in error responses
- [ ] New environment variables documented in `CLAUDE.md`
- [ ] `NEXT_PUBLIC_*` prefix only used for genuinely public values

### Webhooks
- [ ] Webhook endpoints verify request signatures before processing
- [ ] Webhook endpoints only accept POST requests
- [ ] Webhook handlers use `db` from `@/lib/db` with admin-level access (unauthenticated context)

### Database
- [ ] Security enforced at application layer (auth checks in API routes) — Drizzle connects directly to PostgreSQL, bypassing Supabase RLS
- [ ] New database queries scoped to authenticated user's data where applicable
- [ ] No `db` (Drizzle) usage in client components — server-side only

### Frontend
- [ ] No `dangerouslySetInnerHTML` without DOMPurify sanitization
- [ ] Scripts compatible with Content Security Policy (nonce-based loading)
- [ ] No sensitive data stored in localStorage or sessionStorage

### Rate Limiting
- [ ] Sensitive endpoints have rate limiting (login, password reset, form submissions)
- [ ] Rate limit responses include appropriate headers
