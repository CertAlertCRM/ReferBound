import Link from "next/link";
import { Wordmark } from "../components";

export const metadata = { title: "Terms of Service — ReferBound" };

const EFFECTIVE = "July 29, 2026";

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-bold tracking-tight">
        {n}. {title}
      </h2>
      <div className="mt-2 text-sm text-ink-secondary leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/" className="inline-block">
        <Wordmark />
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mt-6">Terms of Service</h1>
      <p className="text-sm text-ink-muted mt-1">Effective {EFFECTIVE}</p>

      <div className="card p-6 sm:p-8 mt-6">
        <p className="text-sm text-ink-secondary leading-relaxed">
          These terms govern your use of ReferBound, a referral-tracking service operated by{" "}
          <strong className="text-ink">Cert Alert CRM LLC</strong>, a Virginia limited liability
          company (&ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account or using a referral
          portal, you agree to them. If you don&apos;t agree, please don&apos;t use the service.
        </p>

        <Section n={1} title="What ReferBound is">
          <p>
            ReferBound lets insurance agents share live referral status with their referral
            partners (lenders, realtors, CPAs, and others), exchange documents once policies are
            bound, and manage those relationships. It is a communication and tracking tool. It is
            <strong className="text-ink"> not</strong> an insurance product, does not provide
            insurance, legal, or financial advice, and is not affiliated with, endorsed by, or
            sponsored by any insurance carrier.
          </p>
        </Section>

        <Section n={2} title="Accounts">
          <p>
            You must provide accurate information and keep your password secure — you&apos;re
            responsible for activity under your account. Agency-plan owners are responsible for
            the teammates they invite. You must be at least 18 and using the service for business
            purposes.
          </p>
        </Section>

        <Section n={3} title="Client information and your responsibilities">
          <p>
            Agents and partners submit information about insurance clients (names, contact
            details, property addresses, documents like loan applications and evidence of
            insurance). By submitting it, you confirm you have the legal right and any necessary
            consent to share that information for the purpose of placing or servicing insurance.
            You are responsible for complying with the laws that apply to your profession,
            including privacy, licensing, and (for referral arrangements) anti-rebating and
            referral-fee rules in your state.
          </p>
          <p>
            Magic links and referral-board links grant access to referral information without a
            login. Treat them like passwords: share them only with the people who should see that
            information. We can rotate a link on request.
          </p>
        </Section>

        <Section n={4} title="Acceptable use">
          <p>
            Don&apos;t use ReferBound to send spam, harvest data, upload malicious files,
            misrepresent who you are, access other users&apos; data, or do anything unlawful. We
            may suspend accounts that do.
          </p>
        </Section>

        <Section n={5} title="Emails and text messages (SMS)">
          <p>
            The service sends transactional emails on your behalf to your partners and, when you
            choose to send them, to your clients — a quote, a check-in, a welcome with proof of
            insurance, or a review request. Client-facing messages are never sent automatically;
            each one requires an action by you. You&apos;re responsible for having a business
            relationship with the recipients and for the content of any message you send or
            edit. Partners can ask you — or us —
            to stop non-essential emails at any time.
          </p>
          <p>
            <strong className="text-ink">SMS program terms.</strong> ReferBound Notifications
            sends transactional text messages about referral activity — for example, that a
            referred client has been quoted or that insurance documents are ready — to referral
            partners and contacts who opt in by checking the SMS consent box. Consent is not a
            condition of any purchase. Message frequency varies with referral activity. Message
            and data rates may apply. Reply <strong className="text-ink">STOP</strong> at any
            time to cancel and stop receiving texts; reply{" "}
            <strong className="text-ink">HELP</strong> or email{" "}
            <span className="text-ink font-medium">hello@stonebind.com</span> for help. Mobile
            carriers are not liable for delayed or undelivered messages. How we handle phone
            numbers and consent is described in the{" "}
            <Link href="/privacy" className="link !text-sm">
              Privacy Policy
            </Link>{" "}
            — mobile information is never shared with third parties or affiliates for marketing
            or promotional purposes.
          </p>
        </Section>

        <Section n={6} title="Plans and billing">
          <p>
            The Free plan includes one lender partner plus up to two non-lender referral partners.
            Paid plans (Pro, Agency) bill monthly or annually through Stripe, depending on the
            plan you choose, and renew automatically until canceled. You can cancel anytime via the billing
            portal; access continues through the paid period. Prices may change with at least 30
            days&apos; notice. Fees are non-refundable except where required by law or where we
            choose to issue a refund.
          </p>
        </Section>

        <Section n={7} title="Forwarding address">
          <p>
            Each account may be issued a private email address for forwarding referrals. You are
            responsible for what you forward to it and for confirming you have the right to share
            that material with a service provider. Mail from senders we cannot match to one of
            your existing partners is held for your review rather than acted on automatically.
          </p>
          <p>
            Loan applications reaching the service by any route are read once and discarded, not
            stored. We keep only the details required to quote. The original remains wherever you
            already hold it, and you should not rely on ReferBound as a system of record for
            lender documents.
          </p>
        </Section>

        <Section n={8} title="Your data">
          <p>
            Your data is yours. You can export your referrals as a CSV at any time and delete
            your account from the Profile page, which permanently removes your partners,
            referrals, messages, and documents. How we handle data is described in the{" "}
            <Link href="/privacy" className="link !text-sm">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section n={9} title="AI features">
          <p>
            Some features use artificial intelligence (document extraction, drafted emails and
            replies). AI output can be wrong — always review extracted data and drafts before
            relying on or sending them. You are responsible for what you send.
          </p>
        </Section>

        <Section n={10} title="Service availability and changes">
          <p>
            We work hard to keep ReferBound available and improving, but it&apos;s provided
            &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind.
            We may add, change, or remove features. We&apos;ll give reasonable notice of changes
            that materially reduce the service.
          </p>
        </Section>

        <Section n={11} title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, Cert Alert CRM LLC is not liable for
            indirect, incidental, special, or consequential damages, or for lost profits, lost
            business, or lost data. Our total liability for any claim relating to the service is
            limited to the amounts you paid us in the twelve months before the claim (or $100 if
            you paid nothing). Nothing here limits liability that cannot be limited by law.
          </p>
        </Section>

        <Section n={12} title="Termination">
          <p>
            You can stop using the service or delete your account at any time. We may suspend or
            terminate accounts that violate these terms, with notice where practical. Sections
            that by their nature survive (data responsibilities, liability limits, governing law)
            survive termination.
          </p>
        </Section>

        <Section n={13} title="Governing law and disputes">
          <p>
            These terms are governed by the laws of the Commonwealth of Virginia, without regard
            to conflict-of-law rules. Disputes will be resolved in the state or federal courts
            located in Virginia, and you consent to their jurisdiction.
          </p>
        </Section>

        <Section n={14} title="Changes to these terms">
          <p>
            We may update these terms as the service evolves. If a change is material, we&apos;ll
            notify account holders by email or in the app before it takes effect. Continued use
            after the effective date means you accept the updated terms.
          </p>
        </Section>

        <Section n={15} title="Contact">
          <p>
            Questions about these terms: <span className="text-ink font-medium">hello@stonebind.com</span>.
            ReferBound™ is a trade name of Cert Alert CRM LLC.
          </p>
        </Section>
      </div>

      <footer className="text-center text-xs text-ink-muted py-8">
        <Link href="/" className="link !text-xs">
          ← Back to ReferBound
        </Link>{" "}
        ·{" "}
        <Link href="/security" className="link !text-xs">
          Security
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="link !text-xs">
          Privacy Policy
        </Link>
      </footer>
    </main>
  );
}
