# Implementation Plan: Recovery Plan MVP

- [x] 1. Domain schemas and rules
  - [x] 1.1 Define `IntakeSchema`, activity levels, surgery statuses, emergency symptoms, and upload limits in `lib/intake.ts`
    - _Requirements: 1.1, 1.4, 1.6, 2.1, 2.2, 2.5, 2.6, 2.7_
  - [x] 1.2 Define `RecoveryPlanSchema`, `PhaseSchema`, `ExerciseSchema`, `ChatMessageSchema` in `lib/plan-schema.ts`
    - _Requirements: 4.1, 4.4, 4.5_
  - [x] 1.3 Build the curated therapy list with evidence levels, labels, and `unapproved` flags in `lib/therapies.ts`
    - _Requirements: 4.5, 4.6, 5.4_
  - [x] 1.4 Implement date helpers and `computePlanTiming` (20 weeks, restart from today when past week 20) in `lib/dates.ts`
    - _Requirements: 4.2, 5.1_
  - [x] 1.5 Define API response types in `lib/api-types.ts`
    - _Requirements: 3.5, 4.1, 6.2_

- [x] 2. Emergency symptom check
  - [x] 2.1 Implement `screenForEmergency` with checkbox reasons, keyword patterns, and negation/hypothetical filtering in `lib/emergency.ts`
    - _Requirements: 3.1, 3.3_
  - [x] 2.2 Build `EmergencyNotice` with reasons, 911 guidance, and optional back button
    - _Requirements: 3.4, 3.8_

- [x] 3. Intake form
  - [x] 3.1 Upload area with file picker, drag and drop, and type/size checks
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 3.2 "I don't have my medical documents" toggle and description field
    - _Requirements: 1.4, 1.5, 1.6_
  - [x] 3.3 Questionnaire fields, client validation, and focus on first invalid field
    - _Requirements: 2.1–2.7_
  - [x] 3.4 Run the emergency screen before submit
    - _Requirements: 3.2, 3.4_
  - [x] 3.5 Submit with 5-minute timeout, `GeneratingPlan` progress, error screen with retry/edit
    - _Requirements: 4.8, 4.9, 4.10_

- [x] 4. AI integration in `lib/ai.ts`
  - [x] 4.1 OpenAI client setup with `OPENAI_API_KEY` and `OPENAI_MODEL`
    - _Requirements: 4.1_
  - [x] 4.2 Shared `SAFETY_RULES` and `PLAN_INSTRUCTIONS` with embedded therapy catalog
    - _Requirements: 1.7, 1.8, 3.7, 4.3, 4.5, 4.6_
  - [x] 4.3 `generateRecoveryPlan` with structured output and PDF/image attachments
    - _Requirements: 1.8, 4.1_
  - [x] 4.4 `normalizePlan` to guarantee contiguous weeks 1–20 and unique therapies
    - _Requirements: 4.3_
  - [x] 4.5 `answerPlanQuestion` for follow-up chat
    - _Requirements: 6.4_
  - [x] 4.6 `toAIError` friendly error mapping
    - _Requirements: 4.8_

- [x] 5. Plan API route (`app/api/plan/route.ts`)
  - [x] 5.1 Size limit, form parsing, intake re-validation, future-date checks
    - _Requirements: 2.4, 2.8_
  - [x] 5.2 Server-side emergency screen and `urgentCare` handling
    - _Requirements: 3.5, 3.6_
  - [x] 5.3 File validation and base64 conversion
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 5.4 Generate plan, handle `cannotCreatePlanReason` (422) and AI errors
    - _Requirements: 4.1, 4.7, 4.8_

- [x] 6. Storage (`lib/storage.ts`)
  - [x] 6.1 `PlanStore` interface and `SavedPlanSchema`
    - _Requirements: 7.1_
  - [x] 6.2 localStorage implementation with `list`, `get`, `save`, `updateChat`, `addSession`, `remove`
    - _Requirements: 6.5, 6.7, 7.1, 7.3, 7.4, 7.6_
  - [x] 6.3 `StorageError` messages for blocked or full storage
    - _Requirements: 7.2_

- [x] 7. Plan view
  - [x] 7.1 `PlanView` loading/missing/error states, header with current week, disclaimer
    - _Requirements: 5.1, 5.5, 3.8_
  - [x] 7.2 Sticky tab bar with 8 tabs and section components in `components/plan/sections.tsx`
    - _Requirements: 5.2, 5.3_
  - [x] 7.3 `TherapiesSection` with `EvidenceBadge` and curated therapy facts
    - _Requirements: 5.4_

- [x] 8. Follow-up chat
  - [x] 8.1 `/api/chat` route with validation and message limits
    - _Requirements: 6.2, 6.3_
  - [x] 8.2 `PlanChat` with suggestions, optimistic send, rollback, save, and clear
    - _Requirements: 6.1, 6.5, 6.6, 6.7_

- [x] 9. Saved plans
  - [x] 9.1 Save after generation and navigate (or stay if the page was left)
    - _Requirements: 7.1_
  - [x] 9.2 `PlansList` with empty state, open, and delete
    - _Requirements: 7.3, 7.4, 7.5_

- [x] 10. PDF export
  - [x] 10.1 "Print / Save as PDF" button with print styles that show all tabs and hide interactive UI
    - _Requirements: 8.1, 8.2_

- [x] 11. Landing and supporting pages
  - [x] 11.1 Landing page, intake page, and "My plans" page
    - _Requirements: 7.3_

- [ ] 12. Follow-ups not yet built (optional)
  - [ ] 12.1 Add automated tests for `screenForEmergency`, `computePlanTiming`, `normalizePlan`, and `IntakeSchema`
  - [ ] 12.2 Clinician review of `lib/therapies.ts` content
  - [ ] 12.3 Align landing page copy ("5-month" vs "20-week")
