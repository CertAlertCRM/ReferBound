"use client";

import Link from "next/link";
import { DemoCard } from "./demo-card";
import { IconArrowRight, IconUsers, IconZap } from "./icons";

// The first screen of an agent with no partners.
//
// Three honest paths, because there are three honest situations — and the one
// added last is the one most new producers are actually in. They have no
// partners and nobody has ever sent them a client; they buy leads and work
// them. The old version opened by describing a product for somebody else,
// which is the worst possible first sentence.
//
// It matters mechanically too, not just tonally: "Referred by" is a required
// field and it only lists sources that exist, so a producer with no sources
// cannot log their first deal at all until they add one.
//
// Deliberately not a checklist. A new agent staring at six setup tasks closes
// the tab.

export function EmptyStart({ agentFirstName }: { agentFirstName?: string | null }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">
          {agentFirstName ? `Let's get you started, ${agentFirstName}` : "Let's get you started"}
        </h2>
        <p className="text-sm text-ink-secondary mt-1 max-w-xl">
          ReferBound tracks where your business comes from — and turns the clients you write into
          the next ones. Start wherever you actually are.
        </p>
      </div>

      <Link href="/start" className="card card-hover p-5 sm:p-6 flex items-start gap-3 block">
        <span className="w-9 h-9 rounded-xl bg-brand-light text-brand grid place-items-center shrink-0">
          <IconUsers size={17} />
        </span>
        <span className="min-w-0">
          <span className="font-semibold block">Someone has sent me a client before</span>
          <span className="text-sm text-ink-secondary block mt-1 max-w-xl">
            A loan officer, a realtor, a friend, a client who keeps sending people — it counts. Add
            them and the clients they&apos;ve already sent, and you&apos;ll have a real close ratio
            and real premium numbers in about five minutes. That&apos;s the number that makes the
            next conversation easy.
          </span>
          <span className="link !text-xs mt-2 inline-flex">
            Start here <IconArrowRight size={12} />
          </span>
        </span>
      </Link>

      <Link
        href="/partners?source=paid"
        className="card card-hover p-5 sm:p-6 flex items-start gap-3 block"
      >
        <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 grid place-items-center shrink-0">
          <IconZap size={17} />
        </span>
        <span className="min-w-0">
          <span className="font-semibold block">I&apos;m working leads I pay for</span>
          <span className="text-sm text-ink-secondary block mt-1 max-w-xl">
            Add the vendor you buy from, then log the ones you win. Every client you write is
            somebody who can send you the next one, and this is where you&apos;ll see who
            you&apos;ve asked and who you haven&apos;t.
          </span>
          <span className="link !text-xs mt-2 inline-flex">
            Add my lead source <IconArrowRight size={12} />
          </span>
        </span>
      </Link>

      <DemoCard agentFirstName={agentFirstName} />
    </div>
  );
}
