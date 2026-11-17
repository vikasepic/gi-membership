# Redirect Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any address on Grow (live or missing, except the protected ones) can be sent anywhere by a rule managed in Settings › Redirects, with WP Engine-style options, as a real 301/302 from the server.

**Architecture:** `lib/redirects.ts` grows into the pure rule engine (schema, protected paths, matching with `$1`–`$9`, query handling, save-time checks, a trace for the test box). `lib/redirect-cache.ts` keeps the rules in process memory for 30 seconds. `proxy.ts` checks them on every GET/HEAD before the page renders; `app/not-found.tsx` stops checking. The settings save refuses bad rules and clears the cache.

**Tech Stack:** Next.js 16 `proxy.ts` (read `node_modules/next/dist/docs/` on proxy/middleware before Task 3), zod, Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-redirect-manager-design.md`

## Global Constraints

- No migration: rules stay in `stores.settings.redirects`, max 500. Old rows `{from, to, permanent}` load with defaults for the new fields.
- `permanent: true` → 301, `false` → 302 (was 308/307).
- Protected, never redirected: `/admin`, `/login`, `/logout`, `/auth`, `/reset`, `/api`, `/checkout`, `/checkout-preview`, `/oto-preview`, `/course-preview`, `/account`, `/library`, `/apps`, `/email`, `/_next`, `/app-icon` (each with everything under it), and exactly `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/llms.txt`, `/favicon.ico`, `/icon.png`. Prefix match on a segment boundary (`/apps` protects `/apps/x`, not `/appsy`). Case-insensitive.
- Never redirected: a request that is not GET/HEAD, or whose query has `preview=1`.
- Pattern: max 300 characters, compiled with the `i` flag, matched against the path with a leading slash and no trailing slash, **original case kept**.
- Destination: starts with `/` or `http://` / `https://`; anything else is refused on save.
- Query "keep": the visitor's query is merged into the destination's; the destination's own value wins on a clash; Next's `_rsc` is never passed on.
- A same-site destination goes out as a relative `Location` (AGENTS.md: behind the proxy `req.url` is the container).
- Cache TTL 30 seconds; a failed read is cached as no rules for 5 seconds; nothing in the redirect path may throw.
- Hint and error copy: plain words, no em dashes.
- The two live rules (`/o/foundation-weekend`, `/o/foundations-weekend-mindvalley` → `https://greaterinside.com`, temporary) keep working.

## Review Focus

1. **Owner saves a broad pattern like `^/(.*)$` → `https://greaterinside.com`:** every unprotected page goes, but admin, login, checkout, account, library, apps and Stripe's webhook still load. Test in Task 1 (`isProtectedPath` + `matchRedirect` with that rule) and Task 3 (proxy passes `/admin` and `/checkout` through).
2. **Ad link `?utm_source=meta&fbclid=…` hits a redirected offer page:** the destination receives the tags (Keep) and the `gi_utm` cookie is still set on the redirect. Test in Task 1 (query merge) and Task 3 (cookie on the 30x).
3. **Settings row unreadable or a stored pattern no longer compiles:** the page loads normally, no 500. Test in Task 2 (loader failure → `[]`) and Task 1 (an uncompilable stored pattern is skipped, not thrown).
4. **Rule edited in the admin:** the next request sees it (cache cleared on save) and a different process sees it within 30 s. Test in Task 2 (clear + TTL) and Task 4 (save calls `clearRedirectCache`).
5. **Owner's page-editor preview of a redirected page (`?preview=1`):** shows the page, not the redirect. Test in Task 3.

---

### Task 1: The rule engine

**Files:**
- Modify: `lib/redirects.ts`
- Test: `lib/redirects.test.ts` (keep the normalising tests; replace "which rule wins" and "where they are checked" with the cases below)

