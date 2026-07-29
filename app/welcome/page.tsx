import { Wordmark } from "../components";

// Public landing page. Unauthenticated visitors to "/" are rewritten here by
// the middleware; the logged-in agent still sees their dashboard at "/".

export const metadata = {
  title: "ReferBound — Live referral tracking for insurance agents",
  description:
    "Give your realtor, lender, and CPA partners a live window into every client they send you. Status updates, instant EOI delivery, closing-date protection.",
};

const FEATURES = [
  {
    title: "A live portal for every partner",
    body: "Each partner gets a private link — no logins, no passwords — showing the clients they've sent you and where each one stands. Fewer “any update?” calls and texts.",
  },
  {
    title: "Documents in one place",
    body: "When you bind and upload the EOI and RCE, your partner downloads them straight from their portal — no digging through email threads before a closing.",
  },
  {
    title: "Closing-date alerts",
    body: "If a referral is within a week of its closing date and not yet bound, both sides get flagged automatically so it gets attention in time.",
  },
  {
    title: "Updates without extra work",
    body: "Key status changes send your partner a short email automatically, and a monthly summary recaps what their referrals turned into — with your name on it.",
  },
];

export default function WelcomePage() {
  return (
    <main className="min-h-screen">
      {/* Top bar with sign-in for existing accounts */}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Wordmark />
          <a href="/login" className="btn-primary !px-5">
            Sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-14 pb-12 text-center">
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          Your referral partners deserve better than{" "}
          <span className="text-brand">&ldquo;any update?&rdquo;</span>
        </h1>
        <p className="mt-4 text-lg text-ink-secondary max-w-xl mx-auto">
          ReferBound gives insurance agents a shared portal with their lender, realtor, and CPA
          partners — live status on every referred client, document downloads once policies are
          bound, and automatic alerts when a closing is approaching without coverage in place.
        </p>
        <div className="mt-8 max-w-md mx-auto space-y-3">
          <a href="/signup" className="btn-primary w-full !py-3 text-base">
            Create your free account
          </a>
          <p className="text-xs text-ink-muted">
            Free includes your first partner with every feature — no card required. Pro is $20/mo for
            unlimited partners; Agency is $99/mo. Built inside a working insurance agency.
          </p>
        </div>

        {/* Product preview — what a partner sees */}
        <div className="mt-12 max-w-lg mx-auto text-left">
          <div className="card overflow-hidden shadow-lift">
            <div className="bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600 px-5 py-4 text-white">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-100">
                <span className="live-dot" aria-hidden />
                Live referral tracking
              </div>
              <p className="text-base font-bold tracking-tight mt-1.5">
                Summit Home Loans <span className="font-normal text-brand-200">×</span> Your Agency
              </p>
            </div>
            <div className="p-4 space-y-2.5">
              {[
                { name: "Jordan M.", meta: "Closing Aug 14 (9d)", pill: "Bound ✓", pillCls: "bg-emerald-50 text-emerald-700", segs: 6, done: true },
                { name: "Riley T.", meta: "Closing Aug 22 (17d)", pill: "Quoted", pillCls: "bg-blue-50 text-blue-700", segs: 3 },
                { name: "Casey B.", meta: "Referred yesterday", pill: "Working on quote", pillCls: "bg-amber-50 text-amber-700", segs: 2 },
              ].map((d) => (
                <div key={d.name} className="rounded-xl border border-slate-100 p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{d.name}</p>
                      <p className="text-[11px] text-ink-muted">{d.meta}</p>
                    </div>
                    <span className={`badge ${d.pillCls}`}>{d.pill}</span>
                  </div>
                  <div className="flex gap-1 mt-2.5">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className={`seg ${i < d.segs ? (d.done ? "seg-done" : "seg-filled") : ""}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-ink-muted mt-3">
            What your lending partner sees — live, from one link, no login.
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
        © 2026 Cert Alert CRM LLC · ReferBound is a{" "}
        <a href="https://stonebind.com" className="hover:underline font-medium text-ink-secondary">
          Stonebind™
        </a>{" "}
        tool · Built by agents, for agents
        <span className="block mt-1">
          Already have an account?{" "}
          <a href="/login" className="link !text-xs">
            Sign in
          </a>
        </span>
      </footer>
    </main>
  );
}
