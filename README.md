# ReferLive — Referral Partner Portal (Pilot)

Real-time referral tracking between an insurance agent and their lending partners.
Built for the Cowart Home Loans pilot.

**Agent side** (passcode login): log leads in seconds, one-tap status updates,
upload EOI / RCE / dec page, pilot metrics at `/stats`.
**Partner side** (magic link, no login): live status board, closing-soon flags,
document downloads, 3-field referral submission.

---

## Setup (about 20 minutes)

### 1. Supabase (database + file storage)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it.
   (This creates all tables **and** the private `docs` storage bucket.)
3. Go to **Project Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Deploy to Vercel
1. Push this folder to a GitHub repo (private is fine).
2. At [vercel.com](https://vercel.com) → **Add New Project** → import the repo. Framework auto-detects as Next.js.
3. In the project's **Settings → Environment Variables**, add every variable from
   `.env.example` (see the notes in that file). You can leave `RESEND_API_KEY` and
   `EMAIL_FROM` empty for now — the app works without email; sends are logged instead.
4. Deploy. Set `APP_URL` to the URL Vercel gives you, then redeploy so email links are correct.

### 3. Email (optional, recommended before the Cowart pilot)
1. Create a free account at [resend.com](https://resend.com), verify a domain you own,
   and create an API key.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `David Falden <updates@yourdomain.com>`)
   in Vercel env vars and redeploy.

### 4. The at-risk cron
`vercel.json` schedules a daily 13:00 UTC (9am ET) check for deals closing within
7 days that aren't bound. Set `CRON_SECRET` in Vercel env vars to protect the route.
You can also trigger it manually: `GET /api/cron/at-risk?secret=YOUR_SECRET`.

### 5. First run
1. Open your deployed URL → sign in with your `AGENT_PASSCODE`.
2. Go to **Partners** → add "Cowart Home Loans" with the team's notification emails.
3. Click **Copy magic link** and text/email it to the Cowart team. That link is their portal — no signup.
4. Log your first lead from the dashboard. The timer starts when the form opens — that's your logging-speed metric on `/stats`.

---

## The pilot workflow

| Moment | What you do | What Cowart sees |
|---|---|---|
| Lead arrives (text/call/email) | **+ Log lead** — name, partner, closing date | New lead appears with status "New lead" |
| You start quoting | Tap **→ Working on quote** | Status updates live; email on "Quoted" |
| Policy bound | Tap **Bound**, upload EOI + RCE | "Bound ✔" + email |
| Docs delivered | Mark **EOI & docs delivered** | Email with download links; docs downloadable in portal |
| Closing ≤7 days, not bound | (automatic) | ⚠ flag in both views + daily alert email to both sides |

Statuses: New lead → Working on quote → Quoted → Application in progress → Bound → EOI & docs delivered. "Not written" (lost) is available anytime and is **not** emailed to the partner — that conversation stays personal.

## Pilot metrics to watch (`/stats`)
- **Avg time to log a lead** — the friction number you wanted to measure
- **Avg time to bound** and **bound rate**
- **Submitted via partner portal** — are Cowart's LOs adopting the submit form?
- **Partner emails sent** — engagement surface for the feedback conversation

## Customization
- Branding: `NEXT_PUBLIC_AGENCY_NAME`, `NEXT_PUBLIC_AGENT_NAME`, `NEXT_PUBLIC_PRODUCT_NAME` env vars (or `lib/config.ts` defaults).
- Statuses / at-risk window / document types: `lib/config.ts`.
- Colors: `tailwind.config.ts` (`brand` palette).

## Notes
- The database is only ever touched server-side with the service-role key; RLS blocks everything else. Partner access is via unguessable 64-char tokens; document downloads require the partner token or an agent session.
- No compensation tracking anywhere, by design.
- Local dev: `npm install && npm run dev` with a `.env.local` based on `.env.example`.
