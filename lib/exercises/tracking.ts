/**
 * Camera tracking setup for guided sessions.
 *
 * Each entry in TRACKED_EXERCISES describes one kind of exercise the camera can
 * follow: which joint to measure, the angles that count as one rep, the typical
 * target range of motion, where to put the camera, and the form rules to check.
 * Plan exercises are matched to an entry by name. Anything that doesn't match,
 * or that has no visible movement (isometric holds, quad sets, icing), uses a
 * timer instead.
 *
 * Angles use clinical-style degrees:
 * - Knee, hip, and elbow bend (flexion): 0° = straight, bigger = more bent.
 * - Knee straightening: degrees short of fully straight (lower is better).
 * - Arm raise: 0° = arm by your side, 180° = straight overhead.
 * - Hip lift (bridge): angle at the hip between shoulder and knee; 180° = in line.
 *
 * Thresholds are forgiving starting points, not clinical standards. Have a
 * licensed physical therapist review them before launch.
 */

export type Side = "left" | "right";
export type CameraView = "side" | "front";
export type BodyPosition = "standing" | "sitting" | "lying";
export type Severity = "warning" | "stop";

export type JointMetricId =
  | "knee_flexion"
  | "knee_extension"
  | "hip_flexion"
  | "hip_extension"
  | "shoulder_flexion"
  | "shoulder_abduction"
  | "elbow_flexion";

export interface JointMetric {
  /** Plain-language name, e.g. "knee bend". */
  label: string;
  joint: "knee" | "hip" | "shoulder" | "elbow";
  /** False when a smaller number is the better result (knee straightening). */
  higherIsBetter: boolean;
}

export const JOINT_METRICS: Record<JointMetricId, JointMetric> = {
  knee_flexion: { label: "knee bend", joint: "knee", higherIsBetter: true },
  knee_extension: { label: "knee straightening (degrees short of straight)", joint: "knee", higherIsBetter: false },
  hip_flexion: { label: "leg raise", joint: "hip", higherIsBetter: true },
  hip_extension: { label: "hip lift", joint: "hip", higherIsBetter: true },
  shoulder_flexion: { label: "forward arm raise", joint: "shoulder", higherIsBetter: true },
  shoulder_abduction: { label: "side arm raise", joint: "shoulder", higherIsBetter: true },
  elbow_flexion: { label: "elbow bend", joint: "elbow", higherIsBetter: true },
};

interface RuleBase {
  /** Stable id, used to count issues across sets and sessions. */
  id: string;
  severity: Severity;
  /** Short phrase for summaries and coach events, e.g. "knee caving inward". */
  label: string;
  /** What to tell the person on screen. */
  cue: string;
}

export type FormRule =
  | (RuleBase & {
      /** Knee moving inward past the hip–ankle line (front view only). */
      type: "kneeValgus";
      maxDegrees: number;
      /** Only check once the knee is bent at least this much. */
      minKneeBend: number;
    })
  | (RuleBase & {
      /** A second joint on the tracked side goes past a limit, e.g. elbow bending during an arm raise. */
      type: "angleLimit";
      metric: JointMetricId;
      max: number;
      /** Only check while the main movement is past this value. */
      whenMainAbove: number;
    })
  | (RuleBase & {
      /** Upper body tilting away from vertical (standing or sitting exercises). */
      type: "trunkLean";
      maxDegrees: number;
    })
  | (RuleBase & {
      /** The main movement goes further than this exercise needs. */
      type: "beyondRange";
      max: number;
    })
  | (RuleBase & {
      /** A rep finished faster than this. */
      type: "tooFast";
      minRepSeconds: number;
    })
  | (RuleBase & {
      /** The person moved but didn't reach the rep target. */
      type: "incompleteRange";
    });

