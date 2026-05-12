# Coastal Programs PDF — CSS Component Reference

Every HTML component available in the `coastal` PDF theme. Use these exact patterns. The `generate_pdf.py` script injects the theme CSS automatically — write semantic HTML with these class names.

**Image paths** are relative to the project root (e.g., `assets/brand/icon-light.png`).

**Brand asset cheat-sheet:**
- `assets/brand/icon-light.png` — use on cover and section-divider backgrounds (Graphite → Charcoal greyscale gradient). Has soft tonal shading baked in; do NOT recolour or filter.
- `assets/brand/icon-dark.jpeg` — dark icon for white backgrounds (JPEG, no transparency).
- `assets/brand/logo-light.png` — full wordmark in brand blue, on white.
- `assets/brand/logo-dark.png` — full wordmark in white, on black.

**Palette at a glance** (sampled from `icon-light.png` — sophisticated greyscale):
- `--graphite` `#404040` — primary, headings, list markers, accent borders
- `--charcoal` `#1A1A1A` — deepest, body emphasis, cover gradient endpoint
- `--slate` `#888888` — mid-grey, captions, subtitles
- `--pebble` `#C8C8C8` — dividers, big section numbers
- `--stone` `#F0F0F0` — light backgrounds, callouts, table tints
- Severity callout colours stay meaningful: red critical / amber medium / green success.

**Orphan prevention**: always wrap a heading and its content in `<section>`. This stops headings from sitting alone at the bottom of a page.

---

## Cover Page

Full-bleed Graphite → Charcoal greyscale gradient. Must be a direct child of `<body>`. **Every multi-page document starts with this.**

> ⚠️ **Image path warning:** WeasyPrint's `base_url` is set to the project root by the generator script. Image `src` must be relative to project root (`assets/brand/icon-light.png`), NOT to the HTML file (`../../assets/...`). Wrong path = silently broken cover with no logo and a tiny PDF (~60 KB). If the PDF is suspiciously small, this is why.

```html
<div class="cover-page">
  <img src="assets/brand/icon-light.png" alt="Coastal Programs" class="cover-logo">
  <h1>STACK AUDIT</h1>
  <p class="cover-subtitle">Corrynne's Natural Skincare</p>
  <hr class="cover-rule">
  <p class="cover-meta">Prepared by Coastal Programs</p>
  <p class="cover-meta">May 2026</p>
</div>
```

**Always immediately follow the cover page with a Table of Contents** (next section) for any multi-page document.

---

## Section Divider

Full-bleed gradient page between major sections. Direct child of `<body>`.

```html
<div class="section-divider">
  <span class="section-number">01</span>
  <h2>Executive Summary</h2>
</div>
```

---

## Table of Contents

```html
<section>
  <h1>Contents</h1>
  <div class="toc">
    <div class="toc-entry">
      <span class="toc-number">01</span>
      <span class="toc-title">Executive Summary</span>
    </div>
    <div class="toc-entry">
      <span class="toc-number">02</span>
      <span class="toc-title">Findings</span>
    </div>
    <div class="toc-entry">
      <span class="toc-number">03</span>
      <span class="toc-title">Architecture &amp; Recon</span>
    </div>
  </div>
</section>
```

---

## Rounded Tables

Always wrap `<table>` in `.table-container`. Default style has no coloured header bar — clean alternating rows.

**Default:**
```html
<div class="table-container">
  <table class="branded-table">
    <thead>
      <tr><th>Plugin</th><th>Version</th><th>Purpose</th></tr>
    </thead>
    <tbody>
      <tr><td>woocommerce</td><td>10.4.4</td><td>Core shop</td></tr>
      <tr><td>woo-discount-rules</td><td>2.6.15</td><td>Bulk discounts</td></tr>
    </tbody>
  </table>
</div>
```

**Blue header variant:**
```html
<div class="table-container">
  <table class="branded-table blue-header">
    <thead><tr><th>Severity</th><th>Count</th></tr></thead>
    <tbody><tr><td>Medium</td><td>9</td></tr></tbody>
  </table>
</div>
```

