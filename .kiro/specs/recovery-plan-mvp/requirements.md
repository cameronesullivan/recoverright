# Requirements: Recovery Plan MVP

## Introduction

RecoverRight helps an injured person turn a diagnosis into a personalized 20-week home recovery plan to review with their doctor and physical therapist. The person uploads medical paperwork (or describes the injury), answers a short questionnaire, passes an emergency symptom screen, and receives an AI-generated plan organized into tabs. They can ask follow-up questions, revisit saved plans, and print or save the plan as a PDF. There are no accounts; plans are stored only in the browser.

This document describes the MVP as currently built.

## Glossary

- **Intake**: the validated questionnaire answers (`Intake` in `lib/intake.ts`).
- **Plan**: the structured AI output (`RecoveryPlan` in `lib/plan-schema.ts`).
- **Saved plan**: a plan plus intake, start date, chat, and sessions stored by `planStore` (`SavedPlan` in `lib/storage.ts`).
- **Plan start date**: week 1, day 1 of the plan (surgery date if surgery is done, otherwise injury date).

## Requirements

### Requirement 1: Diagnosis input

**User story:** As an injured person, I want to upload my medical paperwork or describe my injury, so that the plan is based on my actual diagnosis.

#### Acceptance criteria

1. WHEN the intake form loads THEN the system SHALL show an upload area that accepts JPG, PNG, WebP, or PDF files up to 10 MB, by file picker or drag and drop.
2. WHEN the person selects a file with an unsupported type THEN the system SHALL reject it with a message that names the allowed types and explains how to handle iPhone HEIC photos.
3. WHEN the person selects a file over 10 MB THEN the system SHALL reject it and suggest a smaller photo or screenshot.
4. WHEN the person chooses "I don't have my medical documents" THEN the system SHALL show a free-text description field (max 2000 characters).
5. The system SHALL send the description only while the description field is visible.
6. IF neither a file nor a description is provided THEN the system SHALL block submission with a message that matches the current mode.
7. WHEN both paperwork and a description are given and they conflict THEN the AI SHALL follow the paperwork and record the conflict in `assumptions`.
8. WHEN a document is provided THEN the AI SHALL summarize it in `paperworkFindings` without personal identifiers.

### Requirement 2: Intake questionnaire

**User story:** As an injured person, I want to answer a few questions about myself and my injury, so that the plan fits my situation.

#### Acceptance criteria

1. The form SHALL collect: date of injury, age, activity level, sport (optional), surgery status, surgery date (only when status is "done"), current pain level (0–10), main goal, other notes/symptoms, emergency symptom checkboxes, and an acknowledgement checkbox.
2. Activity level SHALL be one of sedentary, light, moderate, very active, athlete. Surgery status SHALL be one of not discussed, not recommended, recommended, done.
3. IF a required field is missing THEN the system SHALL show a field-level error and focus the first invalid field.
4. IF the injury date, or a completed surgery's date, is in the future THEN the system SHALL reject it on both client and server.
5. IF age is outside 1–120 THEN the system SHALL show "Enter an age between 1 and 120."
6. IF the main goal is shorter than 3 or longer than 500 characters THEN the system SHALL reject it.
7. IF the acknowledgement is not checked THEN the system SHALL block submission.
8. The server SHALL re-validate the intake with the same `IntakeSchema` and return the first error with HTTP 400.

### Requirement 3: Emergency symptom check

**User story:** As an injured person, I want to be told clearly if my symptoms need urgent care, so that I don't follow a home plan when I should see a doctor.

#### Acceptance criteria

1. The form SHALL offer 8 emergency symptom checkboxes (numbness, poor circulation, severe swelling, uncontrolled pain, fever after surgery, wound problem, blood clot signs, deformity).
2. WHEN the form is submitted THEN the system SHALL run `screenForEmergency` in the browser before calling the server.
3. The screen SHALL flag any checked symptom and any keyword match in the notes, goal, or diagnosis text across 9 concern patterns, ignoring matches preceded by negations ("no", "denies", "without"…) or hypothetical phrasing ("if", "watch for", "signs of"…).
4. WHEN the screen flags an emergency THEN the system SHALL show "Please seek medical care now", list the reasons, give 911 guidance, and offer "Go back and edit my answers" instead of generating a plan.
5. The server SHALL run the same screen again and return `status: "emergency"` with the reasons.
6. WHEN the AI sets `urgentCare.needed` THEN the server SHALL return an emergency response instead of a plan, using a generic reason if none was given.
7. The AI SHALL set `urgentCare.needed` only for current symptoms, not standard discharge warnings.
8. WHEN a saved plan has `urgentCare.needed` THEN the plan page SHALL show the emergency notice instead of the plan.

