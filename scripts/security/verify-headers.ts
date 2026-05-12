/**
 * Security Headers Verification Script
 *
 * Tests the current security headers returned by the application.
 * Run against local dev server or production URL.
 *
 * Usage:
 *   bunx tsx scripts/security/verify-headers.ts [url]
 *
 * Default URL: http://localhost:3000
 */

const DEFAULT_URL = "http://localhost:3000";

interface HeaderCheck {
  name: string;
  expected: string | null;
  actual: string | null;
  status: "pass" | "fail" | "warn" | "info";
  notes: string;
}

const REQUIRED_HEADERS: Array<{
  header: string;
  expected: string;
  description: string;
}> = [
  {
    header: "x-frame-options",
    expected: "DENY",
    description: "Prevents clickjacking by disabling iframe embedding",
  },
  {
    header: "x-content-type-options",
    expected: "nosniff",
    description: "Prevents MIME type sniffing",
  },
  {
    header: "referrer-policy",
    expected: "strict-origin-when-cross-origin",
    description: "Controls referrer information sent with requests",
  },
  {
    header: "permissions-policy",
    expected: "camera=(), microphone=(), geolocation=()",
    description: "Restricts browser feature access",
  },
  {
    header: "strict-transport-security",
    expected: "max-age=31536000; includeSubDomains; preload",
    description: "Enforces HTTPS connections (HSTS)",
  },
  {
    header: "x-dns-prefetch-control",
    expected: "on",
    description: "Controls DNS prefetching behavior",
  },
];

const CSP_HEADERS = ["content-security-policy", "content-security-policy-report-only"];

const PATHS_TO_CHECK = [
  { path: "/", description: "Homepage (public)" },
  { path: "/about", description: "About page (public)" },
  { path: "/admin/login", description: "Admin login (auth page)" },
  { path: "/api/health", description: "Health API endpoint" },
];

