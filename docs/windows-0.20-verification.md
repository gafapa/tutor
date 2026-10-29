# Windows 0.20 portable verification

Tutor Local 0.20.0 is qualified locally as a Windows x64 portable ZIP. The default `npm run dist` command produces this distribution; the previous 0.19 installer remains archived with its checksum and receipt.

- Artifact: `Tutor-Local-0.20.0-Portable.zip`, 347,241,187 bytes.
- SHA-256: `11e68ca874704e9f9cdcc148e121db11b21f43156c326e0e140fd1017fc4d055`.
- TypeScript/Vite build passed; 213 domain tests and 24 packaged workflows passed.
- The 76 compiled JS/JSON modules, three renderer files and three unlock assets matched the packaged archive. OCR, semantic models, Windows x64 native resources and VC runtime assets passed verification. Report PDF text and rendering passed.
- The actual ZIP passed integrity testing, was extracted without learner data and executed. Password confirmation, incorrect-password rejection without key/history changes, cancellation and reopening all passed.
- Program-managed data paths remained beside the executable. A development profile override was ignored in portable mode; no Windows-protected vault key was created.
- The complete folder moved to a path containing spaces and Unicode and reopened with its original encrypted history. The bundled semantic model ran before and after the move. A second move retained recognition of the downloaded Qwen model.
- Domain tests independently relocated encrypted history and Moodle credentials using only the portable password. Missing keys, damaged envelopes, incorrect passwords and installed-profile key conflicts were rejected without replacement.
- Existing packaged workflows passed, including real isolated Moodle assignment/quiz histories, permission restrictions, offline originals, comparison reflections, portfolio practice, local Qwen tutoring, AI rubrics and learning observations. Moodle content writes remain forbidden in the app. No new live Aula content mutations were performed.
- Setup and unlock screenshots were inspected at the shipped desktop window size; no layout defects were found.

The first final portable smoke hit a transient Windows `EPERM` when moving the folder immediately after closing a password window. A bounded handle-release retry fixed the test. The focused smoke and final verifier both subsequently passed. Completed domain, functional and PDF checks from the unchanged packaged build were reused through the verifier's explicit resume path after source/archive and resource equality were rechecked; the ZIP test ran again.

Receipts: `test-results/release-0.20.0-verification.json`, `test-results/portable-0.20.0-verification.json`, `test-results/portable-release.log` and `test-results/portable-release-resume.log`. The distributable includes a sanitized manifest and checksum, without private profile paths or student content.

Testing used the current Windows host. Another Windows account/computer, a clean consumer Windows installation and hosted CI were not exercised. This unsigned, unpublished build contains uncommitted changes based on `18fada972eb8ac41a87e78f206664c6a4bed9352`; that commit alone does not describe the complete artifact. No commit, push or publication was performed. Educational backup schema remains 17. See [portable operation, migration and updates](windows-portable.md).
