/**
 * Copies the on-device OCR engine (Tesseract WebAssembly + English data)
 * from node_modules into public/ocr so the app serves it itself.
 * Receipts are then read entirely in the user's browser — no image is
 * uploaded anywhere and no third-party CDN is contacted.
 * Runs automatically before `npm run dev` and `npm run build`.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ocr");
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
];

let copied = 0;
for (const [from, to] of files) {
  const src = join(root, from);
  const dest = join(out, to);
  if (!existsSync(src)) {
    console.error(`[ocr] Missing ${from}. Run "npm install" first.`);
    process.exit(1);
  }
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) continue;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  copied++;
}
if (copied) console.log(`[ocr] Copied ${copied} OCR asset(s) to public/ocr.`);
