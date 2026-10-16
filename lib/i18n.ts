// Partner-facing language.
//
// Scope, decided deliberately: this translates the PRODUCT'S words — buttons,
// labels, status names, the join page, the stock invite — and never the
// AGENT'S words. An agent's saved voice templates send exactly as they wrote
// them. Running those through a translator would put Spanish an agent never
// wrote, and cannot check, in front of their client under their own name. For
// a product whose standing rule is that nothing customer-facing goes out
// unchecked, that is the wrong trade, and a bilingual agent can write their own
// Spanish templates better than any machine will.
//
// No library. A dictionary of this size does not justify a dependency, and the
// shape below — both languages on adjacent lines — means a missing or lazy
// translation is visible when reading the file rather than at runtime in front
// of somebody's realtor.
//
// Agent-facing screens stay English. The agent chose English when they signed
// up; it is their partners and clients who may not share it.

export type Locale = "en" | "es";

export const LOCALES: Locale[] = ["en", "es"];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

export function normalizeLocale(v: unknown): Locale {
  const s = String(v ?? "").trim().toLowerCase().slice(0, 2);
  return s === "es" ? "es" : "en";
}

// Accept-Language, used only as a last resort on the public join page where
// there is no partner record to read a preference from. A stranger arriving
// from a Spanish-language phone should not have to find the toggle first.
export function localeFromHeader(header: string | null | undefined): Locale {
  const h = String(header ?? "").toLowerCase();
  if (!h) return "en";
  // Crude on purpose: the first tag that mentions Spanish before any that
  // mentions English wins. Quality values are not worth parsing for two
  // languages.
  const es = h.indexOf("es");
  const en = h.indexOf("en");
  if (es === -1) return "en";
  if (en === -1) return "es";
  return es < en ? "es" : "en";
}

type Entry = { en: string; es: string };

