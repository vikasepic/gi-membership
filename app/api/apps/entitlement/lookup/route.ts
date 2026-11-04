import { z } from "zod";
import { appForSecret } from "@/lib/app-sync";
import { entitlementForEmail } from "@/lib/app-entitlement-lookup";

export const dynamic = "force-dynamic";

// Outbound-on-demand: a connected app asks the store whether one of its users
// still has access, and which channels.
//
// The push already tells an app what changed. This answers the same question
// when the app has lost its own copy and cannot reconstruct it: Content
// Engine's workspace delete cascaded away the local grant, so nothing in its
// own database could say what had been bought. Without this the only way back
// was a human running SQL.
//
// Authenticated with the app's own shared secret, the same one it presents to
// report an entitlement. The secret establishes WHICH app is asking, and the
// answer is scoped to that app — nothing in the body selects it.
const schema = z.object({
  email: z.string().email(),
  // Accepted because the asking app sends it, and deliberately not used to
  // scope the answer. All three Content Engine offers share one key, so keying
  // channel access off it would collapse them; the secret already says which
  // app is asking, which is the only scope that means anything.
  entitlementKey: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const app = await appForSecret(req.headers.get("x-store-secret"));
  if (!app) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") },
      { status: 400 },
    );
  }

  try {
    // 200 with hasAccess:false is a definitive no, and the asking app acts on
    // it. Anything non-2xx reads as "cannot tell" on the other side, which is
    // why a read failure must stay a 500 and never degrade into a denial.
    return Response.json(await entitlementForEmail(app, parsed.data.email));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
