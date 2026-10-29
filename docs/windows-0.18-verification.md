# Windows 0.18 local qualification

Version 0.18 adds [independent comparison copies with structured reflections](moodle-comparison-reflections.md) to the student-first Windows executable. Both selected attempts, matching comments, source context and the student's three-part reflection can be saved to the personal portfolio. The backend reconstructs source content from the chosen local version rather than accepting source text from the renderer.

The feature remains local and read-only toward Moodle. Copies create no mastery evidence, change no tasks and assign no grades. Existing encrypted history and portable backups remain schema 16; no migration is needed. Attachment bytes are not duplicated into the portfolio.

## Development evidence

All 202 domain tests pass. Development Electron verification passed against real isolated Moodle 4.5 with synthetic assignment and quiz attempts. After removing credentials and stopping the Moodle web server, the workflow saved both comparison types, checked the required reflection fields and draft retention, suppressed a duplicate copy and left source records, tasks and practice evidence unchanged.

Portfolio copies survived removal of the local Moodle copy, encrypted backup restoration and restart. The 960-pixel detail had no horizontal overflow, and no renderer errors were recorded. Evidence: `test-results/moodle-reflection-verification.json` and matching screenshots. Domain tests reject fabricated sources, missing reflections, unavailable attempts and oversized copies before any partial entry is saved.

## Packaged qualification

All 202 domain tests and 22 packaged workflows passed. These include the new comparison/reflection flow against real isolated Moodle, previous Moodle import/history/permission checks, local Qwen tutoring, AI rubric and observation cases, and automated PDF text/rendering checks. Compiled modules, renderer assets and bundled OCR/semantic resources match the packaged archive. The NSIS payload passed its integrity check. Evidence: `test-results/release-0.18.0-verification.json` and `test-results/packaged-moodle-reflection-verification.json`.

The installer is `release/Tutor-Local-0.18.0-Instalador.exe`, 242,473,591 bytes, SHA-256 `f41f71bd284a8690002e9a42c4301f913556b7c6926b666b865d9c9ebad62e4c`.

The actual installer passed silent installation, shortcut creation, startup using a private synthetic profile, semantic search with the bundled model, and uninstallation preserving that profile. The installed archive matched the verified package. Evidence: `test-results/installer-0.18.0-verification.json`. A sanitized manifest, English release notes and SHA-256 sidecar accompany the installer in `release/distribution/`.

The packaged Aula check passed password login, separate course imports, 24 materials, 27 assignments, all original 26 works and evaluations, the supplemental attachment and its evaluation, restart and exact offline attachment export after disconnection. Evidence: `test-results/live-student-packaged-0.18.0-desktop-verification.json`. This is a read-only regression check; comparison/reflection fixtures remain local and synthetic.

## Limits

Comparison/reflection qualification uses synthetic local Moodle attempts, not newly submitted live Aula work. Automatic interpretations of strategy changes, correction of personal reflections and binary attachment comparison remain outside this increment. Source instructions describe the selected local version; they do not reconstruct assignment instructions at the date of an older attempt.

Code signing, an interactive installation on clean Windows, educational effectiveness with real students and manual inspection of every report PDF remain outside this local-host qualification. The development build includes uncommitted workspace changes and has not been published. The verified 0.17 distribution is preserved in `release/distribution-0.17.0/`.
