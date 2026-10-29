# Windows 0.14 local qualification

This is an unpublished Windows x64 development build from the current workspace, including uncommitted changes. The base Git commit alone does not reproduce this build. No GitHub release, deployment or automatic update is part of this work.

## Changes

- Keep each selected Moodle course in an independent local subject, including multi-course setup before a subject exists.
- Preserve full assignment instructions, section notes, submission text and feedback.
- Copy a chosen submission revision into the personal portfolio with an optional reflection.
- Download submission originals into encrypted storage, retain distinct byte versions, and preview or save them without Moodle credentials.
- Keep student attachments separate from course reference materials.
- Reject portable backups with altered originals and roll back writes that exceed portable-history capacity.
- Preserve the Moodle batch progress view when the first new subject becomes available during a slow download.

## Evidence

The packaged executable authenticated against `https://aula.gallego.top` as the authorized synthetic test student, connected independent Mathematics and Networks courses, imported 24 course materials and 27 assignments, and read all original 26 submitted works with their matching grades and feedback. The supplemental attachment assignment contains one TXT original and a synthetic evaluation.

The downloaded original matched the checked-in fixture SHA-256. After restart and removal of both Moodle credentials, the app previewed it locally and saved byte-identical content through a native save dialog. No renderer errors were recorded. Evidence: `test-results/live-student-packaged-desktop-verification.json` and `test-results/live-student-packaged-attachment-offline.png`. The provisioning receipt is `test-results/live-moodle-attachments.json`; the app connector itself remains read-only.

The domain suite passes 184 tests and all 18 packaged workflows passed. The isolated real Moodle fixture, local Qwen inference, report PDF text/rendering, and NSIS payload integrity checks passed. The actual installer installed silently into an isolated test directory, created both shortcuts, launched with its own synthetic profile, ran the bundled semantic model, and uninstalled while preserving that profile. The 70 compiled modules and three renderer assets match the packaged app. Evidence: `test-results/release-0.14.0-verification.json` and `test-results/installer-0.14.0-verification.json`. The first release-suite attempt reached the Moodle UI check before its local fixture had finished installing; after fixture preparation, the complete suite was rerun successfully.

## Artifact and limits

The local installer is `release/Tutor-Local-0.14.0-Instalador.exe`. The verified installer is 241,879,476 bytes, with SHA-256 `0214d03e4c13ba87632fa7fb9d42098d58f053f6833cdd9638ef91f0f62cfc5b`. The installer, `.sha256`, English release notes and a sanitized qualification manifest are available together in `release/distribution-0.14.0/`. The manifest explicitly identifies this as a build containing uncommitted workspace changes. The optional Qwen language model is downloaded explicitly by the student; it is not embedded in the installer. Local OCR and semantic resources and the AI runtime are bundled.

This build is unsigned. Installation on a clean Windows machine, the interactive installer wizard, educational effectiveness with real students, and manual visual review of every generated report remain separate qualifications. The automated tests use synthetic educational data.

## Build preparation fixes

Windows PowerShell signature verification now starts without inheriting PowerShell 7 module search paths, preserving the Microsoft signature check. Isolated Moodle preparation supplies its own OpenSSL configuration. Its pinned PHP archive moved to the [official PHP archive directory](https://downloads.php.net/~windows/releases/archives/); the expected SHA-256 remains unchanged. These are build/test preparation fixes, not additional dependencies in the student's executable. The current dependency audit reports zero vulnerabilities.
