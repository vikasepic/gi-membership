"use client";

import { useActionState } from "react";
import { uploadAsset, type UploadState } from "@/app/admin/actions";

export function AssetUpload({
  productId,
  currentPath,
}: {
  productId: string;
  currentPath: string | null;
}) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadAsset, {});
  const path = state.path ?? currentPath;

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
    >
      <input type="hidden" name="productId" value={productId} />
      <div className="flex flex-col gap-1">
        <span className="kicker text-muted">Paid asset (PDF / audio)</span>
        <span className="text-sm text-muted">
          Stored in the private bucket. Delivered later via ownership-checked signed URLs.
        </span>
      </div>

      {path && (
        <p className="truncate rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted" title={path}>
          Current: {path}
        </p>
      )}

      <input
        type="file"
        name="file"
        accept="application/pdf,audio/*"
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:text-fg"
      />

      {state.error && <p className="text-sm text-primary">{state.error}</p>}
      {state.path && <p className="text-sm text-navy">Uploaded.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-primary disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload asset"}
      </button>
    </form>
  );
}
