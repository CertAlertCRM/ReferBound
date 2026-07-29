import Link from "next/link";
import { Wordmark } from "../components";

export const metadata = { title: "Privacy Policy — ReferBound" };

const EFFECTIVE = "July 29, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      <div className="mt-2 text-sm text-ink-secondary leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/" className="inline-block">
        <Wordmark />
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mt-6">Privacy Policy</h1>
      <p className="text-sm text-ink-muted mt-1">Effective {EFFECTIVE}</p>

      <div className="card p-6 sm:p-8 mt-6">
        <p className="text-sm text-ink-secondary leading-relaxed">
          ReferBound is operated by <strong className="text-ink">Cert Alert CRM LLC</strong>, a
          Virginia company. This policy explains what we collect, why, and what we do with it —
          in plain language, because that&apos;s how we&apos;d want it explained to us.
        </p>

        <Section title="What we collect">
          <p>
            <strong className="text-ink">Account information</strong> — your name, email, agency
            details, headshot, and settings when you create an account.
          </p>
          <p>
            <strong className="text-ink">Referral information</strong> — details agents and
            partners enter about insurance clients: names, contact information, dates of birth,
            property addresses, closing dates, policy details, and uploaded documents (loan
            applications, evidence of insurance, and similar). This information belongs to the
            agent&apos;s book of business; we process it to run the service.
          </p>
          <p>
            <strong className="text-ink">Usage and log data</strong> — emails we send on your
            behalf (logged for delivery and de-duplication), activity timelines, and standard
            technical logs. We do not use advertising trackers.
          </p>
        </Section>

        <Section title="How we use it">
          <p>
            To operate ReferBound: showing live referral status to the right partner, delivering
            documents, sending the transactional emails you and your partners expect (status
            updates, closing alerts, recaps), powering AI features you invoke (document
            extraction, drafted emails), and processing payments. That&apos;s it.{" "}
            <strong className="text-ink">We do not sell your data or your clients&apos; data,
            and we don&apos;t use it for advertising.</strong>
          </p>
        </Section>

        <Section title="Who else touches the data">
          <p>We use a small set of service providers to run ReferBound:</p>
          <p>
            <strong className="text-ink">Supabase</strong> (database &amp; file storage) ·{" "}
            <strong className="text-ink">Vercel</strong> (hosting) ·{" "}
            <strong className="text-ink">Resend</strong> (email delivery) ·{" "}
            <strong className="text-ink">Stripe</strong> (payments — we never see your card
            number) · <strong className="text-ink">Anthropic</strong> (AI features — documents
            and referral details you run through AI features are processed to generate the
            result, and are not used to train their models under our API terms).
          </p>
          <p>
            Each processes data only to provide their service to us. Beyond these, we share data
            only if the law requires it or to protect the service from abuse.
          </p>
        </Section>

        <Section title="Magic links and portals">
          <p>
            Partner portals and referral boards use unguessable links instead of logins. Anyone
            with a portal link can see the referrals shared with that partner — that&apos;s the
            product working as designed. Treat links accordingly, and ask the agent (or us) to
            rotate a link if it&apos;s been shared too widely.
          </p>
        </Section>

        <Section title="Retention and deletion">
          <p>
            We keep data while the account it belongs to is active. Agents can export referrals
            as CSV anytime and can delete their account from the Profile page — deletion
            permanently removes their partners, referrals, messages, documents, and portal links.
            Residual copies in backups age out on a rolling basis.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Data is encrypted in transit (HTTPS everywhere) and at rest by our infrastructure
            providers. Passwords are stored only as salted scrypt hashes. Documents live in
            private storage accessed through short-lived signed URLs. Sign-in and public
            endpoints are rate-limited. No system is perfectly secure, but if we learn of a
            breach affecting your data, we&apos;ll notify you promptly.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can update your profile anytime, control which emails each partner receives
            (recaps and thank-yous are per-partner settings), export your data, or delete your
            account entirely. Partners who want off non-essential emails can ask their agent or
            email us directly.
          </p>
        </Section>

        <Section title="Children">
          <p>ReferBound is a business tool and isn&apos;t directed to anyone under 18.</p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If we materially change this policy, we&apos;ll notify account holders by email or in
            the app first. Questions or requests:{" "}
            <span className="text-ink font-medium">hello@stonebind.com</span>.
          </p>
        </Section>
      </div>

      <footer className="text-center text-xs text-ink-muted py-8">
        <Link href="/" className="link !text-xs">
          ← Back to ReferBound
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="link !text-xs">
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}
