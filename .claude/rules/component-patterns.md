# Component & Styling Patterns

## Component Structure

- **Named exports only** - No default exports
- **Props interface**: Always `{ComponentName}Props`
- **'use client'**: Only for hooks, events, animations
- **Barrel exports**: All components exported from `components/ui/index.ts`

## Animations

- **ALL animations** defined in `app/globals.css` with `@keyframes`
- **Never inline** keyframe definitions
- **Naming**: `.animate-{concept}-{variant}` (e.g., `animate-wave-1`, `animate-scroll-rtl`)
- **GPU acceleration**: Always include `will-change: transform` (or `width`)
- **Seamless loops**: Duplicate content twice in DOM

## Design Tokens (app/globals.css)

- Colors: `gray-{50,100,500,700,900}`, `blue-{300,400,500,600}`
- Shadows: `var(--shadow-soft)`
- Radius: `var(--radius-circle)`, `var(--radius-pill)`, `var(--radius-card)`
- Blue gradient: `rgba(200, 220, 255, 0.3)` for card backgrounds

## Layout

- **Responsive**: Mobile-first (`md:` at 768px, `lg:` at 1024px)
- **Container pattern**: Always `w-full px-4 py-16` → `max-w-7xl mx-auto`
- **Z-index**: Background (z-0), Content (z-10), Navigation (z-50)

## Hero Sections

- **Standard positioning**: `justify-start px-6 pt-64 pb-24` (content positioned lower on screen)
- **Gradient text fix**: Always add `pb-2` to h1 elements with gradient text to prevent descender clipping
- **Structure**: `min-h-screen` section → content wrapper → headline + subtitle + CTA + scroll indicator
- **Pattern**: Use this consistently across all hero sections (home, about, etc.)

## Anti-patterns

- ❌ Default exports
- ❌ Inline keyframe animations (use globals.css)
- ❌ Animate `top`/`left` (use `transform`)
- ❌ Skip `will-change` property
- ❌ Hardcode colors (use design tokens)
- ❌ Client components without 'use client'
- ❌ Forget WebKit prefixes for `backdropFilter`
- ❌ Use `flex-1` + `aspect-ratio` for overflow effects (use absolute positioning instead)
- ❌ Hero sections with `justify-center` (use `justify-start pt-64 pb-24`)
- ❌ Gradient text without `pb-2` (causes descender clipping on g, p, y, etc.)

---

# File Upload Patterns

## Avatar / Logo Uploads

Upload happens immediately on file pick — do NOT store base64 in component state.

```
User picks file
  → POST /api/admin/upload/avatar (FormData)
  → route validates: size ≤ 2MB, magic bytes, allowlisted MIME
  → uploads to lib/storage (S3/MinIO)
  → deletes old file (best-effort)
  → updates DB with proxy URL (/api/media/avatars/filename)
  → returns { url }
  → component sets state to returned URL
```

- File size check: `file.size > 2 * 1024 * 1024` → reject before fetch
- Disable upload button while `isUploading` is true
- Reset `<input type="file">` value after every pick (success or failure)
- `Remove` button calls `DELETE /api/admin/upload/avatar` — clears storage + DB
- Do NOT include `avatarUrl` or `logoUrl` in the main settings save body — the upload route handles DB persistence directly

## Object Storage (`lib/storage`)

- Always import from `@/lib/storage` (the `server-only` wrapper) — never import `@aws-sdk/client-s3` directly in routes
- `uploadFile(path, buffer, { contentType })` — PUT to S3
- `downloadFile(path)` → `Uint8Array<ArrayBuffer> | null` — GET from S3 (returns null on 404)
- `deleteFile(path)` — DELETE from S3
- Path conventions: `avatars/{timestamp}-{hex}.{ext}`, `logos/{timestamp}-{hex}.{ext}`
- Proxy URL convention: `/api/media/{prefix}/{filename}` — stored in DB, served by auth-gated route

## Anti-patterns

- ❌ Storing images as base64 data URLs in the database
- ❌ Returning public/unsigned S3 URLs to clients — always proxy through `/api/media/*`
- ❌ Importing `lib/storage` in Client Components (it's `server-only`)
- ❌ Trusting `file.type` alone for SVG — also inspect first 512 bytes of buffer
- ❌ Passing Node.js `Buffer` or `Readable` directly as `NextResponse` body — use `Blob` or `Uint8Array<ArrayBuffer>`
