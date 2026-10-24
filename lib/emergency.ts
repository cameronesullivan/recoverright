import { EMERGENCY_SYMPTOMS, type Intake } from "./intake";

/**
 * Rule-based screen for emergency symptoms. Runs in the browser before any AI
 * call and again on the server. It is deliberately cautious: when in doubt,
 * it tells the person to get care.
 */

const PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Numbness or tingling", pattern: /\b(numb(ness)?|tingl(e|ing|y)|pins and needles|can'?t feel|cannot feel|lost feeling|loss of (feeling|sensation))\b/ },
  { label: "Signs of poor circulation", pattern: /\b(loss of circulation|poor circulation|no pulse|(turn(ed|ing)?|is|are|look(s|ing)?) (blue|gr[ae]y|white|pale)|cold to the touch|ice cold)\b/ },
  { label: "Severe or worsening swelling", pattern: /\b((severe|extreme|massive|huge) swelling|swelling (is )?(getting worse|worsening|spreading)|cast (is |feels )?(too )?tight|splint (is |feels )?(too )?tight)\b/ },
  { label: "Fever or chills", pattern: /\b(fever(ish)?|chills|high temperature)\b/ },
  { label: "Possible wound infection", pattern: /\b(pus|oozing|foul smell|smells bad|incision (has )?(opened|opening|split)|wound (has )?(opened|opening|split)|spreading redness|red streaks?)\b/ },
  { label: "Possible blood clot or breathing problem", pattern: /\b(chest pain|short(ness)? of breath|can'?t breathe|trouble breathing|difficulty breathing|calf (pain|swelling)|coughing (up )?blood)\b/ },
  { label: "Possible open fracture or new deformity", pattern: /\b(bone (is )?(sticking|poking) (out|through)|bone through (the )?skin|visible bone)\b/ },
  { label: "Compartment syndrome concern", pattern: /\bcompartment syndrome\b/ },
  { label: "Pain that is out of control", pattern: /\b(unbearable|excruciating|out of control|uncontrolled) pain|pain (is )?(unbearable|excruciating|out of control|uncontrolled)\b/ },
];

// "No numbness", "denies fever"
const NEGATION = /\b(no|not|denies|denied|without|never|negative for|free of|absent)\b[^.;!?\n]{0,30}$/;
// Copied discharge instructions: "return to the ER if you have numbness", "watch for signs of infection"
const HYPOTHETICAL = /\b(if|watch for|watch out for|look out for|signs of|symptoms of|such as|warning signs?|in case of|unless|prevent|avoid|risk of)\b[^.;!?\n]{0,40}$/;

function findMatches(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const { label, pattern } of PATTERNS) {
    const global = new RegExp(pattern.source, "g");
    for (const match of lower.matchAll(global)) {
      const before = lower.slice(Math.max(0, match.index - 40), match.index);
      if (!NEGATION.test(before) && !HYPOTHETICAL.test(before)) {
        found.push(label);
        break;
      }
    }
  }
  return found;
}

export interface EmergencyScreen {
  isEmergency: boolean;
  reasons: string[];
}

export function screenForEmergency(
  intake: Pick<Intake, "emergencySymptoms" | "diagnosisText" | "symptomsNotes" | "mainGoal">,
): EmergencyScreen {
  const reasons = new Set<string>();
  for (const key of intake.emergencySymptoms) {
    reasons.add(EMERGENCY_SYMPTOMS[key]);
  }
  // Free text is scanned for symptom words. Negated mentions ("no numbness")
  // and copied discharge warnings ("call if you have a fever") are skipped.
  const freeText = [intake.symptomsNotes, intake.mainGoal, intake.diagnosisText].join("\n");
  for (const label of findMatches(freeText)) {
    reasons.add(`You mentioned: ${label.toLowerCase()}`);
  }
  return { isEmergency: reasons.size > 0, reasons: [...reasons] };
}
