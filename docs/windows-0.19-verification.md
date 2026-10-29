# Windows 0.19 local qualification

Version 0.19 adds [personal practice tasks from portfolio work](portfolio-practice-tasks.md). The task retains its authoritative work/reflection snapshot, appears in the existing plan and supports manual completion without adding verified practice or mastery. Tasks remain entirely local. The [Moodle read-only boundary](moodle-read-only-boundary.md) explicitly rejects mutation functions and reserved request-parameter overrides before HTTP.

Storage and portable backups use schema 17, migrating supported older histories without creating portfolio sources or additional tasks. Version 0.18 cannot open a schema 17 profile. Source snapshots survive portfolio removal with a visible notice; the deletion dialog explains how to remove the retained copy by deleting the task.

## Development evidence

All 208 domain tests pass. Domain checks cover source integrity, subject ownership, pending-request deduplication, local completion, deletion, encrypted restart, old-backup migration, malformed backups and concept limits. The desktop workflow passed task creation with explicit title/date/duration, daily-plan inclusion, source viewing, portfolio removal, encrypted restore and restart, with no renderer errors or horizontal overflow at 960 pixels. Evidence: `test-results/portfolio-tasks-verification.json`.

The isolated Moodle comparison/reflection workflow also creates a personal task from copied Moodle work after disconnecting credentials and stopping the Moodle web server. No remote submissions, tasks or grades are created by that action. This fixture data is local and synthetic.

## Packaged qualification

All 208 domain tests and 23 packaged workflows passed. These include the new local portfolio-task UI, a personal task created from copied Moodle work while disconnected, existing Moodle history/permission cases, local Qwen tutoring, AI rubric/observation cases and automated PDF text/rendering checks. Compiled modules, renderer assets and bundled OCR/semantic resources match the packaged archive. The NSIS payload passed its integrity check. Evidence: `test-results/release-0.19.0-verification.json`, `test-results/packaged-portfolio-tasks-verification.json` and `test-results/packaged-moodle-reflection-verification.json`.

The installer is `release/Tutor-Local-0.19.0-Instalador.exe`, 242,463,235 bytes, SHA-256 `5e752a0c29680b6074f5fec68eac8be646f1c63d3ae3f6879ec05ae382778083`.

The actual installer passed silent installation, shortcut creation, startup using a private synthetic profile, semantic search using the bundled model, and uninstallation preserving the profile. Its installed archive matched the verified package. Evidence: `test-results/installer-0.19.0-verification.json`. The installer, sanitized manifest, English release notes and SHA-256 sidecar are available in `release/distribution/`.

The packaged Aula read regression passed password login, two separate course imports, 24 materials, 27 assignments, all original 26 works and evaluations, the supplemental attachment/evaluation, restart and exact offline export after disconnection. Evidence: `test-results/live-student-packaged-0.19.0-desktop-verification.json`. No Moodle content-write operation is part of this workflow.

## Limits

Personal completion is not evidence that the student has mastered the topic. Automatic task generation, semantic extraction of a next step and validation of the student's reflection are outside this increment. Source attachments remain references if they were references in the portfolio work.

Code signing, an interactive installation on clean Windows, educational effectiveness with real students and manual inspection of every report PDF remain outside this local-host qualification. The build includes uncommitted workspace changes and has not been published. The verified 0.18 distribution is preserved in `release/distribution-0.18.0/`.
