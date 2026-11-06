-- An admin changes a member's email (docs/superpowers/specs/2026-11-06-change-member-email-design.md).
--
-- The email changes IN PLACE: same user id, same ownership, same everything.
-- One function so the rows that carry the address move together or not at all.
-- The login (auth.users) is changed first by the caller through GoTrue; this
-- moves the store's own rows.
--
-- orders.email moves too. Post-purchase emails (hasPaidOrder), renewals and the
-- purchase summary find a buyer by the order's email, so leaving it behind would
-- end their onboarding emails as "every order refunded". The address they paid
-- with stays on the Stripe payment itself.
--
-- trial_history is COPIED, not moved: both addresses stay marked, so neither can
-- claim the same free trial again.
--
-- Returns the old email. A second call with the same new email is a no-op.

create or replace function change_member_email(p_user_id uuid, p_new text)
returns text
language plpgsql
as $$
declare
  v_store uuid;
  v_old   text;
begin
  select store_id, email into v_store, v_old from users where id = p_user_id for update;
  if not found then
    raise exception 'no such member';
  end if;
  if v_old = p_new then
    return v_old;
  end if;

  -- users_store_id_email_key refuses an address another member already has.
  update users set email = p_new where id = p_user_id;

  update orders set email = p_new where user_id = p_user_id;

  insert into trial_history (store_id, email, grant_key, first_trial_at)
  select store_id, p_new, grant_key, first_trial_at
    from trial_history
   where store_id = v_store and email = v_old
  on conflict (store_id, email, grant_key) do nothing;

  update post_purchase_flows f set email = p_new
   where f.store_id = v_store and f.email = v_old
     and not exists (select 1 from post_purchase_flows g where g.sequence_id = f.sequence_id and g.email = p_new);

  update post_purchase_sends set to_email = p_new
   where store_id = v_store and to_email = v_old and status = 'pending';

  update checkout_leads set email = p_new where store_id = v_store and email = v_old;

  -- Queued retries (an app grant, an AC tag) replay the address they were
  -- queued with. Left alone, one would provision the old address in an app
  -- that has just moved the person, which is the second account this prevents.
  update error_events
     set job_payload = jsonb_set(job_payload, '{email}', to_jsonb(p_new))
   where store_id = v_store and resolved_at is null and job_payload ->> 'email' = v_old;

  return v_old;
end;
$$;

revoke all on function change_member_email(uuid, text) from public, anon, authenticated;
grant execute on function change_member_email(uuid, text) to service_role;

notify pgrst, 'reload schema';
