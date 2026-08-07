import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { SETTINGS_SCHEMA, SETTINGS_DEFAULTS, type Settings } from "@/lib/settings-schema";
import type { z } from "zod";

/**
 * Reading and writing the store's settings.
 *
 * The shapes live in `lib/settings-schema.ts` with no database client and no
 * `server-only`, because the admin form needs the group list and the field
 * rules in the browser. Everything that touches Postgres stays here — a client
 * component importing this file is a build error, which is the point.
 */

export * from "@/lib/settings-schema";

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The resolved settings — saved values over code defaults.
 *
 * Deliberately tolerant: a stored value that no longer parses (a colour field
 * that once held a name, a key from a removed field) falls back to its default
 * rather than throwing. This is read on every storefront render, and a settings
 * row is not worth taking the whole shop down for.
 *
 * Memoised per request. The store layout wants it for the brand CSS, again for
 * the metadata, and the checkout wants it for the refund window — one render
 * asking three times is one query, not three.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const db = createServiceClient();
  const { data, error } = await db
    .from("stores")
    .select("name, settings")
    .eq("id", await getStoreId())
    .single();
  if (error || !data) throw new Error(`getSettings: ${error?.message ?? "no store row"}`);

  const stored = (data.settings ?? {}) as Record<string, unknown>;
  const parsed = SETTINGS_SCHEMA.safeParse(stored);
  if (parsed.success) return { ...parsed.data, name: data.name as string };

  // One bad field must not discard the good ones, so fall back per key.
  const out: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  for (const key of Object.keys(SETTINGS_SCHEMA.shape)) {
    const field = SETTINGS_SCHEMA.shape[key as keyof typeof SETTINGS_SCHEMA.shape];
    const one = field.safeParse(stored[key]);
    if (one.success) out[key] = one.data;
  }
  return { ...(out as z.infer<typeof SETTINGS_SCHEMA>), name: data.name as string };
});
// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Merge a patch into the stored blob.
 *
 * Reads the current row first. Two admins saving two different groups at the
 * same second is the case this loses — the later write wins its own keys and
 * carries the earlier one's, which is the right outcome for a settings page and
 * not worth a lock.
 */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const db = createServiceClient();
  const storeId = await getStoreId();

  const { data, error: readErr } = await db
    .from("stores")
    .select("settings")
    .eq("id", storeId)
    .single();
  if (readErr) throw new Error(`saveSettings read: ${readErr.message}`);

  const { name, ...rest } = patch;
  const merged = { ...((data?.settings ?? {}) as Record<string, unknown>), ...rest };

  const update: Record<string, unknown> = { settings: merged };
  // `name` is a real column, not a settings key — it has a not-null constraint
  // and is joined against elsewhere.
  if (typeof name === "string" && name.trim()) update.name = name.trim();

  const { error } = await db.from("stores").update(update).eq("id", storeId);
  if (error) throw new Error(`saveSettings: ${error.message}`);
}