async function checkHeaders(baseUrl: string, path: string): Promise<HeaderCheck[]> {
  const url = `${baseUrl}${path}`;
  const results: HeaderCheck[] = [];

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "SecurityHeadersVerifier/1.0",
      },
    });
  } catch (error) {
    results.push({
      name: "Connection",
      expected: "reachable",
      actual: null,
      status: "fail",
      notes: `Failed to connect to ${url}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return results;
  }

  // Check required headers
  for (const { header, expected, description } of REQUIRED_HEADERS) {
    const actual = response.headers.get(header);

    if (!actual) {
      results.push({
        name: header,
        expected,
        actual: null,
        status: "fail",
        notes: `MISSING - ${description}`,
      });
    } else if (actual.toLowerCase() === expected.toLowerCase()) {
      results.push({
        name: header,
        expected,
        actual,
        status: "pass",
        notes: description,
      });
    } else {
      results.push({
        name: header,
        expected,
        actual,
        status: "warn",
        notes: `Value differs from expected - ${description}`,
      });
    }
  }

  // Check CSP headers
  let cspFound = false;
  for (const cspHeader of CSP_HEADERS) {
    const value = response.headers.get(cspHeader);
    if (value) {
      cspFound = true;
      const isReportOnly = cspHeader === "content-security-policy-report-only";

      results.push({
        name: cspHeader,
        expected: "present",
        actual: value.length > 80 ? value.substring(0, 80) + "..." : value,
        status: isReportOnly ? "warn" : "pass",
        notes: isReportOnly ? "CSP is in report-only mode (not enforcing)" : "CSP is enforcing",
      });

      // Analyze CSP directives
      const directives = value.split(";").map((d) => d.trim());
      const directiveMap = new Map<string, string>();
      for (const d of directives) {
        const parts = d.split(/\s+/);
        if (parts.length >= 1) {
          directiveMap.set(parts[0], parts.slice(1).join(" "));
        }
      }

      // Check for unsafe directives
      if (value.includes("'unsafe-inline'") && !value.includes("'nonce-")) {
        results.push({
          name: "csp:unsafe-inline",
          expected: "absent or with nonce fallback",
          actual: "'unsafe-inline' without nonce",
          status: "fail",
          notes: "unsafe-inline in script-src without nonce defeats CSP purpose",
        });
      }

      if (value.includes("'unsafe-eval'")) {
        results.push({
          name: "csp:unsafe-eval",
          expected: "absent",
          actual: "'unsafe-eval' present",
          status: "fail",
          notes: "unsafe-eval allows arbitrary code execution",
        });
      }

      // Check for nonce-based script loading
      if (value.includes("'nonce-")) {
        results.push({
          name: "csp:nonce",
          expected: "present",
          actual: "nonce-based script loading",
          status: "pass",
          notes: "Scripts require a valid nonce to execute",
        });
      }

      // Check for strict-dynamic
      if (value.includes("'strict-dynamic'")) {
        results.push({
          name: "csp:strict-dynamic",
          expected: "present",
          actual: "'strict-dynamic' enabled",
          status: "pass",
          notes: "Scripts loaded by trusted scripts inherit trust",
        });
      }

      // Check object-src
      if (!directiveMap.has("object-src") || !directiveMap.get("object-src")?.includes("'none'")) {
        results.push({
          name: "csp:object-src",
          expected: "'none'",
          actual: directiveMap.get("object-src") || "not set",
          status: "warn",
          notes: "object-src should be none to prevent plugin-based attacks",
        });
      }

      // Check base-uri
      if (!directiveMap.has("base-uri")) {
        results.push({
          name: "csp:base-uri",
          expected: "'self'",
          actual: "not set",
          status: "warn",
          notes: "base-uri should be set to prevent base tag injection",
        });
      }

      // Check style-src for unsafe-inline
      const styleSrc = directiveMap.get("style-src") || "";
      if (styleSrc.includes("'unsafe-inline'")) {
        results.push({
          name: "csp:style-unsafe-inline",
          expected: "nonce-based or hash-based",
          actual: "'unsafe-inline'",
          status: "info",
          notes: "style-src uses unsafe-inline (common with CSS-in-JS, acceptable tradeoff)",
        });
      }
    }
  }

  if (!cspFound) {
    results.push({
      name: "content-security-policy",
      expected: "present",
      actual: null,
      status: "fail",
      notes: "No CSP header found (neither enforcing nor report-only)",
    });
  }

  // Check for X-Robots-Tag on admin routes
  if (path.startsWith("/admin")) {
    const robotsTag = response.headers.get("x-robots-tag");
    if (robotsTag) {
      results.push({
        name: "x-robots-tag",
        expected: "noindex, nofollow",
        actual: robotsTag,
        status: robotsTag.includes("noindex") ? "pass" : "warn",
        notes: "Admin pages should not be indexed by search engines",
      });
    } else {
      results.push({
        name: "x-robots-tag",
        expected: "noindex, nofollow",
        actual: null,
        status: "warn",
        notes: "Admin pages should have X-Robots-Tag to prevent indexing",
      });
    }
  }

  return results;
}

function printResults(path: string, description: string, results: HeaderCheck[]): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Path: ${path} (${description})`);
  console.log("=".repeat(70));

  const statusSymbols = {
    pass: "[PASS]",
    fail: "[FAIL]",
    warn: "[WARN]",
    info: "[INFO]",
  };

  for (const result of results) {
    const symbol = statusSymbols[result.status];
    console.log(`  ${symbol} ${result.name}`);
    if (result.actual !== null) {
      console.log(`         Value: ${result.actual}`);
    }
    if (result.status !== "pass") {
      console.log(`         Note: ${result.notes}`);
    }
  }
}

function printSummary(allResults: Map<string, HeaderCheck[]>): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log("=".repeat(70));

  let totalPass = 0;
  let totalFail = 0;
  let totalWarn = 0;
  let totalInfo = 0;

  for (const [, results] of allResults) {
    for (const r of results) {
      if (r.status === "pass") totalPass++;
      else if (r.status === "fail") totalFail++;
      else if (r.status === "warn") totalWarn++;
      else if (r.status === "info") totalInfo++;
    }
  }

  console.log(`  Passed:   ${totalPass}`);
  console.log(`  Failed:   ${totalFail}`);
  console.log(`  Warnings: ${totalWarn}`);
  console.log(`  Info:     ${totalInfo}`);
  console.log("");

  if (totalFail > 0) {
    console.log("  RESULT: ISSUES FOUND - Review failed checks above");
  } else if (totalWarn > 0) {
    console.log("  RESULT: ACCEPTABLE - Warnings should be reviewed");
  } else {
    console.log("  RESULT: ALL CHECKS PASSED");
  }
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2] || DEFAULT_URL;

  console.log("Security Headers Verification");
  console.log(`Target: ${baseUrl}`);
  console.log(`Date: ${new Date().toISOString()}`);

  const allResults = new Map<string, HeaderCheck[]>();

  for (const { path, description } of PATHS_TO_CHECK) {
    const results = await checkHeaders(baseUrl, path);
    allResults.set(path, results);
    printResults(path, description, results);
  }

  printSummary(allResults);
}

main().catch(console.error);
