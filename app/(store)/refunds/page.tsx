import type { Metadata } from "next";
import { LegalPage, Clause } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund Policy — Greater Inside",
  description: "When you can get your money back, and how to ask.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund Policy"
      intro="When you can get your money back, and how to ask for it."
    >
      <Clause heading="Digital products">
        <p>
          You can request a refund within {LEGAL.refundWindowDays} days of purchase. Email{" "}
          <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> from the address you
          bought with and tell us the product. You do not have to give a reason.
        </p>
        <p>
          Refunds are returned to the original payment method. Your bank usually takes five to ten
          working days to show it.
        </p>
      </Clause>

      <Clause heading="What happens to your access">
        <p>
          Refunding a purchase removes access to what it unlocked. If a purchase included a bonus
          subscription, that subscription is cancelled at the same time.
        </p>
      </Clause>

      <Clause heading="Subscriptions">
        <p>
          Subscriptions are billed in advance for each period. You can cancel at any time from{" "}
          <a href="/account">your account</a>, and you keep access until the end of the period you
          have already paid for. We do not pro-rate part-months.
        </p>
        <p>
          A subscription that starts with a free trial is not charged until the trial ends. Cancel
          before then and you are not charged at all.
        </p>
      </Clause>

      <Clause heading="If something is wrong with what you bought">
        <p>
          If a product is faulty, not as described, or you cannot access it, tell us and we will fix
          it or refund you — regardless of how long ago you bought it. The{" "}
          {LEGAL.refundWindowDays}-day window above is for changing your mind, not for things that
          are broken.
        </p>
      </Clause>

      <Clause heading="Your statutory rights">
        <p>
          If you are a consumer in the UK or EU you normally have 14 days to withdraw from a
          purchase. Digital content is an exception: that right ends once download or streaming
          begins with your agreement. We do not rely on that exception within our{" "}
          {LEGAL.refundWindowDays}-day window — we will refund you whether or not you have opened
          the product. Nothing here reduces the rights you have by law.
        </p>
      </Clause>

      <Clause heading="Chargebacks">
        <p>
          Please email us before disputing a charge with your bank. A chargeback takes weeks and
          costs us a fee; a refund usually takes a day. We would rather just refund you.
        </p>
      </Clause>
    </LegalPage>
  );
}
