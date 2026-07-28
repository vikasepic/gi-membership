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
  await db.from("visitors").upsert(
    {
      store_id: await getStoreId(),
      anon_id: anon,
      landing_url: body.landingUrl ?? null,
      referrer: body.referrer || null,
      utm: body.utm ?? {},
      click_ids: body.clickIds ?? {},
      user_agent: req.headers.get("user-agent"),
    },
    { onConflict: "store_id,anon_id", ignoreDuplicates: true },
  );

  return Response.json({ ok: true, stored: true });
}
