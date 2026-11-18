-- Read-only access to the admin's report pages (18 Nov 2026).
--
-- The ads team needs to look at Journeys, Transactions, Members, Traffic and
-- Attribution without being able to refund, grant or change anything. A
-- column of its own rather than a second value of is_admin: every guard that
-- lets something be changed reads is_admin (lib/admin-guard.ts), and a viewer
-- must never pass one of those by accident of a shared flag.
--
-- Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
alter table users add column if not exists is_viewer boolean not null default false;

comment on column users.is_viewer is
  'Read-only access to the admin''s report pages. Set by an admin on the person page. is_admin and ADMIN_EMAILS win.';

notify pgrst, 'reload schema';
