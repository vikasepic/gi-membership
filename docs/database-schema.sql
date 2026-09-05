--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: bump_page_count(uuid, date, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_page_count(p_store uuid, p_day date, p_path text, p_source text, p_product text) RETURNS void
    LANGUAGE sql
    AS $$
  insert into page_counts (store_id, day, path, source, product, hits)
  values (p_store, p_day, p_path, p_source, p_product, 1)
  on conflict (store_id, day, path, source, product)
  do update set hits = page_counts.hits + 1;
$$;


--
-- Name: course_items_depth_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.course_items_depth_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'course_items: an item cannot be its own parent';
    end if;
    if exists (select 1 from course_items p
               where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'course_items: nesting deeper than chapter > lesson is not allowed';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: move_course_item(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_course_item(p_item uuid, p_new_parent uuid, p_index integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  v_course      uuid;
  v_old_parent  uuid;
  v_ids         uuid[];
  v_at          integer;
  i             integer;
begin
  select course_id, parent_id into v_course, v_old_parent
    from course_items where id = p_item for update;
  if v_course is null then
    raise exception 'move_course_item: item not found';
  end if;

  -- Two levels, and the trigger from 0003 enforces it on write anyway. Saying
  -- so here means the caller gets a reason rather than a constraint error.
  if v_old_parent is null and p_new_parent is not null then
    raise exception 'move_course_item: a chapter cannot be nested inside another';
  end if;
  if v_old_parent is not null and p_new_parent is null then
    raise exception 'move_course_item: a lesson has to live in a chapter';
  end if;

  if p_new_parent is not null then
    perform 1 from course_items
      where id = p_new_parent and course_id = v_course and parent_id is null;
    if not found then
      raise exception 'move_course_item: destination is not a chapter of this course';
    end if;
  end if;

  -- Park everything that could move, each at a position nothing else holds.
  --
  -- Negating in place is not enough: source and destination would then share
  -- the same negative range, and the moment the item changes parent it lands
  -- on top of a parked row in its new list. A row number over both lists gives
  -- every affected row a slot of its own, and ordering that row number by the
  -- current position keeps the original order recoverable.
  with affected as (
    select id,
           row_number() over (order by parent_id nulls first, sort_order) as rn
      from course_items
     where course_id = v_course
       and (parent_id is not distinct from v_old_parent
         or parent_id is not distinct from p_new_parent)
  )
  update course_items ci
     set sort_order = -1000000 - a.rn
    from affected a
   where ci.id = a.id;

  update course_items set parent_id = p_new_parent where id = p_item;

  -- The list it came from, closed up behind it.
  if v_old_parent is distinct from p_new_parent then
    select array_agg(id order by sort_order desc) into v_ids
      from course_items
     where course_id = v_course and parent_id is not distinct from v_old_parent;
    for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
      update course_items set sort_order = i - 1 where id = v_ids[i];
    end loop;
  end if;

  -- The list it landed in, with the item at the index asked for.
  select array_agg(id order by sort_order desc) into v_ids
    from course_items
   where course_id = v_course
     and parent_id is not distinct from p_new_parent
     and id <> p_item;
  v_ids := coalesce(v_ids, array[]::uuid[]);

  v_at := greatest(0, least(p_index, array_length(v_ids, 1)));
  v_ids := v_ids[1 : v_at] || p_item || v_ids[v_at + 1 : array_length(v_ids, 1)];

  for i in 1 .. array_length(v_ids, 1) loop
    update course_items set sort_order = i - 1 where id = v_ids[i];
  end loop;
end;
$$;


--
-- Name: FUNCTION move_course_item(p_item uuid, p_new_parent uuid, p_index integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.move_course_item(p_item uuid, p_new_parent uuid, p_index integer) IS 'Move a course item to a position, optionally under a different chapter. One transaction, because sibling order is uniquely indexed and a renumber in separate statements collides with itself.';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: swap_course_item_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.swap_course_item_order(a_id uuid, b_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  a_order integer;
  b_order integer;
begin
  select sort_order into a_order from course_items where id = a_id for update;
  select sort_order into b_order from course_items where id = b_id for update;
  if a_order is null or b_order is null then
    raise exception 'swap_course_item_order: item not found';
  end if;
  update course_items set sort_order = -1 where id = a_id;
  update course_items set sort_order = a_order where id = b_id;
  update course_items set sort_order = b_order where id = a_id;
end;
$$;


--
-- Name: sync_offer_default_price(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_offer_default_price() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  o_id uuid;
  d    offer_prices%rowtype;
begin
  o_id := coalesce(new.offer_id, old.offer_id);
  select * into d from offer_prices
   where offer_id = o_id and archived = false
   order by sort_order, created_at
   limit 1;
  -- No price showing at all: leave the last known one standing. offers.price_cents
  -- is NOT NULL, so writing nulls here would fail the caller's save with an
  -- error naming a table they never touched.
  if not found then
    return null;
  end if;
  -- billing_type and interval move TOGETHER or offers' own inline CHECK
  -- (recurring implies an interval) rejects the write.
  update offers
     set billing_type     = d.billing_type,
         interval         = d.interval,
         interval_count   = d.interval_count,
         trial_days       = d.trial_days,
         price_cents      = d.price_cents,
         compare_at_cents = d.compare_at_cents
   where id = o_id;
  return null;
end
$$;


--
-- Name: sync_product_default_price(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_product_default_price() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  p_id uuid;
  d    product_prices%rowtype;
begin
  p_id := coalesce(new.product_id, old.product_id);
  select * into d from product_prices
   where product_id = p_id and archived = false
   order by sort_order, created_at
   limit 1;
  -- No price showing at all: leave the last known one standing.
  -- products.price_cents is NOT NULL, so writing a null here would fail the
  -- caller's save with an error naming a table they never touched.
  if not found then
    return null;
  end if;
  update products
     set price_cents      = d.price_cents,
         compare_at_cents = d.compare_at_cents
   where id = p_id;
  return null;
end
$$;


--
-- Name: templates_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.templates_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: apps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    base_url text NOT NULL,
    provision_endpoint text DEFAULT '/api/store/provision'::text NOT NULL,
    handoff_endpoint text DEFAULT '/auth/store-handoff'::text NOT NULL,
    shared_secret text NOT NULL,
    entitlement_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    channels text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT apps_channels_known CHECK ((channels <@ ARRAY['instagram'::text, 'linkedin'::text]))
);


--
-- Name: COLUMN apps.channels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.apps.channels IS 'What this app can grant inside itself, e.g. {instagram,linkedin} for Content Engine. Empty means the app has no such division and offers granting it carry no channels.';


--
-- Name: checkout_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkout_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    visitor_key text NOT NULL,
    product_id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    converted_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: course_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id uuid,
    subtitle text,
    body_html text,
    video_embed_url text,
    cover_path text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    course_id uuid NOT NULL,
    item_type text DEFAULT 'text'::text NOT NULL,
    audio_urls text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT course_items_item_type_check CHECK ((item_type = ANY (ARRAY['video'::text, 'audio'::text, 'pdf'::text, 'text'::text])))
);


--
-- Name: COLUMN course_items.audio_urls; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.course_items.audio_urls IS 'Externally hosted audio for an audio lesson, in order. Public by nature — an uploaded attachment is the protected option.';


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    subtitle text,
    description text,
    cover_path text,
    chapter_label text DEFAULT 'Chapter'::text NOT NULL,
    lesson_label text DEFAULT 'Lesson'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'text'::text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    video_embed_url text,
    CONSTRAINT courses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT courses_type_check CHECK ((type = ANY (ARRAY['video'::text, 'audio'::text, 'pdf'::text, 'text'::text])))
);


--
-- Name: deploy_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deploy_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    back_in_minutes integer DEFAULT 5 NOT NULL,
    source text DEFAULT 'api'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deploy_notices_back_in_minutes_check CHECK (((back_in_minutes >= 1) AND (back_in_minutes <= 60)))
);


--
-- Name: TABLE deploy_notices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.deploy_notices IS 'Short-lived deploy warnings shown to signed-in admins. Written by POST /api/deploy-notice before a push; read by the admin shell. Rows are meaningless once starts_at + back_in_minutes has passed and are safe to delete at any time.';


--
-- Name: editing_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editing_presence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    resource text NOT NULL,
    resource_id text NOT NULL,
    user_id uuid NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: error_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    source text NOT NULL,
    message text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    job_kind text,
    job_payload jsonb,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fonts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fonts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    family text NOT NULL,
    source text NOT NULL,
    files jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fonts_source_check CHECK ((source = ANY (ARRAY['google'::text, 'custom'::text])))
);


--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    bucket text NOT NULL,
    path text NOT NULL,
    name text NOT NULL,
    alt text,
    mime text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    width integer,
    height integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_bucket_check CHECK ((bucket = ANY (ARRAY['public-media'::text, 'paid-assets'::text])))
);


--
-- Name: offer_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offer_id uuid NOT NULL,
    label text,
    billing_type text NOT NULL,
    "interval" text,
    interval_count integer DEFAULT 1 NOT NULL,
    trial_days integer,
    price_cents integer NOT NULL,
    compare_at_cents integer,
    sort_order integer DEFAULT 0 NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT offer_prices_billing_type_check CHECK ((billing_type = ANY (ARRAY['one_time'::text, 'recurring'::text]))),
    CONSTRAINT offer_prices_compare_at_above_price CHECK (((compare_at_cents IS NULL) OR (compare_at_cents >= price_cents))),
    CONSTRAINT offer_prices_compare_at_cents_check CHECK ((compare_at_cents >= 0)),
    CONSTRAINT offer_prices_interval_check CHECK (("interval" = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'year'::text]))),
    CONSTRAINT offer_prices_interval_count_check CHECK ((interval_count >= 1)),
    CONSTRAINT offer_prices_one_time_has_no_trial CHECK (((billing_type <> 'one_time'::text) OR (trial_days IS NULL))),
    CONSTRAINT offer_prices_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT offer_prices_recurring_needs_interval CHECK (((billing_type <> 'recurring'::text) OR ("interval" IS NOT NULL))),
    CONSTRAINT offer_prices_trial_days_check CHECK (((trial_days IS NULL) OR (trial_days >= 0)))
);


