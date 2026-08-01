"use client";

import { useState } from "react";
import { IconCopy, IconCheck, IconExternal, IconUsers } from "./icons";
import { useUI } from "./ui";

// The empty-state bridge.
//
// An agent with no lending partners can't show one what a portal looks like,
// because theirs is empty — so the pitch stays abstract and the meeting goes
// nowhere. This gives them a link: a live, branded, clearly-labelled sample of
// exactly what that lender would get, plus the words to send with it.
//
// It only appears while they have no partners. The moment they have one, the
// real thing is better than the sample and this gets out of the way.

export function DemoCard({ agentFirstName }: { agentFirstName?: string | null }) {
  const { toast } = useUI();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"link" | "pitch" | null>(null);

  async function make() {
    setBusy(true);
    const res = await fetch("/api/demo");
    setBusy(false);
    if (res.ok) setUrl((await res.json()).url);
    else toast("Couldn't create the link — try again", "error");
  }

  const pitch = url
    ? `Hey — I put together something for you. Every client you send me shows up on a live page with real-time status: quoted, bound, documents ready to download. You'd never have to chase me for an update or a certificate again.\n\nHere's a sample of what yours would look like: ${url}\n\nTakes me two minutes to set up your real one. Worth a look?`
    : "";

  async function copy(what: "link" | "pitch") {
    await navigator.clipboard.writeText(what === "link" ? url! : pitch);
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="card p-5 sm:p-6 border-brand-200 bg-brand-light/30 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-white text-brand grid place-items-center shrink-0 shadow-btn">
          <IconUsers size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">Show a lender what they&apos;d get</h2>
          <p className="text-sm text-ink-secondary mt-1 max-w-xl">
            The hard part of asking a loan officer for referrals is that you&apos;re asking. This
            flips it — you&apos;re handing them a tool. Send this sample portal with your name and
            branding on it, and the conversation starts from something real instead of a
            description.
          </p>
        </div>
      </div>

      {!url ? (
        <button type="button" className="btn-primary !py-2 text-sm" onClick={make} disabled={busy}>
          {busy ? "Building it…" : "Create my sample portal link"}
        </button>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 select-all break-all min-w-0 flex-1">
              {url}
            </code>
            <button type="button" className="btn-ghost !py-2 text-xs shrink-0" onClick={() => copy("link")}>
              {copied === "link" ? (
                <>
                  <IconCheck size={13} /> Copied
                </>
              ) : (
                <>
                  <IconCopy size={13} /> Copy
                </>
              )}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener"
              className="btn-ghost !py-2 text-xs shrink-0"
            >
              <IconExternal size={13} /> Preview
            </a>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-brand hover:opacity-80">
              Something to send with it
            </summary>
            <div className="mt-2 rounded-xl bg-white border border-slate-200 p-3">
              <p className="text-xs text-ink-secondary whitespace-pre-line">{pitch}</p>
              <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs mt-2.5" onClick={() => copy("pitch")}>
                {copied === "pitch" ? (
                  <>
                    <IconCheck size={12} /> Copied
                  </>
                ) : (
                  <>
                    <IconCopy size={12} /> Copy this message
                  </>
                )}
              </button>
            </div>
          </details>

          <p className="text-[11px] text-ink-muted">
            The sample is labelled as a sample on every screen and uses invented client names — it
            can&apos;t be mistaken for anyone&apos;s real file. Once you add a real partner, this
            card disappears and their live portal takes its place.
          </p>
        </div>
      )}
    </div>
  );
}
