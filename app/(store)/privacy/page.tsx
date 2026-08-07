import type { Metadata } from "next";
import { LegalPage, Clause } from "@/components/legal/legal-page";
import { getLegal, PROCESSORS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Greater Inside",
  description: "What we collect, why, who it goes to, and how to get it deleted.",
};

// Everything here describes what the store ACTUALLY does — each claim was
// checked against the code (lib/tracking.ts, lib/email.ts, lib/consent.ts,
// middleware.ts). Change the behaviour and this page has to change with it; a
// privacy policy that overstates or understates what happens is the one kind of
// inaccuracy that carries legal weight.
export default async function PrivacyPage() {
  const LEGAL = await getLegal();
  return (
    <LegalPage
      legal={LEGAL}
      title="Privacy Policy"
      intro="What we collect, why we collect it, and how to get it removed."
    >
      <Clause heading="Who we are">
        <p>
          {LEGAL.storeName} is operated by {LEGAL.legalEntity}
          {LEGAL.address ? `, ${LEGAL.address}` : ""}. For anything in this policy, including a
          request to see or delete your data, email{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
        </p>
      </Clause>

      <Clause heading="What we collect">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>Your account</strong> — your name and email address. Created when you buy
            something or sign in.
          </li>
          <li>
            <strong>Your purchases</strong> — what you bought, when, the amount, the currency, and
            the billing country you selected for tax.
          </li>
          <li>
            <strong>Your progress</strong> — which lessons you have marked complete, so the store
            can show you where you left off.
          </li>
          <li>
            <strong>How you found us</strong> — the page that referred you, any campaign tags in
            the link, and an anonymous id stored in a cookie. This is collected whether or not you
            consent to advertising measurement; it is only <em>sent to advertising platforms</em>{" "}
            if you consent.
          </li>
        </ul>
        <p>
          We never see or store your card number. Card details go directly to Stripe from your
          browser and never touch our servers.
        </p>
      </Clause>

      <Clause heading="Cookies">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>Sign-in cookies</strong> — keep you logged in. Without these the store cannot
            work, so they are always set.
          </li>
          <li>
            <strong>gi_anon</strong> — a random id used to connect your visit to your purchase, so
            we can tell which adverts are worth running.
          </li>
          <li>
            <strong>gi_consent</strong> — remembers your answer to the cookie banner for 180 days,
            then asks again.
          </li>
          <li>
            <strong>gi_theme</strong> — remembers whether you chose light or dark.
          </li>
        </ul>
      </Clause>

      <Clause heading="Advertising measurement, and your choice">
        <p>
          If you accept the cookie banner, we tell Meta and Google Analytics when a purchase
          happens so we can measure which adverts work. Your email is <strong>hashed</strong> before
          it is sent — a one-way fingerprint that lets the platform match an existing customer
          without us handing over the address itself.
        </p>
        <p>
          If you decline, none of that is sent. Nothing else changes: the store, your purchases and
          your library work exactly the same either way. You can change your mind by clearing the{" "}
          <code>gi_consent</code> cookie, which makes the banner reappear.
        </p>
      </Clause>

      <Clause heading="Who else sees your data">
        <p>These are the only third parties that receive anything, and what each one gets:</p>
        <div className="flex flex-col gap-4">
          {PROCESSORS.map((p) => (
            <div key={p.name} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="font-medium text-fg">{p.name}</p>
              <p className="text-sm text-muted">{p.purpose}</p>
              <p className="mt-1 text-sm text-muted">
                <span className="text-fg/70">Receives:</span> {p.data}
              </p>
            </div>
          ))}
        </div>
        <p>
          If you buy access to a connected application, we pass your email address to it so it can
          create your account there. We do not sell your data, and we do not share it for anyone
          else&rsquo;s advertising.
        </p>
      </Clause>

      <Clause heading="Where your data is held">
        <p>
          Account, purchase and progress data is stored on our own server infrastructure rather than
          a shared third-party database. Payment data is held by Stripe, and email delivery is
          handled by Resend; both may process data outside your country under their own safeguards.
        </p>
      </Clause>

      <Clause heading="How long we keep it">
        <p>
          Purchase records are kept for as long as tax and accounting rules require, which is
          typically six years. Your account and progress are kept until you ask us to delete them.
          Attribution records are kept for two years.
        </p>
      </Clause>

      <Clause heading="Your rights">
        <p>
          You can ask for a copy of your data, ask us to correct it, or ask us to delete it. Email{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> and we will respond
          within 30 days.
        </p>
        <p>
          Deleting your account removes your profile, progress and attribution records. We keep the
          purchase record itself, because we are legally required to — but it is disconnected from
          your profile. If you are in the UK or EU you can also complain to your national data
          protection authority.
        </p>
      </Clause>

      <Clause heading="Changes">
        <p>
          If we change this policy we will update the date at the top. Material changes to how we
          use your data will be emailed to account holders rather than made quietly.
        </p>
      </Clause>
    </LegalPage>
  );
}
