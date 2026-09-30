import { subView } from "@/lib/member-money";
import { dateWithYear, shortDate } from "@/lib/dates";
import type { SubscriptionRow } from "@/lib/subscriptions";

/**
 * What a member reads about one of their subscriptions on the account page.
 *
 * Asked for 29 Sep 2026: the purchase list showed "Content Engine — Instagram,
 * 21 Sept 2026 · $0" and nothing else, so somebody who had cancelled could not
 * see that it had worked, or until when they still had access.
 *
 * The state comes from `subView`, the same rule the admin member page uses, so
 * the member and the owner can never be told two different things.
 */
export type MemberSubscriptionLine = {
  state: string;
  detail: string | null;
  tone: "ok" | "warn" | "ended";
};

export function memberSubscriptionLine(s: SubscriptionRow, now = new Date()): MemberSubscriptionLine {
  const v = subView(s, "");
  // The year only when it is not this one. These dates are nearly always
  // weeks away, and "1 Oct 2026" wrapped its year onto a line of its own on
  // a phone.
  const on = (iso: string | null) =>
    iso ? (new Date(iso).getUTCFullYear() === now.getUTCFullYear() ? shortDate(iso) : dateWithYear(iso)) : null;
  const ended = on(s.endedAt ?? s.canceledAt);
  switch (v.state) {
    case "on trial":
      return { state: "Free trial", detail: v.nextChargeAt ? `first payment ${on(v.nextChargeAt)}` : null, tone: "ok" };
    case "paying":
      return {
        state: "Active",
        detail: v.nextChargeAt ? `${s.installments ? "next payment" : "renews"} ${on(v.nextChargeAt)}` : null,
        tone: "ok",
      };
    case "free access":
      return { state: "Active", detail: "free, nothing to pay", tone: "ok" };
    case "past due":
      return { state: "Payment failed", detail: "update your card under Billing", tone: "warn" };
    case "cancelling":
      return { state: "Cancelled", detail: v.cancelsAt ? `access until ${on(v.cancelsAt)}` : null, tone: "warn" };
    case "trial cancelled":
      // Still running until the trial's end, or already over.
      return v.cancelsAt
        ? { state: "Trial cancelled", detail: `access until ${on(v.cancelsAt)}`, tone: "warn" }
        : { state: "Trial cancelled", detail: ended ? `access ended ${ended}` : null, tone: "ended" };
    case "trial ended":
      return { state: "Trial ended", detail: ended, tone: "ended" };
    case "cancelled":
      return { state: "Ended", detail: ended ? `access ended ${ended}` : null, tone: "ended" };
  }
}
