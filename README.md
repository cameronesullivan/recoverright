# RecoverRight

RecoverRight turns an injury diagnosis (typed, or read from a photo/PDF of paperwork) into a personalized,
educational 20-week recovery plan to discuss with a doctor or physical therapist.

## Run it locally

1. Install Node.js 20 or newer.
2. In this folder, install dependencies: `npm install`
3. Copy `.env.local.example` to `.env.local` and paste your OpenAI API key after `OPENAI_API_KEY=`.
4. Start the dev server: `npm run dev`, then open http://localhost:3000.

For a production build: `npm run build` then `npm start`.

## Where things live

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Landing page |
| `app/intake/page.tsx`, `components/IntakeForm.tsx` | Intake form, client-side emergency screen, loading and error states |
| `app/plans/page.tsx`, `components/PlansList.tsx` | "My plans" list |
| `app/plans/[id]/page.tsx`, `components/plan/*` | Plan page (tabs, print, follow-up chat) |
| `app/api/plan/route.ts` | Validates intake and upload, re-runs the emergency screen, calls the AI |
| `app/api/chat/route.ts` | Follow-up questions about a plan |
| `lib/ai.ts` | **All AI calls.** Swap providers by reimplementing `generateRecoveryPlan` and `answerPlanQuestion` |
| `lib/plan-schema.ts` | Zod schema for the plan. Sent to the model as strict JSON Schema and used to validate the response |
| `lib/therapies.ts` | Curated alternative-therapy data (evidence label, summary, risks, cost, regulatory status) |
| `lib/emergency.ts` | Rule-based emergency symptom screen (used in browser and server) |
| `lib/storage.ts` | **All storage.** `PlanStore` interface with a localStorage implementation (plans, chat, guided sessions) |
| `lib/exercises/tracking.ts` | **Guided session tracking config:** per exercise, the joint to track, rep angle thresholds, target range of motion, camera placement, and form rules |
| `lib/exercises/pose.ts`, `lib/exercises/tracker.ts` | Joint-angle math, rep counting, form checks, and "reposition the camera" logic (no AI) |
| `lib/exercises/session.ts` | Turns today's plan exercises into session steps, parses sets/reps, saved-session schema |
| `components/session/*` | Guided session UI: card and history charts, camera permission flow, live video with stick figure, timers, beeps, coach |
| `app/api/coach/route.ts` | Short text coaching messages for guided sessions |
| `public/mediapipe/` | MediaPipe pose model (`pose_landmarker_lite.task`) and WebAssembly runtime, served locally |

## Guided sessions (camera coach)

- Camera access is requested only after the person taps **Start session** and then **Enable camera**.
- Pose tracking uses Google MediaPipe Pose Landmarker, running in the browser. Video is never uploaded or stored.
- The model file is committed in `public/mediapipe/`. The WebAssembly files are copied from
  `node_modules/@mediapipe/tasks-vision` into `public/mediapipe/wasm/` by `scripts/copy-mediapipe-wasm.mjs`,
  which runs automatically before `npm run dev` and `npm run build`.
- MediaPipe 1.1 sends anonymous usage metrics (task type, OS, timing) to Google. The
  `Content-Security-Policy: connect-src 'self'` header in `next.config.ts` blocks that, and any other
  browser request to another site. Remove the header if you'd rather allow it.
- The coach (`coachReply` in `lib/ai.ts`) is only called on milestones (set complete, form issue, pain report,
  exercise finished) and for typed questions. It receives the coach instructions, today's exercise list, and the
  last 6 text messages. If the AI is unavailable, the session keeps working with built-in messages.
- `gpt-5-mini` is the default coach model. OpenAI plans to shut it down on December 11, 2026; set
  `OPENAI_COACH_MODEL` (for example to `gpt-5.6-terra`, the recommended replacement) before then.
- Rep thresholds and form rules are starting points. Have a licensed physical therapist review
  `lib/exercises/tracking.ts` before launch.

## Notes

- The AI can only pick alternative therapies by id from `lib/therapies.ts`. The evidence, risk, cost, and
  regulatory text shown to users comes from that file, not from the model. Have a licensed clinician review
  that file before launch, and re-check regulatory status periodically.
- Uploaded files are sent to OpenAI for that one request and are not stored. Requests use `store: false`.
- To move to a database and accounts, implement `PlanStore` against your backend and change the
  `planStore` export in `lib/storage.ts`.