export interface TrackedExerciseConfig {
  id: string;
  /** Matched against the plan exercise name (lowercased). */
  match: RegExp;
  /** Names that look similar but shouldn't use this config. */
  exclude?: RegExp;
  metric: JointMetricId;
  /** "injured" tracks the injured side when known (otherwise the most visible side). */
  side: "injured" | "both";
  /**
   * "image" measures angles in the 2D camera picture (best for side views).
   * "world" uses MediaPipe's 3D estimate (needed when bending toward the camera).
   */
  angleSpace: "image" | "world";
  view: CameraView;
  position: BodyPosition;
  rep: {
    /** Whether the measured angle goes up or down during the effort part of the rep. */
    direction: "increase" | "decrease";
    /** Angle at the starting position. */
    start: number;
    /** Angle the movement must reach for the rep to count. */
    target: number;
    /**
     * If someone's range is limited today, the target is lowered toward this
     * value after repeated short reps, so we count reps at their current range.
     */
    easiestTarget: number;
  };
  /** Typical target range of motion for this exercise, shown for comparison. */
  targetRange: { min: number; max: number };
  /** Seconds for one slow, controlled rep (used for timers and estimates). */
  repSeconds: number;
  setup: {
    camera: string;
    /** "{side}" is replaced with "left" or "right" (or "injured"). */
    you: string;
  };
  /** Shown when the needed joints aren't visible. */
  repositionHint: string;
  easierVariation: string;
  rules: FormRule[];
}

const tooFast = (minRepSeconds: number): FormRule => ({
  id: "too_fast",
  type: "tooFast",
  minRepSeconds,
  severity: "warning",
  label: "moving too fast",
  cue: "Slow down. Take about 2 seconds each way.",
});

const incomplete = (cue: string): FormRule => ({
  id: "incomplete_range",
  type: "incompleteRange",
  severity: "warning",
  label: "incomplete range of motion",
  cue,
});

const FLOOR_CAMERA = "Put your device on the floor or a low stool about 6–8 feet (2 meters) away, turned sideways (landscape).";
const STANDING_CAMERA = "Put your device at about waist height, 6–8 feet (2 meters) away, turned sideways (landscape).";

