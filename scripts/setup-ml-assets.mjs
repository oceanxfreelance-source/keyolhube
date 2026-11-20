// Copies the MediaPipe WebAssembly runtime into public/ and downloads the segmentation model
// (Apache-2.0, Google MediaPipe "Selfie Multiclass" model card). Runs before dev and build.
// Never fails the build: if the download fails, the app loads the model from Google at runtime.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(root, "public/mediapipe/wasm");
mkdirSync(wasmDst, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) copyFileSync(join(wasmSrc, f), join(wasmDst, f));

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
const modelDst = join(root, "public/models/selfie_multiclass_256x256.tflite");
mkdirSync(dirname(modelDst), { recursive: true });
if (!existsSync(modelDst) || statSync(modelDst).size < 1_000_000) {
  try {
    const r = await fetch(MODEL_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    writeFileSync(modelDst, Buffer.from(await r.arrayBuffer()));
    console.log("ml-assets: model downloaded");
  } catch (e) {
    console.warn(`ml-assets: could not download the model (${e.message}); it will be loaded from Google at runtime`);
  }
}
console.log("ml-assets: ready");
