"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { IconCheck, IconAlert, IconX } from "./icons";

// The app's own dialog layer. Replaces every native alert/confirm/prompt —
// nothing punctures a considered interface faster than a grey browser box
// reading "referbound.com says…".
//
// Toasts announce and get out of the way; confirms are deliberate and styled;
// prompts are a real form. All three resolve as promises so calling code reads
// exactly like the native versions it replaced.

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };

type ConfirmSpec = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type PromptSpec = {
  title: string;
  body?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
};

type UICtx = {
  toast: (text: string, kind?: Toast["kind"]) => void;
  // Strings are accepted so call sites read like the natives they replaced;
  // the first paragraph becomes the title, the rest the body.
  confirm: (spec: ConfirmSpec | string) => Promise<boolean>;
  prompt: (spec: PromptSpec | string) => Promise<string | null>;
};

function asConfirm(spec: ConfirmSpec | string): ConfirmSpec {
  if (typeof spec !== "string") return spec;
  const [title, ...rest] = spec.split(/\n\n+/);
  const danger = /delete|remove|permanently|can't be undone|cannot be undone/i.test(spec);
  return {
    title: title.trim(),
    body: rest.join("\n\n").trim() || undefined,
    confirmLabel: danger ? "Yes, continue" : "Confirm",
    tone: danger ? "danger" : "default",
  };
}

function asPrompt(spec: PromptSpec | string): PromptSpec {
  if (typeof spec !== "string") return spec;
  const [title, ...rest] = spec.split(/\n\n+/);
  return { title: title.trim(), body: rest.join("\n\n").trim() || undefined };
}

const Ctx = createContext<UICtx | null>(null);

export function useUI(): UICtx {
  const ctx = useContext(Ctx);
  // Falling back to natives keeps any un-migrated corner working rather than
  // throwing at the user.
  if (!ctx) {
    return {
      toast: (t) => console.log(t),
      confirm: async (s) => {
        const c = asConfirm(s);
        return window.confirm(`${c.title}${c.body ? `\n\n${c.body}` : ""}`);
      },
      prompt: async (s) => {
        const p = asPrompt(s);
        return window.prompt(p.title, p.defaultValue ?? "");
      },
    };
  }
  return ctx;
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmSpec & { resolve: (v: boolean) => void }) | null
  >(null);
  const [promptState, setPromptState] = useState<
    (PromptSpec & { resolve: (v: string | null) => void; value: string }) | null
  >(null);

  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3800);
  }, []);

  const confirm = useCallback(
    (spec: ConfirmSpec | string) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...asConfirm(spec), resolve })),
    []
  );

  const promptFn = useCallback(
    (spec: PromptSpec | string) =>
      new Promise<string | null>((resolve) => {
        const p = asPrompt(spec);
        setPromptState({ ...p, resolve, value: p.defaultValue ?? "" });
      }),
    []
  );

  // Escape closes whichever dialog is open, the way a real app behaves.
  useEffect(() => {
    if (!confirmState && !promptState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmState) {
        confirmState.resolve(false);
        setConfirmState(null);
      }
      if (promptState) {
        promptState.resolve(null);
        setPromptState(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmState, promptState]);

  return (
    <Ctx.Provider value={{ toast, confirm, prompt: promptFn }}>
      {children}

      {/* Toasts — bottom-left on desktop so they never fight the feedback pill
          or the mobile tab bar. */}
      <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2 pointer-events-none print:hidden max-w-[min(22rem,calc(100vw-2rem))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in pointer-events-auto rounded-xl border shadow-lift px-4 py-3 flex items-start gap-2.5 text-sm ${
              t.kind === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : t.kind === "info"
                  ? "bg-white border-slate-200 text-ink"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {t.kind === "error" ? <IconAlert size={15} /> : t.kind === "info" ? null : <IconCheck size={15} />}
            </span>
            <span className="leading-snug">{t.text}</span>
            <button
              className="ml-auto shrink-0 opacity-40 hover:opacity-100 transition-opacity"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Dismiss"
            >
              <IconX size={13} />
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <Scrim
          onClose={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
        >
          <h3 className="text-lg font-bold tracking-tight">{confirmState.title}</h3>
          {confirmState.body && (
            <p className="text-sm text-ink-secondary mt-2 leading-relaxed">{confirmState.body}</p>
          )}
          <div className="flex gap-2 mt-5 justify-end">
            <button
              className="btn-ghost !py-2 text-xs"
              onClick={() => {
                confirmState.resolve(false);
                setConfirmState(null);
              }}
            >
              {confirmState.cancelLabel ?? "Cancel"}
            </button>
            <button
              className={`!py-2 text-xs ${confirmState.tone === "danger" ? "btn-danger" : "btn-primary"}`}
              autoFocus
              onClick={() => {
                confirmState.resolve(true);
                setConfirmState(null);
              }}
            >
              {confirmState.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </Scrim>
      )}

      {promptState && (
        <Scrim
          onClose={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
        >
          <h3 className="text-lg font-bold tracking-tight">{promptState.title}</h3>
          {promptState.body && <p className="text-sm text-ink-secondary mt-2">{promptState.body}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              promptState.resolve(promptState.value);
              setPromptState(null);
            }}
          >
            <input
              className="input mt-3"
              autoFocus
              placeholder={promptState.placeholder}
              value={promptState.value}
              onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                type="button"
                className="btn-ghost !py-2 text-xs"
                onClick={() => {
                  promptState.resolve(null);
                  setPromptState(null);
                }}
              >
                Cancel
              </button>
              <button className="btn-primary !py-2 text-xs">
                {promptState.confirmLabel ?? "Continue"}
              </button>
            </div>
          </form>
        </Scrim>
      )}
    </Ctx.Provider>
  );
}

function Scrim({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card p-6 max-w-md w-full shadow-xl animate-dialog-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
