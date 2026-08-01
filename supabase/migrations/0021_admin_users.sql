-- Manageable admins, and a record of who was granted access by hand.
--
-- Admin access was ADMIN_EMAILS alone: an env var, so adding a colleague meant
-- editing Coolify and redeploying, and there was no way to see from inside the
-- app who could refund an order.
--
-- ADMIN_EMAILS stays and still wins. It is the break-glass list: someone who
-- cannot be removed through the UI, so a mistake in this table can never lock
-- everyone out of the admin. This flag is additive on top of it.

alter table users
  add column if not exists is_admin boolean not null default false;

comment on column users.is_admin is
  'Admin granted through the admin UI. ADMIN_EMAILS is the separate, higher break-glass list and is not stored here.';

-- Manual grants need to be told apart from purchases when reading a member's
-- history — a comped subscription and a paid one look identical otherwise.
alter table ownership
  add column if not exists granted_by text;

comment on column ownership.granted_by is
  'Admin email that granted this by hand. Null for anything bought.';

create index if not exists users_admin_idx on users (store_id) where is_admin;
