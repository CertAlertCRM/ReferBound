import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/lib/db";
import { themeStyle } from "@/lib/themes";
import { normalizeLocale, localeFromHeader, translator, LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n";
import { JoinForm } from "./join-form";

// The universal share link.
//
// Everything before this page assumed a partner exists because an agent typed
// them in. This inverts it: an agent posts one link to their Instagram story
// or their email signature, and the people who already send them business add
// themselves.
//
// Three things make it safe to put a URL like this in public:
//
//   1. It resolves to ONE agent, by a rotatable code. If the link gets
//      scraped or passed somewhere unwanted, rotating it kills that URL
//      without touching anybody already approved.
//   2. Nothing it creates is real. A submission is a request — no portal
//      token, no notification to anyone, no plan seat consumed — until the
//      agent approves it. A stranger finding the link cannot spend a free
//      agent's only lender seat.
//   3. It reads nothing back. The page shows the agency's name and a sample
//      portal; it never lists real partners, real clients, or anything about
//      the book.
//
// Public, so no session, no middleware protection, and deliberately no
// indexable content beyond the agency name.

export const dynamic = "force-dynamic";

async function resolveAgent(code: string) {
  const slug = String(code ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
  if (!slug) return null;
  const { data: account } = await db()
    .from("accounts")
    .select("id, demo_token")
    .eq("partner_join_code", slug)
    .maybeSingle();
  if (!account) return null;
  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name, agency_name, brand_color")
    .eq("account_id", account.id)
    .maybeSingle();
  return {
    accountId: account.id as string,
    demoToken: (account.demo_token as string | null) ?? null,
    agentName: (prof?.display_name as string | null) || null,
    agencyName: (prof?.agency_name as string | null) || (prof?.display_name as string | null) || null,
    brandColor: (prof?.brand_color as string | null) ?? null,
  };
}

export async function generateMetadata({ params }: { params: { code: string } }) {
  const agent = await resolveAgent(params.code);
  const agency = agent?.agencyName ?? "our agency";
  return {
    title: `Referral portal — ${agency}`,
    description: `See every referral you send ${agency} the whole way through.`,
    // A link meant for one audience has no business in search results.
    robots: { index: false, follow: false },
  };
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { lang?: string };
}) {
  noStore();
  const agent = await resolveAgent(params.code);
  if (!agent) notFound();

  // No partner record exists yet, so there is no stored preference to read.
  // The URL wins if the agent sent a Spanish link; otherwise the visitor's own
  // phone decides, which is the whole point for somebody arriving cold.
  const locale: Locale = searchParams.lang
    ? normalizeLocale(searchParams.lang)
    : localeFromHeader(headers().get("accept-language"));
  const tr = translator(locale);

  const agency = agent.agencyName ?? "our agency";
  const who = agent.agentName ?? agency;

  const steps = [
    { title: tr("join.step1.title"), body: tr("join.step1.body") },
    { title: tr("join.step2.title"), body: tr("join.step2.body") },
    { title: tr("join.step3.title"), body: tr("join.step3.body") },
  ];

  return (
    <div className="min-h-screen bg-canvas" style={themeStyle(agent.brandColor)}>
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-14 space-y-8">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <p className="section-label text-brand">{tr("join.eyebrow")}</p>
            {/* Plain links, not a script — this page has to work for somebody
                on a bad connection who tapped through from a story. */}
            <div className="flex items-center gap-1 text-xs">
              {LOCALES.map((l) => (
                <Link
                  key={l}
                  href={`/join/${params.code}?lang=${l}`}
                  aria-current={l === locale ? "true" : undefined}
                  className={
                    l === locale
                      ? "rounded-md bg-brand-light px-2 py-1 font-semibold text-brand-700"
                      : "rounded-md px-2 py-1 text-ink-muted hover:text-ink"
                  }
                >
                  {LOCALE_NAMES[l]}
                </Link>
              ))}
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
            {tr("join.headline")}
          </h1>
          <p className="text-base text-ink-secondary">{tr("join.sub", { agency })}</p>
        </header>

        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="card p-4 flex gap-3.5">
              <span className="shrink-0 w-7 h-7 rounded-full bg-brand text-white grid place-items-center text-sm font-bold tabular-nums">
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold text-sm">{s.title}</span>
                <span className="block text-sm text-ink-secondary mt-0.5">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* The walkthrough's escape hatch: a real sample portal to click
            around in before handing over an email address. Only rendered when
            the agent actually has a demo token — a dead link would be worse
            than no link. */}
        {agent.demoToken && (
          <a
            href={`/demo/${agent.demoToken}?lang=${locale}`}
            className="block card card-hover p-4 text-sm font-semibold text-brand"
          >
            {tr("join.demo")} →
          </a>
        )}

        <JoinForm code={params.code} locale={locale} agentName={who} />

        <p className="text-[11px] text-ink-muted text-center">
          {agency} · ReferBound
        </p>
      </div>
    </div>
  );
}
