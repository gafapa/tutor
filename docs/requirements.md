# Requirements and implementation evidence

This matrix describes the student-first Windows x64 portable application at version 0.23.0 alpha, educational schema 18. The [product scope](product-scope.md) supersedes historical requirements. All 80 original identifiers remain stable; excluded features do not count as completed work.

**Implemented** means inspected implementation/checks cover the supported behavior. **Partial** means capability or qualification is incomplete. **Pending** means sufficient implementation is absent. **Out of scope** means excluded. Implemented rules may still need educational validation; tests do not establish learning effectiveness.

The [Moodle-first alpha contract](moodle-first-alpha.md) supersedes older encryption/local-only AI notes. Current storage is readable SQLite, credentials are protected separately, onboarding starts with Moodle, and programme PDFs produce reviewed source-linked proposals.

## Current matrix

| ID | Requirement | Status, evidence and remaining limits |
|---|---|---|
| 1 | Independent subject workspace/configuration. | Implemented: separate course/level, editable context, curriculum and history; configuration/isolation tests. Teacher names are context only. |
| 2 | Multiple material formats. | Partial: textual/scanned PDF with reviewed multimodal reading, DOCX, PPTX, TXT/MD, saved HTML, SRT/VTT and Moodle. Graphics, automatic transcription, other presentations and general URL import remain pending; imports/vision/materials checks. |
| 3 | Read the student's Moodle tasks, materials, feedback and grades. | Partial: full assignment text, sections, Text and media areas, offline originals, assignment history and permitted quiz reviews. Broader sites/permissions remain unqualified. See [content](moodle-content-development.md), [attempts](moodle-attempt-history.md) and [quizzes](moodle-quiz-history.md). |
| 4 | Manual/periodic synchronization with history. | Partial: immutable versions, failure retention, withdrawals, task overrides and multi-course setup. Broader outage/permission scenarios remain pending. See [course setup](moodle-course-setup.md). |
| 5 | Curriculum competencies, criteria, content and vocational outcomes. | Implemented: four types linked to units/tasks; education checks. |
| 6 | Sequence, timing, prerequisites and teaching state. | Implemented: ordered units with dates, concepts and validated prerequisites; education checks. |
| 7 | Adaptive diagnosis, open questions, self-assessment and gaps. | Partial: bank, prerequisite adaptation and self-perception; broader open diagnosis remains pending. |
| 8 | Strengths, difficulties, confidence and block evidence. | Partial: estimates/diagnostic summaries; broader blocks remain pending. |
| 9 | Exercise prompt, response, result, feedback, date and duration. | Implemented for supported exercises; core/desktop checks. |
| 10 | Content, competency, difficulty and prerequisite classification. | Partial: bank classification frozen at submission; arbitrary work/materials remain pending. |
| 11 | Evidence-based error hypotheses. | Partial: exact equalities, five observation types and quoted proposals; broader procedural/repeated-error detection and subject validation remain pending. |
| 12 | Historical knowledge, improvement, errors and consolidation. | Partial: attempts, events, snapshots and dated estimates; open-work/rubric evolution remains pending. |
| 13 | Mastery independent of imported grades. | Implemented with initial transparent rules; learning tests. |
| 14 | Evidence-based confidence. | Partial: quantity/consistency rules; pedagogical calibration remains pending. |
| 15 | Concept graph and prerequisite gaps. | Partial: graph, cycle-safe cross-subject prerequisites and foundation checks; broader diagnosis/planning remains pending. |
| 16 | Contextual tutor. | Partial: bounded materials, estimates, accepted observations and strategies; subject-level quality evaluation remains pending. |
| 17 | Progressive hints and verified steps. | Partial: guided attempts before hints, deterministic arithmetic and help history. Arbitrary reasoning/conversational verification remains pending. See [guided cycle](guided-learning-cycle.md). |
| 18 | Simple reformulation, visuals, examples and analogies. | Partial: explanation mode; specific controls remain pending. |
| 19 | Practice adapted to difficulty/errors. | Partial: bank, numerical variants and source-linked recall/application/reasoning packs adapted to personal work, feedback and course; broader subject diversity/adaptation remains pending. |
| 20 | Reinforcement and later independent check. | Partial: confirmed difficulties, persistent sequential practice, later-day no-hint checks, reminders/retries. General open-work correction and educational validation remain pending. |
| 21 | Open problems, real applications and deeper content. | Partial: projects support comparison/application/reflection; systematic adaptation/content selection remains pending. |
| 22 | Daily study, review and task planning. | Implemented for local data, shared activities, ordering and budgets; planning/connections checks. |
| 23 | Persistent 10/20/30-minute sessions. | Implemented: goals, pause/resume, sources and final review; study checks. |
| 24 | Spaced review of earlier content. | Partial: concept/evidence scheduling; more evidence types remain pending. |
| 25 | Flashcards from materials/errors. | Implemented with initial rules: sources, versions, approval and review; education checks. |
| 26 | Personal mock exams resembling real assessments. | Partial: bank selection, units, difficulty and delayed correction; real formats/open questions remain pending. |
| 27 | Explain recommendations with original exercises. | Implemented in planning, review, estimates and direct transfer; planning/connections checks. |
| 28 | Cross-subject reading, graphs, problems, writing, arithmetic and logic profile. | Partial: accepted quotes, dates, independent works and contradictions; per-skill validation remains pending. |
| 29 | Connections between subjects/concepts. | Implemented: explicit equivalence/prerequisite/topic confirmation, reasons and withdrawal. Name matches remain hypotheses; connections checks. |
| 30 | Difficulties supported by independent sources. | Partial: three works, two subjects/two days, deduplication and contradictions; pedagogical validation remains pending. |
| 31 | Evidence-based transfer between subjects. | Implemented for accepted direct connections and supported bank evidence: destination practice without copying mastery; connections checks. |
| 32 | Interactive interdisciplinary evidence graph. | Implemented: subjects, concepts, competencies, prerequisites and work sources; filters, zoom, keyboard and pagination; connections checks. |
| 33 | Shared projects/evidence across subjects. | Implemented: editable versions, curriculum, snapshots, reflections and completion review; planning/restart/restore checks. |
| 34 | Portfolio of successful work, projects, reflections and progress. | Partial: independent successes and text selections/reflections; general attachments and broader evolution remain pending. Moodle attachment retrieval is separate. |
| 35 | Student overview of strengths, changes, next steps and goals. | Implemented: sourced 30-day changes, goals, alerts and dated evolution; goals checks. |
| 36 | Teacher dashboard/reports. | Out of scope: personal reports and optional manual family sharing only. |
| 37 | Teacher class/group analytics. | Out of scope: no teacher workspace or class supervision. |
| 38 | Regression, inactivity and persistent-difficulty alerts. | Implemented with initial sourced rules/reflections; not diagnoses. Educational validation remains pending; goals checks. |
| 39 | Strategy, help, reinforcement and later outcome. | Implemented: sources, responses, help, duration, later-day check and reflection; pedagogy/guided checks. |
| 40 | Structured educational memory beyond chat. | Partial: persistent entities and work/reflection search; common contracts/complete intervention queries remain pending. |
| 41 | Relevant retrieval within bounded subject context. | Partial: hybrid retrieval, bundled E5 INT8 and citations; real-material/student evaluation remains pending. |
| 42 | Retrieve materials with personal evidence. | Partial: bounded materials, attempts, observations/strategies; broader coverage/relevance validation remains pending. |
| 43 | Bound dynamic context. | Implemented with checked limits; prompt tests. |
| 44 | Local engine configuration and portable data. | Partial: local engine/format; six pinned models, automatic Vulkan/CPU selection and CPU fallback. Optional Claude/Codex account integrations now exist; real signed-in inference remains to be qualified. |
| 45 | Local classification, anonymization, embeddings and analysis. | Partial: inference, embeddings and quoted proposals; anonymization/broad validation remain pending. |
| 46 | Minimize, encrypt, delete and export data. | Partial: readable local history, protected credentials, optional encrypted backups, deletion and export; expanded identity separation remains pending. |
| 47 | Local use without a product account. | Implemented: empty-profile startup; Moodle authentication only for connection. |
| 48 | Mobile, hosted web or PWA. | Out of scope: portable Windows x64 only. |
| 49 | Full JSON/CSV/PDF and portfolio export. | Partial: full JSON/encrypted backups and selected report formats; full-history CSV/PDF and portfolio export remain pending. |
| 50 | Import earlier results/history. | Partial: own backups, available Moodle attempts and permitted quizzes; general CSV/history import and unavailable remote history remain pending. |
| 51 | Student control and optional family sharing. | Implemented: local workspace/manual selected reports; no remote accounts or automatic delivery. |
| 52 | Personal tutor help/feedback configuration. | Partial: conversational modes; finer controls remain pending. Teacher policies are excluded. |
| 53 | Practice encouraging independent attempts. | Partial: gated hints and separate no-hint checks; general conversational/open-task scaffolding remains pending. |
| 54 | Study mode with explanations/similar examples. | Partial: conversational modes; finer study/practice distinctions remain pending. |
| 55 | Personal mock exams with in-app restrictions. | Implemented for the bank: IPC restrictions, hidden resources/answers and limited navigation; not institutional supervision. |
| 56 | Encourage attempts before solutions. | Partial: guided hint gating/help counts; conversational solution-request detection remains pending. |
| 57 | Compare self-perception with evidence. | Implemented in diagnosis; planning desktop checks. |
| 58 | Structured metacognitive questions/reflections. | Partial: sessions, diagnosis, rubrics/interventions; cross-subject error-specific questions remain pending. |
| 59 | Improvement, assessment, recovery and depth goals. | Implemented: four types, criteria, dates, schedules, reflections, work and versions; goals checks. |
| 60 | Motivation through goals, streaks and progress. | Implemented: unique days/sources without points/competition. Activity is separate from mastery; goals checks. |
| 61 | Semantic history/evolution queries. | Partial: hybrid search, explicit filters, pagination/originals; temporal-query interpretation and relevance evaluation remain pending. |
| 62 | Compare earlier/current work. | Partial: report/Moodle comparison, comments, quiz points, line changes and reflections. Automatic strategy explanations/general comparison remain pending. See [comparison](moodle-attempt-comparison.md). |
| 63 | Examples adapted to interests, level and errors. | Partial: level/attempt context; interests/controls remain pending. |
| 64 | Galician, Spanish and English interface, including CLIL. | Pending: Spanish interface; model/retrieval languages are separate. |
| 65 | Simplified text, voice, dictation, contrast and size. | Partial: contrast/text size; other supports remain pending. |
| 66 | Photo, handwriting, audio, PDF and screenshot input. | Partial: reviewed image/PDF multimodal reading with selection/rotation/zoom; audio/handwriting qualification remains pending. |
| 67 | Interpret handwriting and locate errors. | Partial: reviewed multimodal reading/transcription and numerical analysis; handwriting/complex formulas remain unqualified. Printed fixtures do not establish handwriting accuracy. |
| 68 | Step feedback and first problematic calculation. | Partial: supported equalities/guided arithmetic; units, algebra and general reasoning require review. |
| 69 | Review work against rubrics. | Partial: versioned descriptors, original work, quotes and local proposals; long-work analysis, external formats and reliable specific AI feedback remain pending. |
| 70 | Link estimates to verifiable exercises. | Implemented for the bank; evidence/isolation checks. |
| 71 | Open educational API. | Pending: private IPC only. Other platform connectors remain excluded. |
| 72 | Common learner/subject/activity/evidence model. | Partial: interventions, activities and reports; broader identity separation/public contracts remain pending. |
| 73 | Moodle interoperability. | Partial: read-only connector; broader content/permissions remain unqualified. Other connectors/general plugins are excluded. |
| 74 | Persistent activity, failure, mastery and reinforcement events. | Implemented with evidence; mastery/recovery checks. |
| 75 | Immutable evidence/earlier states. | Partial: attempts, versions, reviews and before/after estimates; additional states remain pending. |
| 76 | Link work to material versions used. | Partial: citations, session/rubric sources and frozen mock questions; broader linkage remains pending. |
| 77 | Personal weekly summary. | Implemented: closed-week generation, evidence, recommendations, versions and manual export; reports checks. |
| 78 | Personal unit report. | Implemented: period, estimates, curriculum snapshot, evidence/reflection/manual export; not teacher grades; reports checks. |
| 79 | Student-selected transition report. | Implemented: destination, concepts/strategies, exercises, versions/export; excludes chats/materials/other subjects; reports checks. |
| 80 | Withdraw contradicted outdated inferences. | Implemented: explicit review, reason, optional later result and preserved history; withdrawn observations leave context and contradictions reduce confidence. |

## Verification and priorities

The [0.23 local qualification](windows-0.23-verification.md) records the current build and checks. Live Moodle source preparation was read-only; the complete guided cycle uses synthetic data and a simulated later date. The build is unsigned. Another Windows account/computer, clean consumer Windows and educational efficacy remain unqualified. Hosted CI must be checked for the exact commit.

Priorities are broader subject practice/feedback quality, additional Moodle scenarios, complete local exports, accessible input and real handwriting/formula evaluation. One correct later check does not establish consolidation. Teacher features, other platforms and hosted application distribution are excluded rather than backlog items.

Each increment needs usable interaction, durable migration/data handling and appropriate verification. Historical totals cannot serve as a completion score. See [verification history](verification-history.md) and the [documentation index](README.md).
