"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { availableFamilies } from "@/lib/fonts";
import {
  GROUP_FIELDS,
  SETTINGS_SCHEMA,
  getSettings,
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

/** The values this form was rendered from, as the browser last saw them. */
function parseBaseline(raw: FormDataEntryValue | null): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    // A baseline we cannot read is a baseline we cannot check against. Saving
    // unguarded is the behaviour this replaced, not a new risk.
    return null;
  }
}

const FIELD_LABELS: Record<string, string> = {
  legalEntity: "the registered entity",
  address: "the address",
  governingLaw: "the governing law",
  contactEmail: "the support email",
  privacyEmail: "the privacy email",
  refundWindowDays: "the refund window",
  primaryColor: "the primary colour",
  deepColor: "the deep colour",
  name: "the store name",
};

const labelOf = (f: string | number | symbol) => FIELD_LABELS[String(f)] ?? String(f);

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

  // A family name with nothing behind it renders as the fallback, which reads
  // as a broken page rather than an unset setting. Checked against what is
  // actually installed rather than against a list of names.
  if (group === "typography") {
    const families = await availableFamilies();
    for (const key of ["headingFont", "bodyFont"] as const) {
      const chosen = String(patch[key] ?? "");
      if (chosen && !families.includes(chosen)) {
        errors[key] = `${chosen} is not installed. Add it below first.`;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { errors, group };

  // Refuse to overwrite a value somebody else changed while this form was
  // open. Only THIS group's fields are compared: groups merge, so two people
  // saving Legal and Brand at the same moment is not a conflict and must not
  // be reported as one.
  const baseline = parseBaseline(formData.get("_baseline"));
  if (baseline) {
    const current = await getSettings() as unknown as Record<string, unknown>;
    const moved = fields.filter(
      (f) => f in baseline && String(current[f as string] ?? "") !== String(baseline[f as string] ?? ""),
    );
    if (moved.length > 0) {
      return {
        group,
        errors: {
          _form: `Someone else changed ${moved.map(labelOf).join(" and ")} while you had this open. Reload to see their version — saving now would replace it.`,
        },
      };
    }
  }

  try {
    await saveSettings(patch as Partial<Settings>);
  } catch (e) {
    return { errors: { _form: e instanceof Error ? e.message : "Save failed" }, group };
  }

  // Legal and brand values are read by pages all over the store, not just here.
  revalidatePath("/", "layout");
  return { saved: true, group };
}
