"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { inputClass as input } from "@/components/admin/form-controls";
import { copyPageAction, type CopyPageState } from "@/app/admin/pages/actions";
import type { PageSource } from "@/lib/pages";

/**
 * Use another page as a template.
 *
 * Hidden behind a disclosure because it is a thing you do once per page and it
 * replaces everything — a control that destructive sitting open beside the ones
 * you use constantly is a control that eventually gets clicked by accident.
 *
 * It asks twice, and the second button says what will actually happen. The
 * first version of this said "Copy", which is true and useless: the word people
 * needed was "replace".
 */
export function CopyPage({
  ownerType,
  ownerId,
  sources,
  hasSections,
}: {
  ownerType: string;
  ownerId: string;
  sources: PageSource[];
  /** Whether anything would be lost. Changes what the confirm says. */
  hasSections: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [state, action] = useActionState<CopyPageState, FormData>(copyPageAction, {});

  const others = sources.filter((s) => !(s.ownerType === ownerType && s.ownerId === ownerId));
  if (others.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-fg hover:text-fg"
      >
        Copy another page
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ownerType" value={ownerType} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <select
        name="from"
        defaultValue=""
        onChange={() => setArmed(false)}
        className={`${input} w-auto min-w-[14rem] py-1.5 text-xs`}
      >
        <option value="" disabled>
          Copy the structure from…
        </option>
        {others.map((s) => (
          <option key={`${s.ownerType}:${s.ownerId}`} value={`${s.ownerType}:${s.ownerId}`}>
            {s.title} ({s.sections} sections)
          </option>
        ))}
      </select>

      {armed ? (
        <Confirm hasSections={hasSections} onCancel={() => setArmed(false)} />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary"
          >
            Copy it here
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted hover:text-fg"
          >
            Cancel
          </button>
        </>
      )}

      <Result state={state} />
      <p className="w-full text-[0.66rem] text-muted">
        Layout, copy, colours and backgrounds come across. Prices and buy buttons keep belonging to{" "}
        <b className="font-medium text-fg">this</b> product or offer — a copied page sells what it
        was copied onto.
      </p>
    </form>
  );
}

function Confirm({ hasSections, onCancel }: { hasSections: boolean; onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={onCancel} className="text-xs text-muted hover:text-fg">
        Keep this page
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg disabled:opacity-60"
      >
        {pending
          ? "Copying…"
          : hasSections
            ? "Replace everything on this page"
            : "Copy it here"}
      </button>
    </span>
  );
}

function Result({ state }: { state: CopyPageState }) {
  if (state.error) {
    return (
      <span role="alert" className="text-xs text-primary">
        {state.error}
      </span>
    );
  }
  if (state.message) {
    return (
      <span role="status" className="text-xs text-navy">
        {state.message}
      </span>
    );
  }
  return null;
}
