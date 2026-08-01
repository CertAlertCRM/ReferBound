import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { db, DOCS_BUCKET } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/config";
import { themeStyle } from "@/lib/themes";
import { DEMO_DEALS, DEMO_STATS } from "@/lib/demo";
import { IconCheck, IconDownload, IconMail, IconPhone } from "../../icons";

export const dynamic = "force-dynamic";

// The demo portal.
//
// An agent with no lending partners has to walk into an office and describe
// software. This is the thing they hand over instead — a live page, their
// branding, showing exactly what that loan officer would get.
//
// Two rules held the whole way down: every client name says "Sample," and the
// banner never scrolls out of the way. A prospect must never be able to mistake
// this for a real board of real people, and the agent must never be able to
// pass it off as one.

export async function generateMetadata({ params }: { params: { token: string } }) {
  return { title: "Sample Referral Portal", robots: { index: false, follow: false } };
}

function fmtDay(days: number | null) {
  if (days === null) return "no closing date";
  const d = new Date(Date.now() + days * 86400000);
  return `closes ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default async function DemoPortal({ params }: { params: { token: string } }) {
  noStore();
  const token = params.token.replace(/[^a-f0-9]/gi, "");
  if (!token) notFound();

  const { data: account } = await db()
    .from("accounts")
    .select("id")
    .eq("demo_token", token)
    .maybeSingle();
  if (!account) notFound();

  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name, agency_name, phone, email, headshot_path, brand_color")
    .eq("account_id", account.id)
    .maybeSingle();

  let headshotUrl: string | null = null;
  if (prof?.headshot_path) {
    const { data: signed } = await db()
      .storage.from(DOCS_BUCKET)
      .createSignedUrl(prof.headshot_path, 60 * 60);
    headshotUrl = signed?.signedUrl ?? null;
  }

  const agent = prof?.display_name || "Your insurance agent";
  const agency = prof?.agency_name || "";

  return (
    <div style={themeStyle(prof?.brand_color)} className="min-h-screen bg-canvas">
      {/* Never dismissible, never scrolled past. */}
      <div className="sticky top-0 z-30 bg-amber-500 text-white text-xs font-semibold px-4 py-2.5 text-center">
        Sample portal — example data, to show what your live board would look like
      </div>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <header className="card p-5 sm:p-6">
          <div className="flex items-center gap-4">
            {headshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headshotUrl} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0" />
            ) : null}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                Your referral portal
              </p>
              <h1 className="text-xl font-bold tracking-tight mt-0.5">{agent}</h1>
              {agency && <p className="text-sm text-ink-secondary">{agency}</p>}
              <div className="flex flex-wrap gap-3 mt-2">
                {prof?.phone && (
                  <span className="text-xs text-ink-muted inline-flex items-center gap-1.5">
                    <IconPhone size={12} /> {prof.phone}
                  </span>
                )}
                {prof?.email && (
                  <span className="text-xs text-ink-muted inline-flex items-center gap-1.5">
                    <IconMail size={12} /> {prof.email}
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="text-sm text-ink-secondary mt-4">
            Every client you send lands here with live status — quoted, bound, documents out — so
            you can check where a file stands without calling anyone. It doesn&apos;t replace how
            you and {agent.split(" ")[0]} already work. Call, text, email exactly as you do now;
            this is just always on when you want it.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { v: `${DEMO_STATS.avgQuoteHours}h`, l: "Average to quote" },
            { v: `${DEMO_STATS.avgBindDays}d`, l: "Average to bound" },
            { v: `${DEMO_STATS.readyByClosing}%`, l: "Ready by closing" },
          ].map((t) => (
            <div key={t.l} className="card px-4 py-3">
              <p className="tabnum text-xl font-semibold tracking-tight">{t.v}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{t.l}</p>
            </div>
          ))}
        </div>

        <section className="space-y-2.5">
          <h2 className="section-label">Your pipeline</h2>
          {DEMO_DEALS.map((d) => (
            <div key={d.client} className="card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{d.client}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {d.address}
                    {d.coborrower ? ` · with ${d.coborrower}` : ""} · {fmtDay(d.closingInDays)}
                  </p>
                </div>
                <span
                  className={`badge shrink-0 ${
                    ["bound", "docs_delivered"].includes(d.status)
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-brand-light text-brand"
                  }`}
                >
                  {["bound", "docs_delivered"].includes(d.status) && <IconCheck size={11} />}{" "}
                  {STATUS_LABELS[d.status] ?? d.status}
                </span>
              </div>
              {d.note && <p className="text-xs text-ink-secondary mt-2">{d.note}</p>}
              {d.docs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {d.docs.map((doc) => (
                    <span
                      key={doc}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-secondary"
                    >
                      <IconDownload size={12} /> {doc}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="card p-5">
          <h2 className="section-label mb-2">What you&apos;d also get</h2>
          <ul className="space-y-2 text-sm text-ink-secondary">
            <li>
              A documents desk — every EOI and dec page ready to pull into the file, plus the exact
              mortgagee wording to copy. Documents are emailed to you when they&apos;re issued, so
              you never have to come here to get one.
            </li>
            <li>
              Your processors on the document emails automatically, so nobody has to forward
              anything.
            </li>
            <li>
              A cross-check before anything is sent — coborrower, mortgagee clause, loan number,
              property address — so the corrections you normally catch never reach you.
            </li>
            <li>Send a referral straight from the portal, or just email it the way you do now.</li>
          </ul>
        </section>

        <p className="text-center text-[11px] text-ink-muted pb-6">
          Sample data. Ask {agent.split(" ")[0]} for your real portal link and this fills with your
          own clients.
        </p>
      </main>
    </div>
  );
}
