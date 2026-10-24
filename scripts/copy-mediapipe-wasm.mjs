// Copies MediaPipe's WebAssembly runtime from node_modules into public/ so the
// browser loads it from this site instead of a CDN. Runs before `dev` and
// `build` (see package.json). Skips files that are already up to date.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(root, "public", "mediapipe", "wasm");

if (!existsSync(source)) {
  console.error("[mediapipe] node_modules/@mediapipe/tasks-vision is missing. Run `npm install` first.");
  process.exit(1);
}

mkdirSync(target, { recursive: true });
let copied = 0;
for (const name of readdirSync(source)) {
  const from = join(source, name);
  const to = join(target, name);
  const fromStat = statSync(from);
  if (!fromStat.isFile()) continue;
  if (existsSync(to)) {
    const toStat = statSync(to);
    if (toStat.size === fromStat.size && toStat.mtimeMs >= fromStat.mtimeMs) continue;
  }
  copyFileSync(from, to);
  copied++;
}
if (copied > 0) console.log(`[mediapipe] Copied ${copied} WebAssembly file(s) to public/mediapipe/wasm`);

if (!existsSync(join(root, "public", "mediapipe", "pose_landmarker_lite.task"))) {
  console.warn(
    "[mediapipe] public/mediapipe/pose_landmarker_lite.task is missing. Camera tracking won't work until it's restored (see README).",
  );
}
