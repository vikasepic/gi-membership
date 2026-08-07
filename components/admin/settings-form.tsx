"use client";

import { useSlowSave } from "@/components/admin/save-status";
import { useActionState } from "react";
import { saveSettings, type SaveState } from "@/app/admin/settings/actions";
import { inputClass as input, Field } from "@/components/admin/form-controls";
import type { StoreSettings } from "@/lib/admin";

export function SettingsForm({ settings }: { settings: StoreSettings }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveSettings, {});
  const slow = useSlowSave(pending);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-6">
      <Field label="Store name" required>
        <input name="name" defaultValue={settings.name} required className={input} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Support email">
          <input name="supportEmail" type="email" defaultValue={settings.supportEmail ?? ""} className={input} />
        </Field>
        <Field label="Currency" hint="ISO code, e.g. usd">
          <input name="currency" defaultValue={settings.currency} className={input} />
        </Field>
      </div>


      {state.error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="rounded-xl border border-navy/30 bg-navy/5 px-4 py-3 text-sm text-navy">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
      {slow && (
        <p className="text-xs text-primary" role="status">
          Still going. It may already have worked — reload to check.
        </p>
      )}
    </form>
  );
}
