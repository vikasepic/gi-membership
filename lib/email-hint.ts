// Catching the email typos that actually happen, before they cost a delivery.
//
// A wrong address on a checkout is the most expensive mistake available there:
// the receipt, the access link and every later email go to nobody, and the
// buyer's first contact with support is "I paid and got nothing".
//
// Deliberately a suggestion, never a block. Real addresses live on domains no
// list will ever contain, and refusing an address we merely find unfamiliar
// would turn a guess into a lost sale.

/** The domains people mean. Kept short — these cover almost every real typo. */
const COMMON_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
  "rediffmail.com",
];

/** Wrong top-level domains that are always a slip, never a real address. */
const TLD_FIXES: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "hotmail.co": "hotmail.com",
  "outlook.co": "outlook.com",
  "yahoo.co": "yahoo.com",
  "icloud.co": "icloud.com",
};

/**
 * Damerau-Levenshtein: insert, delete, substitute, or swap two adjacent
 * characters, each costing one.
 *
 * The transposition case is the whole reason. "gmial.com" is the single most
 * common email typo there is, and plain Levenshtein scores it 2 — the same as
 * a genuinely different domain — so a one-slip threshold would miss precisely
 * the mistake worth catching.
 */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const d: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Shape check. Intentionally permissive: this rejects what cannot be an
 * address, not what looks unusual. `user@localhost`, plus-addressing and long
 * new TLDs are all real.
 */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 6 || v.length > 254) return false;
  if ((v.match(/@/g) ?? []).length !== 1) return false;
  const [local, domain] = v.split("@");
  if (!local || !domain) return false;
  if (v.includes(" ")) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  // A trailing single-letter TLD is a truncation, e.g. "jane@gmail.c".
  const tld = domain.split(".").pop() ?? "";
  return tld.length >= 2;
}

/**
 * The address they probably meant, or null if it looks fine.
 * Only suggests when one edit away from a domain people actually use — two
 * edits starts guessing at real addresses.
 */
export function suggestEmail(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!looksLikeEmail(v)) return null;
  const at = v.lastIndexOf("@");
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);

  if (TLD_FIXES[domain]) return `${local}@${TLD_FIXES[domain]}`;
  if (COMMON_DOMAINS.includes(domain)) return null;

  for (const candidate of COMMON_DOMAINS) {
    if (editDistance(domain, candidate) === 1) return `${local}@${candidate}`;
  }
  return null;
}