**Borderless (no header, minimal dividers):**
```html
<div class="table-container">
  <table class="branded-table borderless">
    <thead><tr><th>Key</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td>Domain</td><td>corrynnes.com.au</td></tr>
      <tr><td>WordPress</td><td>6.8.5</td></tr>
    </tbody>
  </table>
</div>
```

### Column widths
Use inline `style="width: Xpt"` on `<th>`:
```html
<th style="width: 120pt">Issue</th>
<th>Remediation</th>
```

---

## Severity Callouts (audit reports)

Five colour-coded variants for finding severity:

```html
<div class="callout callout-critical">
  <strong>Critical:</strong> Active SQL injection on /search endpoint.
</div>
<div class="callout callout-medium">
  <strong>Medium:</strong> PHP 7.4 EOL — no security patches since Nov 2022.
</div>
<div class="callout callout-low">
  <strong>Low:</strong> Server header leaks "cloudflare".
</div>
<div class="callout callout-info">
  <strong>Info:</strong> 34 third-party services receive customer data.
</div>
<div class="callout callout-success">
  <strong>Good:</strong> DMARC policy=reject is correctly configured.
</div>
```

---

## Card (single)

```html
<div class="card">
  <h3>Phase 1 — Headless front-end</h3>
  <p>Stand up Next.js storefront pointed at existing Woo backend. Old site untouched. Week 1.</p>
</div>
```

---

## Card Grid (2-column)

```html
<div class="card-grid">
  <div class="card">
    <h3>No plugin licences</h3>
    <p>Stop renting features from 15 vendors.</p>
  </div>
  <div class="card">
    <h3>3-5x faster</h3>
    <p>Server-rendered Next.js, no plugin JS bloat.</p>
  </div>
  <div class="card">
    <h3>Better SEO</h3>
    <p>Core Web Vitals straight to green.</p>
  </div>
  <div class="card">
    <h3>One developer, one codebase</h3>
    <p>No plugin update emails. Ever.</p>
  </div>
</div>
```

For 4 narrower columns, use `card-grid-4`.

---

## Quote Block

For mission statements, customer quotes, vision text.

```html
<blockquote class="quote-block">
  <p>"WordPress + 50 plugins is not how serious e-commerce is built in 2026."</p>
</blockquote>
```

---

## Question Box

For items needing client decision or input. Left accent border + "?" prefix.

```html
<div class="question-box">
  Do you want to keep the existing wholesale pricing structure or simplify the tiers as part of the rebuild?
</div>
```

---

## Code Blocks

`<pre>` and `<code>` are auto-styled with the Stone tint and Graphite accent border:

```html
<pre><code>POST https://graph.facebook.com/v18.0/{pixel_id}/events
Content-Type: application/json

{ "event_name": "Purchase", "value": 49.95 }</code></pre>
```

Inline: `<code>stripe.coupons.create()</code>` renders inline pill style.

---

## Bullet & Numbered Lists

Standard HTML lists. Markers are Graphite automatically.

```html
<ul>
  <li>Plugin attack surface eliminated.</li>
  <li>PHP version no longer matters.</li>
  <li>Page load 3-5x faster.</li>
</ul>

<ol>
  <li>Stand up headless front-end (week 1).</li>
  <li>Replace plugins one at a time (weeks 2-3).</li>
  <li>DNS cutover (week 4).</li>
</ol>
```

---

## Heading + Content Grouping (Orphan Prevention)

Always wrap headings + their content in `<section>`:

```html
<section>
  <h1>1.1 Current Stack</h1>
  <div class="table-container">
    <table class="branded-table">...</table>
  </div>
</section>

<section>
  <h2>Risk Findings</h2>
  <div class="callout callout-medium">...</div>
</section>
```

---

## Colour Swatches (brand pages)