--
-- Name: TABLE offer_prices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.offer_prices IS 'The ways to pay for one offer. offers.price_cents and its siblings are a mirror of the first non-archived row here, written by offer_prices_sync and by nothing else.';


--
-- Name: offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    grant_type text NOT NULL,
    grant_product_id uuid,
    grant_app_id uuid,
    grant_entitlement_key text,
    billing_type text NOT NULL,
    "interval" text,
    interval_count integer DEFAULT 1,
    trial_days integer,
    price_cents integer NOT NULL,
    compare_at_cents integer,
    currency text DEFAULT 'usd'::text NOT NULL,
    stripe_product_id_test text,
    stripe_price_id_test text,
    stripe_product_id_live text,
    stripe_price_id_live text,
    headline text NOT NULL,
    description text,
    bullets jsonb DEFAULT '[]'::jsonb NOT NULL,
    image_url text,
    accept_label text DEFAULT 'Yes, add this'::text NOT NULL,
    decline_label text DEFAULT 'No thanks'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activecampaign_tag_id text,
    oto_template text DEFAULT 'visual'::text NOT NULL,
    oto_body text,
    oto_video_url text,
    oto_sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    bump_headline text,
    bump_description text,
    oto_page jsonb DEFAULT '{}'::jsonb NOT NULL,
    bump_banner text,
    bump_bullets text[] DEFAULT '{}'::text[] NOT NULL,
    bump_note text,
    bump_accent text,
    activecampaign_trial_tag_id text,
    activecampaign_cancelled_tag_id text,
    page_alt_offer_id uuid,
    page_price_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    grant_channels text[] DEFAULT '{}'::text[] NOT NULL,
    ad_event_name text,
    CONSTRAINT offers_ad_event_name_len CHECK (((ad_event_name IS NULL) OR ((char_length(btrim(ad_event_name)) >= 1) AND (char_length(btrim(ad_event_name)) <= 40)))),
    CONSTRAINT offers_billing_type_check CHECK ((billing_type = ANY (ARRAY['one_time'::text, 'recurring'::text]))),
    CONSTRAINT offers_check CHECK (((grant_type <> 'product'::text) OR (grant_product_id IS NOT NULL))),
    CONSTRAINT offers_check1 CHECK (((grant_type <> 'subscription'::text) OR (grant_app_id IS NOT NULL))),
    CONSTRAINT offers_check2 CHECK (((billing_type <> 'recurring'::text) OR ("interval" IS NOT NULL))),
    CONSTRAINT offers_compare_at_cents_check CHECK ((compare_at_cents >= 0)),
    CONSTRAINT offers_grant_channels_known CHECK ((grant_channels <@ ARRAY['instagram'::text, 'linkedin'::text])),
    CONSTRAINT offers_grant_type_check CHECK ((grant_type = ANY (ARRAY['product'::text, 'subscription'::text]))),
    CONSTRAINT offers_interval_check CHECK (("interval" = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'year'::text]))),
    CONSTRAINT offers_oto_template_check CHECK ((oto_template = ANY (ARRAY['short'::text, 'visual'::text, 'long'::text, 'sales'::text, 'sections'::text, 'custom'::text]))),
    CONSTRAINT offers_page_alt_not_self CHECK (((page_alt_offer_id IS NULL) OR (page_alt_offer_id <> id))),
    CONSTRAINT offers_page_price_ids_array CHECK ((jsonb_typeof(page_price_ids) = 'array'::text)),
    CONSTRAINT offers_price_cents_check CHECK ((price_cents >= 0))
);


