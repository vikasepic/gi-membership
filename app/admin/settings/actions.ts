"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import {
  GROUP_FIELDS,
  SETTINGS_SCHEMA,
  saveSettings,
  type SettingsGroupKey,
  type Settings,
} from "@/lib/settings";

export type SaveState = {
  saved?: boolean;
  /** Keyed by field name, plus `_form` for anything that is not one field's fault. */
  errors?: Record<string, string>;
  /** Which group the result belongs to, so one panel's error cannot appear on another. */
  group?: SettingsGroupKey;
};

/**
 * Save one group.
 *
 * Only that group's fields are read and written, which is what makes the page
 * safe to leave half-filled: saving Legal cannot touch Brand, and a field that
 * is not on screen cannot be blanked by a form that never posted it. The write
 * itself merges, so two groups saved in either order both survive.
 */
export async function saveSettingsGroup(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAdmin();

  const group = String(formData.get("_group") ?? "") as SettingsGroupKey;
  const fields = GROUP_FIELDS[group];
  if (!fields) return { errors: { _form: "Unknown settings group" } };

  const errors: Record<string, string> = {};
  const patch: Record<string, unknown> = {};

  for (const field of fields) {
    // `name` is a column on stores, not a key in the settings blob, so it has
    // no entry in the schema and is validated here.
    if (field === "name") {
      const value = String(formData.get("name") ?? "").trim();
      if (!value) errors.name = "The store needs a name";
      else patch.name = value;
      continue;
    }
    const shape = SETTINGS_SCHEMA.shape[field as keyof typeof SETTINGS_SCHEMA.shape];
    if (!shape) continue;
    const raw = formData.get(field as string);
    // An absent checkbox posts nothing at all, which is how it says "off".
    const parsed = shape.safeParse(raw === null ? undefined : raw);
    if (parsed.success) patch[field as string] = parsed.data;
    else errors[field as string] = parsed.error.issues[0]?.message ?? "Not valid";
  }

  if (Object.keys(errors).length > 0) return { errors, group };

  try {
    await saveSettings(patch as Partial<Settings>);
  } catch (e) {
    return { errors: { _form: e instanceof Error ? e.message : "Save failed" }, group };
  }

  // Legal and brand values are read by pages all over the store, not just here.
  revalidatePath("/", "layout");
  return { saved: true, group };
}
