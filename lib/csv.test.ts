import { describe, it, expect } from "vitest";
import { csvCell } from "@/lib/csv";

/**
 * One cell of a downloaded CSV. The files are opened in spreadsheets, and a
 * member's name is whatever they typed at signup.
 */
describe("csvCell", () => {
  it("quotes everything and doubles a quote inside", () => {
    expect(csvCell('The "Big", Bold one')).toBe('"The ""Big"", Bold one"');
    expect(csvCell(12)).toBe('"12"');
  });

  it("is empty for nothing", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it.each(["=HYPERLINK(1)", "+1", "-1+1", "@SUM(A1)"])("makes %s plain text, so a spreadsheet does not run it", (v) => {
    expect(csvCell(v)).toBe(`"'${v}"`);
  });

  it("leaves an ordinary amount and date alone", () => {
    expect(csvCell("27.00")).toBe('"27.00"');
    expect(csvCell("2026-11-18T00:00:00Z")).toBe('"2026-11-18T00:00:00Z"');
  });
});