--
-- Name: COLUMN offers.activecampaign_tag_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.activecampaign_tag_id IS 'Buyer: applied the first time money is actually taken, removed at cancellation. On a trial offer that is when the trial converts, not when it starts.';


--
-- Name: COLUMN offers.oto_template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.oto_template IS 'Layout for /checkout/oto: short | visual | long | custom (custom = coded component keyed on offers.key).';


--
-- Name: COLUMN offers.oto_body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.oto_body IS 'Long-form copy for the long template. Blank lines separate paragraphs.';


--
-- Name: COLUMN offers.oto_video_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.oto_video_url IS 'Embed URL for the visual template. Falls back to image_url when empty.';


--
-- Name: COLUMN offers.oto_sections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.oto_sections IS 'Long-form sales page sections for the `sales` upsell template. Empty sections are skipped.';


--
-- Name: COLUMN offers.bump_headline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.bump_headline IS 'Bold line on the checkout bump. Falls back to headline when null.';


--
-- Name: COLUMN offers.bump_description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.bump_description IS 'Grey line under it on the checkout bump. Falls back to description when null.';


--
-- Name: COLUMN offers.oto_page; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.oto_page IS 'Overrides for the bespoke upsell page copy. Key -> string or string[]. Missing keys use the default in lib/oto-content.ts.';


--
-- Name: COLUMN offers.bump_banner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.bump_banner IS 'Banner text. Null = show the derived default; empty string = no banner; otherwise shown verbatim.';


--
-- Name: COLUMN offers.bump_bullets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.bump_bullets IS 'Short proof points for the checkout. Separate from offers.bullets so the bump can be terser than the sales page.';


--
-- Name: COLUMN offers.bump_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.bump_note IS 'The line tying this bump to what is being bought. Null hides the callout.';


--
-- Name: COLUMN offers.bump_accent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.bump_accent IS 'Accent colour as #rrggbb. Null uses BUMP_ACCENT_DEFAULT.';


--
-- Name: COLUMN offers.activecampaign_trial_tag_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.activecampaign_trial_tag_id IS 'Applied when the trial starts, removed on the first payment. Survives a cancellation inside the trial. Only meaningful when trial_days > 0.';


--
-- Name: COLUMN offers.activecampaign_cancelled_tag_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.activecampaign_cancelled_tag_id IS 'Applied when access ends. Never removed, so it is a history of churn rather than a current state.';


--
-- Name: COLUMN offers.page_alt_offer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.page_alt_offer_id IS 'A second price shown on this offer''s OWN sales page at /o/<key>. Bumps and upsells read their pairing from the product instead.';


--
-- Name: COLUMN offers.grant_channels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.grant_channels IS 'Channels inside the granted app this offer unlocks. Empty for offers that do not grant an app. Sent to the app as `channels` on every provision call.';


--
-- Name: COLUMN offers.ad_event_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offers.ad_event_name IS 'Meta trackCustom event name fired when this offer is bought, beside Purchase or StartTrial. Null sends nothing.';


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    order_id uuid NOT NULL,
    kind text NOT NULL,
    product_id uuid,
    offer_id uuid,
    description text NOT NULL,
    amount_cents integer NOT NULL,
    stripe_payment_intent_id text,
    stripe_subscription_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    offer_price_id uuid,
    product_price_id uuid,
    CONSTRAINT order_items_kind_check CHECK ((kind = ANY (ARRAY['product'::text, 'bump'::text, 'oto'::text, 'renewal'::text])))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    user_id uuid,
    email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    subtotal_cents integer DEFAULT 0 NOT NULL,
    total_cents integer DEFAULT 0 NOT NULL,
    stripe_payment_intent_id text,
    stripe_customer_id text,
    visitor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tracking_consent boolean DEFAULT false NOT NULL,
    buyer_country text,
    tax_cents integer DEFAULT 0 NOT NULL,
    stripe_tax_calculation_id text,
    coupon_code text,
    discount_cents integer DEFAULT 0 NOT NULL,
    session_granted_at timestamp with time zone,
    post_purchase_sent_at timestamp with time zone,
    stripe_setup_intent_id text,
    client_ip text,
    client_user_agent text,
    source_url text,
    stripe_invoice_id text,
    livemode boolean DEFAULT true NOT NULL,
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: COLUMN orders.tracking_consent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.tracking_consent IS 'GDPR: true only when the buyer explicitly opted in before purchase.';