**Interfaces:**
- Produces:
  - `redirectSchema` with `name: string ("")`, `from`, `to`, `match: "exact" | "pattern" ("exact")`, `permanent: boolean (true)`, `query: "keep" | "drop" ("keep")`, `enabled: boolean (true)`; `redirectsSchema` (array, max 500); `type StoreRedirect`.
  - `normalizePath(raw: string): string` (unchanged).
  - `isProtectedPath(pathname: string): boolean`
  - `matchRedirect(rules: StoreRedirect[], pathname: string, search?: string): { location: string; status: 301 | 302; ruleIndex: number } | null`
  - `type RuleProblem = { index: number; message: string }`; `validateRules(rules: StoreRedirect[]): RuleProblem[]`
  - `type TraceStep = { ruleIndex: number; location: string; status: 301 | 302 }`; `traceRedirect(rules: StoreRedirect[], address: string, maxHops?: number): { steps: TraceStep[]; protectedPath: boolean; loop: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
const r = (o: Partial<StoreRedirect>): StoreRedirect => redirectSchema.parse({ to: "https://greaterinside.com", ...o });

it("reads an old rule with today's defaults", () => {
  expect(redirectSchema.parse({ from: "/a", to: "/b", permanent: false }))
    .toEqual({ name: "", from: "/a", to: "/b", match: "exact", permanent: false, query: "keep", enabled: true });
});
it("protects the admin, checkout and members' areas on a segment boundary", () => {
  for (const p of ["/admin", "/Admin/members", "/checkout", "/checkout-preview", "/account", "/library/x", "/apps", "/reset", "/api/webhooks/stripe", "/robots.txt", "/_next/data"]) expect(isProtectedPath(p)).toBe(true);
  for (const p of ["/", "/o/foundation-weekend", "/appsy", "/libraryx", "/p/guide"]) expect(isProtectedPath(p)).toBe(false);
});
it("an exact rule matches however the address was typed, 301 by default, 302 when temporary", () => {
  expect(matchRedirect([r({ from: "/o/Old/" })], "/o/old")).toEqual({ location: "https://greaterinside.com/", status: 301, ruleIndex: 0 });
  expect(matchRedirect([r({ from: "/o/old", permanent: false })], "/o/old")?.status).toBe(302);
});
it("a pattern reuses its captures with the visitor's letter case", () => {
  expect(matchRedirect([r({ match: "pattern", from: "^/blog/(.*)$", to: "https://x.test/news/$1" })], "/blog/My-Post/")?.location)
    .toBe("https://x.test/news/My-Post");
});
it("keeps the visitor's query by default, the destination's own value winning, and never passes _rsc", () => {
  expect(matchRedirect([r({ from: "/a", to: "https://x.test/b?utm_source=site" })], "/a", "?utm_source=meta&fbclid=9&_rsc=abc")?.location)
    .toBe("https://x.test/b?utm_source=site&fbclid=9");
  expect(matchRedirect([r({ from: "/a", to: "/b", query: "drop" })], "/a", "?utm_source=meta")?.location).toBe("/b");
});
it("skips switched-off rules, half-typed rules, self-loops and stored patterns that no longer compile", () => {
  expect(matchRedirect([r({ from: "/a", enabled: false }), r({ from: "/a", to: "/b" })], "/a")?.ruleIndex).toBe(1);
  expect(matchRedirect([r({ from: "", to: "/b" }), r({ from: "/a", to: "/a/" }), r({ match: "pattern", from: "(" })], "/a")).toBeNull();
});
it("first match wins", () => {
  expect(matchRedirect([r({ from: "/a", to: "/one" }), r({ match: "pattern", from: "^/(.*)$", to: "/two" })], "/a")?.location).toBe("/one");
});
it("never matches a protected address, even with a pattern that would", () => {
  expect(matchRedirect([r({ match: "pattern", from: "^/(.*)$" })], "/admin")).toBeNull();
  expect(matchRedirect([r({ match: "pattern", from: "^/(.*)$" })], "/o/x")).not.toBeNull();
});
it("refuses on save: a protected exact address, a bad scheme, a bad or slow or long pattern, and a loop", () => {
  const msgs = (rules: StoreRedirect[]) => validateRules(rules).map((p) => p.index);
  expect(msgs([r({ from: "/checkout" })])).toEqual([0]);
  expect(msgs([r({ from: "/a", to: "javascript:alert(1)" })])).toEqual([0]);
  expect(msgs([r({ match: "pattern", from: "(" })])).toEqual([0]);
  expect(msgs([r({ match: "pattern", from: "^/(a+)+$" })])).toEqual([0]);
  expect(msgs([r({ match: "pattern", from: "^/" + "a".repeat(300) })])).toEqual([0]);
  expect(msgs([r({ from: "/a", to: "/b" }), r({ from: "/b", to: "/a" })])).toEqual([0, 1]);
  expect(msgs([r({ match: "pattern", from: "^/(.*)$", to: "/new/$1" })])).toEqual([0]);
  expect(msgs([r({ match: "pattern", from: "^/old/(.*)$", to: "/new/$1" }), r({ from: "/x", to: "https://greaterinside.com" })])).toEqual([]);
});
it("traces an address through every rule it meets", () => {
  const rules = [r({ from: "/a", to: "/b" }), r({ from: "/b", to: "https://greaterinside.com" })];
  expect(traceRedirect(rules, "/a")).toEqual({ steps: [
    { ruleIndex: 0, location: "/b", status: 301 },
    { ruleIndex: 1, location: "https://greaterinside.com/", status: 301 },
  ], protectedPath: false, loop: false });
  expect(traceRedirect(rules, "https://grow.greaterinside.com/admin").protectedPath).toBe(true);
  expect(traceRedirect([r({ from: "/a", to: "/b" }), r({ from: "/b", to: "/a" })], "/a").loop).toBe(true);
});
```

