import "server-only";

// ActiveCampaign, API v3.
//
// Two calls per purchase:
//
//   POST /api/3/contact/sync   create-or-update by email, returns the contact id
//   POST /api/3/contactTags    apply a tag to that contact
//
// contact/sync is an upsert keyed on email — an existing contact is updated
// rather than duplicated — which is exactly the "create it or update it" the
// store needs, and is why nothing here searches for the contact first.
//
// v3 rather than the older /admin/api.php?api_action=contact_add: that endpoint
// belongs to the legacy API, needs a list id for every call, and returns XML or
// PHP-serialised bodies. v3 is JSON, keyed the same way, and is what
// ActiveCampaign documents today.
//
// Everything here is best-effort and never throws. These calls happen after the
// card has been charged; a marketing outage must not fail a paid order.

const TIMEOUT_MS = 8000;

type AcConfig = { baseUrl: string; token: string };

function config(): AcConfig | null {
  const baseUrl = process.env.ACTIVECAMPAIGN_API_URL?.trim().replace(/\/+$/, "");
  const token = process.env.ACTIVECAMPAIGN_API_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

/** Whether the integration is configured at all. Unset = silently disabled. */
export function activeCampaignEnabled(): boolean {
  return config() !== null;
}

async function acFetch(path: string, body: unknown): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    return await fetch(`${cfg.baseUrl}/api/3${path}`, {
      method: "POST",
      headers: {
        "Api-Token": cfg.token,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`[activecampaign] ${path} request failed:`, e);
    return null;
  }
}

/**
 * ActiveCampaign wants first and last name separately; the store asks for one
 * full name because two boxes on a checkout is one more than necessary.
 * Everything after the first space is the last name, so "Mary Anne van der
 * Berg" keeps its surname intact rather than losing all but one word.
 */
function splitName(fullName: string | null | undefined): { firstName?: string; lastName?: string } {
  const name = (fullName ?? "").trim();
  if (!name) return {};
  const i = name.indexOf(" ");
  if (i === -1) return { firstName: name };
  return { firstName: name.slice(0, i), lastName: name.slice(i + 1).trim() };
}

/** Create or update the contact by email. Returns its AC id, or null. */
export async function syncContact(args: {
  email: string;
  fullName?: string | null;
}): Promise<string | null> {
  const res = await acFetch("/contact/sync", {
    contact: { email: args.email, ...splitName(args.fullName) },
  });
  if (!res) return null;
  if (!res.ok) {
    console.error(`[activecampaign] contact/sync ${res.status}: ${await res.text().catch(() => "")}`);
    return null;
  }
  try {
    const json = (await res.json()) as { contact?: { id?: string | number } };
    const id = json.contact?.id;
    return id == null ? null : String(id);
  } catch {
    return null;
  }
}

/**
 * Apply a tag. Re-applying a tag the contact already has is not an error worth
 * surfacing — a repeat buyer is a normal thing — so a duplicate rejection is
 * logged at most and never propagated.
 */
export async function addTag(contactId: string, tagId: string): Promise<boolean> {
  const res = await acFetch("/contactTags", {
    contactTag: { contact: contactId, tag: tagId },
  });
  if (!res) return false;
  if (res.ok) return true;
  // 422 is what AC returns for "already applied" among other validation
  // problems. Either way the contact ends up tagged, which is the goal.
  if (res.status === 422) return true;
  console.error(`[activecampaign] contactTags ${res.status}: ${await res.text().catch(() => "")}`);
  return false;
}

/**
 * The whole job for one buyer: upsert them, then apply every tag their purchase
 * earned. Tags are applied in sequence rather than in parallel — AC rate-limits
 * per account, and an order has at most a handful of items.
 */
export async function tagContact(args: {
  email: string;
  fullName?: string | null;
  tagIds: string[];
}): Promise<void> {
  if (!activeCampaignEnabled()) return;
  const tagIds = [...new Set(args.tagIds.filter((t) => t && t.trim()))].map((t) => t.trim());

  // Sync even with no tags: the buyer should exist in the CRM either way, and
  // this is what keeps a name up to date when they buy again.
  const contactId = await syncContact({ email: args.email, fullName: args.fullName });
  if (!contactId) return;

  for (const tagId of tagIds) {
    await addTag(contactId, tagId);
  }
}
