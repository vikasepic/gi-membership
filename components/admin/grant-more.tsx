"use client";

import { useActionState } from "react";
import { grantAccessAction, type MemberActionState } from "@/app/admin/members/actions";
import { GrantPicker, type GrantOption } from "@/components/admin/grant-picker";

/** Give an existing member something. Same action and picker the add-member form uses. */
export function GrantMore({ userId, held, grants }: { userId: string; held: string[]; grants: GrantOption[] }) {
  const [state, action, pending] = useActionState<MemberActionState, FormData>(grantAccessAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <GrantPicker grants={grants} held={held} />
      {state.error && <p className="text-sm text-primary">{state.error}</p>}
      {state.message && <p className="text-sm text-navy">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Granting…" : "Grant"}
      </button>
    </form>
  );
}
