import { describe, it, expect } from "vitest";
import { parseProspectCsv } from "../csv-parser";

describe("parseProspectCsv", () => {
  it("parses a happy-path CSV with all columns", () => {
    const csv = [
      "businessName,website,phone,address,city,state,country,industry,googlePlaceId,notes",
      "Acme Co,acme.com,+61 2 1234 5678,1 Pitt St,Sydney,NSW,AU,Plumbing,abc123,Top of list",
      "Bravo Pty Ltd,https://bravo.test,(03) 9876 5432,5 Bourke St,Melbourne,VIC,AU,Cafe,,",
    ].join("\n");

    const { rows, errors } = parseProspectCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      businessName: "Acme Co",
      website: "https://acme.com/",
      phone: "+61 2 1234 5678",
      address: "1 Pitt St",
      city: "Sydney",
      state: "NSW",
      country: "AU",
      industry: "Plumbing",
      googlePlaceId: "abc123",
      notes: "Top of list",
    });
    expect(rows[1].businessName).toBe("Bravo Pty Ltd");
    expect(rows[1].website).toBe("https://bravo.test/");
    expect(rows[1].googlePlaceId).toBeNull();
    expect(rows[1].notes).toBeNull();
  });

  it("reports a fatal error when the required column is missing", () => {
    const csv = ["website,phone", "acme.com,+61 2 1234 5678"].join("\n");

    const { rows, errors } = parseProspectCsv(csv);

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      column: "businessName",
      message: expect.stringContaining("businessName"),
    });
  });

  it("matches headers case-insensitively and ignores separators", () => {
    const csv = [
      "Business Name,Website,PHONE,GooglePlaceID",
      "Acme Co,acme.com,+61299990000,xyz",
    ].join("\n");

    const { rows, errors } = parseProspectCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].businessName).toBe("Acme Co");
    expect(rows[0].website).toBe("https://acme.com/");
    expect(rows[0].phone).toBe("+61299990000");
    expect(rows[0].googlePlaceId).toBe("xyz");
  });

  it("collects per-row errors without failing the whole import", () => {
    const csv = [
      "businessName,website,phone",
      "Good Co,good.example,+61299990000",
      ",bad-row-no-name,+61299990000",
      "Phone Bad Co,ok.example,12",
      "Url Bad Co,not a url,+61299990000",
      "Trim Me  , another.example , +61299990001",
    ].join("\n");

    const { rows, errors } = parseProspectCsv(csv);

    // Three good rows: Good Co, "Trim Me", plus the row that survives despite
    // weird inputs none. Phone Bad Co fails on phone, Url Bad Co fails on url,
    // missing name row fails on businessName.
    expect(rows.map((r) => r.businessName)).toEqual(["Good Co", "Trim Me"]);
    expect(errors).toHaveLength(3);

    const errorColumns = errors.map((e) => e.column);
    expect(errorColumns).toContain("businessName");
    expect(errorColumns).toContain("phone");
    expect(errorColumns).toContain("website");

    // Line numbers are 1-based, header is line 1.
    const missingName = errors.find((e) => e.column === "businessName");
    expect(missingName?.line).toBe(3);
  });

  it("skips fully-empty rows and trims whitespace from values", () => {
    const csv = ["businessName,city", "Acme,  Sydney  ", "", "   ", "Bravo,Melbourne"].join("\n");

    const { rows, errors } = parseProspectCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ businessName: "Acme", city: "Sydney" });
    expect(rows[1]).toMatchObject({ businessName: "Bravo", city: "Melbourne" });
  });

  it("handles quoted fields with commas, embedded newlines, and escaped quotes", () => {
    const csv = [
      "businessName,address,notes",
      '"O\'Hare, Inc.","123 Main St, Suite 4","Line one\nLine two"',
      '"Quote Co","1 King St","She said ""hi"""',
    ].join("\n");

    const { rows, errors } = parseProspectCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0].businessName).toBe("O'Hare, Inc.");
    expect(rows[0].address).toBe("123 Main St, Suite 4");
    expect(rows[0].notes).toBe("Line one\nLine two");
    expect(rows[1].notes).toBe('She said "hi"');
  });

  it("returns an error for empty input", () => {
    expect(parseProspectCsv("").errors).toHaveLength(1);
    expect(parseProspectCsv("   ").errors).toHaveLength(1);
  });

  it("returns an error when only a header is present", () => {
    const csv = "businessName,website\n";
    const { rows, errors } = parseProspectCsv(csv);

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/no data/i);
  });
});
