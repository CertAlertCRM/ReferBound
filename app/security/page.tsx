import Link from "next/link";
import { Wordmark } from "../components";

export const metadata = {
  title: "Security — ReferBound",
  description: "How ReferBound protects agent and client information.",
};

// A page written for the person who asks before they trust you with a client
// file — an agent's compliance officer, a lender's ops manager, an E&O
// underwriter. Plain claims, no security theatre, and honest about what this
// is not: a small product run by a small team, described accurately.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="font-bold tracking-tight">{title}</h2>
      <div className="mt-2.5 text-sm text-ink-secondary leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function SecurityPage() {
  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex justify-center py-2">
        <Link href="/">
          <Wordmark />
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-ink-secondary mt-1">
          ReferBound handles real client information — names, addresses, dates of birth, and
          insurance documents. This page describes what we actually do with it, in enough detail
          that you can decide for yourself rather than take our word for it.
        </p>
      </div>

      <Section title="The data we deliberately don't keep">
        <p>
          The strongest protection for a piece of information is not holding it.{" "}
          <strong className="text-ink">Loan documents are never stored.</strong> A borrower&apos;s
          loan paperwork reaching ReferBound by any route — forwarded email, agent upload, or
          partner upload — is read once in memory and discarded rather than written to disk.
        </p>
        <p>
          What we keep from it is what a quote requires: names, dates of birth, contact details,
          property address, closing date, and loan number. Our AI provider is instructed not to
          return Social Security numbers, income figures, asset balances, or account numbers, and
          none of those are written to our database.
        </p>
        <p>
          We also never store carrier-proprietary rating data, and we never ask an agent for
          carrier credentials.
        </p>
      </Section>

      <Section title="How data is stored">
        <p>
          Application data is held in Postgres on Supabase, and documents in a private storage
          bucket that is not publicly listable. Both are encrypted at rest by the provider, and all
          traffic to and from ReferBound is over TLS.
        </p>
        <p>
          Our application never reaches the database with a public key. Every query runs
          server-side through a service credential, and row-level security is enabled on every
          table so that anonymous and end-user keys can read nothing at all.
        </p>
      </Section>

      <Section title="Who can see what">
        <p>
          <strong className="text-ink">Agents</strong> see only their own account&apos;s referrals,
          partners, and documents. Team members on an Agency plan share the account owner&apos;s
          data by design; that is the point of a shared agency board.
        </p>
        <p>
          <strong className="text-ink">Partners</strong> reach their portal through an unguessable
          link. That link shows only the clients that partner referred — never another
          partner&apos;s clients, never the agent&apos;s wider book. Agent-issued documents on a
          deal appear only once the policy is bound.
        </p>
        <p>
          <strong className="text-ink">Clients</strong> who are emailed their own documents receive
          a link signed for that single document with an expiry. They are never given a
          partner&apos;s portal token.
        </p>
        <p>
          A magic link is a key. If a partner&apos;s link is ever shared beyond who should have it,
          the agent can rotate it from the partner&apos;s page, which invalidates the old one
          immediately.
        </p>
      </Section>

      <Section title="Email intake">
        <p>
          An agent may be issued a private forwarding address. It is unguessable, belongs to one
          account, and mail sent to it is processed only for that account.
        </p>
        <p>
          Incoming webhooks are rejected unless they carry a valid signature from our mail provider
          and a recent timestamp, so an unsigned or replayed request cannot create a referral. Mail
          from a sender we cannot match to one of that agent&apos;s existing partners is held for
          review rather than acted on, and we never send an automatic reply to an unrecognized
          address.
        </p>
        <p>
          Where a sender&apos;s mail system encrypts a message end-to-end, we cannot decrypt it and
          do not attempt to. Only unencrypted parts, such as the subject line, are processed.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          AI is used to read documents and messages and to draft text a person then reviews. It is
          never used to decide coverage, price a policy, or send anything on its own.
        </p>
        <p>
          Documents and message content are sent to Anthropic&apos;s API for extraction. That
          content is not used to train models. Every prompt treats the content as data rather than
          instructions, so text inside a document or email cannot direct the system to do
          something it otherwise wouldn&apos;t.
        </p>
        <p>
          Anything drafted for a client or a referral partner is shown to the agent for editing
          before it can be sent. Nothing customer-facing is ever sent automatically.
        </p>
      </Section>

      <Section title="Text messages">
        <p>
          Texts go only to contacts who have opted in, and consent is recorded against the phone
          number it was given for. Changing the number clears the consent. Every message carries
          opt-out instructions, and STOP is honored immediately. Consent does not transfer between
          agents: if a partner&apos;s setup is shared with another agent, the SMS opt-in does not
          come with it.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          Agents choose how long uploaded source documents are kept — indefinitely, or purged after
          30, 90, or 180 days. Details already extracted onto a referral survive the purge; the
          file does not. Loan documents are exempt from this choice because they are never
          stored in the first place.
        </p>
        <p>
          Agents can export everything as CSV at any time, delete individual referrals and
          documents, and delete their account, which removes their data.
        </p>
      </Section>

      <Section title="What we don't claim">
        <p>
          ReferBound is a small product built by a small team. We are not SOC 2 certified, we do
          not hold ISO 27001, and we have not undergone a third-party penetration test. We would
          rather say that plainly than imply otherwise.
        </p>
        <p>
          What we do claim is specific: no data selling, no advertising trackers, no carrier
          credentials, no loan documents on disk, and no automated messages to your clients.
        </p>
      </Section>

      <Section title="Reporting a problem">
        <p>
          If you believe you&apos;ve found a vulnerability or a data-handling issue, email{" "}
          <span className="text-ink font-medium">hello@stonebind.com</span>. Please include enough
          detail to reproduce it. We&apos;ll acknowledge and tell you what we&apos;re doing about
          it; we won&apos;t pursue anyone who reports something in good faith.
        </p>
      </Section>

      <p className="text-center text-xs text-ink-muted pb-6">
        <Link href="/privacy" className="link !text-xs">
          Privacy Policy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="link !text-xs">
          Terms
        </Link>
      </p>
    </main>
  );
}
