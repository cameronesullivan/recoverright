import type { PoseLandmarker } from "@mediapipe/tasks-vision";

/** Served from /public, so nothing is loaded from Google's CDN. */
export const POSE_MODEL_PATH = "/mediapipe/pose_landmarker_lite.task";
export const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";

const LOAD_TIMEOUT_MS = 45_000;

/** Where MediaPipe 1.x sends anonymous usage metrics. */
const METRICS_URL_PREFIX = "https://odml.pa.googleapis.com/";
let metricsBlocked = false;

/**
 * MediaPipe uploads usage metrics (never video) when a tracker is closed and
 * every 60 seconds. The site's Content-Security-Policy already blocks that,
 * but the blocked request logs console errors. Answer it locally instead, so
 * nothing is sent and nothing is logged. Every other request is untouched.
 */
function blockMediaPipeMetrics(): void {
  if (metricsBlocked || typeof window === "undefined") return;
  metricsBlocked = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(METRICS_URL_PREFIX)) return Promise.resolve(new Response(null, { status: 204 }));
    return originalFetch(input, init);
  };
}

/**
 * Load MediaPipe Pose Landmarker. Runs entirely in the browser: video frames
 * are processed on this device and never uploaded.
 */
export async function loadPoseLandmarker(): Promise<PoseLandmarker> {
  blockMediaPipeMetrics();
  const work = (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
    const create = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return await create("GPU");
    } catch {
      // Some devices don't support WebGL for MediaPipe; the CPU is slower but works.
      return await create("CPU");
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Movement tracking took too long to load.")), LOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
