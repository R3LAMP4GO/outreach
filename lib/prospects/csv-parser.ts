/**
 * CSV parser for prospect imports.
 *
 * Minimal RFC 4180 parser — handles quoted fields (with escaped `""`),
 * embedded newlines inside quotes, and CRLF/LF/CR line endings. Returns
 * normalised rows alongside per-row validation errors so a single bad row
 * never fails the whole import.
 *
 * Public API:
 *   parseProspectCsv(raw): { rows: ProspectRow[]; errors: ImportError[] }
 *
 * Required column: `businessName` (case-insensitive header match)
 * Optional columns: website, phone, address, city, state, country, industry,
 *                   googlePlaceId, notes
 */

export interface ProspectRow {
  businessName: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  googlePlaceId: string | null;
  notes: string | null;
}

export interface ImportError {
  /** 1-based line in the source CSV (header is line 1). */
  line: number;
  /** Column name involved, if applicable. */
  column?: string;
  message: string;
}

/** Columns we accept, in canonical (camelCase) form. */
const REQUIRED_COLUMNS = ["businessName"] as const;
const OPTIONAL_COLUMNS = [
  "website",
  "phone",
  "address",
  "city",
  "state",
  "country",
  "industry",
  "googlePlaceId",
  "notes",
] as const;

const ALL_COLUMNS: readonly string[] = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

/**
 * Parse a raw CSV string into prospect rows + per-row errors.
 *
 * A "fatal" error (no header / no required column / no rows) is reported as
 * a single error on line 1 and `rows` is empty. Otherwise the parser
 * collects what it can and reports the rest.
 */
export function parseProspectCsv(raw: string): {
  rows: ProspectRow[];
  errors: ImportError[];
} {
  const errors: ImportError[] = [];
  const rows: ProspectRow[] = [];

  if (!raw || raw.trim().length === 0) {
    return {
      rows,
      errors: [{ line: 1, message: "CSV is empty" }],
    };
  }

  const records = tokenize(raw);
  if (records.length === 0) {
    return {
      rows,
      errors: [{ line: 1, message: "CSV is empty" }],
    };
  }

  // First non-empty record is the header.
  const header = records[0].fields.map((f) => f.trim());
  const headerMap = buildHeaderMap(header);

  if (!headerMap.has("businessName")) {
    return {
      rows,
      errors: [
        {
          line: records[0].line,
          column: "businessName",
          message: "Missing required column: businessName",
        },
      ],
    };
  }

  for (let i = 1; i < records.length; i++) {
    const record = records[i];

    // Skip blank lines (RFC 4180 tokeniser already drops trailing empty rows,
    // but a single empty field in the middle still creates a record).
    if (record.fields.every((f) => f.trim().length === 0)) continue;

    const result = parseRow(record.fields, record.line, headerMap);
    if (result.error) {
      errors.push(result.error);
    } else if (result.row) {
      rows.push(result.row);
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ line: 1, message: "CSV contains no data rows" });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface RawRecord {
  /** 1-based line number where this record started. */
  line: number;
  fields: string[];
}

/** RFC 4180 tokeniser. Handles quoted fields, escaped quotes, embedded \\n. */
function tokenize(input: string): RawRecord[] {
  const records: RawRecord[] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let rowStarted = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (rowStarted) {
      records.push({ line: recordStartLine, fields: row });
    }
    row = [];
    rowStarted = false;
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];

    if (!rowStarted && !inQuotes) {
      recordStartLine = line;
      rowStarted = true;
    }

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      if (c === "\n") line++;
      field += c;
      continue;
    }

    if (c === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }

    if (c === ",") {
      pushField();
      continue;
    }

    if (c === "\r" && next === "\n") {
      pushField();
      pushRow();
      line++;
      i++;
      continue;
    }

    if (c === "\n" || c === "\r") {
      pushField();
      pushRow();
      line++;
      continue;
    }

    field += c;
  }

  // Trailing field (no terminating newline).
  if (field.length > 0 || row.length > 0 || rowStarted) {
    pushField();
    pushRow();
  }

  return records;
}

/** Map normalised camelCase header \u2192 column index. Case-insensitive. */
function buildHeaderMap(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < header.length; i++) {
    const key = normaliseHeader(header[i]);
    if (!key) continue;
    const canonical = ALL_COLUMNS.find((c) => c.toLowerCase() === key);
    if (canonical && !map.has(canonical)) {
      map.set(canonical, i);
    }
  }
  return map;
}

/**
 * Lowercase + strip non-alphanumerics so `Business Name`, `business_name`,
 * `business-name`, and `BUSINESSNAME` all collapse to `businessname`.
 */
function normaliseHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseRow(
  fields: string[],
  line: number,
  headerMap: Map<string, number>,
): { row?: ProspectRow; error?: ImportError } {
  const get = (col: string): string | null => {
    const idx = headerMap.get(col);
    if (idx == null) return null;
    const value = fields[idx]?.trim();
    return value && value.length > 0 ? value : null;
  };

  const businessName = get("businessName");
  if (!businessName) {
    return {
      error: { line, column: "businessName", message: "businessName is required" },
    };
  }

  const phoneRaw = get("phone");
  const phone = phoneRaw ? validatePhone(phoneRaw) : null;
  if (phoneRaw && phone === null) {
    return {
      error: {
        line,
        column: "phone",
        message: `Invalid phone: "${phoneRaw}" (need at least 7 digits)`,
      },
    };
  }

  const websiteRaw = get("website");
  const website = websiteRaw ? normaliseWebsite(websiteRaw) : null;
  if (websiteRaw && website === null) {
    return {
      error: {
        line,
        column: "website",
        message: `Invalid website URL: "${websiteRaw}"`,
      },
    };
  }

  return {
    row: {
      businessName,
      website,
      phone,
      address: get("address"),
      city: get("city"),
      state: get("state"),
      country: get("country"),
      industry: get("industry"),
      googlePlaceId: get("googlePlaceId"),
      notes: get("notes"),
    },
  };
}

/**
 * Loose phone validation. We don't fully normalise to E.164 here — that's
 * a job for a downstream library. We just confirm the input is plausibly a
 * phone number (\u2265 7 digits) and return the trimmed string for storage.
 */
function validatePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return raw.trim();
}

/**
 * Loose URL validation. Adds `https://` if no protocol present, then runs it
 * through `new URL()` to confirm it parses. Rejects anything that doesn't
 * have at least one dot in the hostname (foo.com, sub.foo.com).
 */
function normaliseWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