--
-- Name: COLUMN orders.tax_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.tax_cents IS 'Tax portion of total_cents, as calculated by Stripe Tax at checkout.';


--
-- Name: COLUMN orders.coupon_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.coupon_code IS 'Stripe promotion code applied at checkout, uppercased. Null when none.';


--
-- Name: COLUMN orders.discount_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.discount_cents IS 'Amount taken off the subtotal, in cents. Snapshot — never recomputed.';


--
-- Name: COLUMN orders.session_granted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.session_granted_at IS 'When the post-purchase session was minted. Set once; a second attempt is refused.';


--
-- Name: COLUMN orders.post_purchase_sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.post_purchase_sent_at IS 'When the welcome/post-purchase email was sent for this order. Null means never. Set by lib/post-purchase-send.ts, which is the only writer.';


--
-- Name: COLUMN orders.stripe_setup_intent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.stripe_setup_intent_id IS 'Set instead of stripe_payment_intent_id when this order starts a subscription — a recurring product price, where nothing is charged today. See lib/checkout.ts finalizeOrder.';


--
-- Name: COLUMN orders.client_ip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.client_ip IS 'Buyer IP at checkout, for ad-platform match quality. Written only with tracking consent.';


--
-- Name: COLUMN orders.client_user_agent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.client_user_agent IS 'Buyer user agent at checkout. Written only with tracking consent.';


--
-- Name: COLUMN orders.source_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.source_url IS 'The page the checkout happened on, sent as event_source_url. Written only with tracking consent.';


--
-- Name: COLUMN orders.stripe_invoice_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.stripe_invoice_id IS 'The Stripe invoice this order records, for a renewal or a trial converting. Null on a checkout order. Unique, so a redelivered webhook cannot write a second one.';


--
-- Name: COLUMN orders.livemode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.livemode IS 'False when the order was made against a Stripe test key. Test orders are real rows for money that never moved: excluded from revenue, kept for the record.';


--
-- Name: oto_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oto_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    order_id uuid NOT NULL,
    user_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oto_tokens_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'expired'::text])))
);


--
-- Name: ownership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ownership (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid,
    app_id uuid,
    offer_id uuid,
    source text NOT NULL,
    stripe_subscription_id text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by text,
    offer_price_id uuid,
    product_price_id uuid,
    session_granted_at timestamp with time zone,
    CONSTRAINT ownership_check CHECK (((product_id IS NOT NULL) OR (app_id IS NOT NULL))),
    CONSTRAINT ownership_source_check CHECK ((source = ANY (ARRAY['purchase'::text, 'bump'::text, 'oto'::text, 'grant'::text, 'app'::text]))),
    CONSTRAINT ownership_status_check CHECK ((status = ANY (ARRAY['active'::text, 'trialing'::text, 'canceled'::text, 'past_due'::text])))
);


--
-- Name: COLUMN ownership.granted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ownership.granted_by IS 'Admin email that granted this by hand. Null for anything bought.';


--
-- Name: COLUMN ownership.session_granted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ownership.session_granted_at IS 'When a post-purchase session was handed out for this grant. Set once; the compare-and-set on it is what stops a return URL minting a second session.';


--
-- Name: page_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_counts (
    store_id uuid NOT NULL,
    day date NOT NULL,
    path text NOT NULL,
    source text NOT NULL,
    hits integer DEFAULT 0 NOT NULL,
    product text DEFAULT ''::text NOT NULL
);


--
-- Name: page_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    owner_type text NOT NULL,
    owner_id uuid NOT NULL,
    section_key text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    style text DEFAULT 'paper'::text NOT NULL,
    accent text,
    variant text,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    background jsonb,
    css_id text,
    css_class text,
    layout jsonb,
    CONSTRAINT page_sections_owner_type_check CHECK ((owner_type = ANY (ARRAY['product'::text, 'offer'::text, 'store'::text, 'checkout'::text, 'email'::text])))
);


--
-- Name: COLUMN page_sections.owner_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.page_sections.owner_type IS 'product | offer | store | checkout | email. The last three are keyed by the store id and have one owner row each: the storefront home page, the checkout layout, and the post-purchase email. See lib/pages.ts sectionsFor().';


--
-- Name: COLUMN page_sections.background; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.page_sections.background IS 'Optional {type,color,image,size,position,repeat,overlay} over the band preset. Null means the preset alone.';


--
-- Name: COLUMN page_sections.css_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.page_sections.css_id IS 'Optional DOM id for this band, so #it can be linked to. Sanitised on write.';


--
-- Name: COLUMN page_sections.css_class; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.page_sections.css_class IS 'Optional class list for this band, for page-level custom CSS. Sanitised on write.';


--
-- Name: COLUMN page_sections.layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.page_sections.layout IS 'How the band holds its content: {width: boxed|full|custom, maxWidth, padX, padY}. Null means the built-in measure — 1040px, px-6, py-12/md:py-16 — exactly as before.';


--
-- Name: page_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    owner_type text NOT NULL,
    owner_id uuid NOT NULL,
    custom_css text DEFAULT ''::text NOT NULL,
    custom_js text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    snippets jsonb DEFAULT '[]'::jsonb NOT NULL,
    meta_title text DEFAULT ''::text NOT NULL,
    meta_description text DEFAULT ''::text NOT NULL,
    share_image_path text DEFAULT ''::text NOT NULL,
    CONSTRAINT page_settings_owner_type_check CHECK ((owner_type = ANY (ARRAY['product'::text, 'offer'::text, 'store'::text, 'checkout'::text, 'email'::text])))
);


--
-- Name: COLUMN page_settings.snippets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.page_settings.snippets IS 'Code snippets for this page alone: [{name, place, code, on, onCheckout}]. Same shape as the store-wide list in stores.settings.codeSnippets — see lib/code-snippets.ts.';


--
-- Name: COLUMN page_settings.meta_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.page_settings.meta_title IS 'The <title> and og:title for this page. Empty falls back to the product or offer name, then to the store default. See lib/page-metadata.ts.';


--
-- Name: COLUMN page_settings.share_image_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.page_settings.share_image_path IS 'Storage path of the 1200x630 card behind a shared link. Empty falls back to the page''s cover image, then the store''s share image.';


