"use client";

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PoseFrame } from "@/lib/exercises/pose";
import { drawPose, type DrawOptions } from "./drawPose";

interface Props {
  stream: MediaStream;
  landmarker: PoseLandmarker;
  /** Called for every new video frame. Returns how to draw the stick figure. */
  onFrame: (frame: PoseFrame | null, timestamp: number) => DrawOptions;
  /** Called if pose detection keeps failing (for example, the GPU context was lost). */
  onTrackingError: () => void;
  /** Ask for a brand-new camera stream ("Restart camera"). */
  onRestartCamera: () => void;
  children?: ReactNode;
}

/** How long the video can go without new frames before we offer "Restart camera". */
const STALL_MS = 6000;

/**
 * Mirrored live video with a canvas overlay that lines up exactly with it.
 * Each camera stream gets its own fresh <video> element and tracking loop.
 */
export function CameraStage(props: Props) {
  return <CameraStageInner key={props.stream.id} {...props} />;
}

/**
 * The container uses the video's own aspect ratio, so landmark coordinates map
 * 1:1 onto the canvas. Frames are processed on this device only.
 */
function CameraStageInner({ stream, landmarker, onFrame, onTrackingError, onRestartCamera, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFrameRef = useRef(onFrame);
  const onErrorRef = useRef(onTrackingError);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  /** True when the camera is on but no video frames are arriving. */
  const [stalled, setStalled] = useState(false);

  useLayoutEffect(() => {
    onFrameRef.current = onFrame;
    onErrorRef.current = onTrackingError;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const track = stream.getVideoTracks()[0];
    video.muted = true;
    video.srcObject = stream;
    const onMeta = () => {
      if (video.videoWidth > 0) setSize({ w: video.videoWidth, h: video.videoHeight });
    };
    // play() can be interrupted (for example when the element is re-attached),
    // so try again whenever the video is ready and still paused.
    const tryPlay = () => {
      if (video.paused) void video.play().catch(() => undefined);
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("resize", onMeta);
    video.addEventListener("canplay", tryPlay);
    track?.addEventListener("unmute", tryPlay);
    tryPlay();

    // Watchdog: if frames stop arriving, retry play() and then offer "Restart camera".
    let lastTime = -1;
    let badSince: number | null = null;
    const watchdog = window.setInterval(() => {
      const healthy =
        track?.readyState === "live" &&
        !track.muted &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.currentTime !== lastTime;
      lastTime = video.currentTime;
      if (healthy) {
        badSince = null;
        setStalled(false);
        return;
      }
      tryPlay();
      badSince ??= performance.now();
      if (performance.now() - badSince > STALL_MS) setStalled(true);
    }, 1000);

    let raf = 0;
    let stopped = false;
    let lastVideoTime = -1;
    let lastTimestamp = 0;
    let errors = 0;
    // On slow devices, skip frames so detection uses at most about half the
    // main thread and buttons stay responsive.
    let idleUntil = 0;

    const loop = () => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      if (video.readyState < 2 || video.videoWidth === 0 || video.currentTime === lastVideoTime) return;
      const started = performance.now();
      if (started < idleUntil) return;
      lastVideoTime = video.currentTime;
      // MediaPipe needs strictly increasing timestamps.
      let timestamp = started;
      if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
      lastTimestamp = timestamp;

      let frame: PoseFrame | null = null;
      try {
        const result = landmarker.detectForVideo(video, timestamp);
        const image = result.landmarks[0];
        if (image) {
          frame = {
            image,
            world: result.worldLandmarks[0] ?? null,
            width: video.videoWidth,
            height: video.videoHeight,
          };
        }
        errors = 0;
      } catch {
        errors++;
        if (errors === 30) onErrorRef.current();
        return;
      }

      const draw = onFrameRef.current(frame, timestamp);
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) drawPose(ctx, frame?.image ?? null, draw);
      const finished = performance.now();
      idleUntil = finished + (finished - started);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearInterval(watchdog);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("resize", onMeta);
      video.removeEventListener("canplay", tryPlay);
      track?.removeEventListener("unmute", tryPlay);
      video.pause();
      video.srcObject = null;
    };
  }, [stream, landmarker]);

  const ratio = size ? size.w / size.h : 16 / 9;
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-2xl bg-slate-950"
      style={{ aspectRatio: `${ratio}`, maxWidth: `min(100%, calc(60vh * ${ratio.toFixed(4)}))` }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        muted
        playsInline
        autoPlay
        aria-label="Your camera, shown like a mirror"
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {children}
      {stalled && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/90 px-6 text-center"
        >
          <p className="text-2xl font-bold sm:text-3xl">The camera is on, but the video isn&apos;t showing</p>
          <p className="max-w-md text-slate-300">
            Restarting the camera usually fixes this. If it keeps happening, close other apps or browser tabs that use
            the camera.
          </p>
          <button type="button" onClick={onRestartCamera} className="btn-primary min-h-14 text-xl">
            Restart camera
          </button>
        </div>
      )}
    </div>
  );
}
