import { TopNav } from "../components";

export const metadata = { title: "How ReferBound works — Help" };

// The five-minute manual. Honest by design: emails send at exactly two
// moments, documents post after binding + upload (never "instantly"), and the
// portal is an addition to how partners already work — never a replacement.
//
// Structure matters as much as the words here. Seventeen sections stacked open
// is a wall nobody reads — an agent arrives with one question, not seventeen.
// So the page is a set of collapsed answers grouped by when you'd need them,
// with only the two setup sections open. Native <details> keeps this a server
// component: no client JS, works with browser find-in-page on most browsers,
// and every heading is still a real heading for search engines.

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="section-label px-1">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Item({
  title,
  hint,
  open,
  children,
}: {
  title: string;
  hint?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="card group overflow-hidden" open={open}>
      <summary className="flex items-start justify-between gap-3 p-4 sm:p-5 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden hover:bg-slate-50/70 transition-colors">
        <span className="min-w-0">
          <span className="block font-bold tracking-tight text-[15px]">{title}</span>
          {hint && (
            <span className="block text-xs text-ink-muted mt-0.5 group-open:hidden">{hint}</span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 mt-1 text-ink-muted transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="px-4 sm:px-5 pb-5 -mt-1 text-sm text-ink-secondary leading-relaxed space-y-3">
        {children}
      </div>
    </details>
  );
}

export default function HelpPage() {
  return (
    <>
      <TopNav active="help" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">How ReferBound works</h1>
          <p className="text-sm text-ink-secondary mt-1">
            The whole idea in one sentence: every referral partner gets a private live link showing
            what&apos;s happening with the clients they sent you — so the trust builds itself while
            you just work your deals.
          </p>
          <p className="text-xs text-ink-muted mt-2">Tap any heading to open it.</p>
        </div>

        <Group title="Start here">
          <Item title="Getting set up (5 minutes)" open>
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
          </Item>

          <Item title="Working a lead" open>
            <p>
              Log a lead in seconds (paste a loan document and AI fills the details), then advance it with
              one tap as it moves: <strong className="text-ink">Working on quote → Quoted → Working
              with client → Bound → EOI &amp; docs delivered</strong>. Deals that won&apos;t close
              get marked <strong className="text-ink">Not written</strong> (the ✕ on any lead row).
            </p>
            <p>
              <strong className="text-ink">Emails send at exactly two moments</strong> — marked with
              ✉ on the buttons: when you hit <em>Quoted</em> (&ldquo;we&apos;re on it&rdquo;) and
              when you hit <em>EOI &amp; docs delivered</em> (one combined bound-plus-documents
              email). Everything else updates the portal silently. Marking a deal Not written never
              emails anyone — that conversation deserves a personal touch.
            </p>
            <p>
              <strong className="text-ink">Documents:</strong> bind the policy, gather the EOI and
              RCE, upload them to the deal, then mark docs delivered. Partners download them from
              their portal from that moment on — no digging through email threads at closing.
            </p>
          </Item>

          <Item title="Starting from nothing" hint="No partners yet — two ways in">
            <p>
              No partners yet? Two doors. <strong className="text-ink">Someone has sent me a client
              before</strong> walks you through adding that person — a loan officer, a realtor, a
              friend, a past client — and backfilling what they&apos;ve already sent, so you have a
              real close ratio in about five minutes. That number is what makes the next
              conversation easy.
            </p>
            <p>
              Or <strong className="text-ink">show a lender what they&apos;d get</strong> — a live
              sample portal with your name and branding on it, clearly labelled as a sample, that
              you can send with a one-line message. It turns &ldquo;will you send me
              business?&rdquo; into &ldquo;here&apos;s what I&apos;d give you.&rdquo;
            </p>
            <p>
              Free includes one lender partner plus two others — realtors, CPAs, whoever sends you
              people. The lender seat is the one Pro unlocks.
            </p>
          </Item>
        </Group>

        <Group title="Getting referrals in">
          <Item title="Email intake — forward instead of typing" hint="Your private forwarding address">
            <p>
              Most referrals arrive as an email, not a portal submission. Under{" "}
              <strong className="text-ink">Intake</strong> you&apos;ll find a forwarding address
              that belongs only to you. Forward the loan officer&apos;s introduction to it and it
              becomes a lead: the sender matched to the right partner, the client details pulled
              out, and a short &ldquo;got it, I&apos;m on the quote&rdquo; reply sent back in your
              words.
            </p>
            <p>
              It reads the subject line as well as the body — lender subjects are often structured
              enough to carry the client and the address on their own — and it reads attachments, so
              a three-word email with a loan document attached still produces a full lead.
            </p>
            <p>
              Anything from a sender we don&apos;t recognize waits in Intake for you rather than
              becoming a lead on its own, and nothing is ever auto-replied to a stranger. You can
              turn off the automatic logging or the automatic reply in your profile.
            </p>
            <p>
              Two things it can&apos;t read, so you know rather than wonder. A message your mail
              system encrypted (Outlook&apos;s &ldquo;Encrypt&rdquo; button produces a{" "}
              <code className="text-[12px]">.rpmsg</code> file) is sealed to your identity and
              can&apos;t be opened by us — we take what the subject line gives and say so. And a
              password-protected PDF needs the password; open the document on the deal, choose
              Unlock, and paste the one the lender sent separately.
            </p>
          </Item>

          <Item title="What your partner sees" hint="Their side of the magic link">
            <p>
              Their portal shows every client they&apos;ve sent you: live status bars, closing-date
              countdowns, documents once delivered, and a message thread per deal. They can submit
              new referrals right from the portal — the &ldquo;who&apos;s sending this?&rdquo;
              picker keeps track of which LO or processor sent each one, so updates go to the right
              person.
            </p>
            <p>
              The portal is an <strong className="text-ink">addition</strong> to how you already
              work together — partners who like to call still call, and nothing about their habits
              has to change. It just means the answer to &ldquo;any update?&rdquo; is always one tap
              away.
            </p>
            <p>
              If a partner would rather not see your speed stats, or you&apos;re too new to have
              good ones, turn the scorecard off in your Profile — it&apos;s the &ldquo;speed
              scorecard&rdquo; checkbox.
            </p>
          </Item>
        </Group>

        <Group title="Getting to the closing table">
          <Item title="The pre-delivery check" hint="Catches the things that kick a file back">
            <p>
              Once you&apos;ve uploaded the EOI (and RCE), the deal page offers a{" "}
              <strong className="text-ink">pre-delivery check</strong>. It reads your documents
              against whatever your partner sent — the loan document, insurance request, or
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
          </Item>

          <Item title="Your client's three emails" hint="Quote, check-in, welcome — all manual">
            <p>
              Every deal has two audiences. On the deal page, under{" "}
              <strong className="text-ink">The client</strong>, are the three messages you&apos;d
              otherwise type by hand: the quote, a check-in, and the welcome.
            </p>
            <p>
              <strong className="text-ink">Send quote</strong> emails the client with the loan
              officer copied on the same thread — the way you already send it — and marks the deal
              Quoted, so that&apos;s one action instead of three. If a quote has been sitting three
              days with no answer, a check-in button appears. Once the policy is bound,{" "}
              <strong className="text-ink">Send welcome</strong> gives the client their own copy of
              the proof of insurance, separate from the lender&apos;s.
            </p>
            <p>
              <strong className="text-ink">Nothing customer-facing ever sends on its own.</strong>{" "}
              Every one of these is a button you press. A mistake to a partner is awkward; a mistake
              to a customer is your reputation.
            </p>
          </Item>

          <Item title="Closing week" hint="What's still open, grouped by day">
            <p>
              <strong className="text-ink">Closing</strong> in the nav shows every file with a
              closing date in the next 7, 14, or 30 days, grouped by day, with exactly what&apos;s
              still open on each: not bound, no EOI, documents not delivered, check not run,
              blockers unresolved. Red is a real problem, amber is worth a look, and a file with
              nothing open is marked Ready.
            </p>
            <p>
              Your partners can correct a date from their own portal. When a closing moves you get
              an email — and a text if it moved <em>up</em>, because that&apos;s a file that just
              became urgent without anyone touching it. The board shows &ldquo;moved from&rdquo; so
              you can see the change rather than just a different number.
            </p>
          </Item>
        </Group>

        <Group title="Working with different partners">
          <Item title="Realtors are worth more than one client" hint="The shorter track, and the loan officer behind it">
            <p>
              When you add a partner as a Realtor, their referrals run a shorter track — got it,
              working it, covered — because a realtor doesn&apos;t need the EOI pipeline. What they
              do have is the loan officer on the other side of the deal, and they&apos;re the only
              person who knows all three of you.
            </p>
            <p>
              Their portal asks who&apos;s handling the loan (the honest reason: so you can send
              documents straight to the lender instead of routing them through the realtor), and the
              deal grows a panel with two drafts — a note to that loan officer, or a request that
              the realtor introduce you. Both wait until the file is <em>covered</em>, because a
              loan officer who just watched your EOI land correct and early is a different
              conversation from a cold one. Nothing sends; you read and edit first.
            </p>
          </Item>

          <Item title="For processors: your clause library" hint="Import the mortgagee sheet they already keep">
            <p>
              A processor doesn&apos;t have one mortgagee clause, they have fifteen. On the
              documents desk in their portal they can upload the sheet they already keep — a
              spreadsheet, a PDF, a photo of the printed one — and it&apos;s read into a library.
              Every clause is shown for review before saving, because a clause gets a file kicked
              back over one wrong word.
            </p>
            <p>
              Each deal then gets the right clause. Most of the time it&apos;s matched automatically
              from the loan type or investor named on the file; when it&apos;s a guess it says so,
              and when a processor sets one by hand nothing overwrites it. They can upload their
              insurance requirements the same way, and every EOI you send gets checked against them.
            </p>
          </Item>

          <Item title="Notifications — email, text, or both">
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
          </Item>

          <Item title="Magic links — treat them like keys">
            <p>
              Anyone with a partner&apos;s link can see that partner&apos;s referrals. That&apos;s
              the product working — but treat links like keys: share them with the people who should
              have them, and if one gets forwarded too widely, hit{" "}
              <strong className="text-ink">Rotate magic link</strong> in the partner&apos;s Edit
              panel. The old link dies instantly; you send the new one.
            </p>
          </Item>
        </Group>

        <Group title="Good to know">
          <Item title="Things that quietly protect you" hint="Renewal watch, coverage records, the deal file">
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
              <strong className="text-ink">Loan documents are never stored.</strong> A borrower&apos;s
              loan paperwork carries their SSN, income, and assets — none of which is needed to
              quote. However one reaches us, forwarded or uploaded, it&apos;s read once and
              discarded. What it said lands on the referral: names, both dates of birth, the
              address, the closing date, the loan number. The original stays wherever you already
              have it. The timeline records that it arrived and what it filled in.
            </p>
            <p>
              <strong className="text-ink">The deal file.</strong> At the bottom of any deal,
              &ldquo;Print the full deal file&rdquo; produces one page with every status change,
              message, email, document, and check — timestamped. Save it as a PDF and it goes
              straight to your E&amp;O carrier or your attorney.
            </p>
          </Item>

          <Item title="Fixing mistakes">
            <p>
              Wrong document? Trash it from the deal page — it disappears from the portal
              immediately. Accidental message? Hover it and tap the trash. Duplicate or test
              partner? Duplicate keeps the setup with a fresh link; Delete removes everything.
              Heads-up: anything that already went out by email is in their inbox — deleting stops
              the portal from showing it, but can&apos;t unsend an email.
            </p>
          </Item>

          <Item title="Getting leads into your other systems" hint="CSV export and webhooks">
            <p>
              Profile → CRM &amp; AMS integrations: export leads as a spreadsheet (the
              &ldquo;new&rdquo; export skips anything already exported, so no duplicate rekeying),
              or set up the webhook to push every lead into AgencyZoom, Agency MVP, or anything
              Zapier reaches — automatically.
            </p>
          </Item>

          <Item title="Put it on your phone">
            <p>
              ReferBound installs like an app, no app store needed.{" "}
              <strong className="text-ink">iPhone:</strong> open referbound.com in Safari → Share →
              Add to Home Screen. <strong className="text-ink">Android:</strong> Chrome shows an
              Install button in the address bar. On your phone, swipe left or right to move between
              pages, or use the tab bar at the bottom.
            </p>
          </Item>
        </Group>

        <section className="card p-5 bg-brand-light/30 border-brand-200">
          <h2 className="font-bold tracking-tight text-[15px]">Questions or ideas?</h2>
          <p className="mt-1.5 text-sm text-ink-secondary leading-relaxed">
            The 💬 feedback button (bottom of every page) goes straight to the founder. ReferBound is
            built inside a working insurance agency — what you ask for shapes what gets built,
            usually fast.
          </p>
        </section>

        <footer className="text-center text-xs text-ink-muted pb-4">
          © 2026 Cert Alert CRM LLC · ReferBound is a Stonebind™ tool
          <span className="block mt-1">
            <a href="/terms" className="link-muted !text-xs">
              Terms of Service
            </a>
            {" · "}
            <a href="/security" className="link-muted !text-xs">
              Security
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