--
-- Name: pending_app_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_app_entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    app_id uuid NOT NULL,
    email text NOT NULL,
    entitlement_key text,
    status text DEFAULT 'active'::text NOT NULL,
    stripe_subscription_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pending_app_entitlements_status_check CHECK ((status = ANY (ARRAY['active'::text, 'trialing'::text, 'canceled'::text, 'past_due'::text])))
);


--
-- Name: product_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_courses (
    product_id uuid NOT NULL,
    course_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: product_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    label text,
    billing_type text NOT NULL,
    "interval" text,
    interval_count integer DEFAULT 1 NOT NULL,
    trial_days integer,
    price_cents integer NOT NULL,
    compare_at_cents integer,
    sort_order integer DEFAULT 0 NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_prices_billing_type_check CHECK ((billing_type = ANY (ARRAY['one_time'::text, 'recurring'::text]))),
    CONSTRAINT product_prices_compare_at_above_price CHECK (((compare_at_cents IS NULL) OR (compare_at_cents >= price_cents))),
    CONSTRAINT product_prices_compare_at_cents_check CHECK ((compare_at_cents >= 0)),
    CONSTRAINT product_prices_interval_check CHECK (("interval" = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'year'::text]))),
    CONSTRAINT product_prices_interval_count_check CHECK ((interval_count >= 1)),
    CONSTRAINT product_prices_one_time_has_no_trial CHECK (((billing_type <> 'one_time'::text) OR (trial_days IS NULL))),
    CONSTRAINT product_prices_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT product_prices_recurring_needs_interval CHECK (((billing_type <> 'recurring'::text) OR ("interval" IS NOT NULL))),
    CONSTRAINT product_prices_trial_days_check CHECK (((trial_days IS NULL) OR (trial_days >= 0)))
);


--
-- Name: TABLE product_prices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_prices IS 'The ways to buy one product. products.price_cents and compare_at_cents are a mirror of the first non-archived row here, written by product_prices_sync and by nothing else. Mirrors offer_prices exactly — see 0048.';


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    tagline text,
    description text,
    type text,
    price_cents integer NOT NULL,
    compare_at_cents integer,
    currency text DEFAULT 'usd'::text NOT NULL,
    stripe_product_id_test text,
    stripe_price_id_test text,
    stripe_product_id_live text,
    stripe_price_id_live text,
    media_mode text,
    media_path text,
    media_embed_url text,
    cover_image_url text,
    bump_offer_id uuid,
    upsell_offer_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_placeholder boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cover_path text,
    activecampaign_tag_id text,
    activecampaign_abandoned_tag_id text,
    bump_alt_offer_id uuid,
    upsell_alt_offer_id uuid,
    checkout_note text,
    checkout_bullets jsonb DEFAULT '[]'::jsonb NOT NULL,
    bump_price_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    upsell_price_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    offer_id uuid,
    bump_product_id uuid,
    upsell_product_id uuid,
    ad_event_name text,
    CONSTRAINT products_ad_event_name_len CHECK (((ad_event_name IS NULL) OR ((char_length(btrim(ad_event_name)) >= 1) AND (char_length(btrim(ad_event_name)) <= 40)))),
    CONSTRAINT products_bump_alt_distinct CHECK (((bump_alt_offer_id IS NULL) OR (bump_alt_offer_id <> bump_offer_id))),
    CONSTRAINT products_bump_is_not_self CHECK (((bump_product_id IS NULL) OR (bump_product_id <> id))),
    CONSTRAINT products_bump_names_one_thing CHECK (((bump_offer_id IS NULL) OR (bump_product_id IS NULL))),
    CONSTRAINT products_bump_price_ids_array CHECK ((jsonb_typeof(bump_price_ids) = 'array'::text)),
    CONSTRAINT products_compare_at_cents_check CHECK ((compare_at_cents >= 0)),
    CONSTRAINT products_media_mode_check CHECK ((media_mode = ANY (ARRAY['upload'::text, 'embed'::text]))),
    CONSTRAINT products_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT products_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT products_type_check CHECK ((type = ANY (ARRAY['pdf'::text, 'audio'::text, 'video'::text, 'app'::text, 'course'::text]))),
    CONSTRAINT products_upsell_alt_distinct CHECK (((upsell_alt_offer_id IS NULL) OR (upsell_alt_offer_id <> upsell_offer_id))),
    CONSTRAINT products_upsell_is_not_self CHECK (((upsell_product_id IS NULL) OR (upsell_product_id <> id))),
    CONSTRAINT products_upsell_names_one_thing CHECK (((upsell_offer_id IS NULL) OR (upsell_product_id IS NULL))),
    CONSTRAINT products_upsell_price_ids_array CHECK ((jsonb_typeof(upsell_price_ids) = 'array'::text))
);


--
-- Name: COLUMN products.stripe_product_id_live; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.stripe_product_id_live IS 'The Stripe Product every recurring price of this product bills against. Written on first use by ensureStripeProductFor in lib/checkout.ts.';


--
-- Name: COLUMN products.activecampaign_tag_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.activecampaign_tag_id IS 'ActiveCampaign tag id applied to the buyer on purchase. Null = no tag.';


--
-- Name: COLUMN products.activecampaign_abandoned_tag_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.activecampaign_abandoned_tag_id IS 'Tag applied when checkout for THIS product starts, removed when it is paid.';


--
-- Name: COLUMN products.bump_alt_offer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.bump_alt_offer_id IS 'A second price shown beside bump_offer_id, turning the tickbox into a choice. Null means one price.';


--
-- Name: COLUMN products.upsell_alt_offer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.upsell_alt_offer_id IS 'A second price shown beside upsell_offer_id as a second one-click button. Null means one price.';


--
-- Name: COLUMN products.bump_price_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.bump_price_ids IS 'Which of the bump offer''s prices this product shows, in order. Empty means the headline price alone. Falls through to bump_alt_offer_id while that column still exists — see lib/checkout.ts.';