### Requirement 4: AI-generated 20-week plan

**User story:** As an injured person, I want a clear, personalized 20-week plan, so that I understand my injury and what to do each week.

#### Acceptance criteria

1. WHEN a valid, non-emergency intake is submitted THEN the server SHALL generate a plan with OpenAI structured output that conforms to `RecoveryPlanSchema`.
2. The plan start date SHALL be the surgery date when surgery is done, otherwise the injury date. IF that start is more than 20 weeks ago THEN the plan SHALL start today.
3. The plan SHALL contain 3–5 phases that cover weeks 1–20 in order with no gaps or overlaps; the server SHALL normalize phase week ranges to guarantee this.
4. Each phase SHALL include focus, what to expect, goals, milestones, precautions, and 3–6 home exercises with sets, reps, frequency, steps, and a safety note.
5. The plan SHALL include an overview, surgery options (surgical vs non-surgical pros/cons and questions for the surgeon), 4–8 alternative therapies chosen by id from the curated list, nutrition/sleep/habit tips, red flags, and questions for the doctor and PT.
6. The AI SHALL NOT give doses for unapproved substances or any medication, invent citations, or tell the person to change prescribed treatment.
7. IF the input isn't an injury, is unreadable, or is too vague THEN the server SHALL return the AI's `cannotCreatePlanReason` with HTTP 422.
8. IF generation fails THEN the system SHALL show a friendly error (timeout, connection, bad key, model unavailable, rate limit, unreadable file) and offer "Try again" and "Edit my answers" without losing answers.
9. The client SHALL abort generation after 5 minutes and show a timeout message.
10. While generating, the system SHALL show progress steps, including "Reading your paperwork" when a file was uploaded.

### Requirement 5: Plan view with tabs

**User story:** As an injured person, I want my plan organized into sections, so that I can find what I need quickly.

#### Acceptance criteria

1. The plan page SHALL show the title, summary, plan start date, current week ("You're in week N of 20" or "20-week plan complete"), and a disclaimer.
2. The plan page SHALL provide a sticky tab bar with: Overview, Timeline, Home exercises, Surgery options, Other therapies, Nutrition & sleep, Red flags, Questions.
3. The Timeline and Home exercises tabs SHALL highlight the phase for the current week.
4. The Other therapies tab SHALL show each therapy with its evidence level badge, curated summary, risks, cost, and regulatory status from `lib/therapies.ts`, plus the AI's `whyRelevant`.
5. IF the plan id isn't found in this browser THEN the system SHALL explain that plans are saved only in the browser where they were created.

### Requirement 6: Follow-up chat

**User story:** As an injured person, I want to ask questions about my plan, so that I understand it better before talking to my care team.

#### Acceptance criteria

1. The plan page SHALL include an "Ask about your plan" chat with 4 suggested questions.
2. WHEN the person asks a question THEN the client SHALL send the plan, intake, plan start date, and message history to `/api/chat`.
3. The server SHALL validate the request, keep the last 16 messages, require the last message to be from the user and at most 2000 characters, and reject bodies over 400,000 characters.
4. Answers SHALL be plain text, tied to the plan and current week, use only curated therapy information, and tell the person to call 911 first if they describe an emergency.
5. WHEN an answer arrives THEN the system SHALL save the chat with the plan. IF saving fails THEN the system SHALL keep the answer on screen and show a warning.
6. IF the request fails THEN the system SHALL restore the question to the input and show the error.
7. WHEN the person confirms "Clear chat" THEN the system SHALL delete the saved chat history.

### Requirement 7: Saved plans

**User story:** As an injured person, I want my plans saved without making an account, so that I can come back to them.

#### Acceptance criteria

1. WHEN a plan is generated THEN the client SHALL save it in localStorage and navigate to `/plans/{id}`. IF the person left the page during generation THEN the plan SHALL still be saved without navigating.
2. IF saving fails (storage blocked or full) THEN the system SHALL show an error explaining the cause.
3. The "My plans" page SHALL list saved plans newest first with title, injury, start date, and created date, with Open and Delete actions.
4. WHEN the person confirms Delete THEN the system SHALL remove the plan.
5. WHEN no plans exist THEN the system SHALL show an empty state with a link to build a plan.
6. Invalid stored entries SHALL be hidden from reads but preserved on writes.

### Requirement 8: PDF export

**User story:** As an injured person, I want to print or save my plan as a PDF, so that I can bring it to appointments.

#### Acceptance criteria

1. The plan page SHALL include a "Print / Save as PDF" button that opens the browser print dialog.
2. WHEN printing THEN the output SHALL include every tab's content and hide the tab bar, chat, and interactive buttons.
