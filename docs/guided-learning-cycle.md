# Evidence-based guided learning cycle

Version 0.21 connects the student's Moodle submission to a local review, explicit confirmation of a difficulty, targeted practice and a later independent check. It extends the existing observations and interventions rather than introducing a second learning record system.

## Student flow

In **Cómo aprendo**, select a submitted personal Moodle assignment under **De mi entrega a mi siguiente práctica**. The app creates an independent portfolio copy containing only the student's recovered submission text. Course, source URL, local revision, Moodle attempt, instructions and published feedback remain separate metadata. It does not infer a weakness from a grade, count the import as a new exercise attempt or change mastery. Group submissions, drafts, missing text and foreign activity/revision pairs cannot enter this shortcut.

The numerical analysis checks only equalities in the student's text. Instructions and teacher comments are shown as context and are not treated as the student's reasoning. A student can alternatively request existing local-AI observation proposals or record a literal observation. Every difficulty requires an explicit personal confirmation and reason before a reinforcement starts. The numerical checker deliberately leaves text, units, unknown algebra and other unsupported reasoning ungraded.

New supported reinforcements use two sequential practice activities. Arithmetic is decomposed into deterministic expression-tree steps, preserving exact fractions, operator precedence, signs and bounded integer exponents. The student must attempt each step before requesting a hint. There are at most two progressively revealed hints per step and 50 per activity. Incorrect answers remain in the history; a correct step advances to the next. Finishing the activity atomically saves its response and actual hint count. Bank exercises use the existing verified question and answer contract, with an initial attempt and progressive hints; they do not pretend to verify arbitrary written reasoning.

The independent third activity opens no earlier than the next local calendar day after the last practice response, and only after both practices are complete. If practice finishes late, its check date moves forward. Neither hint requests nor the guided-step endpoint are available for this activity; final submission rejects a nonzero hint count. The app stores one outcome and does not overwrite it with a retry. A wrong result offers another explicit reinforcement; an open answer remains pending review. The student can preserve a reflection about what helped and the next step. One correct check does not establish consolidation or change Moodle grades.

Pending new cycles appear in **Inicio/Mi espacio** and **Mi plan** with direct navigation to the selected reinforcement. Existing historical reinforcements retain their original behavior; schema migration does not invent attempts, hints or independence claims.

## Storage and authority

Portfolio rows can contain backend-generated `moodlePracticeSource` metadata. Public portfolio input cannot create that metadata. Preparation is authoritative, atomic and idempotent for a particular recovered source version/attempt; later Moodle updates do not rewrite the copy. Multiple local versions of the same Moodle attempt share an evidence identity when counting accepted observations, including supported rubric copies. Importing the work or grading guided responses creates no verified concept exercises.

Moodle evidence-day counting uses the recovered submission timestamp rather than the local import date. An unknown original date contributes no additional evidence day. This prevents staged imports of old work from appearing to demonstrate learning across new days. Portfolio creation time and the original submission date remain distinct.

Guidance is an optional append-only turn array on an intervention. All calls validate intervention/activity ownership, sequential activity order, current step, prior attempts, hint limits and completion. The renderer supplies an answer or requests a hint; it cannot supply step indices, correctness, timestamps, expected answers or hint counts. The public snapshot omits the raw guidance array, answer keys, bank identifiers and unrevealed activity hints. A dedicated view returns only the current prompt, revealed hints and the student's own attempts. Active mock exams block these endpoints.

History and backups use schema 18. Supported older backups migrate without manufactured records; version 0.20 cannot open an upgraded schema-18 workspace. Keep a pre-upgrade backup if a downgrade might be needed. Restore replays the turn history and checks source references/hashes, permitted activities, dates/order, exact final answers, durations, hint counts, dependent responses and the independent check date before replacing current data. Missing keys and portable password handling retain their existing protections.

Deleting a source portfolio entry removes dependent analyses, reinforcement responses/reflections and dependent report records, with a notice in the deletion dialog. Existing independent task snapshots remain detached and are preserved according to the portfolio-task contract. Deleting only the cached Moodle data does not remove the independent portfolio source.

All learning-cycle operations are local. They never invoke Moodle administration, submission or grading functions. The connector's existing read-function allowlist remains unchanged.

## Verification and limits

Domain tests cover exact steps, hint gating/counts, activity ordering, next-day checks including late practice, independent results, bank/open work, source authority and deduplication, immutable copies, encrypted restart, schema-17 migration, deletion and rollback after tampered backups. `scripts/smoke-guided-practice.mjs` exercises the complete student flow against a deterministic synthetic Moodle REST double, then disconnects it and continues offline. Its later-day check uses a simulated clock, not an actual elapsed school day. Screenshots cover wide and 960-pixel Windows layouts.

This increment does not validate general pedagogical effectiveness, arbitrary model feedback, handwriting, unrestricted algebra or every school subject. Open work remains explicitly ungraded; automatic step checking is limited to the supported arithmetic and exercise-bank contracts. No claim of complete learning mastery or externally supervised assessment is made.

The final [Windows 0.21 qualification](windows-0.21-verification.md) passed 222 domain tests and 25 packaged workflows. Live Aula checks additionally confirmed authoritative source text, feedback, original date and idempotent preparation after credential disconnection. The later-day practice check remains a simulated synthetic scenario.
