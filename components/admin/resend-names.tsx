"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { resendNames, type BackfillState } from "@/app/admin/apps/actions";

/**
 * Re-send an app everything the store already told it, with names attached.
 *
 * The count is shown before the button rather than after the send, so the
 * decision is made on a number rather than on hope. It asks twice because it
 * reaches another company's server — a misclick here is not undoable by
 * clicking something else.
 */
export function ResendNames({
  appId,
  appName,
  total,
  named,
  active,
}: {
  appId: string;
  appName: string;
  total: number;
  named: number;
  active: boolean;
}) {
  const [state, action] = useActionState<BackfillState, FormData>(resendNames, {});
  const mine = state.appId === appId;

  if (total === 0) {
    return (
      <p className="text-xs text-muted">
        The store holds no entitlements for {appName}, so there are no names to send.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-border pt-3">
      <input type="hidden" name="appId" value={appId} />
      <p className="text-xs text-muted">
        {named} of {total} {total === 1 ? "entitlement has" : "entitlements have"} a name stored.
        Re-sends each one&rsquo;s <em>current</em> status with the name attached — it grants
        nothing and takes nothing away.
      </p>
      {!active && (
        <p className="text-xs text-primary">
          {appName} is inactive. The store refuses outbound calls to an inactive app, so this
          would do nothing until it is switched on.
        </p>
      )}
      <Row />
      {mine && state.message && (
        <span role="status" className="text-xs text-navy">
          {state.message}
        </span>
      )}
      {mine && state.error && (
        <span role="alert" className="text-xs text-primary">
          {state.error}
        </span>
      )}
    </form>
  );
}

function Row() {
  const { pending } = useFormStatus();
  return (
    <span className="flex items-center gap-3">
      <ConfirmSubmit
        label="Send names"
        confirmLabel="Send — this reaches their server"
        cancelLabel="Not now"
        kind="send"
        disabled={pending}
      />
      {pending && (
        <span role="status" className="text-xs text-muted">
          Sending…
        </span>
      )}
    </span>
  );
}
