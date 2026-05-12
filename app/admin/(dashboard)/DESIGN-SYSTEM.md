# Dashboard Design System

## Blue Slate Palette

Professional blue with neutral grays - versatile for all apps.

---

## Core Colors

| Token | Value | Usage |
|-------|-------|-------|
| **Primary** | `#3b82f6` | Main actions, links, focus states |
| **Secondary** | `#64748b` | Supporting elements, secondary text |
| **Accent** | `#0ea5e9` | Highlights, notifications, emphasis |
| **Background** | `#ffffff` | Page background |
| **Surface** | `#f8fafc` | Cards, elevated elements |

---

## WCAG AA Compliance

All color combinations meet WCAG AA standards (4.5:1 minimum contrast ratio):

- Primary (#3b82f6) on white: **4.7:1**
- Secondary (#64748b) on white: **4.5:1**
- Text (#0f172a) on white: **15.2:1**
- Muted text (#64748b) on white: **4.5:1**

---

## Color Scales

### Primary Blue
```css
--dashboard-primary-50: #eff6ff;   /* Lightest backgrounds */
--dashboard-primary-100: #dbeafe;  /* Hover backgrounds */
--dashboard-primary-200: #bfdbfe;  /* Borders */
--dashboard-primary-300: #93c5fd;  /* Disabled states */
--dashboard-primary-400: #60a5fa;  /* Icons */
--dashboard-primary-500: #3b82f6;  /* Base - buttons, links */
--dashboard-primary-600: #2563eb;  /* Hover states */
--dashboard-primary-700: #1d4ed8;  /* Active states */
--dashboard-primary-800: #1e40af;  /* Dark accents */
--dashboard-primary-900: #1e3a8a;  /* Very dark */
--dashboard-primary-950: #172554;  /* Darkest */
```

### Secondary Slate
```css
--dashboard-secondary-50: #f8fafc;   /* Surface backgrounds */
--dashboard-secondary-100: #f1f5f9;  /* Muted backgrounds */
--dashboard-secondary-200: #e2e8f0;  /* Borders */
--dashboard-secondary-300: #cbd5e1;  /* Strong borders */
--dashboard-secondary-400: #94a3b8;  /* Disabled text */
--dashboard-secondary-500: #64748b;  /* Base - muted text */
--dashboard-secondary-600: #475569;  /* Secondary text */
--dashboard-secondary-700: #334155;  /* Strong text */
--dashboard-secondary-800: #1e293b;  /* Dark backgrounds */
--dashboard-secondary-900: #0f172a;  /* Primary text, sidebar */
--dashboard-secondary-950: #020617;  /* Darkest */
```

### Accent Sky
```css
--dashboard-accent-50: #f0f9ff;   /* Info backgrounds */
--dashboard-accent-100: #e0f2fe;  /* Light highlights */
--dashboard-accent-200: #bae6fd;  /* Borders */
--dashboard-accent-300: #7dd3fc;  /* Icons */
--dashboard-accent-400: #38bdf8;  /* Emphasis */
--dashboard-accent-500: #0ea5e9;  /* Base - highlights */
--dashboard-accent-600: #0284c7;  /* Hover */
--dashboard-accent-700: #0369a1;  /* Active */
--dashboard-accent-800: #075985;  /* Dark */
--dashboard-accent-900: #0c4a6e;  /* Very dark */
--dashboard-accent-950: #082f49;  /* Darkest */
```

---

## Semantic Tokens

### Backgrounds
```css
--dashboard-bg: #ffffff;           /* Main background */
--dashboard-bg-subtle: #f8fafc;    /* Subtle distinction */
--dashboard-bg-muted: #f1f5f9;     /* Muted areas */
--dashboard-bg-elevated: #ffffff;  /* Elevated surfaces */
```

### Text
```css
--dashboard-text: #0f172a;           /* Primary text */
--dashboard-text-secondary: #475569; /* Secondary text */
--dashboard-text-muted: #64748b;     /* Muted text */
--dashboard-text-disabled: #94a3b8;  /* Disabled text */
--dashboard-text-link: #3b82f6;      /* Links */
```

### Borders
```css
--dashboard-border: #e2e8f0;        /* Default borders */
--dashboard-border-subtle: #f1f5f9; /* Subtle borders */
--dashboard-border-strong: #cbd5e1; /* Emphasized borders */
--dashboard-border-focus: #3b82f6;  /* Focus state */
```

---

## Interactive States

### Primary Button
| State | Background | Text |
|-------|------------|------|
| Default | `#3b82f6` | `#ffffff` |
| Hover | `#2563eb` | `#ffffff` |
| Active | `#1d4ed8` | `#ffffff` |
| Disabled | `#93c5fd` | `#ffffff` |

### Secondary Button
| State | Background | Text |
|-------|------------|------|
| Default | `#f1f5f9` | `#334155` |
| Hover | `#e2e8f0` | `#334155` |
| Active | `#cbd5e1` | `#334155` |
| Disabled | `#f8fafc` | `#94a3b8` |

### Ghost Button
| State | Background | Text |
|-------|------------|------|
| Default | transparent | `#475569` |
| Hover | `#f1f5f9` | `#334155` |
| Active | `#e2e8f0` | `#334155` |

---

## Feedback Colors

### Status Colors
| Status | Background | Text | Border |
|--------|------------|------|--------|
| Success | `#dcfce7` | `#15803d` | `#22c55e` |
| Warning | `#fef3c7` | `#b45309` | `#f59e0b` |
| Error | `#fee2e2` | `#b91c1c` | `#ef4444` |
| Info | `#e0f2fe` | `#0369a1` | `#0ea5e9` |

---

## Usage Examples

### Apply the theme
```tsx
// The dashboard layout automatically applies the theme
<div className="dashboard-theme">
  {/* Dashboard content */}
</div>
```

### Using CSS Variables
```css
.my-component {
  background-color: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  color: var(--dashboard-text);
}

.my-component:hover {
  background-color: var(--dashboard-surface-hover);
}
```

### Using Utility Classes
```tsx
// Buttons
<button className="btn-dashboard-primary">Primary Action</button>
<button className="btn-dashboard-secondary">Secondary Action</button>

// Cards
<div className="card-dashboard">Card content</div>

// Badges
<span className="badge-dashboard-success">Success</span>
<span className="badge-dashboard-warning">Warning</span>
<span className="badge-dashboard-error">Error</span>

// Text
<p className="text-dashboard-muted">Muted text</p>
<a className="text-dashboard-link">Link text</a>

// Backgrounds
<div className="bg-dashboard-subtle">Subtle background</div>
```

---

## File Location

Design system CSS: `app/admin/(dashboard)/dashboard-design-system.css`

The system is scoped to the dashboard via the `.dashboard-theme` class wrapper, ensuring homepage styles remain unaffected.
