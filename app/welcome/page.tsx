import { Wordmark } from "../components";
import { WaitlistForm } from "./waitlist-form";

// Public landing page. Unauthenticated visitors to "/" are rewritten here by
// the middleware; the logged-in agent still sees their dashboard at "/".

export const metadata = {
  title: "ReferLive — Live referral tracking for insurance agents",
  description:
    "Give your realtor, lender, and CPA partners a live window into every client they send you. Status updates, instant EOI delivery, closing-date protection.",
};

const FEATURES = [
  {
    title: "A live portal for every partner",
    body: "Your lenders and realtors get a private link — no logins, no passwords — showing every client they've sent you and exactly where each one stands. No more “any update?” texts.",
  },
  {
    title: "EOI delivered the moment you bind",
    body: "Evidence of insurance and replacement cost estimators land in the partner's portal the second the policy is bound. Their processor stops chasing you, and closings stop waiting on paperwork.",
  },
  {
    title: "Closing-date protection",
    body: "Any referral within a week of closing that isn't bound yet gets flagged to both sides automatically. The deal your partner cares about most never slips through quietly.",
  },
  {
    title: "You look responsive without lifting a finger",
    body: "Every status change notifies your partner automatically, and a monthly summary shows them what their referrals turned into. The agents who close the loop get the next referral.",
  },
];

export default function WelcomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <Wordmark size="text-3xl" />
        <h1 className="mt-8 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          Your referral partners deserve better than{" "}
          <span className="text-brand">&ldquo;any update?&rdquo;</span>
        </h1>
        <p className="mt-4 text-lg text-ink-secondary max-w-xl mx-auto">
          ReferLive gives insurance agents a live referral portal for their lender, realtor, and CPA
          partners — status on every client, documents the moment policies bind, and closings that
          never slip quietly.
        </p>
        <div className="mt-8 max-w-md mx-auto">
          <WaitlistForm />
          <p className="mt-3 text-xs text-ink-muted">
            Built inside a working insurance agency. Early access is limited while we pilot with
            founding agents.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-ink-secondary leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="card p-8">
          <h2 className="section-label mb-5">How it works</h2>
          <ol className="space-y-4 text-sm text-ink-secondary">
            <li>
              <span className="font-semibold text-ink">1. Add a partner.</span> Thirty seconds —
              name and email. They get a private magic link. They never create an account.
            </li>
            <li>
              <span className="font-semibold text-ink">2. Work your referrals like always.</span>{" "}
              Leads still arrive by call or text. Logging one takes seconds, and one tap moves it
              through quote → application → bound.
            </li>
            <li>
              <span className="font-semibold text-ink">3. Your partners watch it happen.</span>{" "}
              Live statuses, automatic updates at the moments that matter, documents on bind — and a
              thank-you summary every month with your name on it.
            </li>
          </ol>
        </div>
      </section>

      <footer className="text-center text-xs text-ink-muted pb-10">
        © 2026 ReferLive · Built by agents, for agents
        <span className="block mt-1">
          <a href="/login" className="hover:underline">
            Agent sign-in
          </a>
        </span>
      </footer>
    </main>
  );
}
