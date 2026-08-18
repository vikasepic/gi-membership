import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";

// Records a visitor for attribution. First-touch wins (ignoreDuplicates), so a
// later pageview never overwrites the landing UTMs / click ids.
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
      click_ids: clickIds,
      user_agent: req.headers.get("user-agent"),
    },
    { onConflict: "store_id,anon_id", ignoreDuplicates: true },
  );

  // Fill in click ids that arrived later, without disturbing first touch.
  //
  // `_fbp` and `_fbc` are written by Meta's pixel, and the pixel does not load
  // until consent is granted — so on the landing request they do not exist yet.
  // First-touch-wins is right for the campaign that brought somebody here and
  // wrong for an identifier that simply had not been issued: under
  // ignoreDuplicates alone, the strongest match signal Meta offers could never
  // be stored at all.
  //
  // Merged rather than replaced, and only for keys with nothing in them, so a
  // later pageview still cannot overwrite the fbclid of the ad that converted.
  if (clickIds.fbp || clickIds.fbc) {
    const { data: existing } = await db
      .from("visitors")
      .select("click_ids")
      .eq("store_id", storeId)
      .eq("anon_id", anon)
      .maybeSingle();
    const stored = (existing?.click_ids as Record<string, string> | null) ?? {};
    const merged = { ...stored };
    for (const k of ["fbp", "fbc"] as const) {
      if (clickIds[k] && !stored[k]) merged[k] = clickIds[k];
    }
    if (Object.keys(merged).length !== Object.keys(stored).length) {
      await db
        .from("visitors")
        .update({ click_ids: merged })
        .eq("store_id", storeId)
        .eq("anon_id", anon);
    }
  }

  return Response.json({ ok: true, stored: true });
}
