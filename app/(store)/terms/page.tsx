import type { Metadata } from "next";
import { LegalPage, Clause } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service — Greater Inside",
  description: "The agreement between you and Greater Inside.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`The agreement between you and ${LEGAL.storeName} when you buy or use anything here.`}
    >
      <Clause heading="Who you are dealing with">
        <p>
          {LEGAL.storeName} is operated by {LEGAL.legalEntity}
          {LEGAL.address ? `, ${LEGAL.address}` : ""}. &ldquo;We&rdquo; and &ldquo;us&rdquo; mean
          that company. &ldquo;You&rdquo; means the person using the store. Contact:{" "}
          <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      </Clause>

      <Clause heading="Your account">
        <p>
          You need an account to access what you buy. Keep your login details to yourself — you are
          responsible for what happens under your account. Give us a real email address; it is how
          we send receipts and how you recover access.
        </p>
        <p>
          One account is for one person. Do not share logins. We may suspend an account being used
          by several people at once.
        </p>
      </Clause>

      <Clause heading="What you are buying">
        <p>
          You are buying a personal, non-transferable licence to access and use the content — not
          ownership of it. You may use it for your own purposes, including your own commercial work.
        </p>
        <p>You may not:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>resell, republish or redistribute the content, in whole or in part;</li>
          <li>share your access with anyone else;</li>
          <li>
            present it as your own, or use it to build a competing product of substantially the same
            material.
          </li>
        </ul>
        <p>
          We may end your access without a refund if you do these things. We keep all copyright and
          other rights in the content.
        </p>
      </Clause>

      <Clause heading="How long you have access">
        <p>
          One-off purchases are intended to remain available to you indefinitely, and we will give
          reasonable notice before withdrawing anything. Where a product is delivered as a
          downloadable file, keep your own copy — that is the version we cannot take away.
        </p>
        <p>Subscriptions last as long as they are paid for. See the refund policy for how they end.</p>
      </Clause>

      <Clause heading="Prices and payment">
        <p>
          Prices are shown before you pay. Tax is calculated at your country&rsquo;s rate and shown
          on your receipt. Payment is handled by Stripe; by paying you also accept their terms.
        </p>
        <p>
          Where a purchase includes an optional add-on with a recurring charge, that is stated on
          the checkout page before you agree to it, along with what it costs and when it starts.
          A one-off purchase and a subscription are always charged separately, never merged into one
          amount.
        </p>
      </Clause>

      <Clause heading="Refunds">
        <p>
          Set out in full in our <a href="/refunds">refund policy</a>, which forms part of these
          terms.
        </p>
      </Clause>

      <Clause heading="What we promise, and what we do not">
        <p>
          We will make reasonable efforts to keep the store available and the content accurate. We
          do not promise uninterrupted access, and we do not promise particular results from using
          it — the content is education, not a guarantee of any outcome.
        </p>
        <p>
          Nothing here limits our liability for death, personal injury, or fraud. Beyond that, our
          liability to you is limited to what you paid us in the twelve months before the claim.
        </p>
      </Clause>

      <Clause heading="Connected applications">
        <p>
          Some purchases give access to a separate application. When they do, we pass your email
          address to it so it can create your account. That application has its own terms, and your
          use of it is governed by them as well as these.
        </p>
      </Clause>

      <Clause heading="Ending this agreement">
        <p>
          You can stop using the store and close your account at any time by emailing us. We may
          suspend or close an account that breaks these terms, or that we reasonably believe is
          being used fraudulently.
        </p>
      </Clause>

      <Clause heading="Changes">
        <p>
          We may update these terms. The date at the top shows when they last changed. Changes are
          not retroactive — the terms that applied when you bought something are the ones that
          govern that purchase.
        </p>
      </Clause>

      <Clause heading="Law">
        <p>
          {LEGAL.governingLaw
            ? `These terms are governed by the law of ${LEGAL.governingLaw}, and its courts have jurisdiction.`
            : "The governing law and jurisdiction for these terms has not yet been set by the store owner."}{" "}
          If you are a consumer, this does not deprive you of the protection of the mandatory laws
          of the country where you live.
        </p>
      </Clause>
    </LegalPage>
  );
}
