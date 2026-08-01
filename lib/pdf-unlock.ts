// Opening a password-protected PDF.
//
// Lenders send the 1003 encrypted and the password in a separate email, so
// without this the most valuable document in the workflow is a file nothing can
// read. With the password it decrypts cleanly.
//
// The decoder is loaded at call time rather than imported at the top, on
// purpose: it's the only dependency in this project that exists for a single
// optional feature, and a missing package should degrade to a clear message
// rather than break the build for everyone. If `pdfjs-dist` isn't installed,
// every other part of ReferBound carries on exactly as before.

export type UnlockResult = { ok: true; text: string } | { ok: false; error: string };

export async function unlockPdf(buffer: Buffer, password: string): Promise<UnlockResult> {
  let pdfjs: any;
  try {
    // Indirect specifier keeps the bundler from resolving this at build time,
    // so an uninstalled package is a runtime message and not a failed deploy.
    const pkg = "pdfjs-dist/legacy/build/pdf.mjs";
    pdfjs = await import(/* webpackIgnore: true */ pkg);
  } catch {
    return {
      ok: false,
      error:
        "PDF unlocking isn't installed on this deployment yet. Open the file with the password and upload the unlocked copy instead.",
    };
  }

  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      password,
      isEvalSupported: false,
      useSystemFonts: false,
    });
    const doc = await task.promise;

    // A loan application runs a dozen pages or so; the cap is a guard against a
    // pathological file, not an expected limit.
    const pages = Math.min(doc.numPages ?? 0, 30);
    const parts: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push((content.items ?? []).map((it: any) => it.str ?? "").join(" "));
    }
    const text = parts.join("\n\n").trim();
    if (!text) {
      return {
        ok: false,
        error:
          "The file opened but contains no readable text — it's likely a scan. Upload it unlocked and it'll be read as an image.",
      };
    }
    return { ok: true, text };
  } catch (e: any) {
    const msg = String(e?.name ?? e?.message ?? e);
    if (/password/i.test(msg)) {
      return { ok: false, error: "That password didn't open the file — check it and try again." };
    }
    return { ok: false, error: `Couldn't open that PDF (${msg.slice(0, 120)})` };
  }
}