- [ ] **Step 2: Run, confirm they fail**

Run: `npx vitest run lib/redirects.test.ts`
Expected: FAIL (`isProtectedPath`, `validateRules`, `traceRedirect` not exported; new fields missing).

- [ ] **Step 3: Implement in `lib/redirects.ts`**

Decisions the tests leave open:
- Slow-pattern guard: refuse a nested quantifier, a group containing `+`, `*` or `{` that is itself followed by `+`, `*` or `{` (regex `/\([^)]*[+*{][^)]*\)[+*{]/`). Match only against paths of at most 1024 characters.
- Save-time loop check: for each enabled complete rule, start from its own exact `from` (for a pattern, its `to` with every `$n` replaced by `x`, followed from there) and run `traceRedirect` with `maxHops` 10. Refuse every rule on a chain that repeats a path or comes back to its start. External destinations end a chain.
- Messages (exact copy): protected `That address is part of the admin, checkout or members' area, so it can't be redirected.`; scheme `Send it to a path starting with / or a full https:// address.`; bad pattern `That pattern isn't valid: <reason>.`; slow `That pattern could slow every page down. Avoid a repeated group like (a+)+.`; long `Keep a pattern under 300 characters.`; loop `These rules send visitors in a circle: <path> → <path> → …`.
- `new URL(location, "https://grow.local")` for the query merge; strip the fake origin back off for a same-site destination.

- [ ] **Step 4: Run, confirm they pass**

Run: `npx vitest run lib/redirects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/redirects.ts lib/redirects.test.ts
git commit -m "Redirects: patterns, query handling, protected paths and save checks"
```

### Task 2: The rules, cached in the process

**Files:**
- Create: `lib/redirect-cache.ts`, `lib/redirect-cache.test.ts`
- Modify: `lib/store.ts` (export `STORE_SLUG`)

**Interfaces:**
- Consumes: `redirectsSchema`, `StoreRedirect` (Task 1).
- Produces: `cachedRedirectRules(load?: () => Promise<StoreRedirect[]>, now?: number): Promise<StoreRedirect[]>`; `clearRedirectCache(): void`; `loadRedirectRules(): Promise<StoreRedirect[]>` (service client, `stores` by `slug = STORE_SLUG`, `settings->redirects`, parsed with `redirectsSchema`).

- [ ] **Step 1: Tests**

```ts
it("loads once and serves from memory for 30 seconds", async () => { /* load called once at t=0 and t=29_999, twice at t=30_000 */ });
it("serves no rules for 5 seconds when the read fails, and never throws", async () => { /* load rejects -> [] ; called again at t=5_000 */ });
it("loads afresh after clearRedirectCache", async () => { /* ... */ });
it("parses stored rules, filling the new fields", async () => { /* loadRedirectRules with mocked service client returning [{from,to,permanent:false}] -> query "keep", enabled true */ });
```

- [ ] **Step 2: Run, confirm failure**

