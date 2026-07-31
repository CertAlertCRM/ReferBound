import { TopNav } from "../components";

export const metadata = { title: "How ReferBound works — Help" };

// The five-minute manual. Honest by design: emails send at exactly two
// moments, documents post after binding + upload (never "instantly"), and the
// portal is an addition to how partners already work — never a replacement.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="font-bold tracking-tight">{title}</h2>
      <div className="mt-2.5 text-sm text-ink-secondary leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <>
      <TopNav active="help" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">How ReferBound works</h1>
          <p className="text-sm text-ink-secondary mt-1">
            The whole idea in one sentence: every referral partner gets a private live link showing
            what&apos;s happening with the clients they sent you — so the trust builds itself while
            you just work your deals.
          </p>
        </div>

        <Section title="Getting set up (5 minutes)">
          <p>
            <strong className="text-ink">1. Profile first.</strong> Your name, agency, and headshot
            appear on every portal — it&apos;s how partners see you. Pick your portal color while
            you&apos;re there.
          </p>
          <p>
            <strong className="text-ink">2. Add your best partner.</strong> The lender or realtor
            who sends you the most. Use Smart Paste — paste their email signature or a text and
            the form fills itself.
          </p>
          <p>
            <strong className="text-ink">3. Log the deals already in motion.</strong> Before you
            share anything, add the two or three referrals you&apos;re working right now. Their
            first look should show live deals, never an empty page.
          </p>
          <p>
            <strong className="text-ink">4. Send the magic link.</strong> Copy it, text it, email
            it (AI drafts the intro), or show the QR at coffee. No login, no password, no app for
            them to install.
          </p>
        </Section>

        <Section title="Working a lead">
          <p>
            Log a lead in seconds (paste a 1003 and AI fills the details), then advance it with
            one tap as it moves: <strong className="text-ink">Working on quote → Quoted → Working
            with client → Bound → EOI &amp; docs delivered</strong>. Deals that won&apos;t close get
            marked <strong className="text-ink">Not written</strong> (the ✕ on any lead row).
          </p>
          <p>
            <strong className="text-ink">Emails send at exactly two moments</strong> — marked with
            ✉ on the buttons: when you hit <em>Quoted</em> (&ldquo;we&apos;re on it&rdquo;) and when
            you hit <em>EOI &amp; docs delivered</em> (one combined bound-plus-documents email).
            Everything else updates the portal silently. Marking a deal Not written never emails
            anyone — that conversation deserves a personal touch.
          </p>
          <p>
            <strong className="text-ink">Documents:</strong> bind the policy, gather the EOI and
            RCE, upload them to the deal, then mark docs delivered. Partners download them from
            their portal from that moment on — no digging through email threads at closing.
          </p>
        </Section>

        <Section title="The pre-delivery check">
          <p>
            Once you&apos;ve uploaded the EOI (and RCE), the deal page offers a{" "}
            <strong className="text-ink">pre-delivery check</strong>. It reads your documents
            against whatever your partner sent — the loan application, insurance request, or
            mortgagee clause — and compares the things that cause real closing problems: named
            insured and co-borrower, property address, mortgagee wording, loan number, effective
            date versus closing, and Coverage A against the replacement cost.
          </p>
          <p>
            It runs automatically when you mark <em>EOI &amp; docs delivered</em>, and if it finds
            something it stops the email until you decide. A missing co-borrower or a wrong
            mortgagee clause costs a re-upload now and a phone call during someone&apos;s closing
            week later. It stays quiet about formatting differences — &ldquo;St&rdquo; versus
            &ldquo;Street&rdquo; is not a problem, and a checker that cries wolf gets ignored. You
            can always send anyway; you know the file better than it does.
          </p>
        </Section>

        <Section title="Things that quietly protect you">
          <p>
            <strong className="text-ink">Renewal watch.</strong> Once a week, if a bound policy is
            expiring within 30 days, you get a note — because a renewal the lender never receives
            proof of is how force-placed coverage happens. Turn it off in your profile if you
            don&apos;t service renewals here.
          </p>
          <p>
            <strong className="text-ink">Their requirements, on file.</strong> In a partner&apos;s
            Edit panel there&apos;s an optional &ldquo;Their requirements&rdquo; section — the
            exact mortgagee clause, deductible caps, flood rule. Enter it once and every EOI you
            ever send that partner gets checked against it, even on deals where they never sent
            you a document.
          </p>
          <p>
            <strong className="text-ink">Coverage records.</strong> Under Log a touch you can
            record that you recommended a coverage and the client declined it. That timestamped
            line is the single most useful thing to have if a claim ever gets ugly, and it takes
            five seconds.
          </p>
          <p>
            <strong className="text-ink">The deal file.</strong> At the bottom of any deal,
            &ldquo;Print the full deal file&rdquo; produces one page with every status change,
            message, email, document, and check — timestamped. Save it as a PDF and it goes
            straight to your E&amp;O carrier or your attorney.
          </p>
        </Section>

        <Section title="What your partner sees">
          <p>
            Their portal shows every client they&apos;ve sent you: live status bars, closing-date
            countdowns, documents once delivered, and a message thread per deal. They can submit
            new referrals right from the portal — the &ldquo;who&apos;s sending this?&rdquo; picker
            keeps track of which LO or processor sent each one, so updates go to the right person.
          </p>
          <p>
            The portal is an <strong className="text-ink">addition</strong> to how you already work
            together — partners who like to call still call, and nothing about their habits has to
            change. It just means the answer to &ldquo;any update?&rdquo; is always one tap away.
          </p>
          <p>
            If a partner would rather not see your speed stats, or you&apos;re too new to have
            good ones, turn the scorecard off in your Profile — it&apos;s the &ldquo;speed
            scorecard&rdquo; checkbox.
          </p>
        </Section>

        <Section title="Notifications — email, text, or both">
          <p>
            Each partner team contact can be notified by email, text, or both (set it in the
            partner&apos;s Edit panel). Texts only go to people who&apos;ve opted in, and they can
            reply STOP anytime. You can also text anyone the portal link directly — the
            &ldquo;Text link&rdquo; button on any partner.
          </p>
          <p>
            For yourself: turn on &ldquo;Text me when a new referral arrives&rdquo; in your
            Profile — the one moment worth a buzz.
          </p>
        </Section>

        <Section title="Magic links — treat them like keys">
          <p>
            Anyone with a partner&apos;s link can see that partner&apos;s referrals. That&apos;s
            the product working — but treat links like keys: share them with the people who should
            have them, and if one gets forwarded too widely, hit{" "}
            <strong className="text-ink">Rotate magic link</strong> in the partner&apos;s Edit
            panel. The old link dies instantly; you send the new one.
          </p>
        </Section>

        <Section title="Fixing mistakes">
          <p>
            Wrong document? Trash it from the deal page — it disappears from the portal
            immediately. Accidental message? Hover it and tap the trash. Duplicate or test
            partner? Duplicate keeps the setup with a fresh link; Delete removes everything.
            Heads-up: anything that already went out by email is in their inbox — deleting stops
            the portal from showing it, but can&apos;t unsend an email.
          </p>
        </Section>

        <Section title="Getting leads into your other systems">
          <p>
            Profile → CRM &amp; AMS integrations: export leads as a spreadsheet (the
            &ldquo;new&rdquo; export skips anything already exported, so no duplicate rekeying),
            or set up the webhook to push every lead into AgencyZoom, Agency MVP, or anything
            Zapier reaches — automatically.
          </p>
        </Section>

        <Section title="Put it on your phone">
          <p>
            ReferBound installs like an app, no app store needed.{" "}
            <strong className="text-ink">iPhone:</strong> open referbound.com in Safari → Share →
            Add to Home Screen. <strong className="text-ink">Android:</strong> Chrome shows an
            Install button in the address bar. On your phone, swipe left or right to move between
            pages, or use the tab bar at the bottom.
          </p>
        </Section>

        <Section title="Questions or ideas?">
          <p>
            The 💬 feedback button (bottom of every page) goes straight to the founder. ReferBound
            is built inside a working insurance agency — what you ask for shapes what gets built,
            usually fast.
          </p>
        </Section>

        <footer className="text-center text-xs text-ink-muted pb-4">
          © 2026 Cert Alert CRM LLC · ReferBound is a Stonebind™ tool
          <span className="block mt-1">
            <a href="/terms" className="link-muted !text-xs">
              Terms of Service
            </a>
            {" · "}
            <a href="/privacy" className="link-muted !text-xs">
              Privacy Policy
            </a>
          </span>
        </footer>
      </main>
    </>
  );
}