```html
<div class="swatch-grid">
  <div class="swatch" style="background: #404040; color: #FFFFFF;">
    <div class="swatch-name">Graphite</div>
    <div class="swatch-hex">#404040</div>
    <div class="swatch-rgb">RGB(64, 64, 64)</div>
  </div>
  <div class="swatch" style="background: #1A1A1A; color: #FFFFFF;">
    <div class="swatch-name">Charcoal</div>
    <div class="swatch-hex">#1A1A1A</div>
    <div class="swatch-rgb">RGB(26, 26, 26)</div>
  </div>
  <div class="swatch" style="background: #888888; color: #FFFFFF;">
    <div class="swatch-name">Slate</div>
    <div class="swatch-hex">#888888</div>
    <div class="swatch-rgb">RGB(136, 136, 136)</div>
  </div>
  <div class="swatch" style="background: #C8C8C8; color: #1A1A1A; border: 1px solid #DDDDDD;">
    <div class="swatch-name">Pebble</div>
    <div class="swatch-hex">#C8C8C8</div>
    <div class="swatch-rgb">RGB(200, 200, 200)</div>
  </div>
  <div class="swatch" style="background: #F0F0F0; color: #1A1A1A; border: 1px solid #DDDDDD;">
    <div class="swatch-name">Stone</div>
    <div class="swatch-hex">#F0F0F0</div>
    <div class="swatch-rgb">RGB(240, 240, 240)</div>
  </div>
</div>
```

For light swatches, add `border: 1px solid #DDDDDD` so they're visible against white pages.

---

## Font Display

```html
<div class="font-display">
  <div>
    <div class="font-name teko">Teko</div>
    <div class="font-role">Headlines, Display</div>
  </div>
  <div>
    <div class="font-name inter">Inter</div>
    <div class="font-role">Body Text, UI</div>
  </div>
</div>
```

---

## Utility Classes

| Class | Effect |
|-------|--------|
| `.body-bold` | Bold body text |
| `.text-muted` | Mid-grey text colour |
| `.text-small` | 8pt font size |
| `.spacer` | 10pt vertical gap |
| `.spacer-lg` | 20pt vertical gap |
| `.page-break` | Force a page break before this element |
| `.keep-together` | Prevent page break inside this element |

---

## Full Document Structure Example

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Stack Audit — Corrynne's</title></head>
<body>

  <!-- Cover -->
  <div class="cover-page">
    <img src="assets/brand/icon-light.png" alt="Coastal Programs" class="cover-logo">
    <h1>STACK AUDIT</h1>
    <p class="cover-subtitle">Corrynne's Natural Skincare</p>
    <hr class="cover-rule">
    <p class="cover-meta">Prepared by Coastal Programs</p>
    <p class="cover-meta">May 2026</p>
  </div>

  <!-- Table of Contents -->
  <section>
    <h1>Contents</h1>
    <div class="toc">
      <div class="toc-entry"><span class="toc-number">01</span><span class="toc-title">Executive Summary</span></div>
      <div class="toc-entry"><span class="toc-number">02</span><span class="toc-title">Current Stack</span></div>
      <div class="toc-entry"><span class="toc-number">03</span><span class="toc-title">Findings</span></div>
      <div class="toc-entry"><span class="toc-number">04</span><span class="toc-title">Recommendations</span></div>
    </div>
  </section>

  <!-- Section 1 divider -->
  <div class="section-divider">
    <span class="section-number">01</span>
    <h2>Executive Summary</h2>
  </div>

  <section>
    <h1>1.1 Snapshot</h1>
    <p>Corrynne's site runs on WordPress 6.8.5 + WooCommerce 10.4.4, hosted behind Cloudflare on PHP 7.4.33 — a known end-of-life runtime.</p>
    <div class="callout callout-medium">
      <strong>PHP 7.4 EOL:</strong> No security patches since November 2022. This is the headline risk.
    </div>
  </section>

  <section>
    <h1>1.2 Risk Rating</h1>
    <blockquote class="quote-block">
      <p>0.3 / 10 — LOW. No critical findings. Nine medium-severity issues, all fixable.</p>
    </blockquote>
  </section>

</body>
</html>
```
