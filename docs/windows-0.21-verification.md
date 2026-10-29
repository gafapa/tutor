# Windows 0.21 guided learning cycle verification

Tutor Local 0.21.0 is locally qualified as a Windows x64 portable ZIP with the new [guided learning cycle](guided-learning-cycle.md).

- Artifact: `Tutor-Local-0.21.0-Portable.zip`, 347,247,869 bytes.
- SHA-256: `7a0f0dbeb06d2e18b1ae28b27946e6c3eded44543825eaa97dad4c9401b6e9ae`.
- TypeScript/Vite build, 222 domain tests and 25 packaged workflows passed for the final reviewed build.
- All 78 compiled JS/JSON modules, three renderer assets and three portable-unlock assets matched the packaged archive. Native Windows x64, VC runtime, OCR and semantic assets were verified. Report PDF text and rendering passed.
- The new packaged workflow used a deterministic Moodle REST double to prepare a personal submission and published feedback, confirm an observation, practice exact arithmetic in sequential steps, request a hint only after attempting, close/reopen offline and preserve progress, then complete a simulated later-day check without hints. Home/plan reminders, direct navigation, reflection, encrypted backup and restart passed without invented exercise attempts or mastery changes.
- Domain checks additionally cover fractions, precedence and signs, copied-expression rejection, unrepresentable-result refusal, hint limits/counts, step/activity ownership and order, wrong independent checks, late practice rescheduling, bank questions, explicitly ungraded open work, same-source deduplication, original Moodle evidence dates, tampered backups, schema-17 migration and dependent-source deletion.
- The actual ZIP was extracted and executed with its password gate. Wrong passwords preserved history/key bytes, portable paths remained beside the executable, and a moved folder reopened. The bundled semantic model ran before and after moving; the downloaded Qwen model was detected after another move.
- The existing packaged Moodle, personal learning, local Qwen tutoring, AI rubric and AI observation workflows passed. New student-facing screens were inspected at wide and 960-pixel Windows widths; their original screenshots and final packaged confirmation screenshots are retained.

## Live Moodle read-only verification

The authorized `alumno` test account on Aula was checked using the final packaged executable. Two independent courses, 24 materials, 27 assignments, the original 26 synthetic submitted/evaluated works and the supplemental attachment/evaluation remained readable. Original attachment export after disconnection and restart with encrypted access passed.

The new source-preparation endpoint was also exercised against a live submitted work with published feedback. Its own text, original feedback and submission timestamp were retained exactly; duplicate preparation reused the same copy. Preparation was performed after disconnecting the Moodle credentials, proving that it used the cached authorized data. It created no exercise attempt or mastery change and left cached Moodle records unchanged. No live submissions, grading or course content mutations were performed.

The complete guided-practice/later-day exercise is a synthetic scenario with a simulated date. The live check qualifies real source retrieval/preparation, not learning efficacy or an actual elapsed school day.

## Evidence and limits

Receipts include `test-results/release-0.21.0-verification.json`, `portable-0.21.0-verification.json`, `packaged-guided-practice-verification.json`, `live-student-packaged-0.21.0-desktop-verification.json` and `guided-release-reviewed.log`.

The distribution includes its checksum and sanitized verification manifest. Version 0.20 remains archived and its download link is preserved. Educational history/backup schema is now 18; retain a pre-upgrade backup because 0.20 cannot read an upgraded workspace. Existing history does not receive manufactured guided turns or independence claims.

Automatic correction is limited to supported arithmetic and curated-bank answers. Open work needs review, and one correct check does not establish consolidation. General pedagogical effectiveness and handwriting remain unqualified. Tests ran on the current Windows host; another account/computer, clean consumer Windows and hosted CI were not exercised. The unsigned, unpublished build contains uncommitted changes based on `18fada972eb8ac41a87e78f206664c6a4bed9352`; the base commit alone does not describe the complete artifact. No commit, push or publication was performed.
