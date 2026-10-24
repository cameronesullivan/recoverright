---
inclusion: always
---

# RecoverRight project rules

These rules apply to every change in this repository.

## Medical safety

- **Never give dosing for unapproved substances.** No doses, schedules, cycles, or sourcing for anything that isn't FDA-approved (for example BPC-157, TB-500, growth hormone peptides). The model prompts in `lib/ai.ts` (`SAFETY_RULES`) also forbid medication doses of any kind; keep that rule. Therapies flagged `unapproved: true` in `lib/therapies.ts` must never show dosing in the UI, the prompts, or chat answers.
- **Always label alternative therapies by evidence level.** Every therapy shown to a user must display its `EvidenceLevel` ("strong", "emerging", "experimental") using `EVIDENCE_LABELS` / `EvidenceBadge`. Therapy facts come only from the curated list in `lib/therapies.ts`; the model may choose therapies by id and write `whyRelevant`, but must not add claims, citations, or new therapies.
- Never invent citations, study names, statistics, or URLs.
- Never tell users to stop or change a prescribed medicine, brace, or weight-bearing restriction. The care team's instructions come first.
- Keep the emergency screen (`lib/emergency.ts`) running on both the client and the server, and keep the "Educational information, not medical advice" disclaimers.

## Architecture

- **All AI calls live in `lib/ai.ts`.** Prompts, model selection (`OPENAI_MODEL`, `OPENAI_COACH_MODEL`), the OpenAI client, and error mapping (`AIError`, `toAIError`) stay in that file. API routes in `app/api/*` validate input and call functions exported from `lib/ai.ts`; they never import `openai` directly. `lib/ai.ts` stays `import "server-only"`.
- **All storage lives in `lib/storage.ts`.** Components read and write plans, chat history, and guided sessions only through `planStore` (the `PlanStore` interface). No direct `localStorage` access elsewhere. To add a database, implement `PlanStore` and swap the `planStore` export.
- Validate data at trust boundaries with the zod schemas in `lib/intake.ts`, `lib/plan-schema.ts`, and `lib/exercises/session.ts`.

## Privacy

- **Never send camera video to the server.** Pose tracking runs in the browser with MediaPipe assets served from `public/mediapipe`. No frames, images, video, or landmark streams may leave the device. The coach endpoint (`/api/coach`) receives only exercise names/sets/reps and short text messages. Keep the `connect-src 'self'` CSP in `next.config.ts` and the MediaPipe metrics block in `components/session/poseLandmarker.ts`.
- Uploaded documents are sent to OpenAI only for the single plan request with `store: false` and are never persisted on the server.

## Next.js

- This project uses a Next.js version with breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (see `AGENTS.md`).
