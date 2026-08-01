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
            partners enter, forward, or upload about insurance clients: names, contact
            information, dates of birth, property addresses, closing dates, policy details, and
            documents (evidence of insurance, declarations pages, insurance requests, mortgagee
            clause letters, and similar). This information belongs to the agent&apos;s book of
            business; we process it to run the service.
          </p>
          <p>
            <strong className="text-ink">Forwarded email</strong> — each agent can be given a
            private forwarding address. Messages sent to it are stored with their sender, subject,
            and body so the agent can review what became a lead, along with what our AI extracted
            from them. Attachments are read and, other than loan applications (see Retention),
            attached to the referral.
          </p>
          <p>
            <strong className="text-ink">Loan applications are read but not kept.</strong> A loan
            application (1003) contains far more personal information than an insurance quote
            requires. Whenever one reaches us — forwarded, uploaded by an agent, or uploaded by a
            partner — it is read once in memory and discarded rather than written to storage. We
            retain only what a quote needs: names, dates of birth, contact details, property
            address, closing date, and loan number. We instruct our AI provider not to return
            Social Security numbers, income figures, asset balances, or account numbers, and we
            do not store them.
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
            updates, closing alerts, recaps, and the client-facing messages an agent chooses to
            send), powering AI features (extracting details from documents and forwarded emails,
            drafting messages for the agent to review), and processing payments. That&apos;s it.{" "}
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
            number) · <strong className="text-ink">Twilio</strong> (text-message delivery, for
            opted-in contacts only) · <strong className="text-ink">Anthropic</strong> (AI features — documents
            and referral details you run through AI features are processed to generate the
            result, and are not used to train their models under our API terms).
          </p>
          <p>
            Each processes data only to provide their service to us. Beyond these, we share data
            only if the law requires it or to protect the service from abuse.
          </p>
        </Section>

        <Section title="Text messages (SMS)">
          <p>
            Some notifications are available by text message — for example, letting a referral
            partner know a client they sent has been quoted or that insurance documents are
            ready. Texts are sent only to people who opt in by checking the SMS consent box when
            submitting a referral or in their contact settings. Message frequency varies with
            referral activity; message and data rates may apply. Reply{" "}
            <strong className="text-ink">STOP</strong> at any time to opt out, or{" "}
            <strong className="text-ink">HELP</strong> for help.
          </p>
          <p>
            <strong className="text-ink">
              No mobile information will be shared with third parties or affiliates for marketing
              or promotional purposes.
            </strong>{" "}
            Phone numbers and SMS opt-in consent are never sold or shared for marketing;
            text-messaging originator opt-in data and consent are shared only with our SMS
            delivery provider (Twilio) to send the messages you asked for.
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

        <Section title="Email intake">
          <p>
            An agent&apos;s forwarding address is unguessable and belongs to one account. Mail
            sent to it is processed only for that account. Messages from senders we can&apos;t
            match to one of the agent&apos;s existing partners are held for the agent&apos;s
            review rather than acted on, and we never send an automatic reply to an unrecognized
            sender.
          </p>
          <p>
            Some mail systems encrypt messages in transit to external recipients. We cannot
            decrypt those and do not attempt to; only the unencrypted parts, such as the subject
            line, are processed.
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
            A fuller description of how we store data, who can see what, and what we deliberately
            don&apos;t keep is on the{" "}
            <Link href="/security" className="link !text-sm">
              security page
            </Link>
            .
          </p>
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
        <Link href="/security" className="link !text-xs">
          Security
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="link !text-xs">
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}
