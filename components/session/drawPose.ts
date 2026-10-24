import { LM, MIN_VISIBILITY, type PosePoint } from "@/lib/exercises/pose";
import type { FormStatus } from "@/lib/exercises/tracker";

export const STATUS_COLORS: Record<FormStatus, string> = {
  good: "#22c55e",
  warning: "#eab308",
  stop: "#ef4444",
};

const BONES: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
];

const JOINTS = [
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftElbow,
  LM.rightElbow,
  LM.leftWrist,
  LM.rightWrist,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
];

export interface DrawOptions {
  status: FormStatus;
  /** Landmarks to draw larger (the tracked joint). */
  highlight: number[];
  /** Landmark to put the live angle next to. */
  labelAt: number | null;
  label: string | null;
}

/**
 * Draw a stick figure over the mirrored video. The canvas is the same size as
 * the video frame; x is flipped here (not with CSS) so the angle text stays readable.
 */
export function drawPose(ctx: CanvasRenderingContext2D, landmarks: PosePoint[] | null, options: DrawOptions): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;

  const scale = Math.max(1, Math.min(width, height) / 360);
  const at = (i: number) => {
    const p = landmarks[i];
    return { x: (1 - p.x) * width, y: p.y * height, visible: (p.visibility ?? 1) >= MIN_VISIBILITY };
  };
  const color = STATUS_COLORS[options.status];

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Bones: a dark outline first so the lines stand out on any background.
  for (const pass of [0, 1] as const) {
    ctx.strokeStyle = pass === 0 ? "rgba(15, 23, 42, 0.55)" : color;
    ctx.lineWidth = (pass === 0 ? 7 : 4) * scale;
    for (const [a, b] of BONES) {
      const pa = at(a);
      const pb = at(b);
      if (!pa.visible || !pb.visible) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }

  // Head: a small circle around the nose and ears, joined to the shoulders.
  const nose = at(LM.nose);
  const ls = at(LM.leftShoulder);
  const rs = at(LM.rightShoulder);
  if (nose.visible) {
    const neck = ls.visible && rs.visible ? { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 } : ls.visible ? ls : rs.visible ? rs : null;
    const radius = neck
      ? Math.min(60 * scale, Math.max(8 * scale, Math.hypot(nose.x - neck.x, nose.y - neck.y) * 0.45))
      : 14 * scale;
    if (neck) {
      const dx = neck.x - nose.x;
      const dy = neck.y - nose.y;
      const len = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      ctx.moveTo(nose.x + (dx / len) * radius, nose.y + (dy / len) * radius);
      ctx.lineTo(neck.x, neck.y);
      ctx.stroke();
    }
    ctx.lineWidth = 4 * scale;
    ctx.strokeStyle = color;
    ctx.fillStyle = "rgba(15, 23, 42, 0.25)";
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Joints.
  for (const i of JOINTS) {
    const p = at(i);
    if (!p.visible) continue;
    const big = options.highlight.includes(i);
    const r = (big ? 11 : 5.5) * scale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = big ? "#ffffff" : color;
    ctx.fill();
    ctx.lineWidth = (big ? 4 : 2) * scale;
    ctx.strokeStyle = big ? color : "rgba(15, 23, 42, 0.6)";
    ctx.stroke();
  }

  // Live angle next to the tracked joint.
  if (options.label && options.labelAt !== null) {
    const p = at(options.labelAt);
    if (p.visible) {
      // Kept small so it doesn't hide the person.
      const fontSize = Math.round(14 * scale);
      ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      const textWidth = ctx.measureText(options.label).width;
      const padX = 5 * scale;
      const boxW = textWidth + padX * 2;
      const boxH = fontSize * 1.35;
      // Put the label beside the joint, flipping sides near the edge.
      let x = p.x + 14 * scale;
      if (x + boxW > width) x = p.x - 14 * scale - boxW;
      const y = Math.min(Math.max(p.y - boxH / 2, 0), height - boxH);
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
      roundRect(ctx, x, y, boxW, boxH, 6 * scale);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(options.label, x + padX, y + boxH / 2);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
