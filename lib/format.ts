// Shared input formatting + validation. Used by both client components
// (live as-you-type formatting) and API routes (server-side normalization).

// Live formatter for phone inputs: digits only, dashed as 804-555-1234.
export function formatPhoneInput(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

// Server-side: normalize any phone-ish string to XXX-XXX-XXXX when it's a
// valid US 10-digit (with or without leading 1); otherwise store trimmed as-is.
export function normalizePhone(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10) return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
  return raw;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || null;
}
