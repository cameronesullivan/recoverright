"use client";

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  describeDosage,
  formatClock,
  type GuidedSession,
  type SessionExerciseResult,
  type SessionStep,
} from "@/lib/exercises/session";
import { JOINT_METRICS, describeSide, type Side } from "@/lib/exercises/tracking";
import type { Exercise } from "@/lib/plan-schema";
import { planStore } from "@/lib/storage";
import { openCamera, stopAllCameras, stopCamera } from "./camera";
import { CameraStage } from "./CameraStage";
import { PainScale } from "./PainScale";
import { loadPoseLandmarker } from "./poseLandmarker";
import { SessionController, type SessionSnapshot } from "./SessionController";

export const SESSION_DISCLAIMER =
  "Camera tracking is an estimate, not a clinical assessment. This coach is AI guidance, not a licensed physical therapist. Stop if you feel sharp pain.";

type CameraProblem = "denied" | "not-found" | "in-use" | "insecure" | "unsupported" | "model" | "lost" | "unknown";

type Setup =
  | { kind: "intro" }
  | { kind: "camera" }
  | { kind: "problem"; problem: CameraProblem }
  | { kind: "timers" };

export interface SessionRunnerProps {
  planId: string;
  exercises: Exercise[];
  week: number;
  phaseName: string;
  side: Side | null;
  onClose: () => void;
  onSaved: (session: GuidedSession) => void;
}

function cameraProblemFrom(error: unknown): CameraProblem {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "in-use";
  return "unknown";
}

/**
 * Full-screen guided session. Camera access is requested only after the
 * person taps "Enable camera". Video stays on this device.
 */
