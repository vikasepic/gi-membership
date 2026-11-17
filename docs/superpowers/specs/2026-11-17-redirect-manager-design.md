# Redirect manager (17 Nov 2026)

The owner wants to send any address on Grow anywhere, managed from the admin, "like WP Engine have for the redirection, all the options, values and variables". Every rule starts from an address on grow.greaterinside.com; the destination can be any link.

## Why

On 17 Nov the owner asked to redirect both Foundations Weekend sales pages to https://greaterinside.com. Grow could not: its redirects (Settings › Redirects, `lib/redirects.ts`) fire only when an address would otherwise show "page not found" (`app/not-found.tsx`). The offers had to be switched off first, which also closed their checkout, and even then the redirect happens in the browser after the page starts loading (status 200 with Next's in-page redirect), not as a server redirect.

## What exists today

- Rules live in the store settings blob, `stores.settings.redirects`: `{ from, to, permanent }`, at most 500, first match wins, edited in `components/admin/redirect-fields.tsx`, saved through the Redirects settings group.
- `normalizePath` compares paths with a leading slash, no trailing slash, no query, lower case. A full URL pasted into From keeps only its path.
- A rule pointing at its own path is skipped.
- Live today: two temporary rules, `/o/foundation-weekend` and `/o/foundations-weekend-mindvalley` to `https://greaterinside.com`. They must keep working.

## Approaches considered

- **A. Check the rules on every request, in `proxy.ts`, before the page renders (picked by the owner).** Works on live pages, sends a real 301/302 from the server, and carries every option below. The rules are cached in memory so a normal page pays almost nothing.
- **B. Keep checking only at "page not found" and add the options.** Smaller, but a live page still needs its offer switched off first: the exact limit the owner hit.
- **C. Next.js `redirects` in the build config.** Every change would need a deploy; not manageable from the admin. Dropped.

## Goals

Each rule has (WP Engine's Redirect Rules form, minus what Grow doesn't need):

- **Name** (optional), shown in the list.
- **From**: an address on Grow. Two kinds:
  - **Exact** (default): today's behaviour, compared with `normalizePath`.
  - **Pattern**: a regular expression, WP Engine style (`^/blog/(.*)$`), matched case-insensitively against the path with a leading slash and no trailing slash or query, **keeping the visitor's letter case**, so `$1` carries `My-Post`, not `my-post`. *(My call: a destination's own paths may be case-sensitive.)*
- **To**: a path on Grow or any full `https://` / `http://` URL. With a Pattern, `$1` to `$9` insert the captured groups.
- **Type**: 301 Permanent or 302 Temporary. Existing rules map `permanent: true` to 301 and `false` to 302.
- **Query string**: Keep (default) or Drop. Keep passes the visitor's query (UTM tags, `fbclid`) on to the destination, merged with any query the destination already has; the destination's own value wins on a clash. *(My call: Keep is the default because ad and email links carry tracking tags, and WP Engine also carries them by default.)*
- **On/off** per rule, so a campaign rule can be paused without deleting it.
- **Order**: first match wins, top to bottom, with move up/down as today.
- **Test an address**: a box on the Redirects screen where the owner types an address and sees which rule catches it and the exact URL it would go to. Unsaved edits are tested too.

Behaviour:

- Runs in `proxy.ts` for every page the proxy already sees, on GET and HEAD only.
- A redirect from the server: `301` or `302` with a `Location`. A same-site destination is sent as a relative path (AGENTS.md: behind the proxy `req.url` is the container's address).
- Rules are read from settings and cached in the process. Saving the Redirects group clears the cache. If clearing can't reach the proxy's process, the cache expires within 30 seconds. *(My call.)*
- If the rules can't be read, nothing is redirected and the page loads normally. A redirect failure must never take a page down.
- `app/not-found.tsx` stops checking redirects; the proxy covers missing addresses too.
- **`?preview=1` is never redirected**, so the page editors can still preview a page that has a rule on it. *(My call: the editors preview through the real address. A visitor who adds `?preview=1` sees the live page, which is public anyway.)*
- **A redirect keeps attribution:** the `gi_anon` and `gi_utm` cookies the proxy sets are set on the redirect response too, so a campaign that lands on a redirected address still credits the sale. The redirected page records no visit of its own, because it never loads. *(My call.)*

## Must not happen (guard rails)

- **No rule can catch these, whatever it says:** `/admin`, `/login`, `/logout`, `/auth`, `/reset` (the password-reset link), `/api` (including Stripe's webhook), `/checkout`, `/checkout-preview`, `/oto-preview`, `/course-preview`, `/account`, `/library` and `/apps` (members' purchases; owner, 17 Nov: "protect them"), `/email`, `/_next`, `robots.txt`, `sitemap.xml`, the manifest, `llms.txt`, the app icon, and static files. The save refuses an Exact rule for one of them and says why. A Pattern that could match one is still allowed, but those addresses are skipped before matching. *(My call: one wrong pattern must never lock the owner out of the admin or stop payments.)*
- **No loops, as far as can be known on save:** the save follows each rule's destination through the list (a Pattern's destination is tried with the `$n` it would produce for a sample of its own match) and refuses one that comes back to where it started, with the chain shown. This is best effort: a pattern can loop only for some addresses, which no check can rule out in general. At request time a destination equal to the address being visited is skipped, and the test box shows the whole chain for any address the owner types. *(My call, after the review: the first draft promised more than can be checked.)*
- **A bad pattern can't save:** an invalid regular expression, or one that takes too long, is refused on save. Patterns are capped at 300 characters. *(Builder: pick the guard against catastrophic backtracking.)*
- A destination must be a path starting with `/` or an `http(s)://` URL. `javascript:` and other schemes are refused.
- The two live Foundations Weekend rules keep working through the change.

## Non-goals

- WP Engine's "Break" (serving another page without changing the address).
- Conditions on country, header or cookie (WP Engine's newer Web Rules Engine).
- A domain field: Grow serves one domain.
- Counting how often each rule is used. It would mean a write on every redirect.
- Redirecting POST requests or anything under the guard rail list.
- Bulk import from a CSV. Can come later if the owner moves a WordPress site's redirects across.

## Constraints

- No migration: the rules stay in `stores.settings.redirects`, read through the existing settings schema (`lib/settings-schema.ts`), so old rules load with defaults for the new fields.
- `proxy.ts` already calls Supabase for the session on every request; the redirect check must add no network call on a cache hit.
- Rule cap stays 500.
- The 1000-row PostgREST cap does not apply (one settings row).
- Copy follows the house style: plain words, no em dashes.

## Left to the builder

- Exact layout of the rule rows and the test box, within the existing settings screen's style.
- How the cache is cleared from the save action and how the 30-second expiry is kept.
- The regex safety guard.
