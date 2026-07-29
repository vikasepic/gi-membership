import { z } from "zod";
import { appForSecret, recordAppEntitlement } from "@/lib/app-sync";

export const dynamic = "force-dynamic";

// Inbound: a connected app tells the store one of its users has (or no longer
// has) an entitlement — typically because they subscribed inside the app rather
// than through the store.
//
// Without this the store has no idea, and would offer them the very thing they
// already pay for. Suppressing that is not cosmetic: accepting the offer would
// start a SECOND subscription and bill them twice.
//
// Authenticated with the app's own shared secret, the same one the store signs
// that app's handoff tokens with, so presenting it proves which app is calling.
const schema = z.object({
  email: z.string().email(),
  entitlementKey: z.string().nullable().optional(),
  status: z.enum(["active", "trialing", "canceled", "past_due"]),
  stripeSubscriptionId: z.string().nullable().optional(),
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
    const result = await recordAppEntitlement({
      app,
      email: parsed.data.email,
      entitlementKey: parsed.data.entitlementKey ?? null,
      status: parsed.data.status,
      stripeSubscriptionId: parsed.data.stripeSubscriptionId ?? null,
    });
    // linked:false means we parked it — no store account with that email yet.
    // It is applied automatically when they create one, so the app should treat
    // this as success, not as something to retry.
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
