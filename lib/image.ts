// Client-side image preparation for headshots and partner logos.
// Runs in the browser before upload, which keeps huge phone photos off the
// wire and — more importantly — guarantees what lands in storage is sized for
// the retina displays these things are actually viewed on.
//
// Two rules that matter for sharpness:
//   1. NEVER upscale. Enlarging a small logo bakes in blur permanently; better
//      to store it at its real size and let CSS handle the rest.
//   2. Step down in halves for big reductions. A single huge downscale drops
//      detail even with high-quality smoothing on; halving repeatedly keeps
//      edges (especially type in a logo) crisp.

export type Prepared = {
  file: File;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Source was smaller than the display size — it will look soft. */
  lowRes: boolean;
  /** Vector or unreadable format, passed through untouched. */
  passthrough: boolean;
};

// Retina targets. Headshots render at ~144px CSS, logos at ~320px CSS; at 3x
// that's 432 and 960 device pixels, so these leave real headroom.
const HEADSHOT_PX = 1024;
const LOGO_MAX_W = 1400;
const LOGO_MAX_H = 700;
/** Below this, a logo will visibly soften inside the portal's hero chip. */
const LOGO_MIN_SHARP_W = 400;

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    // Honors EXIF rotation — otherwise phone photos arrive sideways.
    return await createImageBitmap(file, { imageOrientation: "from-image" } as any);
  } catch {
    return await createImageBitmap(file);
  }
}

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }
  return [c, ctx];
}

// Repeated halving until within 2x of the target, then a final exact draw.
function drawStepped(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): HTMLCanvasElement | null {
  let curW = sw;
  let curH = sh;
  let current: CanvasImageSource = src;

  while (curW / 2 > dw && curH / 2 > dh) {
    const [c, ctx] = canvasOf(curW / 2, curH / 2);
    if (!ctx) return null;
    ctx.drawImage(current, 0, 0, curW, curH, 0, 0, c.width, c.height);
    current = c;
    curW = c.width;
    curH = c.height;
  }

  const [out, octx] = canvasOf(dw, dh);
  if (!octx) return null;
  octx.drawImage(current, 0, 0, curW, curH, 0, 0, out.width, out.height);
  return out;
}

function toFile(canvas: HTMLCanvasElement, name: string, type: string, quality: number): Promise<File | null> {
  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], name, { type }) : null),
      type,
      quality
    )
  );
}

function passthroughResult(file: File): Prepared {
  return {
    file,
    width: 0,
    height: 0,
    sourceWidth: 0,
    sourceHeight: 0,
    lowRes: false,
    passthrough: true,
  };
}

/**
 * Headshot: center-cropped square, sized for retina, JPEG.
 * Any photo works — portrait, landscape, enormous.
 */
export async function prepareHeadshot(file: File): Promise<Prepared> {
  if (file.type === "image/svg+xml") return passthroughResult(file);
  try {
    const bmp = await loadBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const out = Math.min(side, HEADSHOT_PX); // never upscale
    const [square, sctx] = canvasOf(side, side);
    if (!sctx) return passthroughResult(file);
    sctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, side, side);

    const scaled = drawStepped(square, side, side, out, out);
    if (!scaled) return passthroughResult(file);
    const f = await toFile(scaled, "headshot.jpg", "image/jpeg", 0.92);
    if (!f) return passthroughResult(file);
    return {
      file: f,
      width: out,
      height: out,
      sourceWidth: bmp.width,
      sourceHeight: bmp.height,
      lowRes: side < 300,
      passthrough: false,
    };
  } catch {
    return passthroughResult(file);
  }
}

/**
 * Partner logo: scaled down to fit the portal's hero chip at retina density,
 * transparency preserved, never enlarged. SVGs pass straight through — vector
 * is already perfect at every size.
 */
export async function prepareLogo(file: File): Promise<Prepared> {
  if (file.type === "image/svg+xml") return passthroughResult(file);
  try {
    const bmp = await loadBitmap(file);
    const scale = Math.min(LOGO_MAX_W / bmp.width, LOGO_MAX_H / bmp.height, 1); // ≤1: no upscaling
    const dw = Math.round(bmp.width * scale);
    const dh = Math.round(bmp.height * scale);
    const lowRes = bmp.width < LOGO_MIN_SHARP_W;

    // Already small enough and lossless? Leave the original bytes alone rather
    // than re-encoding — a second pass only ever loses detail.
    const keepsAlpha = file.type === "image/png" || file.type === "image/webp";
    if (scale === 1 && keepsAlpha) {
      return {
        file,
        width: bmp.width,
        height: bmp.height,
        sourceWidth: bmp.width,
        sourceHeight: bmp.height,
        lowRes,
        passthrough: false,
      };
    }

    const scaled = drawStepped(bmp, bmp.width, bmp.height, dw, dh);
    if (!scaled) return passthroughResult(file);
    // PNG keeps transparent backgrounds and crisp type; JPEG for photographic
    // logos that never had alpha to begin with.
    const type = keepsAlpha ? "image/png" : "image/jpeg";
    const f = await toFile(scaled, keepsAlpha ? "logo.png" : "logo.jpg", type, 0.94);
    if (!f) return passthroughResult(file);
    return {
      file: f,
      width: dw,
      height: dh,
      sourceWidth: bmp.width,
      sourceHeight: bmp.height,
      lowRes,
      passthrough: false,
    };
  } catch {
    return passthroughResult(file);
  }
}

/** Friendly note when an upload will look soft, or null when it's fine. */
export function sharpnessNote(p: Prepared): string | null {
  if (p.passthrough || !p.lowRes) return null;
  return `Heads up — that image is only ${p.sourceWidth}px wide, so it may look soft on partner portals. A version at least ${LOGO_MIN_SHARP_W}px wide (or an SVG) will look crisp.`;
}