Run: `npx vitest run lib/redirect-cache.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement** (module-level `{ rules, until }`; concurrent first requests may each load once, acceptable).

- [ ] **Step 4: Run, confirm pass**, same command, PASS.

- [ ] **Step 5: Commit** `git commit -m "Redirect rules cached in the process for 30 seconds"`

### Task 3: Redirect in the proxy, not at the 404

**Files:**
- Modify: `proxy.ts`, `app/not-found.tsx` (remove `sendAnywhereItShould` and its imports)
- Test: `lib/proxy-redirect.test.ts` (new; mock `@/lib/redirect-cache` and `@supabase/ssr`, call `proxy(new NextRequest(url, { method }))`), and update `lib/redirects.test.ts`'s "where they are checked" source assertions to the new home

**Interfaces:**
- Consumes: `matchRedirect`, `isProtectedPath` (Task 1), `cachedRedirectRules` (Task 2), `applyAttributionCookie` (existing).

- [ ] **Step 1: Tests**

```ts
it("redirects a live address with the rule's status and a relative Location for a same-site destination", async () => { /* rule /o/x -> /p/y, 301; res.status 301, location "/p/y" */ });
it("sends an external destination as is, with the visitor's query", async () => { /* /o/fw?utm_source=meta -> 302 https://greaterinside.com/?utm_source=meta */ });
it("sets the anon and campaign cookies on the redirect", async () => { /* set-cookie contains gi_anon and gi_utm */ });
it.each(["/admin", "/checkout", "/account", "/api/webhooks/stripe"])("lets %s through under a catch-all rule", async (p) => { /* no 30x */ });
it("never redirects ?preview=1 or a POST", async () => { /* ... */ });
it("loads the page normally when the rules can't be read", async () => { /* cachedRedirectRules resolves [] -> no 30x */ });
// in lib/redirects.test.ts:
it("runs in the proxy and no longer at the 404 boundary", () => {
  expect(readFileSync("proxy.ts", "utf8")).toContain("matchRedirect");
  expect(readFileSync("app/not-found.tsx", "utf8")).not.toContain("matchRedirect");
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npx vitest run lib/proxy-redirect.test.ts lib/redirects.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `proxy`, after `anon` is resolved and before the Supabase session call: if GET/HEAD, no `preview=1`, not protected, and `matchRedirect(await cachedRedirectRules(), pathname, search)` hits, return `new NextResponse(null, { status, headers: { Location: location } })` with the `gi_anon` cookie (when new) and `applyAttributionCookie(req, res)`. Wrap the lookup so any throw falls through to the normal response.

- [ ] **Step 4: Run, confirm pass**, same command, PASS.

- [ ] **Step 5: Commit** `git commit -m "Redirects run in the proxy, on live pages, before the page renders"`

### Task 4: The Redirects settings screen

**Files:**
- Modify: `components/admin/redirect-fields.tsx`, `app/admin/settings/actions.ts`
- Test: `components/admin/redirect-fields.test.tsx` (new), `app/admin/settings/save-group.test.ts` (add cases)

**Interfaces:**
- Consumes: `StoreRedirect`, `validateRules`, `traceRedirect`, `normalizePath` (Task 1), `clearRedirectCache` (Task 2).

- [ ] **Step 1: Tests**

```tsx
it("shows name, from, match, to, type, query and on/off per rule, and posts them", () => { /* hidden input JSON carries all seven fields */ });
it("shows a save problem under its rule as it is typed", () => { /* from "/checkout" -> the protected message under rule 1 */ });
it("tests an address against the unsaved rules and shows the chain", () => { /* type "/a" -> "Rule 1 → /b → Rule 2 → https://greaterinside.com/" ; "/admin" -> "Never redirected: admin, checkout or members' area." ; "/zzz" -> "No rule catches this address." */ });
// save-group.test.ts
it("refuses to save redirects with a problem, naming the rule", async () => { /* error "Rule 2: That address is part of…" , saveSettings not called */ });
it("clears the redirect cache after a good save", async () => { /* clearRedirectCache called once */ });
```

- [ ] **Step 2: Run, confirm failure**

Run: `npx vitest run components/admin/redirect-fields.test.tsx app/admin/settings/save-group.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Rule row: Name (optional), From with an Exact / Pattern select, To, Type select (301 Permanent / 302 Temporary), Query select (Keep / Drop), On checkbox, move up/down, remove. Under the list, "Test an address" input and its result line. The save action runs `validateRules` on complete rules and returns the first problem as `Rule <n>: <message>` without saving; after a save it calls `clearRedirectCache()`.

- [ ] **Step 4: Run tests, then look at it.** Same command, PASS. Then on the local dev server, `/admin/settings?group=redirects` (or wherever the group opens): add `^/blog/(.*)$` → `https://x.test/$1`, test `/blog/My-Post`, save; screenshot for the owner.

- [ ] **Step 5: Commit** `git commit -m "Settings › Redirects: every option, save checks and an address test"`

### Task 5: Ship

- [ ] **Step 1:** Full suite, exit status gated, locally and CI-style with `.env.local` moved to the scratchpad. `npx vitest run --exclude 'tmp-*/**'; echo "exit $?"` → `exit 0` both ways. `npx tsc --noEmit` clean outside `tmp-*`.
- [ ] **Step 2:** With the owner's go-ahead: 60-second deploy notice, wait, push (main also carries the unpushed 6bd6b82). `gh run list --branch main --limit 1` until green.
- [ ] **Step 3:** Live check: `curl -sI https://grow.greaterinside.com/o/foundation-weekend` → `302` with `location: https://greaterinside.com/`; same for the Mindvalley page; `/admin` and `/checkout` unaffected.
