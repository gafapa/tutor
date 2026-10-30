# Windows 0.23 student support verification

This record covers the shared student interface, course guidance, reviewed Moodle/curriculum relationships, estimated study calendar, guided practice, Vulkan inference and longer scanned programmes. See [Student experience](student-experience.md) for behavior and limits.

## Artifact

- Windows x64 portable: `Tutor-Local-0.23.0-Portable.zip`, 357,220,094 bytes.
- SHA-256: `fcc7a8b9dcfa9c1dd512e809de730ba42cc0db8d871488c4089750e3ddb4b631`.
- Extract the whole folder and open `Tutor Local.exe`. Moodle remains read-only. Educational history is readable SQLite; secrets are separately protected by Windows.
- All 237 domain tests and 27 packaged workflows passed for this exact ZIP; the final distribution manifest records its source commit.

## Functional checks

The TypeScript/Vite build and all 237 domain tests passed. Domain checks include atomic relationship/calendar commits, stale curriculum rejection, ownership, literal source references, trusted physical pagination, whitespace-only quote grounding, reuse of cached Moodle programme material, course-specific prompts, ungraded practice, backup settings and activity withdrawal. Dependency audit reported zero vulnerabilities. Documentation links and whitespace checks passed.

The student desktop workflow exercised the actual collapsed navigation, review confirmation, editable relationships/dates, hints gated by an initial attempt, ungraded persistence, school-year selection, restart and a 600-pixel layout. It rendered an actual twelve-page scanned PDF in isolated workers, processed all pages and retained ten previews. Moodle REST and generative responses in this workflow are deterministic doubles. These checks do not establish pedagogical quality or arbitrary document accuracy.

All 27 packaged workflows passed, including the existing materials, study, assessment, Moodle history, feedback, portfolio, reporting and AI workflows. The verifier checked exact renderer/compiled archive identity, pinned semantic/Vulkan resources and report PDF rendering. The portable check executed the actual extracted ZIP and reopened readable history and the bundled semantic model after moving its folder. The onboarding workflow also reused a PDF already imported as material without duplicating it.

## Native model checks

On this Windows host (32 GB RAM, NVIDIA GeForce RTX 2070 Max-Q), automatic Vulkan selection completed real Qwen inference. An intentionally invalid GPU device recovered through CPU and completed the same request. The backend was read from actual model status after inference. Vulkan b11319 and its DLLs are pinned and verified; Microsoft VC runtime files are bundled. These checks do not qualify other GPUs, driver installations or clean Windows.

A separate real Gemma 4 E4B run used the downloaded, hash-verified weights and visual projector through Vulkan. It transcribed the printed synthetic image `2 + 2 = 5` without correcting the source, and returned a validated unit title as structured JSON. This adds larger-model/GPU evidence to the earlier E2B CPU check; it does not qualify handwriting or complex formula recognition.

Early native extraction trials on public school programmes exposed a wrong model page and whitespace changes in a quote. Reference validation rejected those responses without persisting curriculum. The importer now binds references to its own physical page and restores only whitespace differences to the exact original substring. Fabricated words and citations outside the current fragment remain rejected.

After that correction, native E4B/GPU checks read both complete selectable-text PDFs and extracted one quoted unit from a selected page of each: [1st ESO mathematics, IES Faro das Luas](https://www.edu.xunta.gal/centros/iesfarodasluas/system/files/programacion_didactica_lomloe_MATEMATICAS1_ESO.pdf) (38 pages; physical page 5 tested) and [2nd Bachillerato physics, IES Terra de Soneira](https://centros.edu.xunta.gal/iesterradesoneira/system/files/2025-12/PROGRAMACIO%CC%81N%20DIDA%CC%81CTICA%202%20BAC%20FI%CC%81SICA%2025%2026.pdf) (26 pages; physical page 6 tested). Each quote resolved to the actual source fragment. This is limited native extraction evidence, not full-programme coverage, a complete desktop import or a curriculum correctness audit. The receipt is `public-programme-native-verification.json`.

## Evidence and limits

Local receipts include `student-verification.json`, `gpu-auto-verification.json`, `gpu-fallback-verification.json`, `multimodal-gemma4-e4b-gpu-verification.json` and the versioned packaged/portable verification JSON under `test-results`. Screenshots include the default Home, reviewed relationships and narrow practice dialog. Evidence and model downloads remain outside the learner ZIP.

Both official native CLI sessions were already connected. Codex and Claude each completed real Spanish tutoring, structured JSON and a selected synthetic image request without another login or copied credentials. The receipt is `account-cli-live-verification.json`. Tutor honors the existing CLI configuration home, filters unrelated environment secrets and revokes its own authorization without global CLI logout. Protocol tests check MCP/app-tool disabling as well as shell and approval restrictions.

Two clearly synthetic four-page programme PDFs were generated, visually reviewed, uploaded through MoodlIA CLI to the existing authorized test courses 9 and 10, downloaded and compared byte-for-byte. Modules 184 and 185 retain those PDFs. `scripts/generate-moodle-programmes.py` reproduces their educational content; `live-programme-upload-verification.json` records the hashes. These fixture writes are separate from the application's enforced read-only connector.

The real `alumno` account then connected to both courses through the Electron application. Renderer API checks imported the uploaded PDFs, used Codex to extract and save four reviewed units and four criteria per subject, reused the cached Moodle materials, confirmed twelve task relationships and estimated dates for four mathematics units, and created four local study tasks. Both Codex and Claude generated the three exercise kinds from an actual Moodle activity, reviewed a quoted student answer and saved one ungraded personal attempt each. No mastery was inferred. Leaving account AI retained both official CLI sessions. `live-moodle-support-0.23-verification.json` records this actual-server/development-Electron run with synthetic educational data; it is separate from the deterministic packaged UI workflow and does not establish human usability or pedagogical efficacy.

Representative student handwriting/formula work, exhaustive real-programme extraction, a second Windows account/computer, educational effectiveness and hosted CI remain unverified. The binary is unsigned. No tag or GitHub binary publication is part of this qualification. The prior qualified 0.22 distribution is preserved separately.
