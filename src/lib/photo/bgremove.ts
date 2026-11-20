"use client";
// Background removal for photos of people, in the browser, with Google MediaPipe's
// "Selfie Multiclass" segmentation model (Apache-2.0). Works for people only: it separates
// hair, face, body and clothes from the background. Not for products, animals or objects.
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

const LOCAL_MODEL = "/models/selfie_multiclass_256x256.tflite";
const REMOTE_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
const MAX_OUTPUT = 4096; // longest side of the cut-out (browser canvas limits)

let segmenter: Promise<ImageSegmenter> | null = null;

async function create(): Promise<ImageSegmenter> {
  const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const model = (await fetch(LOCAL_MODEL, { method: "HEAD" }).then((r) => r.ok).catch(() => false)) ? LOCAL_MODEL : REMOTE_MODEL;
  const opts = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: model, delegate }, runningMode: "IMAGE" as const, outputCategoryMask: false, outputConfidenceMasks: true,
  });
  try {
    return await ImageSegmenter.createFromOptions(fileset, opts("GPU"));
  } catch {
    return ImageSegmenter.createFromOptions(fileset, opts("CPU")); // no WebGL: slower but works
  }
}

export function loadSegmenter(): Promise<ImageSegmenter> {
  segmenter ??= create().catch((e) => { segmenter = null; throw e; });
  return segmenter;
}

const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Cut the person out of a photo. Returns a PNG with a transparent background at the photo's
 * resolution (capped at 4096 px), and how much of the frame is the person.
 */
export async function removeBackground(img: HTMLImageElement): Promise<{ blob: Blob; width: number; height: number; coverage: number }> {
  const seg = await loadSegmenter();
  // 1. segment a reduced copy (the model works at 256 px internally anyway)
  const s = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(img.naturalWidth * s)); small.height = Math.max(1, Math.round(img.naturalHeight * s));
  small.getContext("2d")!.drawImage(img, 0, 0, small.width, small.height);
  const res = seg.segment(small);
  const bg = res.confidenceMasks?.[0];
  if (!bg) throw new Error("The model returned no result");
  const mw = bg.width, mh = bg.height, conf = bg.getAsFloat32Array();
  // 2. person alpha = 1 - background confidence, as an image we can scale smoothly
  const maskCv = document.createElement("canvas");
  maskCv.width = mw; maskCv.height = mh;
  const md = maskCv.getContext("2d")!.createImageData(mw, mh);
  let cover = 0;
  for (let i = 0; i < mw * mh; i++) {
    const a = 1 - conf[i];
    cover += a > 0.5 ? 1 : 0;
    md.data[i * 4 + 3] = Math.round(a * 255);
  }
  maskCv.getContext("2d")!.putImageData(md, 0, 0);
  res.close();
  const coverage = cover / (mw * mh);
  if (coverage < 0.01) throw new Error("No person found in this photo. Background removal works on photos of people.");
  // 3. full-resolution cut-out: upscale the mask (bilinear), tighten edges, apply as alpha
  const o = Math.min(1, MAX_OUTPUT / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * o), H = Math.round(img.naturalHeight * o);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(img, 0, 0, W, H);
  const pix = ctx.getImageData(0, 0, W, H);
  const big = document.createElement("canvas");
  big.width = W; big.height = H;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = "high";
  bctx.drawImage(maskCv, 0, 0, W, H);
  const alpha = bctx.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) pix.data[i * 4 + 3] = Math.round(smoothstep(0.3, 0.7, alpha[i * 4 + 3] / 255) * 255);
  ctx.putImageData(pix, 0, 0);
  const blob = await new Promise<Blob>((r, j) => out.toBlob((b) => (b ? r(b) : j(new Error("Could not create the image"))), "image/png"));
  return { blob, width: W, height: H, coverage };
}