export default function SessionRunner({ planId, exercises, week, phaseName, side, onClose, onSaved }: SessionRunnerProps) {
  const [setup, setSetup] = useState<Setup>({ kind: "intro" });
  const [cameraWanted, setCameraWanted] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [landmarker, setLandmarker] = useState<PoseLandmarker | null>(null);
  const [controller, setController] = useState<SessionController | null>(null);
  /** The camera is only kept on while this browser tab is visible. */
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === "visible");
  /** Bumped by "Restart camera" to request a fresh stream. */
  const [cameraAttempt, setCameraAttempt] = useState(0);

  function makeController(useCamera: boolean) {
    return new SessionController({
      exercises,
      useCamera,
      side,
      week,
      phaseName,
      save: async (session) => {
        await planStore.addSession(planId, session);
        onSaved(session);
      },
    });
  }

  function enableCamera() {
    setController((c) => c ?? makeController(true));
    setSetup({ kind: "camera" });
    setCameraWanted(true);
  }

  function retryCamera() {
    // Restart the camera request after the person changes their browser setting.
    setCameraWanted(false);
    setSetup({ kind: "camera" });
    setTimeout(() => setCameraWanted(true), 0);
  }

  function continueWithoutCamera() {
    setCameraWanted(false);
    if (controller) controller.disableCamera();
    else setController(makeController(false));
    setSetup({ kind: "timers" });
  }

  function close() {
    controller?.dispose();
    setCameraWanted(false);
    stopAllCameras();
    onClose();
  }

  function restartCamera() {
    setCameraAttempt((n) => n + 1);
  }

  // Track whether this browser tab is visible.
  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Camera stream. A fresh stream is requested every time this runs. The
  // cleanup stops every track (camera light off) when the session closes, the
  // page is left (Next.js hides the page and runs cleanups), the tab is hidden,
  // or "Restart camera" is pressed.
  useEffect(() => {
    if (!cameraWanted || !tabVisible) return;
    let cancelled = false;
    let acquired: MediaStream | null = null;
    // Start on the next tick. In development, React mounts effects twice and
    // cleans up the first run right away; deferring means that throwaway run
    // never opens the camera.
    const start = window.setTimeout(async () => {
      if (cancelled) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setSetup({ kind: "problem", problem: window.isSecureContext ? "unsupported" : "insecure" });
        return;
      }
      try {
        const media = await openCamera();
        if (cancelled) {
          stopCamera(media);
          return;
        }
        acquired = media;
        media.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (!cancelled) setSetup({ kind: "problem", problem: "lost" });
        });
        setStream(media);
      } catch (error) {
        if (!cancelled) setSetup({ kind: "problem", problem: cameraProblemFrom(error) });
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      stopCamera(acquired);
      setStream(null);
    };
  }, [cameraWanted, tabVisible, cameraAttempt]);

  // Pose model, loaded from /public in parallel with the camera.
  useEffect(() => {
    if (!cameraWanted) return;
    let cancelled = false;
    let loaded: PoseLandmarker | null = null;
    // Deferred for the same reason as the camera: skip React's throwaway first run in development.
    const start = window.setTimeout(() => {
      if (cancelled) return;
      loadPoseLandmarker()
        .then((lm) => {
          if (cancelled) {
            lm.close();
            return;
          }
          loaded = lm;
          setLandmarker(lm);
        })
        .catch(() => {
          if (!cancelled) setSetup((s) => (s.kind === "problem" ? s : { kind: "problem", problem: "model" }));
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      loaded?.close();
      setLandmarker(null);
    };
  }, [cameraWanted]);

  // Session clock runs while this screen is visible.
  useEffect(() => {
    if (!controller) return;
    controller.attach();
    return () => controller.detach();
  }, [controller]);

  // Don't let timers run behind a camera problem screen.
  useEffect(() => {
    if (setup.kind === "problem") controller?.pause();
  }, [setup.kind, controller]);

  // Pause if the person switches tabs or apps.
  useEffect(() => {
    if (!controller) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") controller.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [controller]);

  // Keep the screen awake during the session, where supported.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const request = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
          if (released) void lock.release();
        }
      } catch {
        // Not supported or not allowed; the session works without it.
      }
    };
    void request();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // Stop the page behind from scrolling.
  useLayoutEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  let content: ReactNode;
  if (setup.kind === "intro") {
    content = <CameraIntro onEnable={enableCamera} onSkip={continueWithoutCamera} onClose={close} />;
  } else if (setup.kind === "problem") {
    content = (
      <CameraProblemScreen
        problem={setup.problem}
        onRetry={retryCamera}
        onContinue={continueWithoutCamera}
        onClose={close}
      />
    );
  } else if (!controller || (setup.kind === "camera" && (!stream || !landmarker))) {
    content = <StartingCamera hasStream={Boolean(stream)} onCancel={continueWithoutCamera} />;
  } else {
    content = (
      <SessionView
        controller={controller}
        stream={setup.kind === "camera" ? stream : null}
        landmarker={setup.kind === "camera" ? landmarker : null}
        onTrackingError={() => setSetup({ kind: "problem", problem: "model" })}
        onRestartCamera={restartCamera}
        onClose={close}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guided exercise session"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-900 text-white"
    >
      <div className="flex-1">{content}</div>
      <p className="px-4 pt-2 pb-4 text-center text-sm text-slate-300 sm:px-6">{SESSION_DISCLAIMER}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup screens
// ---------------------------------------------------------------------------

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto mt-6 w-full max-w-2xl px-4 sm:mt-12 sm:px-6 ${className}`}>
      <div className="rounded-3xl bg-white p-6 text-slate-800 shadow-xl sm:p-8">{children}</div>
    </div>
  );
}

function CameraIntro({ onEnable, onSkip, onClose }: { onEnable: () => void; onSkip: () => void; onClose: () => void }) {
  return (
    <Panel>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-teal-700">
          <path d="M4 6h10a2 2 0 0 1 2 2v1.5l4-2.5v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
        </svg>
      </div>
      <h2 className="mt-4 text-2xl font-bold text-slate-900 sm:text-3xl">Turn on your camera for coaching</h2>
      <p className="mt-3 text-lg text-slate-700">
        We use your camera to count reps and check your form. Video never leaves your device.
      </p>
      <p className="mt-3 text-slate-600">
        The motion tracking runs inside your browser. Your browser will ask for permission next. You can turn the
        camera off at any time by ending the session.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onEnable} className="btn-primary text-lg">
          Enable camera
        </button>
        <button type="button" onClick={onSkip} className="btn-secondary justify-center text-base">
          Use timers instead (no camera)
        </button>
      </div>
      <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-slate-500 hover:text-slate-800">
        Cancel and go back to my plan
      </button>
    </Panel>
  );
}

function StartingCamera({ hasStream, onCancel }: { hasStream: boolean; onCancel: () => void }) {
  return (
    <Panel>
      <div className="flex flex-col items-center py-6 text-center" role="status" aria-live="polite">
        <div className="relative h-14 w-14" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border-4 border-sky-100" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-teal-600" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-slate-900">
          {hasStream ? "Loading movement tracking…" : "Waiting for camera permission…"}
        </h2>
        <p className="mt-2 max-w-md text-slate-600">
          {hasStream
            ? "This takes a few seconds the first time."
            : "If your browser shows a pop-up, choose Allow. Look near the address bar if you don't see it."}
        </p>
        <button type="button" onClick={onCancel} className="btn-secondary mt-6">
          Continue without camera
        </button>
      </div>
    </Panel>
  );
}

const PROBLEM_TEXT: Record<CameraProblem, { title: string; body: string }> = {
  denied: {
    title: "Camera access is blocked",
    body: "Your browser isn't letting RecoverRight use the camera. You can turn it back on, or continue with timers instead.",
  },
  "not-found": {
    title: "No camera found",
    body: "We couldn't find a camera on this device. Plug one in and try again, or continue with timers instead.",
  },
  "in-use": {
    title: "The camera is busy",
    body: "Another app (like Zoom or Teams) may be using the camera. Close it and try again, or continue with timers instead.",
  },
  insecure: {
    title: "The camera needs a secure connection",
    body: "Browsers only allow the camera on https:// sites or on localhost. Open the site at http://localhost:3000, or continue with timers.",
  },
  unsupported: {
    title: "This browser can't use the camera",
    body: "Try a recent version of Chrome, Edge, Firefox, or Safari, or continue with timers instead.",
  },
  model: {
    title: "Movement tracking couldn't start",
    body: "The motion-tracking model didn't load on this device. You can try again, or continue with timers. Rep counting by timer still works.",
  },
  lost: {
    title: "The camera stopped",
    body: "The camera was disconnected or turned off. Try again, or continue with timers.",
  },
  unknown: {
    title: "The camera didn't start",
    body: "Something went wrong starting the camera. Try again, or continue with timers instead.",
  },
};

function CameraProblemScreen({
  problem,
  onRetry,
  onContinue,
  onClose,
}: {
  problem: CameraProblem;
  onRetry: () => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const text = PROBLEM_TEXT[problem];
  return (
    <Panel>
      <div role="alert">
        <h2 className="text-2xl font-bold text-slate-900">{text.title}</h2>
        <p className="mt-3 text-lg text-slate-700">{text.body}</p>
      </div>
      {problem === "denied" && (
        <div className="mt-5 rounded-2xl bg-sky-50 p-5 text-sky-950">
          <p className="font-semibold">To turn the camera back on in Chrome or Edge:</p>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>Click the lock icon (or the settings icon) at the left end of the address bar.</li>
            <li>Find <strong>Camera</strong> and change it to <strong>Allow</strong>.</li>
            <li>Close that menu, then click <strong>Try again</strong> below. If it still doesn&apos;t work, reload the page.</li>
          </ol>
          <p className="mt-4 text-sm">
            <strong>Safari:</strong> Safari menu → Settings for this website → Camera → Allow.{" "}
            <strong>Firefox:</strong> click the camera icon in the address bar and remove the block.{" "}
            <strong>Windows:</strong> also check Settings → Privacy &amp; security → Camera, and make sure your browser is
            allowed.
          </p>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onRetry} className="btn-primary">
          Try again
        </button>
        <button type="button" onClick={onContinue} className="btn-secondary justify-center">
          Continue without camera
        </button>
      </div>
      <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-slate-500 hover:text-slate-800">
        Cancel and go back to my plan
      </button>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

function SessionView({
  controller,
  stream,
  landmarker,
  onTrackingError,
  onRestartCamera,
  onClose,
}: {
  controller: SessionController;
  stream: MediaStream | null;
  landmarker: PoseLandmarker | null;
  onTrackingError: () => void;
  onRestartCamera: () => void;
  onClose: () => void;
}) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  /** Non-null while asking "End the session now?"; remembers whether it was already paused. */
  const [confirmingEnd, setConfirmingEnd] = useState<{ wasPaused: boolean } | null>(null);
  const step = snap.steps[snap.index];
  const { stage } = snap;
  const camera =
    stream && landmarker && step?.mode === "camera" ? { stream, landmarker, restart: onRestartCamera } : null;
  /** The big control buttons (including End session) are shown during sets and rests. */
  const hasControls = stage.kind === "get-ready" || stage.kind === "active" || stage.kind === "rest";

  function askToEnd() {
    setConfirmingEnd({ wasPaused: snap.paused });
    controller.pause();
  }

  function keepGoing() {
    if (confirmingEnd && !confirmingEnd.wasPaused && snap.paused) controller.togglePause();
    setConfirmingEnd(null);
  }

  if (stage.kind === "summary") {
    return <Summary snap={snap} onClose={onClose} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-teal-300">
            Exercise {snap.index + 1} of {snap.steps.length}
            {step && step.dosage.sets > 1 && stage.kind !== "exercise-intro" && ` · Set ${snap.setNumber} of ${step.dosage.sets}`}
          </p>
          <h2 className="truncate text-xl font-bold sm:text-2xl">{step?.exercise.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => controller.toggleMute()}
            className="rounded-full border border-slate-600 px-4 py-2 text-sm font-medium hover:border-slate-400"
            aria-pressed={!snap.muted}
          >
            {snap.muted ? "Sound off" : "Sound on"}
          </button>
          {!hasControls && (
            <button
              type="button"
              onClick={askToEnd}
              className="rounded-full border border-slate-600 px-4 py-2 text-sm font-medium hover:border-slate-400"
            >
              End session
            </button>
          )}
        </div>
      </header>

      {confirmingEnd && (
        <div role="alertdialog" aria-label="End session?" className="mt-4 rounded-2xl bg-white p-5 text-slate-800">
          <p className="text-lg font-semibold">End the session now?</p>
          <p className="mt-1 text-slate-600">What you&apos;ve done so far will be saved to your plan.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setConfirmingEnd(null);
                controller.endSession();
              }}
            >
              Yes, end session
            </button>
            <button type="button" className="btn-secondary justify-center" onClick={keepGoing}>
              Keep going
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {stage.kind === "exercise-intro" && step && (
          <ExerciseIntro snap={snap} step={step} camera={camera} controller={controller} onTrackingError={onTrackingError} />
        )}
        {(stage.kind === "get-ready" || stage.kind === "active") && step && (
          <ActiveSet
            snap={snap}
            step={step}
            camera={camera}
            controller={controller}
            onTrackingError={onTrackingError}
            onEnd={askToEnd}
          />
        )}
        {stage.kind === "rest" && step && <Rest snap={snap} step={step} controller={controller} onEnd={askToEnd} />}
        {stage.kind === "pain-check" && step && (
          <div className="mx-auto max-w-3xl space-y-6 rounded-3xl bg-slate-800 p-6 sm:p-8">
            <p className="text-lg text-slate-200">Finished {step.exercise.name}.</p>
            <PainScale value={null} onSelect={(n) => controller.setPain(n)} />
            <CoachBox snap={snap} />
          </div>
        )}
        {stage.kind === "stopped" && step && <Stopped snap={snap} step={step} controller={controller} />}
      </div>
    </div>
  );
}

type CameraProps = { stream: MediaStream; landmarker: PoseLandmarker; restart: () => void } | null;

type CameraMessageTone = "neutral" | "warning" | "stop";

const CAMERA_MESSAGE_TONES: Record<CameraMessageTone, string> = {
  neutral: "bg-slate-950/65 text-white",
  warning: "bg-amber-400/90 text-slate-950",
  stop: "bg-red-600/90 text-white",
};

/**
 * A compact message pinned to the bottom edge of the video, at most two lines.
 * Shown on tablets and larger; phones use CameraMessageBelow instead.
 */
function CameraMessage({
  tone,
  live,
  children,
}: {
  tone: CameraMessageTone;
  live: "polite" | "assertive";
  children: ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-3 hidden justify-center sm:flex">
      <p
        className={`line-clamp-2 max-w-xl rounded-xl px-3 py-1.5 text-center text-lg leading-snug font-semibold ${CAMERA_MESSAGE_TONES[tone]}`}
        aria-live={live}
      >
        {children}
      </p>
    </div>
  );
}

/** On phones the video is small, so the message goes just below it instead of on top. */
function CameraMessageBelow({
  tone,
  live,
  children,
}: {
  tone: CameraMessageTone;
  live: "polite" | "assertive";
  children: ReactNode;
}) {
  return (
    <p
      className={`mx-auto rounded-xl px-3 py-2 text-center text-base leading-snug font-semibold sm:hidden ${CAMERA_MESSAGE_TONES[tone]}`}
      aria-live={live}
    >
      {children}
    </p>
  );
}

function ExerciseIntro({
  snap,
  step,
  camera,
  controller,
  onTrackingError,
}: {
  snap: SessionSnapshot;
  step: SessionStep;
  camera: CameraProps;
  controller: SessionController;
  onTrackingError: () => void;
}) {
  const side = snap.results[snap.index]?.side;
  const sideWord: Side | null = side === "left" || side === "right" ? side : null;
  const tracking = step.tracking;
  const ready = !camera || snap.positioning?.ok;
  const setupTone: CameraMessageTone = snap.positioning && !snap.positioning.ok ? "warning" : "neutral";
  const setupMessage =
    snap.positioning === null
      ? "Looking for you…"
      : snap.positioning.ok
        ? (snap.positioning.hint ?? "✓ We can see you. Tap Ready when you're set.")
        : snap.positioning.message;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-5 rounded-3xl bg-slate-800 p-6">
        {step.exercise.purpose && <p className="text-lg text-slate-200">{step.exercise.purpose}</p>}
        <p className="inline-flex rounded-full bg-teal-900/70 px-4 py-1.5 text-lg font-semibold text-teal-100">
          {describeDosage(step)}
        </p>
        {step.exercise.steps.length > 0 && (
          <ol className="space-y-2">
            {step.exercise.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-slate-100">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-700 text-sm font-semibold">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        )}
        {step.exercise.safetyNote && (
          <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-950">
            <strong>Safety:</strong> {step.exercise.safetyNote}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => controller.ready()} className="btn-primary min-h-16 flex-1 text-2xl">
            Ready
          </button>
          <button
            type="button"
            onClick={() => controller.skipExercise()}
            className="min-h-16 rounded-full border border-slate-500 px-6 text-lg font-semibold hover:border-slate-300"
          >
            Skip this exercise
          </button>
        </div>
        <CoachBox snap={snap} controller={controller} />
      </div>

      <div className="space-y-4">
        {step.mode === "camera" && tracking ? (
          <>
            <div className="rounded-3xl bg-sky-100 p-5 text-sky-950">
              <p className="text-lg font-semibold">Set up your camera</p>
              <ul className="mt-2 space-y-2">
                <li>
                  <strong>Camera:</strong> {tracking.setup.camera}
                </li>
                <li>
                  <strong>You:</strong> {describeSide(tracking.setup.you, sideWord)}
                </li>
              </ul>
              <p className="mt-2 text-sm">
                We&apos;ll track your {sideWord ? `${sideWord} ` : ""}
                {JOINT_METRICS[tracking.metric].label}. You&apos;ll get 5 seconds to get into position after tapping Ready.
              </p>
            </div>
            {camera && (
              <CameraStage
                stream={camera.stream}
                landmarker={camera.landmarker}
                onFrame={controller.handleFrame}
                onTrackingError={onTrackingError}
                onRestartCamera={camera.restart}
              >
                <CameraMessage tone={setupTone} live="polite">
                  {setupMessage}
                </CameraMessage>
              </CameraStage>
            )}
            {camera && (
              <CameraMessageBelow tone={setupTone} live="polite">
                {setupMessage}
              </CameraMessageBelow>
            )}
            {camera && !ready && (
              <p className="text-center text-sm text-slate-300">You can still tap Ready. Counting starts once we can see you.</p>
            )}
          </>
        ) : (
          <div className="rounded-3xl bg-slate-800 p-6">
            <p className="text-lg font-semibold">
              {step.mode === "hold"
                ? "We'll time each hold"
                : step.mode === "duration"
                  ? "We'll run a timer"
                  : "We'll pace your reps with a timer"}
            </p>
            <p className="mt-2 text-slate-300">
              {step.mode === "hold"
                ? "A beep tells you when to start holding and when to relax."
                : step.mode === "duration"
                  ? "Get comfortable. We'll beep when the time is up."
                  : `A beep marks each rep, about every ${step.repSeconds} seconds. Move slowly and smoothly.`}
              {snap.useCamera && " No camera is needed for this one."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveSet({
  snap,
  step,
  camera,
  controller,
  onTrackingError,
  onEnd,
}: {
  snap: SessionSnapshot;
  step: SessionStep;
  camera: CameraProps;
  controller: SessionController;
  onTrackingError: () => void;
  onEnd: () => void;
}) {
  const getReady = snap.stage.kind === "get-ready";
  const reps = step.dosage.reps;
  const message = getReady ? "Get into position…" : (snap.cue ?? snap.coach?.text ?? "Move slowly and smoothly.");
  const positioningProblem = camera && snap.positioning && !snap.positioning.ok ? snap.positioning.message : null;

  // On the camera view, one small message at the bottom edge, most important first.
  let cameraMessage: string = message;
  let cameraTone: CameraMessageTone = snap.formStatus === "stop" ? "stop" : snap.cue ? "warning" : "neutral";
  if (getReady) {
    cameraMessage = `Starting in ${snap.secondsLeft ?? ""}… get into position`;
    cameraTone = "neutral";
  } else if (snap.paused) {
    cameraMessage = "Paused";
    cameraTone = "neutral";
  } else if (positioningProblem) {
    cameraMessage = positioningProblem;
    cameraTone = "warning";
  }

  // Full-size overlays for the timer card (no camera video to keep clear).
  const overlay = (
    <>
      {snap.paused && !getReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60">
          <p className="text-5xl font-bold sm:text-7xl">Paused</p>
        </div>
      )}
      {getReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40" aria-live="assertive">
          <p className="text-2xl font-semibold sm:text-3xl">Starting in</p>
          <p className="text-8xl font-bold tabular-nums sm:text-9xl">{snap.secondsLeft}</p>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {camera ? (
        <CameraStage
          stream={camera.stream}
          landmarker={camera.landmarker}
          onFrame={controller.handleFrame}
          onTrackingError={onTrackingError}
          onRestartCamera={camera.restart}
        >
          {/* Small labels at the edges only, so the person can always see themselves. */}
          <div className="absolute top-2 left-2 rounded-xl bg-slate-950/60 px-3 py-1 sm:top-3 sm:left-3">
            <p className="text-2xl leading-tight font-bold tabular-nums sm:text-3xl" aria-live="polite">
              {snap.repsThisSet}
              <span className="text-base text-slate-300 sm:text-lg">/{reps} reps</span>
            </p>
          </div>
          {step.dosage.sets > 1 && (
            <div className="absolute top-2 right-2 rounded-xl bg-slate-950/60 px-3 py-1 text-sm font-semibold sm:top-3 sm:right-3 sm:text-base">
              Set {snap.setNumber}/{step.dosage.sets}
            </div>
          )}
          <CameraMessage tone={cameraTone} live={getReady ? "assertive" : "polite"}>
            {cameraMessage}
          </CameraMessage>
        </CameraStage>
      ) : (
        <TimerCard snap={snap} step={step} message={message} overlay={overlay} />
      )}
      {camera && (
        <CameraMessageBelow tone={cameraTone} live={getReady ? "assertive" : "polite"}>
          {cameraMessage}
        </CameraMessageBelow>
      )}

      {snap.positioning?.ok && snap.positioning.hint && camera && (
        <p className="text-center text-lg text-amber-200">{snap.positioning.hint}</p>
      )}
      <SessionControls snap={snap} controller={controller} showFinishSet={!getReady} onEnd={onEnd} />
    </div>
  );
}

function TimerCard({
  snap,
  step,
  message,
  overlay,
}: {
  snap: SessionSnapshot;
  step: SessionStep;
  message: string;
  overlay: ReactNode;
}) {
  const timer = snap.timer;
  const reps = step.dosage.reps;
  return (
    <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl bg-slate-800 px-6 py-10 text-center">
      {step.mode === "paced" ? (
        <>
          <p className="text-8xl leading-none font-bold tabular-nums sm:text-9xl" aria-live="polite">
            {snap.repsThisSet}
            <span className="text-4xl text-slate-400 sm:text-6xl">/{reps}</span>
          </p>
          <p className="mt-2 text-xl text-slate-300">reps</p>
          <p className="mt-6 text-3xl font-semibold text-teal-300 sm:text-4xl">{timer?.label ?? "Move slowly…"}</p>
        </>
      ) : (
        <>
          <p
            className={`text-3xl font-semibold sm:text-4xl ${timer?.phase === "relax" ? "text-sky-300" : "text-teal-300"}`}
          >
            {timer?.label ?? "Hold"}
          </p>
          <p className="mt-2 text-8xl leading-none font-bold tabular-nums sm:text-9xl" aria-live="polite">
            {formatClock(timer?.secondsLeft ?? step.dosage.holdSeconds ?? 0)}
          </p>
          {step.mode === "hold" && reps > 1 && (
            <p className="mt-4 text-2xl text-slate-200">
              Hold {Math.min(reps, snap.repsThisSet + (timer?.phase === "hold" ? 1 : 0)) || 1} of {reps}
            </p>
          )}
        </>
      )}
      <div className="mx-auto mt-6 h-3 max-w-md overflow-hidden rounded-full bg-slate-700" aria-hidden="true">
        <div className="h-full rounded-full bg-teal-400 transition-[width]" style={{ width: `${Math.round((timer?.progress ?? 0) * 100)}%` }} />
      </div>
      <p className="mt-8 text-2xl font-semibold sm:text-3xl" aria-live="polite">
        {message}
      </p>
      {overlay}
    </div>
  );
}

function SessionControls({
  snap,
  controller,
  showFinishSet,
  onEnd,
}: {
  snap: SessionSnapshot;
  controller: SessionController;
  showFinishSet: boolean;
  onEnd: () => void;
}) {
  const big = "min-h-16 rounded-2xl px-4 text-xl font-semibold transition focus-visible:outline-4 focus-visible:outline-white";
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button type="button" onClick={() => controller.togglePause()} className={`${big} bg-slate-700 hover:bg-slate-600`}>
          {snap.paused ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={() => controller.skipExercise()} className={`${big} bg-slate-700 hover:bg-slate-600`}>
          Skip
        </button>
        <button type="button" onClick={() => controller.hurt()} className={`${big} bg-red-600 hover:bg-red-500`}>
          That hurts
        </button>
        <button type="button" onClick={onEnd} className={`${big} border-2 border-slate-500 hover:border-slate-300`}>
          End session
        </button>
      </div>
      {showFinishSet && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => controller.finishSet()}
            className="text-base font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
          >
            Finish this set now
          </button>
        </div>
      )}
    </div>
  );
}

function Rest({
  snap,
  step,
  controller,
  onEnd,
}: {
  snap: SessionSnapshot;
  step: SessionStep;
  controller: SessionController;
  onEnd: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-3xl bg-slate-800 p-6 text-center sm:p-8">
        <p className="text-2xl font-semibold text-sky-300">Rest</p>
        <p className="text-8xl leading-none font-bold tabular-nums">{formatClock(snap.secondsLeft ?? 0)}</p>
        <p className="mt-3 text-xl text-slate-200">
          Next: set {snap.setNumber} of {step.dosage.sets}
        </p>
        {/* Fixed height so the layout doesn't jump when this text changes (it would make clicks miss). */}
        <p className={`mt-2 h-7 ${snap.paused ? "text-lg font-semibold text-amber-300" : "text-sm text-slate-300"}`}>
          {snap.paused ? "Paused" : snap.typing ? "The rest timer waits while you type." : ""}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => controller.startNextSetNow()} className="btn-primary min-h-14 text-xl">
            Start next set now
          </button>
        </div>
      </div>
      <CoachBox snap={snap} controller={controller} />
      <SessionControls snap={snap} controller={controller} showFinishSet={false} onEnd={onEnd} />
    </div>
  );
}

function Stopped({ snap, step, controller }: { snap: SessionSnapshot; step: SessionStep; controller: SessionController }) {
  const result = snap.results[snap.index];
  const isLast = snap.index >= snap.steps.length - 1;
  const trigger = snap.stage.kind === "stopped" ? snap.stage.trigger : "hurt";
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-3xl border-2 border-red-400 bg-red-50 p-6 text-red-950 sm:p-8" role="alert">
        <h3 className="text-2xl font-bold sm:text-3xl">Let&apos;s stop {step.exercise.name}</h3>
        <p className="mt-2 text-lg">
          {trigger === "pain"
            ? `You rated your pain ${result?.painScore}/10. Pain of 7 or more is a sign to stop.`
            : "You said this hurts. Stopping is the right call."}
        </p>
        <ul className="mt-4 space-y-2 text-lg">
          <li>
            <strong>Rest first.</strong> Let the area settle before doing anything else.
          </li>
          <li>
            <strong>Easier option for next time:</strong>{" "}
            {step.tracking?.easierVariation ?? "Try fewer reps, a smaller movement, or a slower pace."}
          </li>
          <li>
            <strong>If the pain continues</strong> or keeps coming back with this exercise, contact your physical therapist
            before doing it again.
          </li>
        </ul>
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-base">
          Get medical care right away if the pain is severe or comes with new swelling, numbness, or a change in skin color.
        </p>
      </div>
      {trigger === "hurt" && (
        <div className="rounded-3xl bg-slate-800 p-6">
          <PainScale value={result?.painScore ?? null} onSelect={(n) => controller.setPain(n)} label="How bad is the pain right now?" />
        </div>
      )}
      <CoachBox snap={snap} controller={controller} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={() => controller.continueAfterStop()} className="btn-primary min-h-14 flex-1 text-xl">
          {isLast ? "Finish session" : "Rest, then go to the next exercise"}
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={() => controller.endSession()}
            className="min-h-14 rounded-full border border-slate-500 px-6 text-lg font-semibold hover:border-slate-300"
          >
            End session
          </button>
        )}
      </div>
    </div>
  );
}

function CoachBox({ snap, controller }: { snap: SessionSnapshot; controller?: SessionController }) {
  const [question, setQuestion] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!controller || !question.trim()) return;
    controller.ask(question);
    setQuestion("");
    controller.setTyping(false);
  }

  return (
    <section aria-label="Coach" className="rounded-3xl bg-slate-800/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold tracking-wide text-teal-300 uppercase">Coach</p>
        {snap.coachOffline && (
          <p className="text-xs text-slate-400">AI coach offline · rep counting still works</p>
        )}
      </div>
      <p className="mt-2 text-xl leading-snug sm:text-2xl" aria-live="polite">
        {snap.coachBusy && !snap.coach ? "…" : (snap.coach?.text ?? "I'll check in after each set.")}
      </p>
      {snap.qa.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-slate-700 pt-3 text-sm">
          {snap.qa.slice(-4).map((m, i) => (
            <li key={i} className={m.role === "user" ? "text-slate-300" : "text-slate-100"}>
              <span className="font-semibold">{m.role === "user" ? "You: " : "Coach: "}</span>
              {m.content}
            </li>
          ))}
        </ul>
      )}
      {controller && (
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="coach-question" className="sr-only">
            Ask the coach a question
          </label>
          <input
            id="coach-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onFocus={() => controller.setTyping(true)}
            onBlur={() => controller.setTyping(false)}
            maxLength={300}
            placeholder="Ask the coach a question (optional)"
            className="min-h-12 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-4 text-base text-white placeholder:text-slate-400 focus:border-teal-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!question.trim() || snap.coachBusy}
            className="min-h-12 rounded-xl bg-teal-600 px-5 font-semibold hover:bg-teal-500 disabled:opacity-50"
          >
            {snap.coachBusy ? "Thinking…" : "Ask"}
          </button>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<SessionExerciseResult["status"], string> = {
  completed: "Completed",
  partial: "Partly done",
  skipped: "Skipped",
  stopped: "Stopped (pain)",
};

function Summary({ snap, onClose }: { snap: SessionSnapshot; onClose: () => void }) {
  const results = snap.results;
  const done = results.filter((r) => r.status === "completed").length;
  const totalReps = results.reduce((sum, r) => sum + r.repsCompleted, 0);
  const pains = results.map((r) => r.painScore).filter((p): p is number => p !== null);
  const tips = new Map<string, { label: string; cue: string; count: number }>();
  for (const r of results) {
    for (const f of r.formIssues) {
      const existing = tips.get(f.id);
      if (existing) existing.count += f.count;
      else tips.set(f.id, { label: f.label, cue: f.cue, count: f.count });
    }
  }
  const minutes = snap.session
    ? Math.max(1, Math.round((Date.parse(snap.session.endedAt) - Date.parse(snap.session.startedAt)) / 60000))
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6">
      <div className="rounded-3xl bg-white p-6 text-slate-800 sm:p-8">
        <h2 className="text-3xl font-bold text-slate-900">Session summary</h2>
        <p className="mt-1 text-slate-600">
          {minutes ? `About ${minutes} minute${minutes === 1 ? "" : "s"}` : ""}
          {snap.session && !snap.session.usedCamera ? " · Timer mode (no camera)" : ""}
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <dt className="text-sm font-medium text-emerald-800">Exercises completed</dt>
            <dd className="mt-1 text-3xl font-bold text-emerald-950">
              {done}/{results.length}
            </dd>
          </div>
          <div className="rounded-2xl bg-sky-50 p-4">
            <dt className="text-sm font-medium text-sky-800">Total reps</dt>
            <dd className="mt-1 text-3xl font-bold text-sky-950">{totalReps}</dd>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4">
            <dt className="text-sm font-medium text-amber-800">Highest pain</dt>
            <dd className="mt-1 text-3xl font-bold text-amber-950">{pains.length ? `${Math.max(...pains)}/10` : "—"}</dd>
          </div>
        </dl>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-semibold">Exercise</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Reps</th>
                <th className="py-2 pr-3 font-semibold">Best range of motion</th>
                <th className="py-2 font-semibold">Pain</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3 font-medium text-slate-900">{r.name}</td>
                  <td className="py-3 pr-3">{STATUS_LABEL[r.status]}</td>
                  <td className="py-3 pr-3 tabular-nums">
                    {r.repsCompleted}/{r.repsTarget}
                  </td>
                  <td className="py-3 pr-3">
                    {r.bestAngle !== null && r.metric && r.metric in JOINT_METRICS ? (
                      <>
                        <span className="font-semibold">{r.bestAngle}°</span>{" "}
                        <span className="text-slate-500">
                          {r.side === "left" || r.side === "right" ? `${r.side} ` : ""}
                          {JOINT_METRICS[r.metric as keyof typeof JOINT_METRICS].label}
                          {r.targetRange && ` · typical target ${r.targetRange.min}–${r.targetRange.max}°`}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">{r.mode === "camera" ? "Not measured" : "Timer only"}</span>
                    )}
                  </td>
                  <td className="py-3 tabular-nums">{r.painScore !== null ? `${r.painScore}/10` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold text-slate-900">Form tips for next time</h3>
          {tips.size === 0 ? (
            <p className="mt-2 text-slate-600">
              {snap.session?.usedCamera
                ? "No form issues were flagged. Keep moving slowly and smoothly."
                : "Form checks need the camera. Move slowly and follow your PT's instructions."}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {[...tips.values()].map((t) => (
                <li key={t.label} className="rounded-xl bg-amber-50 px-4 py-2 text-amber-950">
                  <strong className="capitalize">{t.label}</strong> ({t.count}×): {t.cue}
                </li>
              ))}
            </ul>
          )}
        </div>

        {pains.some((p) => p >= 7) || results.some((r) => r.hurtReported) ? (
          <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950">
            You reported significant pain today. Rest, and contact your physical therapist before repeating the exercise that
            hurt.
          </p>
        ) : null}

        <p className="mt-6 text-sm text-slate-500" role="status">
          {snap.save === "saving" && "Saving this session to your plan…"}
          {snap.save === "saved" && "✓ Saved to your plan. You'll see it in your session history."}
          {snap.save === "nothing" && "Nothing was recorded, so this session wasn't saved."}
          {snap.save === "error" && (
            <span className="text-red-700">This session couldn&apos;t be saved: {snap.saveError}</span>
          )}
        </p>

        <button type="button" onClick={onClose} className="btn-primary mt-6 text-lg">
          Done
        </button>
      </div>
    </div>
  );
}
