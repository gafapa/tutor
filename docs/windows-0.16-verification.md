# Windows 0.16 local qualification

Version 0.16 adds [Moodle quiz attempt history and permitted reviews](moodle-quiz-history.md) to the student-first Windows executable. The connector remains read-only. It recovers only the connected student's attempt metadata and requests reviews only for finished attempts. Raw points are retained only when Moodle exposes attempt marks. Local portfolio copies add no verified practice or mastery evidence.

Backup schema 16 preserves older supported history without inventing quiz attempts. The 0.15 executable cannot open schema 16 history. Preserve the previous backup if a downgrade is needed.

## Development evidence

Development Electron verification passed against a real isolated Moodle 4.5 installation. Two finished synthetic attempts were created before connection. The workflow recovered typed responses, selected the older review, copied a reflection to the portfolio, respected hidden marks, cleared the latest review on permission denial, and imported a third active attempt as metadata only. The newest active attempt left the linked plan task pending.

Previously permitted local versions remained available after disconnection. Encrypted backup/restore and restart preserved reviews and independent portfolio content. No renderer errors or horizontal overflow at 960 pixels were recorded. Evidence: `test-results/moodle-quiz-verification.json`.

Quiz data in these checks is synthetic and local. The increment does not create or modify Aula quizzes or historical assignment submissions. Plain-text review extraction does not reproduce interactive questions, image-only content or question attachments.

## Packaged qualification

All 196 domain tests and 20 packaged workflows passed. These include real isolated Moodle quiz permissions, local Qwen tutoring, AI rubric and observation cases, and automated report PDF text/rendering checks. The compiled modules, renderer assets, OCR and semantic models match the packaged archive. The NSIS payload passed its integrity check. Evidence: `test-results/release-0.16.0-verification.json` and `test-results/packaged-moodle-quiz-verification.json`.

The installer is `release/Tutor-Local-0.16.0-Instalador.exe`, 242,464,022 bytes, SHA-256 `6f8c19f976ce975fe2fa60d26b0b82e672ca9c898954ea9193fd884e3a60a903`.

The actual installer passed silent installation, shortcut creation, launch using a private synthetic profile, semantic search with the bundled model, and uninstallation retaining that profile. The installed archive matched the qualified package. Evidence: `test-results/installer-0.16.0-verification.json`. The sanitized distribution manifest, English release notes and SHA-256 sidecar accompany the installer in `release/distribution/`.

The packaged Aula read check passed password login, separate course imports, 24 materials, 27 assignments, the original 26 works and evaluations, the supplemental attachment and its evaluation, restart, and exact offline attachment export after credential removal. Evidence: `test-results/live-student-packaged-0.16.0-desktop-verification.json`. Quiz permission behavior was tested against local Moodle rather than Aula.

## Limits

This qualification applies to the current Windows host. Code signing, an interactive installation on clean Windows, educational effectiveness with real students and manual inspection of every report PDF remain outside it. The build includes uncommitted workspace changes and has not been published. Previous 0.15 distribution evidence is archived in `release/distribution-0.15.0/`; it does not qualify the new executable.
