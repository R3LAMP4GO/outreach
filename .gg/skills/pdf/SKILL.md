---
name: pdf
description: "Generate professional Coastal Programs branded PDFs (security audit reports, client proposals, stack reviews, threat models) using WeasyPrint HTML/CSS to PDF. Use this skill whenever the user wants to deliver a polished branded PDF — audit findings, client deliverables, internal reports. Trigger when the user mentions 'turn this into a PDF', 'send the audit as a PDF', 'brand this for the client', or any output that needs a cover page, table of contents, and section dividers."
---

# Coastal Programs PDF Generator

Generate polished, print-ready PDFs by writing semantic HTML and letting the theme CSS handle all the styling. The script injects the CSS automatically — you just write clean HTML with the right class names.

## Step 1: Understand the Request

Determine what kind of document the user needs:
- **Security audit report** — convert from `audit-output/<client>/markdown.md` (and any companion docs)
- **Client proposal / stack review** — gather content from chat or existing markdown
- **Threat model / handbook** — build from a structured outline

## Step 2: Load the CSS Component Reference

Read `references/css-components.md` (relative to this skill's directory). It lists every available HTML component and the exact markup to use:
- Cover pages, section dividers, table of contents
- Rounded tables (default, blue-header, borderless)
- Cards (single and 2/4-column grid)
- Quote blocks, question boxes, and severity callouts (`callout-critical`, `callout-medium`, `callout-low`, `callout-info`, `callout-success`)
- Code blocks (auto-styled `<pre>` and `<code>`)
- Bullet lists (Graphite markers)
- Utility classes

A full document structure example is at the bottom of the reference.

## Step 3: Build the HTML Document

Write an HTML file using the components from the reference. Key rules:

1. **Always start with a cover page** for any multi-page document — Graphite → Charcoal greyscale gradient background, Coastal Programs icon (`assets/brand/icon-light.png` — designed for dark backgrounds, has wave/CP shading) at `width: 60mm`, title in ALL CAPS `<h1>`, short subtitle, `<hr class="cover-rule">`, two `<p class="cover-meta">` lines (client name + date).
2. **Always include a Table of Contents on page 2** for any document with more than ~3 sections. Use `<div class="toc">`. Entries must match the section dividers exactly (same numbers, same titles).
3. **Always wrap headings + content in `<section>`** — prevents orphan headings at page bottoms.
4. **Always wrap tables in `<div class="table-container">`** — gives them rounded corners.
5. **Cover pages and section dividers must be direct children of `<body>`** — they use named `@page` rules for full-bleed backgrounds.
6. **Image paths MUST be relative to the project root**, NOT the HTML file. The script sets `base_url=project_root` for WeasyPrint. Use `assets/brand/icon-light.png` — NEVER `../../assets/...`. Wrong path = broken image and a tiny PDF (~60 KB instead of ~1 MB). If the PDF is suspiciously small, that's the cause.
7. **Never use em dashes (—) anywhere in copy.** House style. Use a comma, full stop, colon, or parentheses instead. Applies to body text, headings, callouts, table cells, captions, every string. If you're tempted to write `foo — bar`, write `foo, bar` or `foo. Bar` or `foo (bar)`. En dashes (–) are also out. The only dash that ships is the hyphen (-) in compound words.
8. **Do NOT add `<style>` or `<link>` tags for the theme** — the script injects theme CSS automatically. Page-specific overrides in a single `<style>` block in `<head>` are fine.

Write HTML to a sensible location, e.g.:
```
audit-output/<client>/report.html
```

## Step 4: Generate the PDF

### Pre-flight check

```bash
.venv/bin/python3 -c "import weasyprint; print('OK')" 2>/dev/null || echo "FAIL"
```

If it fails, set up the venv:
```bash
python3.13 -m venv .venv
.venv/bin/pip install weasyprint beautifulsoup4 pillow
```

If `python3.13` is missing:
```bash
brew install python@3.13 pango
```

### Generate

```bash
.venv/bin/python3 .claude/skills/pdf/scripts/generate_pdf.py \
  --input audit-output/corrynnes/report.html \
  --output audit-output/corrynnes/Corrynnes-Stack-Audit.pdf \
  --theme coastal
```

Arguments:
- `--input` (required): path to the HTML file
- `--output` (required): path for the output PDF
- `--theme` (optional): theme name, default `coastal`. Maps to `scripts/themes/<name>.css`
- `--base-url` (optional): base path for resolving images. Defaults to project root.
- `--editable` (optional): wraps numeric `<td>` cells in PDF form inputs the recipient can edit in Preview/Acrobat.

## Step 5: Post-Generation

1. Tell the user the output file path and size.
2. Open it: `open <path>` (macOS).
3. For changes — edit the HTML and regenerate. Layout tweaks are usually CSS, not HTML.
4. For a different look — edit `scripts/themes/coastal.css`. CSS variables at the top control the whole palette.

## Brand: Coastal Programs

The default `coastal` theme is a refined greyscale palette sampled directly from `icon-light.png` — the same tones as the logo's wave artwork and CP letters. The brand reads as sophisticated and editorial rather than corporate-blue.

### Palette

| Token | Hex | Role |
|---|---|---|
| `--graphite` | `#404040` | Primary — headings, accents, h1/h3 colour, list markers, accent borders. Matches the CP letter darkness. |
| `--charcoal` | `#1A1A1A` | Deepest — body emphasis, cover gradient endpoint |
| `--abyss-tone` | `#0A0A0A` | Near-black for full-bleed contrast |
| `--slate` | `#888888` | Mid-grey — the dominant tone in the wave artwork. Used for cover subtitle, captions, secondary accents. |
| `--pebble` | `#C8C8C8` | Soft accent — dividers, big section divider numbers |
| `--stone` | `#F0F0F0` | Light backgrounds — quote blocks, callout-low, table tints |
| `--mist` | `#F8F8F8` | Subtle off-white card backgrounds |
| `--mid-grey` | `#6B6B6B` | Body muted text, footer page number |
| `--border-light` | `#DDDDDD` | All component borders |

### Backwards-compatible aliases

The old blue-era variable names still resolve, mapped to the new greys, so any existing HTML continues to work without edits:

| Old name | Now resolves to |
|---|---|
| `--ocean-blue` | `--graphite` |
| `--deep-navy` | `--charcoal` |
| `--abyss` | `--abyss-tone` |
| `--foam` | `--stone` |
| `--sky` | `--slate` |
| `--sand` | `--mist` |
| `--section-num-tint` | `--pebble` |

**Style summary:**
- **Fonts**: Teko (display headings) + Inter (body) from Google Fonts
- **Page**: A4, 18-20mm margins, "COASTAL PROGRAMS" header left + "CONFIDENTIAL" header right + page number footer
- **Cover**: greyscale gradient (Graphite → Charcoal), white logo + title + subtitle
- **Style**: Rounded 12px corners, alternating row tints (white / stone), card-based layouts
- **Severity callouts**: keep meaning-bearing colours (red critical / amber medium / green success) — these communicate urgency and should never be greyscaled. The `callout-low` and `callout-info` variants intentionally use the new stone/grey palette.

### Brand asset locations

| Asset | Path | Use on |
|---|---|---|
| Icon designed for dark backgrounds (preserves wave/CP shading) | `assets/brand/icon-light.png` | Cover, section dividers — anywhere on the dark gradient |
| Icon for light backgrounds | `assets/brand/icon-dark.jpeg` | White/stone backgrounds (JPEG — no transparency) |
| Full wordmark in brand blue (on white) | `assets/brand/logo-light.png` | White backgrounds, headers, footers |
| Full wordmark in white (on black) | `assets/brand/logo-dark.png` | Dark backgrounds |

**Naming convention:** `*-light.png` = designed *for* light backgrounds (so the artwork is dark/coloured) **EXCEPT** `icon-light.png` which is the lighter-shaded icon designed for dark backgrounds. Do NOT post-process the icon (no filters, no recolouring) — the tonal shading is intentional and reads as the brand.

To create a new client-specific theme, copy `scripts/themes/coastal.css` and modify the CSS variables at the top.

## Common Document Patterns

### Security audit report

Cover → TOC → Executive Summary → Findings (grouped by severity using `.callout-*`) → Recon → Endpoint Map → Architecture → Recommendations.

### Client stack review

Cover → TOC → Current Stack (table) → Plugin/dependency inventory → Modernisation roadmap → Risk findings → Recommended next steps.

### Proposal

Cover → TOC → Problem → Solution → Phased plan (cards) → Pricing (table) → Timeline → Next steps.

## Troubleshooting

- **Tiny PDF (~60 KB)** = broken image path. Image paths are relative to project root, not HTML file.
- **Headings stranded at page bottoms** = wrap them in `<section>`.
- **Tables not rounded** = missing `<div class="table-container">` wrapper.
- **Cover background not full-bleed** = `.cover-page` must be a direct child of `<body>`.
- **Fonts look like Times New Roman** = Google Fonts CDN unreachable. Check internet, or fall back to `'Helvetica'` / `'Arial'`.
- **Two cards stacked instead of side-by-side** = should not happen any more (the grid is flex-based). If it does, you're probably using a custom inline style overriding the flex layout. Stop and check.

## Layout rules of thumb

- **`.card-grid` with 2 cards** = always one row of 2 side-by-side cards. **Use this for paired concepts** (e.g. "website service / worker service"). Never stack two cards manually with `<br>` or block-level wrappers.
- **`.card-grid` with 4 cards** = two rows of 2.
- **`.card-grid-4`** = four narrow cards in a single row, for metric/stat callouts.
- **Odd card counts (3, 5)** leave a gap, avoid them. Either pad to an even count or use a different component.
