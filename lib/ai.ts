// Minimal Anthropic API client — direct fetch, no SDK dependency.
// All AI features are GROUNDED: Claude only ever organizes or extracts from
// supplied content. It never invents coverage facts, carriers, or promises.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export async function askClaude(opts: {
  system: string;
  content: ContentBlock[];
  maxTokens?: number;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("AI features need ANTHROPIC_API_KEY set in environment variables.");
  }
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content ?? []).find((b: any) => b.type === "text")?.text ?? "";
  if (!text) throw new Error("Claude returned no text content.");
  return text;
}

// Claude sometimes wraps JSON in markdown fences despite instructions — strip
// before parsing (lesson learned the hard way in ProducerIQ).
export function parseJsonLoose(raw: string): any {
  let t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (m) t = m[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start > 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export function mediaTypeFor(fileName: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null; // docx/xlsx not supported for extraction
}