const DICT: Record<string, Entry> = {
  // ── The join page ─────────────────────────────────────────────────────────
  "join.eyebrow": { en: "Referral portal", es: "Portal de referencias" },
  "join.headline": {
    en: "See every referral you send, the whole way through",
    es: "Vea cada referencia que envía, de principio a fin",
  },
  "join.sub": {
    en: "{agency} gives the people who send them business a live view of what happened next. Add yourself below and you'll have your own.",
    es: "{agency} les da a las personas que le envían negocio una vista en vivo de lo que pasó después. Regístrese abajo y tendrá la suya.",
  },
  "join.step1.title": { en: "Send a referral the way you already do", es: "Envíe una referencia como siempre lo hace" },
  "join.step1.body": {
    en: "A call, a text, a name on a sticky note. Nothing about how you work has to change.",
    es: "Una llamada, un mensaje, un nombre en una nota. Nada de cómo trabaja tiene que cambiar.",
  },
  "join.step2.title": { en: "Watch it move", es: "Vea su progreso" },
  "join.step2.body": {
    en: "Quoted, bound, documents ready — the status updates as it happens, without you asking.",
    es: "Cotizado, emitido, documentos listos — el estado se actualiza solo, sin que tenga que preguntar.",
  },
  "join.step3.title": { en: "Pull the documents when you need them", es: "Descargue los documentos cuando los necesite" },
  "join.step3.body": {
    en: "Proof of insurance and declarations land in the portal once the policy is bound. No login, just your link.",
    es: "La prueba de seguro y las declaraciones aparecen en el portal una vez emitida la póliza. Sin contraseña, solo su enlace.",
  },
  "join.demo": { en: "See a sample portal first", es: "Ver un portal de muestra primero" },
  "join.form.title": { en: "Add yourself", es: "Regístrese" },
  "join.form.name": { en: "Your name", es: "Su nombre" },
  "join.form.company": { en: "Company", es: "Empresa" },
  "join.form.email": { en: "Email", es: "Correo electrónico" },
  "join.form.phone": { en: "Phone (optional)", es: "Teléfono (opcional)" },
  "join.form.role": { en: "What do you do?", es: "¿A qué se dedica?" },
  "join.form.note": { en: "Anything they should know", es: "Algo que deba saber" },
  "join.form.notePlaceholder": {
    en: "How you know each other, or a referral you've already sent",
    es: "Cómo se conocen, o una referencia que ya envió",
  },
  "join.form.submit": { en: "Request my portal", es: "Solicitar mi portal" },
  "join.form.sending": { en: "Sending…", es: "Enviando…" },
  "join.done.title": { en: "Request sent", es: "Solicitud enviada" },
  "join.done.body": {
    en: "{agent} will approve it and your portal link comes by email. Usually the same day.",
    es: "{agent} la aprobará y su enlace llegará por correo. Normalmente el mismo día.",
  },
  "join.error.required": { en: "Name and email are required", es: "El nombre y el correo son obligatorios" },
  "join.error.email": { en: "Enter a valid email address", es: "Ingrese un correo electrónico válido" },
  "join.error.generic": { en: "Something went wrong — try again", es: "Algo salió mal — intente de nuevo" },
  "join.error.duplicate": {
    en: "There's already a request in for that email. {agent} has it.",
    es: "Ya hay una solicitud con ese correo. {agent} la tiene.",
  },
  "join.closed": {
    en: "This link isn't active right now. Ask them for a fresh one.",
    es: "Este enlace no está activo. Pídale uno nuevo.",
  },

  // Partner types, as a person would describe themselves.
  "role.lender": { en: "Loan officer / lender", es: "Oficial de préstamos / prestamista" },
  "role.realtor": { en: "Real estate agent", es: "Agente de bienes raíces" },
  "role.processor": { en: "Processor / transaction coordinator", es: "Procesador / coordinador de transacciones" },
  "role.cpa": { en: "CPA / accountant", es: "Contador" },
  "role.other": { en: "Something else", es: "Otra cosa" },

  // ── The portal shell ──────────────────────────────────────────────────────
  "portal.title": { en: "Live Referral Portal", es: "Portal de Referencias en Vivo" },
  "portal.liveTracking": { en: "Live referral tracking", es: "Seguimiento de referencias en vivo" },
  "portal.subFull": {
    en: "Every client you've referred to {agent}, updated in real time. Insurance documents post here once they're issued after binding.",
    es: "Cada cliente que le ha referido a {agent}, actualizado en tiempo real. Los documentos de seguro aparecen aquí una vez emitidos después de la contratación.",
  },
  "portal.subSimple": {
    en: "Every client you've referred to {agent}, updated in real time — so you always know where they stand.",
    es: "Cada cliente que le ha referido a {agent}, actualizado en tiempo real — para que siempre sepa cómo van.",
  },
  "portal.reach": { en: "Reach {first} directly:", es: "Comuníquese con {first} directamente:" },
  "portal.yourReferrals": { en: "Your referrals", es: "Sus referencias" },
  "portal.sendOne": { en: "Send a referral", es: "Enviar una referencia" },
  "portal.documents": { en: "Documents", es: "Documentos" },
  "portal.download": { en: "Download", es: "Descargar" },
  "portal.messages": { en: "Messages", es: "Mensajes" },
  "portal.closingDate": { en: "Closing date", es: "Fecha de cierre" },
  "portal.updated": { en: "Updated", es: "Actualizado" },
  "portal.nothingYet": {
    en: "Nothing here yet. The referrals you send will show up on this page.",
    es: "Nada aquí todavía. Las referencias que envíe aparecerán en esta página.",
  },
  "portal.langLabel": { en: "Language", es: "Idioma" },

  // ── Statuses, as a partner reads them ─────────────────────────────────────
  // These matter more than anything else on this list: a partner checks the
  // portal to learn one thing, and this is that thing.
  "status.new": { en: "New lead", es: "Referencia nueva" },
  "status.quoting": { en: "Working on quote", es: "Preparando cotización" },
  "status.quoted": { en: "Quoted", es: "Cotizado" },
  "status.application": { en: "Working with client", es: "Trabajando con el cliente" },
  "status.bound": { en: "Bound ✔", es: "Emitido ✔" },
  "status.docs_delivered": { en: "EOI & docs delivered", es: "Prueba de seguro y documentos entregados" },
  "status.lost": { en: "Not written", es: "No se emitió" },

  // The simplified track a realtor sees, where quoting detail is noise.
  "simple.new": { en: "Got the referral", es: "Referencia recibida" },
  "simple.working": { en: "Working on it", es: "En proceso" },
  "simple.bound": { en: "Covered ✔", es: "Asegurado ✔" },
  "simple.lost": { en: "Not written", es: "No se emitió" },
};

// Translate. Missing keys return the key itself rather than empty space —
// a visible "portal.foo" in testing beats a blank label in production.
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  if (!entry) return key;
  let out = entry[locale] ?? entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

// Bound to one language, so a component doesn't thread the locale through
// every single call.
export function translator(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
}

export function statusLabelFor(locale: Locale, status: string, simple = false): string {
  if (simple) {
    if (status === "new") return t(locale, "simple.new");
    if (status === "lost") return t(locale, "simple.lost");
    if (status === "bound" || status === "docs_delivered") return t(locale, "simple.bound");
    return t(locale, "simple.working");
  }
  return t(locale, `status.${status}`);
}

export const PARTNER_ROLES: { value: string; key: string }[] = [
  { value: "lender", key: "role.lender" },
  { value: "realtor", key: "role.realtor" },
  { value: "processor", key: "role.processor" },
  { value: "cpa", key: "role.cpa" },
  { value: "other", key: "role.other" },
];
