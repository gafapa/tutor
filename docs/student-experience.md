# Shared student experience and curriculum support

The confirmed audience is students from the first year of ESO through the second year of Bachillerato. The user selected one shared interface adapted to the school year, rather than separate products. Tutor Local remains a Windows portable application; familiar phone-style interactions do not imply a mobile release.

## Daily interaction

The default navigation exposes follow-up, planning, Moodle, the tutor and practice. Other tools remain available through an expandable group. At narrow window widths, a bottom navigation and an explicit tools panel replace the sidebar. Subjects can be changed from the compact header. Controls use larger targets and visible focus; reduced-motion preferences are respected. History and detailed progress on Home are disclosed when needed instead of competing with the current Moodle work.

School year is optional, editable during onboarding or in preferences, and retained in educational backups. Early ESO guidance asks for shorter sentences, defined vocabulary, one instruction at a time and everyday examples. Bachillerato guidance asks for academic vocabulary, explicit justification, alternative approaches and appropriate exam depth. This is a prompting policy, not a validated pedagogical adaptation or an age-verification system. The interface does not require a date of birth.

## Review curriculum links and a study calendar

From curriculum, request a proposal using an explicit starting date. Unlinked Moodle tasks are compared with bounded candidates from the same subject. Proposals reference existing units, concepts and criteria and quote the original activity. Matching uses titles and at most 2,500 source characters; it can miss information elsewhere. Weak matches can be left unlinked. Each relationship can be removed and its unit edited before confirmation.

Undated units receive a sequential study-calendar proposal. Explicit duration in weeks needs a literal quote from the unit description; otherwise one week is a visible default estimate. Dates are calculated from the student's chosen start and remain estimates, without holidays or an inferred school calendar. They are editable or removable. Optionally, confirmation creates independent local study tasks that participate in the existing daily budget and review plan. Moodle deadlines are not changed.

Nothing is applied until explicit review confirmation. A private draft fingerprint and per-task/unit versions detect changed context. Commit validates subject ownership, active Moodle revisions, literal quotes, dates and identifiers before one transaction. A changed curriculum or activity requires a new proposal. Relationship confirmation never creates a grade, exercise attempt or mastery estimate.

## Practice from current work

Pending tasks and personal submitted work can open a three-part pack: recall, application and reasoning. The selected AI receives bounded original instructions, linked unit/criteria, personal work when it is not a group submission, published feedback, and accepted personal observations. Course-specific guidance applies. Each exercise includes an exact activity reference, progressive hints and self-review checkpoints. The model response is validated before display.

The student must write an attempt before asking for hints or revealing checkpoints. Optional AI feedback quotes the student's actual answer and is explicitly a proposal, not a teacher grade. Saving records the chosen answer, help count and reflection as an ungraded personal attempt. It cannot increase mastery automatically. Packs are temporary, expire after an hour and are invalidated by activity withdrawal/revision. Confirm/save before closing; unfinished packs are not an autosaved assessment session.

## Local inference and long PDFs

The CPU runtime remains available. A separately pinned Vulkan runtime probes compatible devices, prefers a detected dedicated NVIDIA/Radeon/Arc device, and uses automatic layer fitting. The user can force CPU. A failed GPU startup retries through CPU, with actual backend reported in model status. Vulkan runtime and Microsoft redistributable files are verified before packaging; drivers remain an OS dependency.

Real local checks on this host exercised automatic GPU selection, successful Qwen inference, forced invalid-device recovery to CPU, and Gemma 4 E4B image/structured-text inference through the GPU backend. These are synthetic correctness checks, not throughput or cross-hardware qualification.

Scanned programme PDFs support up to 300 pages, processed in five-page batches. All transcripts retain physical page order. The first ten prepared images are returned as previews to bound memory; compare later references with the original PDF. Transcripts are bounded at two million characters, with up to 600 extraction fragments. Cancellation, a changed source file or invalid output leaves curriculum unchanged. Ordinary individual capture still uses a maximum ten-page selection.

Programme references use the physical page supplied by the importer rather than a model's interpretation of printed footers. A quote may differ only in whitespace; the importer restores the exact source substring before validating and storing it. Changed words, punctuation or references outside the current fragment are rejected.

A programme already downloaded as Moodle material can be used for curricular extraction. Exact content-hash matches reuse that material and preserve its identity, version and Moodle provenance. A separate import event prevents duplicate curricular imports and survives backup/restore. Merely having the PDF in Materials is not treated as a completed curricular import.

## Qualification boundaries

`npm run test:student` checks the shared navigation, 600-pixel layout, reviewed relationships/calendar, gated hints, ungraded persistence, school-year selection and an actual twelve-page scanned PDF. Moodle REST and generative responses in that workflow are deterministic doubles; local image/PDF preparation is real. Domain tests cover atomicity, stale context, ownership, fabricated references, course prompting, backup persistence and withdrawn sources.

`npm run test:gpu` requires prepared Qwen weights and a compatible dedicated device. `npm run test:multimodal -- --model=gemma4-e4b --gpu` downloads and checks the larger model outside the learner ZIP. Existing official Codex and Claude CLI sessions completed real tutoring, JSON and selected-image requests with synthetic context. Tutor reuses these sessions without copying credentials; leaving account AI in Tutor does not log out the CLI. Representative handwriting/formula work, exhaustive programme coverage, another Windows account/computer and educational effectiveness still require direct evidence. Moodle test-fixture uploads are performed separately with the authorized MoodlIA CLI; the application remains read-only.
