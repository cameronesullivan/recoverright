import type { JointMetricId, Side } from "./tracking";

/**
 * Geometry helpers for MediaPipe Pose landmarks. Pure functions with no browser
 * dependencies, so they can run anywhere.
 */

export interface PosePoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseFrame {
  /** Landmarks normalized to the video frame (0–1), in the un-mirrored camera image. */
  image: PosePoint[];
  /** MediaPipe's 3D estimate in meters (origin between the hips), when available. */
  world: PosePoint[] | null;
  /** Video size in pixels, needed to measure angles in the 2D image correctly. */
  width: number;
  height: number;
}

/** MediaPipe Pose landmark indices used by RecoverRight. */
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export const MIN_VISIBILITY = 0.5;

export function sideLandmarks(side: Side) {
  return side === "left"
    ? { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist, hip: LM.leftHip, knee: LM.leftKnee, ankle: LM.leftAnkle }
    : { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist, hip: LM.rightHip, knee: LM.rightKnee, ankle: LM.rightAnkle };
}

/** The three landmarks (end, joint, end) that define each measurement. */
export function metricLandmarks(metric: JointMetricId, side: Side): [number, number, number] {
  const s = sideLandmarks(side);
  switch (metric) {
    case "knee_flexion":
    case "knee_extension":
      return [s.hip, s.knee, s.ankle];
    case "hip_flexion":
    case "hip_extension":
      return [s.shoulder, s.hip, s.knee];
    case "shoulder_flexion":
    case "shoulder_abduction":
      return [s.hip, s.shoulder, s.elbow];
    case "elbow_flexion":
      return [s.shoulder, s.elbow, s.wrist];
  }
}

/** True when every landmark is confidently detected and inside the picture. */
export function areVisible(frame: PoseFrame, indices: readonly number[], minVisibility = MIN_VISIBILITY): boolean {
  return indices.every((i) => {
    const p = frame.image[i];
    if (!p) return false;
    const inFrame = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    return inFrame && (p.visibility ?? 1) >= minVisibility;
  });
}

export function averageVisibility(frame: PoseFrame, indices: readonly number[]): number {
  if (indices.length === 0) return 0;
  return indices.reduce((sum, i) => sum + (frame.image[i]?.visibility ?? 0), 0) / indices.length;
}

type Vec = [number, number, number];

function point(frame: PoseFrame, index: number, space: "image" | "world"): Vec {
  if (space === "world" && frame.world?.[index]) {
    const p = frame.world[index];
    return [p.x, p.y, p.z];
  }
  const p = frame.image[index];
  // Scale to pixels so angles aren't distorted by the video's aspect ratio.
  return [p.x * frame.width, p.y * frame.height, 0];
}

/** Angle at b between the segments b→a and b→c, in degrees (0–180). */
export function angleAt(a: Vec, b: Vec, c: Vec): number {
  const u: Vec = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const v: Vec = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const lu = Math.hypot(...u);
  const lv = Math.hypot(...v);
  if (lu === 0 || lv === 0) return 180;
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/**
 * Measure a joint in clinical-style degrees (see lib/exercises/tracking.ts).
 * Returns null when the needed landmarks aren't visible.
 */
export function measure(
  frame: PoseFrame,
  metric: JointMetricId,
  side: Side,
  space: "image" | "world",
): number | null {
  const [ia, ib, ic] = metricLandmarks(metric, side);
  if (!areVisible(frame, [ia, ib, ic])) return null;
  const inner = angleAt(point(frame, ia, space), point(frame, ib, space), point(frame, ic, space));
  switch (metric) {
    case "knee_flexion":
    case "knee_extension":
    case "hip_flexion":
    case "elbow_flexion":
      return 180 - inner;
    case "hip_extension":
    case "shoulder_flexion":
    case "shoulder_abduction":
      return inner;
  }
}

function pixel(frame: PoseFrame, index: number): [number, number] {
  const p = frame.image[index];
  return [p.x * frame.width, p.y * frame.height];
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Width of the shoulders and hips relative to torso length, in the picture.
 * About 0.6+ when facing the camera, under about 0.35 when side-on.
 */
export function facingRatio(frame: PoseFrame): number | null {
  const ids = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
  if (ids.some((i) => !frame.image[i])) return null;
  const ls = pixel(frame, LM.leftShoulder);
  const rs = pixel(frame, LM.rightShoulder);
  const lh = pixel(frame, LM.leftHip);
  const rh = pixel(frame, LM.rightHip);
  const torso = Math.hypot(...sub(midpoint(ls, rs), midpoint(lh, rh)));
  if (torso < 1) return null;
  const width = (Math.hypot(...sub(ls, rs)) + Math.hypot(...sub(lh, rh))) / 2;
  return width / torso;
}

function sub(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] - b[0], a[1] - b[1]];
}

/** How far the upper body tilts from vertical, in degrees (0 = upright). */
export function trunkLean(frame: PoseFrame): number | null {
  const shoulders = [LM.leftShoulder, LM.rightShoulder].filter((i) => areVisible(frame, [i]));
  const hips = [LM.leftHip, LM.rightHip].filter((i) => areVisible(frame, [i]));
  if (shoulders.length === 0 || hips.length === 0) return null;
  const avg = (ids: number[]) => {
    const pts = ids.map((i) => pixel(frame, i));
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] as [
      number,
      number,
    ];
  };
  const [dx, dy] = sub(avg(shoulders), avg(hips));
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;
  // Image y points down, so "up" is negative y.
  return (Math.acos(Math.min(1, Math.max(-1, -dy / length))) * 180) / Math.PI;
}

/**
 * Knee moving toward the body's midline (valgus), measured in the 2D picture
 * from the front. Positive = inward, negative = outward. Null if not visible.
 */
export function kneeValgus(frame: PoseFrame, side: Side): number | null {
  const s = sideLandmarks(side);
  const otherHip = side === "left" ? LM.rightHip : LM.leftHip;
  if (!areVisible(frame, [s.hip, s.knee, s.ankle, otherHip])) return null;
  const hip = pixel(frame, s.hip);
  const knee = pixel(frame, s.knee);
  const ankle = pixel(frame, s.ankle);
  const midX = (hip[0] + pixel(frame, otherHip)[0]) / 2;

  const deviation = 180 - angleAt([hip[0], hip[1], 0], [knee[0], knee[1], 0], [ankle[0], ankle[1], 0]);
  const span = ankle[1] - hip[1];
  if (Math.abs(span) < 1) return null;
  const t = (knee[1] - hip[1]) / span;
  const lineX = hip[0] + t * (ankle[0] - hip[0]);
  const inward = Math.abs(knee[0] - midX) < Math.abs(lineX - midX);
  return inward ? deviation : -deviation;
}

/**
 * Which side of the body is closer to the camera, based on MediaPipe's depth
 * estimate (smaller z = closer). Null if unclear.
 */
export function nearSide(frame: PoseFrame): Side | null {
  const left = (frame.image[LM.leftShoulder]?.z ?? 0) + (frame.image[LM.leftHip]?.z ?? 0);
  const right = (frame.image[LM.rightShoulder]?.z ?? 0) + (frame.image[LM.rightHip]?.z ?? 0);
  if (Math.abs(left - right) < 0.1) return null;
  return left < right ? "left" : "right";
}
