# Reflecting on Moodle submissions

Effective 2026-10-29, a student can save the online text of an imported Moodle submission to the local portfolio from its detail view. They can add a personal reflection before selecting **Guardar entrega en mi portfolio**. The application opens the portfolio after saving.

The copy contains the selected local revision's assignment instructions, submission text and feedback, along with the course, source URL, import date and submission state. Attachment names and sizes remain references; attachment bytes are not included. The copied entry is independent of subsequent Moodle updates and remains available after that connection's imported data is removed.

The main process resolves the item, connection and immutable revision itself. The renderer cannot supply a different subject or overwrite the source text. Missing revisions and versions without online text are rejected. The complete content must fit the portfolio's 50,000-character limit; an oversized work is rejected without truncation or a partial entry. Copies and personal reflections use the existing encrypted storage and backup schema 15.

Repeatedly saving the same source revision with the same reflection returns the existing personal entry. A different reflection or a later revision can create another selection. The entry has no verified exercise references and creates no attempts, concept mastery or automatic assessment. The semantic index is invalidated when a copy is created so that search can include the new work.

## Development validation

The local domain suite passes 188 tests. New cases cover independent copies of historical revisions, reflection and feedback preservation, repeated saves, source removal, backup/restore, invalid revisions and oversized work rejection. The development-desktop smoke also exercises the copy-and-reflect workflow with a synthetic REST fixture. These are implementation checks; they do not validate the pedagogical quality of feedback or qualify a newly packaged installer.

## Live assessment data

The authorized `alumno` test account (id 4) has 26 submitted online-text assignments across courses 9 and 10 on `https://aula.gallego.top`. All 26 have a saved grade and feedback visible to that student. Scores range from 4.5 to 10 out of 10. The answers and evaluations are explicitly synthetic test data, including deliberate mistakes explained in the feedback.

The reviewable source is `tests/fixtures/moodle-live/submissions.json`. Each evaluation includes accuracy (4 points), reasoning (3), checking and limitations (2), and clarity and units (1). The live receipt `test-results/live-moodle-assessments.json` records submitted-content hashes, saved grades and student-visible feedback checks. Account creation and password changes were not performed. Student credentials are absent from these artifacts.

Live development-Electron verification also passed using password login as `alumno`: the interface connected both courses, read the 26 submitted responses and their matching grades and feedback, imported 24 materials, saved one submission with its personal reflection to the portfolio and retained encrypted access after restart. No renderer errors were recorded. Evidence: `test-results/live-student-desktop-verification.json` and `test-results/live-student-portfolio.png`. This run performed no additional remote submissions or grading and does not qualify a packaged installer.

## Offline submission originals

Submission attachments now download through the existing read-only Moodle connector. They are separate resource records with `source: submission`; they never become course materials or reference documents for the tutor. The activity detail links to each attachment. Students can choose a historical revision, extract its text locally or save the exact original through a native save dialog. Unsupported text extraction does not prevent saving the original. No file is executed or automatically opened.

Original bytes are stored only inside the encrypted history and its portable backups. Routine renderer snapshots contain filenames, sizes and SHA-256 hashes, without base64 payloads. The main process resolves the selected item and hash, verifies the bytes, and checks the record again after asynchronous extraction or save-dialog selection. Credentials are unnecessary for cached previews and exports.

Each distinct byte version is retained once per attachment. Failed downloads preserve earlier copies; a failed submission lookup does not withdraw attachments. The version selector exposes older downloaded content explicitly when the latest revision has no downloaded bytes. Synchronization limits are 20 MiB per file and 100 MiB per run, with at most 1,000 distinct cached versions per attachment. The existing 75 MiB portable-history capacity check rolls back an update that would exceed the supported backup size.

Downloads send the token in the POST body, accept only the configured Moodle origin and site path, and refuse redirects. Backup import validates canonical base64, byte length, SHA-256, and membership in the attachment version history before replacing saved data. Schema 14 migrates existing schema 13 histories without inventing attachments; older application builds cannot open the newer history.

Validation includes synthetic HTTP file downloads, changed bytes, failed requests, refused redirects, encrypted restart, portable restore, tampered backups, renderer payload exclusion and isolation from course materials. The development Electron flow checks offline text preview and byte-exact save. Live packaged verification also passed against Aula using an additional synthetic assignment in Mathematics: its TXT original matched the fixture SHA-256 and exported bytes, remained readable after disconnecting both courses, and did not become a course material. The original 26 graded online-text assignments remain intact. Evidence: `test-results/live-student-packaged-desktop-verification.json`. This qualifies the packaged app on the current Windows host; clean-Windows installation and educational effectiveness are separate checks.

## Historical attempts

The subsequent 0.15 increment also lets the student select a previous Moodle assignment attempt, read its matching comments and originals, and copy that specific response into the portfolio. See [attempt history](moodle-attempt-history.md) and [Windows 0.15 qualification](windows-0.15-verification.md). Earlier live and release receipts above retain their original scope.
