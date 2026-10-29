# Windows 0.17 local qualification

Version 0.17 adds [offline Moodle attempt comparison](moodle-attempt-comparison.md) to the student-first Windows executable. It compares previously downloaded responses and matching comments, offers exact line changes and retains attachment references without comparing their bytes. Only finished quiz reviews available in the selected local version can be compared.

The feature makes no network requests or source mutations, adds no mastery evidence and does not interpret textual changes as learning improvement. Storage and backup schema remain 16; no migration is needed.

## Development evidence

All 200 domain tests pass. Development Electron verification passed against a real isolated Moodle 4.5 installation with two graded assignment attempts and two finished quiz attempts prepared before connection. With credentials removed and the web server stopped, it checked original responses and comments, attachment references, exact changes, quiz reviews, identical-selection handling and restart. Source items and versions, portfolio, practice evidence and plan tasks were unchanged.

The comparison displayed two columns in a wide window and stacked them at 960 pixels, without horizontal dialog overflow or renderer errors. Evidence: `test-results/moodle-comparison-verification.json` and matching screenshots. The comparison limits reject oversized documents without truncating their originals.

## Packaged qualification

All 200 domain tests and 21 packaged workflows passed, including the new offline comparison flow against real isolated Moodle, existing Moodle history and permission cases, local Qwen tutoring, AI rubric and observation cases, and automated PDF text/rendering checks. Compiled modules, renderer assets and bundled OCR/semantic resources match the packaged archive. The NSIS payload passed its integrity check. Evidence: `test-results/release-0.17.0-verification.json` and `test-results/packaged-moodle-comparison-verification.json`.

The installer is `release/Tutor-Local-0.17.0-Instalador.exe`, 242,466,010 bytes, SHA-256 `8f4b2a6a6f36e88c76bc4210dc3d270b257eb3a500fa59b8ca05e887a737b432`.

The actual installer passed silent installation, shortcut creation, startup with a private synthetic profile, semantic search using the bundled model, and uninstallation preserving that profile. Its installed archive matched the verified package. Evidence: `test-results/installer-0.17.0-verification.json`. A sanitized manifest, English release notes and SHA-256 sidecar accompany the installer in `release/distribution/`.

The packaged Aula check passed password login, separate course imports, 24 materials, 27 assignments, the original 26 works and evaluations, the supplemental attachment and its evaluation, restart and exact offline export after credential removal. Evidence: `test-results/live-student-packaged-0.17.0-desktop-verification.json`. No live submissions were modified.

## Limits

Comparison qualification uses local synthetic Moodle attempts. Aula's existing assignments remain intact; this increment does not create or modify live quiz attempts or submissions. Automatic explanations of strategy changes, comparisons across different activities and attachment-content differences remain outside this feature.

Code signing, an interactive installation on clean Windows, educational effectiveness with real students and manual inspection of every report PDF remain outside this local-host qualification. This development build includes uncommitted workspace changes and has not been published. The verified 0.16 distribution is preserved in `release/distribution-0.16.0/`.
