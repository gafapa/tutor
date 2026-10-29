# Windows 0.15 local qualification

Version 0.15 adds [historical Moodle assignment submissions](moodle-attempt-history.md) to the student-first Windows executable. The application connector remains read-only. It imports earlier attempts through an existing student-authorized REST response, separates Moodle attempts from local snapshots, retains their attachment originals, and can copy a chosen historical response and its matching comments into the portfolio.

Only the latest submission controls the linked plan task. Historical imports and copies create no verified practice or mastery evidence. Backup schema 15 preserves schema 14 data without inventing historical attempts. The 0.14 executable cannot open schema 15 history.

## Qualification status

The domain suite passes 188 tests. Development Electron verification passed against a real, isolated Moodle 4.5 installation with two graded synthetic attempts created before the first connection. It checked historical selection, matching feedback, offline original-file preview and byte-exact export after credential removal, portfolio reflection, encrypted backup/restore and restart. No renderer errors were recorded; the 960-pixel dialog had no horizontal overflow.

All 19 packaged workflows passed, including historical attempts against real isolated Moodle, local Qwen tutoring, AI rubric/observation cases, and report PDF text/rendering. The NSIS payload passed its integrity check. The packaged app also passed live Aula login, two-course import, the original 26 works/evaluations, the supplemental attachment and its evaluation, restart, and byte-exact offline export after disconnection. Evidence: `test-results/release-0.15.0-verification.json`, `test-results/packaged-moodle-history-verification.json` and `test-results/live-student-packaged-0.15.0-desktop-verification.json`. The historical-attempt dataset is local and synthetic; the existing Aula assignments were not reopened or modified by this increment.

The actual installer also passed silent installation, shortcut creation, launch with a private synthetic profile, use of the bundled semantic model, and uninstallation preserving that profile. Evidence: `test-results/installer-0.15.0-verification.json`.

## Artifact and limits

The new local installer is `release/Tutor-Local-0.15.0-Instalador.exe`. It is 242,469,594 bytes, with SHA-256 `094d68877707f68b5df442cc200a2ac1a951036b6576de575af7d51c61916d37`. A sanitized manifest, SHA-256 sidecar and English notes accompany it in `release/distribution/`. The build includes uncommitted workspace changes and has not been published.

This is a qualification on the current Windows host. Code signing, an interactive installation on clean Windows, educational effectiveness with real students, and manual inspection of every report PDF remain separate. Earlier 0.14 installer evidence is retained as historical evidence and must not be used to qualify the newer executable.