export const TRACKED_EXERCISES: TrackedExerciseConfig[] = [
  {
    id: "heel_slide",
    match: /heel slide/,
    metric: "knee_flexion",
    side: "injured",
    angleSpace: "image",
    view: "side",
    position: "lying",
    rep: { direction: "increase", start: 25, target: 50, easiestTarget: 30 },
    targetRange: { min: 90, max: 120 },
    repSeconds: 4,
    setup: {
      camera: FLOOR_CAMERA,
      you: "Lie on your back with your {side} side facing the camera, so your hip, knee, and ankle are all in view.",
    },
    repositionHint: "Move the camera back so your whole leg, from hip to ankle, is visible.",
    easierVariation: "Slide your heel a shorter distance, or put a towel or plastic bag under your heel so it glides more easily.",
    rules: [tooFast(1.5), incomplete("Slide your heel a little further if it's comfortable.")],
  },
  {
    id: "straight_leg_raise",
    match: /straight[- ]leg raise|\bslr\b/,
    metric: "hip_flexion",
    side: "injured",
    angleSpace: "image",
    view: "side",
    position: "lying",
    rep: { direction: "increase", start: 12, target: 25, easiestTarget: 15 },
    targetRange: { min: 30, max: 45 },
    repSeconds: 4,
    setup: {
      camera: FLOOR_CAMERA,
      you: "Lie on your back with your {side} side facing the camera. Bend your other knee and keep your {side} leg straight.",
    },
    repositionHint: "Move the camera back so your shoulder, hip, and whole leg are visible.",
    easierVariation: "Lift your leg only a few inches, or do quad sets (tighten your thigh without lifting) instead.",
    rules: [
      {
        id: "knee_bent",
        type: "angleLimit",
        metric: "knee_flexion",
        max: 20,
        whenMainAbove: 10,
        severity: "warning",
        label: "knee bending during the lift",
        cue: "Keep your knee straight. Tighten your thigh before you lift.",
      },
      {
        id: "beyond_range",
        type: "beyondRange",
        max: 75,
        severity: "stop",
        label: "lifting higher than needed",
        cue: "Stop and lower your leg. It only needs to reach about the height of your other knee.",
      },
      tooFast(1.5),
      incomplete("Lift a little higher if it's comfortable, about to the height of your other knee."),
    ],
  },
  {
    id: "squat",
    match: /squat|sit[- ]?to[- ]?stand|chair (stand|rise)|stand(ing)? up from (a )?chair/,
    exclude: /wall squat hold|squat hold/,
    metric: "knee_flexion",
    side: "both",
    angleSpace: "world",
    view: "front",
    position: "standing",
    rep: { direction: "increase", start: 20, target: 40, easiestTarget: 25 },
    targetRange: { min: 60, max: 90 },
    repSeconds: 4,
    setup: {
      camera: STANDING_CAMERA,
      you: "Stand facing the camera with your whole body in view, feet hip-width apart. Hold a counter or sturdy chair if you need balance.",
    },
    repositionHint: "Step back until your whole body, from head to feet, is in view.",
    easierVariation: "Do a smaller squat, hold a counter for support, or sit down to a higher chair and stand back up.",
    rules: [
      {
        id: "knee_valgus",
        type: "kneeValgus",
        maxDegrees: 12,
        minKneeBend: 30,
        severity: "warning",
        label: "knee caving inward",
        cue: "Push your knees out so they stay in line with your toes.",
      },
      {
        id: "trunk_lean",
        type: "trunkLean",
        maxDegrees: 15,
        severity: "warning",
        label: "leaning to one side",
        cue: "Keep your weight even on both legs and your chest up.",
      },
      {
        id: "beyond_range",
        type: "beyondRange",
        max: 110,
        severity: "stop",
        label: "squatting deeper than needed",
        cue: "Stop and come back up. That's deeper than this exercise needs.",
      },
      tooFast(1.6),
      incomplete("Bend your knees a little more if it's comfortable."),
    ],
  },
  {
    id: "bridge",
    match: /bridg/,
    exclude: /\bhold\b/,
    metric: "hip_extension",
    side: "injured",
    angleSpace: "image",
    view: "side",
    position: "lying",
    rep: { direction: "increase", start: 145, target: 160, easiestTarget: 152 },
    targetRange: { min: 165, max: 180 },
    repSeconds: 4,
    setup: {
      camera: FLOOR_CAMERA,
      you: "Lie on your back with your knees bent and feet flat, with your {side} side facing the camera.",
    },
    repositionHint: "Move the camera back so your shoulder, hip, and knee are all visible.",
    easierVariation: "Lift your hips only an inch or two, or squeeze your buttocks without lifting.",
    rules: [tooFast(1.5), incomplete("Lift your hips a little higher if it's comfortable.")],
  },
  {
    id: "terminal_knee_extension",
    match: /terminal knee extension|\btke\b/,
    metric: "knee_extension",
    side: "injured",
    angleSpace: "image",
    view: "side",
    position: "standing",
    rep: { direction: "decrease", start: 25, target: 10, easiestTarget: 18 },
    targetRange: { min: 0, max: 5 },
    repSeconds: 3,
    setup: {
      camera: STANDING_CAMERA,
      you: "Stand with your {side} side facing the camera so your hip, knee, and ankle are in view.",
    },
    repositionHint: "Step back so your whole leg, from hip to ankle, is visible.",
    easierVariation: "Use a lighter band or no band, and straighten the knee gently.",
    rules: [tooFast(1.2), incomplete("Straighten your knee a little more if it's comfortable.")],
  },
  {
    id: "seated_knee_extension",
    match: /long arc quad|knee extension|leg extension|kicks? out/,
    metric: "knee_extension",
    side: "injured",
    angleSpace: "image",
    view: "side",
    position: "sitting",
    rep: { direction: "decrease", start: 60, target: 25, easiestTarget: 45 },
    targetRange: { min: 0, max: 10 },
    repSeconds: 4,
    setup: {
      camera: STANDING_CAMERA,
      you: "Sit on a chair with your {side} side facing the camera so your hip, knee, and ankle are in view.",
    },
    repositionHint: "Move the camera back so your whole leg, from hip to ankle, is visible.",
    easierVariation: "Straighten your knee only part of the way, or do quad sets instead.",
    rules: [tooFast(1.5), incomplete("Straighten your knee a little more if it's comfortable.")],
  },
  {
    id: "standing_knee_flexion",
    match: /hamstring curl|knee curl|standing knee (bend|flexion|curl)/,
    metric: "knee_flexion",
    side: "injured",
    angleSpace: "image",
    view: "side",
    position: "standing",
    rep: { direction: "increase", start: 20, target: 60, easiestTarget: 35 },
    targetRange: { min: 80, max: 100 },
    repSeconds: 4,
    setup: {
      camera: STANDING_CAMERA,
      you: "Stand holding a counter or chair with your {side} side facing the camera, whole leg in view.",
    },
    repositionHint: "Step back so your whole leg, from hip to ankle, is visible.",
    easierVariation: "Bend your knee a smaller amount, or do the exercise lying on your stomach.",
    rules: [
      {
        id: "thigh_forward",
        type: "angleLimit",
        metric: "hip_flexion",
        max: 25,
        whenMainAbove: 20,
        severity: "warning",
        label: "thigh swinging forward",
        cue: "Keep your thigh in line with your body. Bend only at the knee.",
      },
      {
        id: "trunk_lean",
        type: "trunkLean",
        maxDegrees: 20,
        severity: "warning",
        label: "leaning forward",
        cue: "Stand tall and hold the counter for balance.",
      },
      tooFast(1.5),
      incomplete("Bend your knee a little more if it's comfortable."),
    ],
  },
  {
    id: "shoulder_abduction",
    match: /abduction|side (arm )?raise|lateral raise|raise .*to the side|arm raises? to the side|scaption/,
    exclude: /hip|leg|clam|side[- ]lying/,
    metric: "shoulder_abduction",
    side: "injured",
    angleSpace: "image",
    view: "front",
    position: "standing",
    rep: { direction: "increase", start: 30, target: 75, easiestTarget: 50 },
    targetRange: { min: 150, max: 180 },
    repSeconds: 4,
    setup: {
      camera: STANDING_CAMERA,
      you: "Stand or sit facing the camera so your head, arms, and hips are in view.",
    },
    repositionHint: "Step back so your head, both arms, and hips are visible.",
    easierVariation: "Raise your arm only to shoulder height or lower, or slide your hand up a wall.",
    rules: [
      {
        id: "elbow_bent",
        type: "angleLimit",
        metric: "elbow_flexion",
        max: 35,
        whenMainAbove: 40,
        severity: "warning",
        label: "elbow bending",
        cue: "Keep your elbow fairly straight as you lift.",
      },
      {
        id: "trunk_lean",
        type: "trunkLean",
        maxDegrees: 12,
        severity: "warning",
        label: "leaning the body sideways",
        cue: "Keep your body upright. Don't lean away from the arm.",
      },
      tooFast(1.5),
      incomplete("Raise your arm a little higher if it's comfortable."),
    ],
  },
  {
    id: "shoulder_flexion",
    match: /shoulder flexion|forward (arm )?raise|front raise|arm raise|arm lift|overhead reach|raise (your )?arms?/,
    exclude: /side|lateral|abduction/,
    metric: "shoulder_flexion",
    side: "injured",
    angleSpace: "image",
    view: "side",
    position: "standing",
    rep: { direction: "increase", start: 30, target: 80, easiestTarget: 50 },
    targetRange: { min: 150, max: 180 },
    repSeconds: 4,
    setup: {
      camera: STANDING_CAMERA,
      you: "Stand or sit with your {side} side facing the camera so your arm, shoulder, and hip are in view.",
    },
    repositionHint: "Step back so your whole arm, shoulder, and hip are visible.",
    easierVariation: "Raise your arm only partway, help it with your other hand, or slide your hand along a table.",
    rules: [
      {
        id: "elbow_bent",
        type: "angleLimit",
        metric: "elbow_flexion",
        max: 35,
        whenMainAbove: 40,
        severity: "warning",
        label: "elbow bending",
        cue: "Keep your elbow fairly straight as you lift.",
      },
      {
        id: "trunk_lean",
        type: "trunkLean",
        maxDegrees: 15,
        severity: "warning",
        label: "leaning back",
        cue: "Keep your back straight. Don't lean back to lift higher.",
      },
      tooFast(1.5),
      incomplete("Raise your arm a little higher if it's comfortable."),
    ],
  },
  {
    id: "elbow_flexion",
    match: /elbow (flexion|bend|curl)|biceps? curl|bend and straighten (your )?elbow|elbow flexion and extension/,
    metric: "elbow_flexion",
    side: "injured",
    angleSpace: "image",
    view: "side",
    position: "standing",
    rep: { direction: "increase", start: 40, target: 90, easiestTarget: 60 },
    targetRange: { min: 135, max: 150 },
    repSeconds: 4,
    setup: {
      camera: STANDING_CAMERA,
      you: "Stand or sit with your {side} side facing the camera so your shoulder, elbow, and wrist are in view.",
    },
    repositionHint: "Move back so your shoulder, elbow, and wrist are all visible.",
    easierVariation: "Bend your elbow a smaller amount, or support your forearm on a table and slide it.",
    rules: [
      {
        id: "upper_arm_swing",
        type: "angleLimit",
        metric: "shoulder_flexion",
        max: 35,
        whenMainAbove: 50,
        severity: "warning",
        label: "upper arm swinging",
        cue: "Keep your elbow tucked by your side.",
      },
      tooFast(1.5),
      incomplete("Bend your elbow a little more if it's comfortable."),
    ],
  },
];