--
-- Name: COLUMN products.offer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.offer_id IS 'The offer whose ways to pay this product is sold on. Null means the product''s own one-time price_cents, which is every product today. Does not change what /checkout charges — see lib/checkout.ts.';


--
-- Name: COLUMN products.bump_product_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.bump_product_id IS 'The product offered as this checkout''s order bump. Mutually exclusive with bump_offer_id; bump_price_ids holds the price ids of whichever was named.';


--
-- Name: COLUMN products.ad_event_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.ad_event_name IS 'Meta trackCustom event name fired on the upsell page for this funnel. Set by the ads team. Null sends nothing.';


--
-- Name: progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid,
    lesson_id uuid,
    completed boolean DEFAULT false NOT NULL,
    position_seconds integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_source text,
    manual_override boolean DEFAULT false NOT NULL,
    course_id uuid,
    CONSTRAINT progress_completed_source_check CHECK ((completed_source = ANY (ARRAY['manual'::text, 'video'::text, 'download'::text, 'dwell'::text])))
);


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    name text NOT NULL,
    "group" text DEFAULT 'Saved'::text NOT NULL,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    band jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'template'::text NOT NULL,
    CONSTRAINT templates_kind_check CHECK ((kind = ANY (ARRAY['template'::text, 'global'::text])))
);


--
-- Name: TABLE templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.templates IS 'Designs saved from the builder. Same shape as a built-in: an array of Block, plus the band it was drawn on. Sanitized in, normalized out.';


--
-- Name: COLUMN templates.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.kind IS 'template = inserting drops a copy; global = inserting drops a link, and editing changes every page that points at it.';


--
-- Name: trial_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    email text NOT NULL,
    grant_key text NOT NULL,
    first_trial_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    store_id uuid NOT NULL,
    email text NOT NULL,
    username text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_admin boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN users.is_admin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.is_admin IS 'Admin granted through the admin UI. ADMIN_EMAILS is the separate, higher break-glass list and is not stored here.';


--
-- Name: visitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    anon_id text NOT NULL,
    landing_url text,
    referrer text,
    utm jsonb DEFAULT '{}'::jsonb NOT NULL,
    click_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_agent text,
    ip_hash text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: apps apps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apps
    ADD CONSTRAINT apps_pkey PRIMARY KEY (id);


--
-- Name: apps apps_store_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apps
    ADD CONSTRAINT apps_store_id_key_key UNIQUE (store_id, key);


--
-- Name: checkout_leads checkout_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_leads
    ADD CONSTRAINT checkout_leads_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: courses courses_store_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_store_id_slug_key UNIQUE (store_id, slug);


--
-- Name: deploy_notices deploy_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_notices
    ADD CONSTRAINT deploy_notices_pkey PRIMARY KEY (id);


--
-- Name: editing_presence editing_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editing_presence
    ADD CONSTRAINT editing_presence_pkey PRIMARY KEY (id);


--
-- Name: editing_presence editing_presence_resource_resource_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editing_presence
    ADD CONSTRAINT editing_presence_resource_resource_id_user_id_key UNIQUE (resource, resource_id, user_id);


--
-- Name: error_events error_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_events
    ADD CONSTRAINT error_events_pkey PRIMARY KEY (id);


--
-- Name: fonts fonts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fonts
    ADD CONSTRAINT fonts_pkey PRIMARY KEY (id);


--
-- Name: fonts fonts_store_id_family_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fonts
    ADD CONSTRAINT fonts_store_id_family_key UNIQUE (store_id, family);


--
-- Name: course_items lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_items
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: media media_store_id_bucket_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_store_id_bucket_path_key UNIQUE (store_id, bucket, path);


--
-- Name: offer_prices offer_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_prices
    ADD CONSTRAINT offer_prices_pkey PRIMARY KEY (id);


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);


--
-- Name: offers offers_store_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_store_id_key_key UNIQUE (store_id, key);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: oto_tokens oto_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oto_tokens
    ADD CONSTRAINT oto_tokens_pkey PRIMARY KEY (id);


--
-- Name: oto_tokens oto_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oto_tokens
    ADD CONSTRAINT oto_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: ownership ownership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership
    ADD CONSTRAINT ownership_pkey PRIMARY KEY (id);


--
-- Name: page_counts page_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_counts
    ADD CONSTRAINT page_counts_pkey PRIMARY KEY (store_id, day, path, source, product);


--
-- Name: page_sections page_sections_owner_type_owner_id_section_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_sections
    ADD CONSTRAINT page_sections_owner_type_owner_id_section_key_key UNIQUE (owner_type, owner_id, section_key);


--
-- Name: page_sections page_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_sections
    ADD CONSTRAINT page_sections_pkey PRIMARY KEY (id);


--
-- Name: page_settings page_settings_owner_type_owner_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_settings
    ADD CONSTRAINT page_settings_owner_type_owner_id_key UNIQUE (owner_type, owner_id);


--
-- Name: page_settings page_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_settings
    ADD CONSTRAINT page_settings_pkey PRIMARY KEY (id);


--
-- Name: pending_app_entitlements pending_app_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_app_entitlements
    ADD CONSTRAINT pending_app_entitlements_pkey PRIMARY KEY (id);


--
-- Name: pending_app_entitlements pending_app_entitlements_store_id_app_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_app_entitlements
    ADD CONSTRAINT pending_app_entitlements_store_id_app_id_email_key UNIQUE (store_id, app_id, email);


--
-- Name: product_courses product_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_courses
    ADD CONSTRAINT product_courses_pkey PRIMARY KEY (product_id, course_id);


--
-- Name: product_prices product_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_store_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_slug_key UNIQUE (store_id, slug);


--
-- Name: progress progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_pkey PRIMARY KEY (id);


--
-- Name: progress progress_store_id_user_id_lesson_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_store_id_user_id_lesson_id_key UNIQUE (store_id, user_id, lesson_id);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: stores stores_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_slug_key UNIQUE (slug);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: trial_history trial_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_history
    ADD CONSTRAINT trial_history_pkey PRIMARY KEY (id);


