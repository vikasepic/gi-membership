import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";
import { mergeClickIds } from "@/lib/tracking-fields";

// Records a visitor for attribution. First-touch wins (ignoreDuplicates), so a
// later pageview never overwrites the landing UTMs or click ids, except a
// newer Meta ad click (mergeClickIds).
//
// Click ids, UTMs and user-agent are personal data under GDPR and this store
// takes EU/UK traffic, so nothing is stored without explicit consent.
export async function POST(req: Request) {
  const jar = await cookies();
  const anon = jar.get("gi_anon")?.value;
  if (!anon) return Response.json({ ok: false });

  if (!mayTrack(parseConsent(jar.get(CONSENT_COOKIE)?.value))) {
    return Response.json({ ok: true, stored: false, reason: "no-consent" });
  }

  const body = (await req.json().catch(() => ({}))) as {
    landingUrl?: string;
    referrer?: string;
    utm?: Record<string, string>;
    clickIds?: Record<string, string>;
  };

  const db = createServiceClient();
  const storeId = await getStoreId();
  const clickIds = body.clickIds ?? {};

  await db.from("visitors").upsert(
    {
      store_id: storeId,
      anon_id: anon,
      landing_url: body.landingUrl ?? null,
      referrer: body.referrer || null,
      utm: body.utm ?? {},
      // Through the same merge, so a stale _fbc from an earlier click never
      // lands beside the fbclid of this one.
      click_ids: mergeClickIds({}, clickIds, Date.now()),
      user_agent: req.headers.get("user-agent"),
    },
    { onConflict: "store_id,anon_id", ignoreDuplicates: true },
  );

  // Click ids that arrived later, and a newer Meta ad click. See
  // mergeClickIds: first touch still wins for everything else.
  if (clickIds.fbp || clickIds.fbc || clickIds.fbclid) {
    const { data: existing } = await db
      .from("visitors")
      .select("click_ids")
      .eq("store_id", storeId)
      .eq("anon_id", anon)
      .maybeSingle();
    const stored = (existing?.click_ids as Record<string, string> | null) ?? {};
    const merged = mergeClickIds(stored, clickIds, Date.now());
    if (JSON.stringify(merged) !== JSON.stringify(stored)) {
      await db
        .from("visitors")
        .update({ click_ids: merged })
        .eq("store_id", storeId)
        .eq("anon_id", anon);
    }
  }

  return Response.json({ ok: true, stored: true });
}