/** Exercises with no visible movement, timed as holds. */
const ISOMETRIC = /\b(quad(riceps)? sets?|quad squeezes?|glute(al)? sets?|glute squeezes?|isometrics?|static (hold|contraction)s?|planks?|wall sits?|squat holds?)\b/;
/** Exercises timed as one continuous block. */
const CONTINUOUS = /\b(ice|icing|cold (pack|therapy|compress)|cryotherapy|elevat(e|ion|ing))\b/;

export type ExerciseMode = "camera" | "paced" | "hold" | "duration";

export interface ExerciseClassification {
  mode: ExerciseMode;
  tracking: TrackedExerciseConfig | null;
}

/**
 * Decide how a plan exercise is run in a guided session.
 * `hasRepCount` / `holdSeconds` come from parsing the exercise's reps text.
 */
export function classifyExercise(
  name: string,
  dosage: { hasRepCount: boolean; holdSeconds: number | null },
): ExerciseClassification {
  const lower = name.toLowerCase();
  if (CONTINUOUS.test(lower)) return { mode: "duration", tracking: null };
  if (ISOMETRIC.test(lower)) return { mode: "hold", tracking: null };

  const tracking =
    TRACKED_EXERCISES.find((c) => c.match.test(lower) && !(c.exclude && c.exclude.test(lower))) ?? null;
  const namedHold = /\bhold\b/.test(lower);
  if (tracking && !(namedHold && !dosage.hasRepCount)) return { mode: "camera", tracking };

  if (dosage.holdSeconds !== null && (!dosage.hasRepCount || namedHold || /stretch/.test(lower))) {
    return { mode: !dosage.hasRepCount && dosage.holdSeconds >= 60 ? "duration" : "hold", tracking: null };
  }
  return { mode: "paced", tracking: null };
}

export function getTrackingConfig(id: string): TrackedExerciseConfig | undefined {
  return TRACKED_EXERCISES.find((c) => c.id === id);
}

/** Fill in "{side}" in setup text. */
export function describeSide(text: string, side: Side | null): string {
  return text.replaceAll("{side}", side ?? "injured");
}
