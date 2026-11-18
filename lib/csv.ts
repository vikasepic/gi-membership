/**
 * One cell of a downloaded CSV, quoted.
 *
 * These files are opened in spreadsheets, and a member's name is whatever
 * they typed at signup: a cell that starts like a formula (= + - @) is given a
 * leading apostrophe so the spreadsheet shows it as text and does not run it.
 * Shared by every admin download since 18 Nov 2026, when the downloads gained
 * a second audience (read-only people).
 */
export function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}
