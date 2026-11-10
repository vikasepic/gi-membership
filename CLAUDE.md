## Project card (read before touching repo or server)
- Repo: vikasepic/gi-membership (GitHub account: vikasepic). Branch `main` in this folder.
- Git login: pinned to `vikasepic` in this repo's own git config (2026-11-02), so it works whichever `gh` account is active. Never change the remote or switch accounts to make a push work.
- Deploys to: Coolify on KVM-8 (`187.127.154.67`, panel `coolify.gowithepic.com`), app `gi-membership` uuid `r11f09w16h8afmpt0ilxey2q`; a push to `main` auto-deploys via GitHub webhook 657468091. Announce before every push (see AGENTS.md). Migrations are applied by hand, before the push that needs them.
- Live URL: https://grow.greaterinside.com
- Database/services: self-hosted Supabase stack on KVM-8 (Coolify service `fuv6argrk5j8ogd4y3hi5tu0`, API `https://grow-api.greaterinside.com`); Stripe; Resend; daily DB backup cron 05:00 UTC.
- Credentials: see ~/Documents/Projects/KVM8-CREDENTIALS.md, "gi-membership" heading (pointer only, no secrets here). The domain also appears in ~/Documents/Projects/FUNNEL-APP-CREDENTIALS.md and ~/Documents/Projects/BOOK-WRITER-CREDENTIALS.md.
- Related folders: /Users/apple/Documents/Ajit Projects/gi-membership-templates and /Users/apple/Documents/Ajit Projects/gi-membership-visits (git worktrees of this repo; never run `npm install`, node_modules is shared), /Users/apple/Documents/Ajit Projects/Content Machine (Content Engine app on the same box)
- Vault: ~/claude-brain/projects/-Users-apple-Documents-Ajit-Projects-grow-membership/CONTEXT.md (read it at session start)
- If anything above says UNKNOWN: stop and ask Vikas before deploying, pushing, or touching a server.
- After each work session: run /wrap (updates this Work log, the vault and graphify).

## Work log (newest first, one line per session)
- 2026-11-10 Course Access tab, Subscriptions page (Trials+Renewals folded in), View as on every page, and admin "Change email" in place everywhere (34ab10b, 0099 applied by hand): login, store rows, all three apps, Stripe, AC, notice to both addresses; Lisa Gu moved to lisa@renucoaching.ca incl. orders; Funnel App + Book Writer endpoints verified live 10 Nov; pending: spec doc edit uncommitted, Lisa's Stripe customer email + AC tag move by hand, keep/revert 993e095 unanswered
- 2026-11-04 An app can ask the store whether an email still has access: POST /api/apps/entitlement/lookup, scoped by the caller's own secret, built on the same union the push uses
- 2026-10-28 Page builder canvas holds a page's pinned blocks so a fixed nav cannot cover Save
- 2026-10-26 Recent buyers popup shipped: purchase rules, settings group, public read, card, per-member hide, privacy policy wording (13 commits)
- 2026-10-23 Errors page stops calling refused Stripe lookups "missing"
- 2026-10-22 Foundations Weekend asks of the shared modules; a chargeback on a renewal finds its order
- 2026-10-21 Safe test purchases, Meta dataset as the receipt, Inter italics, lessons from the Book to Bestseller port (9 commits)
- 2026-10-20 Module tweaks: scrolling shelf, slide evidence, block class/label/direction
- 2026-10-14 Coupon month limits, checkout shows what a code did, refunded product closes its courses
- 2026-10-13 "View as" reaches the built-in apps

@AGENTS.md
