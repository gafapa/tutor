# Windows 0.22 Moodle-first alpha verification

This record covers the new [Moodle-first orientation](moodle-first-alpha.md), password-free educational storage, programme extraction and optional multimodal/account AI. It supersedes earlier storage and AI assumptions; historical artifacts retain their original qualification.

## Artifact

- Windows x64 portable ZIP: `Tutor-Local-0.22.0-Portable.zip`, 324,292,038 bytes.
- SHA-256: `432dddf28c40e1f0319d8fa9b928fd2045ac821fa38ea5720d3a4bbc96b4b9aa`.
- Extract the complete folder and open `Tutor Local.exe`. No installation or workspace password is required.
- Educational history uses readable SQLite. Moodle credentials remain separately protected for the Windows user/computer. Older encrypted profiles remain untouched and are not migrated.

## Checks

TypeScript/Vite build, all 231 domain tests and all 26 packaged workflows passed. The actual ZIP was extracted and executed without a password, its private folder was moved to a path with spaces/Unicode, readable history reopened and the bundled semantic model ran before and after relocation. Report PDF text and rendering passed. Dependency audit reported zero vulnerabilities. Documentation links and whitespace checks passed.

The Moodle-first desktop workflow connected two independent synthetic courses through the interface, exercised six model choices and the external-consent gate, read a real local programme PDF with a deterministic extraction response, edited/confirmed the proposal and reopened the workspace. No exercise attempts or mastery were invented.

Multimodal capture checks used real isolated image/PDF preparation and a deterministic AI response: PNG/JPEG/WebP, page ranges, rotation, blank pages, metadata removal, mandatory human review, immutable transcripts/reviews, ungraded work, cancellation and deleted-subject handling. A scanned programme returned all three rendered source pages and a warning distinguishing AI-transcript quotes from selectable PDF text; no curriculum was saved before confirmation. All 83 compiled modules and 3 renderer assets matched the packaged archive. The packaged archive contains neither Tesseract nor trained OCR assets.

A separate actual llama.cpp CPU run loaded the pinned Gemma 4 E2B weights and its visual projector. It transcribed a synthetic printed image containing `2 + 2 = 5` without correcting it. A native structured-text request extracted a unit title as schema-conforming JSON. The optional reproducer is `npm run test:multimodal`; it downloads models outside the deliverable. Gemma E4B inference and handwriting accuracy remain unverified.

Native Codex CLI 0.165.0 initialized App Server in a fresh application-specific home and returned a signed-out account. Native Claude Code 2.1.312 returned its signed-out JSON status in an isolated configuration directory. Protocol tests use deterministic child processes, including explicit selected-image attachment and temporary-file cleanup. No existing personal credentials were copied and no real signed-in account inference was performed.

## Evidence and limits

Local evidence includes `test-results/orientation-release.log`, `release-0.22.0-verification.json`, `portable-0.22.0-verification.json`, `orientation-verification.json`, `packaged-ocr-verification.json`, `multimodal-native-verification.json` and `multimodal-schema.log`. The final receipt matches the exact artifact hash above; earlier candidate receipts do not qualify a different ZIP.

This is an unsigned local Windows qualification. A clean second computer/account, signed-in Claude/Codex inference, arbitrary school-programme coverage, handwriting/complex-formula accuracy, educational effectiveness and hosted CI are not established by these checks. No production Moodle writes, tag or binary publication are part of this qualification. The prior 0.21 distribution and its existing local download paths are preserved.
