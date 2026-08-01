"use client";

import Link from "next/link";
import { DemoCard } from "./demo-card";
import { IconArrowRight, IconUsers } from "./icons";

// The first screen of an agent with no partners.
//
// Two honest paths, because there are two honest situations. Someone has sent
// them a client before — in which case the fastest route to a product that
// means anything is to get that history in. Or nobody has, in which case the
// problem isn't tracking, it's the conversation they haven't had yet, and what
// they need is something to bring to it.
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
          ReferBound organizes the clients your referral partners send you. Two ways in, depending
          on where you are.
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

      <DemoCard agentFirstName={agentFirstName} />
    </div>
  );
}