--
-- Name: trial_history trial_history_store_id_email_grant_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_history
    ADD CONSTRAINT trial_history_store_id_email_grant_key_key UNIQUE (store_id, email, grant_key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_store_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_store_id_email_key UNIQUE (store_id, email);


--
-- Name: visitors visitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitors
    ADD CONSTRAINT visitors_pkey PRIMARY KEY (id);


--
-- Name: visitors visitors_store_id_anon_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitors
    ADD CONSTRAINT visitors_store_id_anon_id_key UNIQUE (store_id, anon_id);


--
-- Name: checkout_leads_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_leads_pending_idx ON public.checkout_leads USING btree (updated_at) WHERE ((sent_at IS NULL) AND (converted_at IS NULL));


--
-- Name: checkout_leads_visitor_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX checkout_leads_visitor_product_idx ON public.checkout_leads USING btree (store_id, visitor_key, product_id);


--
-- Name: course_items_chapter_order_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX course_items_chapter_order_uq ON public.course_items USING btree (course_id, sort_order) WHERE (parent_id IS NULL);


--
-- Name: course_items_lesson_order_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX course_items_lesson_order_uq ON public.course_items USING btree (parent_id, sort_order) WHERE (parent_id IS NOT NULL);


--
-- Name: course_items_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_items_parent_idx ON public.course_items USING btree (parent_id, sort_order);


--
-- Name: deploy_notices_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deploy_notices_recent_idx ON public.deploy_notices USING btree (store_id, starts_at DESC);


--
-- Name: editing_presence_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX editing_presence_resource_idx ON public.editing_presence USING btree (resource, resource_id, seen_at DESC);


--
-- Name: error_events_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_events_due_idx ON public.error_events USING btree (next_attempt_at) WHERE ((resolved_at IS NULL) AND (job_kind IS NOT NULL));


--
-- Name: error_events_unresolved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_events_unresolved_idx ON public.error_events USING btree (store_id, created_at DESC) WHERE (resolved_at IS NULL);


--
-- Name: media_by_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_by_kind ON public.media USING btree (store_id, mime, created_at DESC);


--
-- Name: offer_prices_offer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offer_prices_offer_idx ON public.offer_prices USING btree (offer_id, sort_order, created_at);


--
-- Name: order_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_order_idx ON public.order_items USING btree (order_id);


--
-- Name: orders_coupon_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_coupon_idx ON public.orders USING btree (store_id, coupon_code) WHERE (coupon_code IS NOT NULL);


--
-- Name: orders_invoice_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_invoice_uq ON public.orders USING btree (stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL);


--
-- Name: orders_livemode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_livemode_idx ON public.orders USING btree (store_id, livemode) WHERE (livemode = false);


--
-- Name: orders_post_purchase_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_post_purchase_pending_idx ON public.orders USING btree (store_id, created_at) WHERE (post_purchase_sent_at IS NULL);


--
-- Name: orders_setup_intent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_setup_intent_idx ON public.orders USING btree (stripe_setup_intent_id) WHERE (stripe_setup_intent_id IS NOT NULL);


--
-- Name: orders_store_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_store_created_idx ON public.orders USING btree (store_id, created_at DESC);


--
-- Name: ownership_offer_price_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ownership_offer_price_idx ON public.ownership USING btree (offer_price_id) WHERE (offer_price_id IS NOT NULL);


--
-- Name: ownership_product_price_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ownership_product_price_idx ON public.ownership USING btree (product_price_id) WHERE (product_price_id IS NOT NULL);


--
-- Name: ownership_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ownership_subscription_idx ON public.ownership USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
-- Name: ownership_user_app_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ownership_user_app_uq ON public.ownership USING btree (store_id, user_id, app_id) WHERE (app_id IS NOT NULL);


--
-- Name: ownership_user_product_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ownership_user_product_uq ON public.ownership USING btree (store_id, user_id, product_id) WHERE (product_id IS NOT NULL);


--
-- Name: page_sections_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_sections_owner_idx ON public.page_sections USING btree (owner_type, owner_id, "position");


--
-- Name: pending_app_entitlements_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_app_entitlements_email_idx ON public.pending_app_entitlements USING btree (store_id, email);


--
-- Name: product_courses_course_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_courses_course_idx ON public.product_courses USING btree (course_id);


--
-- Name: product_prices_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_prices_product_idx ON public.product_prices USING btree (product_id, sort_order, created_at);


--
-- Name: products_store_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_store_status_idx ON public.products USING btree (store_id, status);


--
-- Name: progress_course_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX progress_course_idx ON public.progress USING btree (user_id, course_id);


--
-- Name: templates_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_kind_idx ON public.templates USING btree (store_id, kind, name);


--
-- Name: templates_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX templates_store_idx ON public.templates USING btree (store_id, "group", name);


--
-- Name: trial_history_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trial_history_lookup ON public.trial_history USING btree (store_id, email, grant_key);


--
-- Name: users_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_admin_idx ON public.users USING btree (store_id) WHERE is_admin;


--
-- Name: apps apps_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER apps_updated BEFORE UPDATE ON public.apps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: checkout_leads checkout_leads_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER checkout_leads_updated BEFORE UPDATE ON public.checkout_leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: course_items course_items_depth; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER course_items_depth BEFORE INSERT OR UPDATE ON public.course_items FOR EACH ROW EXECUTE FUNCTION public.course_items_depth_guard();


--
-- Name: courses courses_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: fonts fonts_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fonts_updated BEFORE UPDATE ON public.fonts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: course_items lessons_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lessons_updated BEFORE UPDATE ON public.course_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: offer_prices offer_prices_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER offer_prices_sync AFTER INSERT OR DELETE OR UPDATE ON public.offer_prices FOR EACH ROW EXECUTE FUNCTION public.sync_offer_default_price();


--
-- Name: offer_prices offer_prices_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER offer_prices_updated BEFORE UPDATE ON public.offer_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: offers offers_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER offers_updated BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: orders orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ownership ownership_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ownership_updated BEFORE UPDATE ON public.ownership FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: page_sections page_sections_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER page_sections_updated BEFORE UPDATE ON public.page_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: page_settings page_settings_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER page_settings_updated BEFORE UPDATE ON public.page_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_prices product_prices_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_prices_sync AFTER INSERT OR DELETE OR UPDATE ON public.product_prices FOR EACH ROW EXECUTE FUNCTION public.sync_product_default_price();


--
-- Name: product_prices product_prices_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_prices_updated BEFORE UPDATE ON public.product_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products products_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: progress progress_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER progress_updated BEFORE UPDATE ON public.progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stores stores_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stores_updated BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: templates templates_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER templates_touch BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.templates_touch();


--
-- Name: users users_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: apps apps_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apps
    ADD CONSTRAINT apps_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: checkout_leads checkout_leads_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_leads
    ADD CONSTRAINT checkout_leads_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: checkout_leads checkout_leads_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_leads
    ADD CONSTRAINT checkout_leads_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: course_items course_items_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_items
    ADD CONSTRAINT course_items_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_items course_items_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_items
    ADD CONSTRAINT course_items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.course_items(id) ON DELETE CASCADE;


--
-- Name: courses courses_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: deploy_notices deploy_notices_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_notices
    ADD CONSTRAINT deploy_notices_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: editing_presence editing_presence_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editing_presence
    ADD CONSTRAINT editing_presence_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: editing_presence editing_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editing_presence
    ADD CONSTRAINT editing_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: error_events error_events_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_events
    ADD CONSTRAINT error_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: fonts fonts_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fonts
    ADD CONSTRAINT fonts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: course_items lessons_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_items
    ADD CONSTRAINT lessons_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: media media_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: offer_prices offer_prices_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_prices
    ADD CONSTRAINT offer_prices_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;


--
-- Name: offers offers_grant_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_grant_app_id_fkey FOREIGN KEY (grant_app_id) REFERENCES public.apps(id) ON DELETE RESTRICT;


--
-- Name: offers offers_grant_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_grant_product_id_fkey FOREIGN KEY (grant_product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: offers offers_page_alt_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_page_alt_offer_id_fkey FOREIGN KEY (page_alt_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: offers offers_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_offer_price_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_offer_price_id_fkey FOREIGN KEY (offer_price_id) REFERENCES public.offer_prices(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_product_price_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_price_id_fkey FOREIGN KEY (product_price_id) REFERENCES public.product_prices(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: orders orders_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orders orders_visitor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_visitor_id_fkey FOREIGN KEY (visitor_id) REFERENCES public.visitors(id) ON DELETE SET NULL;


--
-- Name: oto_tokens oto_tokens_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oto_tokens
    ADD CONSTRAINT oto_tokens_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE RESTRICT;


--
-- Name: oto_tokens oto_tokens_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oto_tokens
    ADD CONSTRAINT oto_tokens_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: oto_tokens oto_tokens_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oto_tokens
    ADD CONSTRAINT oto_tokens_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: oto_tokens oto_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oto_tokens
    ADD CONSTRAINT oto_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ownership ownership_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership
    ADD CONSTRAINT ownership_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;


--
-- Name: ownership ownership_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership
    ADD CONSTRAINT ownership_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: ownership ownership_offer_price_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership
    ADD CONSTRAINT ownership_offer_price_id_fkey FOREIGN KEY (offer_price_id) REFERENCES public.offer_prices(id) ON DELETE RESTRICT;


--
-- Name: ownership ownership_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership
    ADD CONSTRAINT ownership_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: ownership ownership_product_price_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership
    ADD CONSTRAINT ownership_product_price_id_fkey FOREIGN KEY (product_price_id) REFERENCES public.product_prices(id) ON DELETE RESTRICT;


--
-- Name: ownership ownership_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership
    ADD CONSTRAINT ownership_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: ownership ownership_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership
    ADD CONSTRAINT ownership_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: page_counts page_counts_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_counts
    ADD CONSTRAINT page_counts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: page_sections page_sections_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_sections
    ADD CONSTRAINT page_sections_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: page_settings page_settings_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_settings
    ADD CONSTRAINT page_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: pending_app_entitlements pending_app_entitlements_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_app_entitlements
    ADD CONSTRAINT pending_app_entitlements_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;


--
-- Name: pending_app_entitlements pending_app_entitlements_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_app_entitlements
    ADD CONSTRAINT pending_app_entitlements_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: product_courses product_courses_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_courses
    ADD CONSTRAINT product_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: product_courses product_courses_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_courses
    ADD CONSTRAINT product_courses_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_prices product_prices_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_bump_alt_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_bump_alt_offer_id_fkey FOREIGN KEY (bump_alt_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: products products_bump_offer_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_bump_offer_fk FOREIGN KEY (bump_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: products products_bump_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_bump_product_id_fkey FOREIGN KEY (bump_product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: products products_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: products products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: products products_upsell_alt_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_upsell_alt_offer_id_fkey FOREIGN KEY (upsell_alt_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: products products_upsell_offer_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_upsell_offer_fk FOREIGN KEY (upsell_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: products products_upsell_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_upsell_product_id_fkey FOREIGN KEY (upsell_product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: progress progress_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: progress progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.course_items(id) ON DELETE CASCADE;


--
-- Name: progress progress_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: progress progress_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: progress progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trial_history trial_history_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_history
    ADD CONSTRAINT trial_history_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: users users_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: visitors visitors_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitors
    ADD CONSTRAINT visitors_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: apps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;

--
-- Name: checkout_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkout_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: course_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.course_items ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: deploy_notices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deploy_notices ENABLE ROW LEVEL SECURITY;

--
-- Name: editing_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.editing_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: error_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

--
-- Name: fonts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fonts ENABLE ROW LEVEL SECURITY;

--
-- Name: media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: oto_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oto_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: ownership; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ownership ENABLE ROW LEVEL SECURITY;

--
-- Name: page_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.page_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: page_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.page_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: page_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.page_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_app_entitlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_app_entitlements ENABLE ROW LEVEL SECURITY;

--
-- Name: product_courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_courses ENABLE ROW LEVEL SECURITY;

--
-- Name: product_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;

--
-- Name: stores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

--
-- Name: templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_history ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: visitors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

