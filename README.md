# Tutor Local

[![Tests](https://github.com/gafapa/tutor/actions/workflows/tests.yml/badge.svg)](https://github.com/gafapa/tutor/actions/workflows/tests.yml)

Tutor Local is a student-controlled learning companion for Windows x64. It runs as a portable executable, stores educational data on the student's computer and lets the student/family choose local or account-based AI, and retrieves the student's own Moodle courses through a strictly read-only connector. Each subject uses a separate Moodle course.

The interface is currently in Spanish. Reports support personal reflection and optional manual sharing with parents or family. Teacher dashboards, remote family accounts, other learning platforms, hosted web applications and mobile distributions are outside the [product scope](docs/product-scope.md).

## Portable use

The current development version is **0.23.1 alpha**. The verified local download is `release/distribution/Tutor-Local-0.23.1-Portable.zip`, with an adjacent SHA-256 file and verification manifest. See [0.23 qualification and limits](docs/windows-0.23.1-verification.md). The binary has not been published to GitHub Releases.

1. Extract the complete ZIP to a writable local drive or USB drive.
2. Open `Tutor Local.exe`. Onboarding starts with the school Moodle connection; there is no workspace password.
3. Keep the complete folder, including `App`, `Docs` and `Data` (created on first launch). Close the app before moving it or unplugging the drive.

No installation, administrator privileges, Node.js, Python or Ollama is required. Document preparation, semantic search and the local AI engine are included. Settings offers six pinned, checksum-verified local models: four text-only Qwen models and multimodal Gemma 4 E2B/E4B (including their visual projectors), with a RAM-based recommendation and detected CPU/GPU information. The runtime can select a compatible Vulkan GPU automatically, with CPU fallback and a CPU-only setting. Alternatively, authorize context processing through your own Claude/Codex account and its separately installed official native executable. Planning, materials and the exercise bank work without that download.

To update, extract the newer ZIP into a new folder and copy the complete `Data` folder with both versions closed. Keep the old folder and an independent backup until the new version opens successfully. This alpha uses a new readable SQLite workspace. Earlier encrypted profiles are preserved without migration or a compatibility promise. Moodle credentials are protected for the Windows account/computer; reconnect after moving to another account or PC. See [portable operation and storage](docs/windows-portable.md).

Claude/Codex reuse an existing session in the selected official CLI; browser sign-in is needed only when that tool is signed out. Leaving account AI in Tutor revokes Tutor's permission and returns to local processing without logging out the CLI. Tutor does not copy credential files.

## Implemented learning tools

- A shared interface from 1st ESO to 2nd Bachillerato, course-adapted tutoring guidance, five primary navigation options and a compact bottom dock in narrow windows.
- Reviewed Moodle task/curriculum links, editable estimated unit dates and optional local study tasks. Three-part practice from current Moodle work saves ungraded personal attempts. See [student support](docs/student-experience.md).
- Separate subjects, curriculum, units, materials and versioned sources. Import textual/scanned PDF, DOCX, PPTX, saved HTML, notes and existing subtitle transcripts; images/scanned pages use the selected multimodal model and require text review.
- Daily planning, timed study sessions, exercises, flashcards, personal mock exams, goals and progress views with supporting evidence.
- Moodle synchronization, assignments, published feedback/grades, permitted submission/quiz histories, offline originals and attempt comparison. Imported grades do not establish mastery.
- Independent portfolio selections, reflections, versioned rubrics and personal practice tasks. Local copies never submit work or change Moodle.
- A guided learning cycle: review a personal Moodle submission, confirm a difficulty, attempt sequential practice before requesting hints, and complete a later-day check without hints. Home and My plan show pending checks.
- Local tutoring with bounded source context/citations, multilingual semantic retrieval, exact arithmetic analysis, accepted observations and cross-subject connections.
- Local weekly/unit/transition reports, manual PDF/CSV/JSON report exports, full-history JSON export and encrypted backups.

Automatic correction covers supported arithmetic and the curated exercise bank. Open work and AI suggestions require review. Estimates, observations and streaks are learning aids; they do not establish pedagogical validity or a teacher grade. The [requirements matrix](docs/requirements.md) distinguishes implemented, partial, pending and excluded work.

## Privacy and recovery

Educational history is readable SQLite in `Data/learning.sqlite`; no workspace password is required. Moodle credentials and the derived semantic cache are protected separately using a Windows-protected key. Moodle credentials are encrypted separately and excluded from educational backups; restoration requires reconnection.

The renderer is isolated and its network access is blocked. Local inference listens only on loopback with a random per-run key. Intended network access covers authorized Moodle reads, public model downloads and explicitly authorized account-based AI queries. Claude/Codex receive selected context only after explicit authorization; analytics and automatic report delivery remain absent. Model downloads reveal normal connection metadata to the provider.

Encrypted `.tutor` backups are portable. JSON, CSV and PDF exports are readable files under the student's control. Encrypted backups are optional; keep their passwords and independent copies. See [backup validation](docs/backup-safety.md) and the enforced [Moodle read-only boundary](docs/moodle-read-only-boundary.md).

## Development

Use Node.js 24 and npm. Windows x64 is required for desktop qualification/packaging; Linux domain/build checks do not qualify a Linux desktop app.

```powershell
npm ci
node node_modules/electron/install.js
npm run prepare:runtime
npm run dev
```

React/TypeScript implement the interface; Electron provides the desktop shell, sql.js the database, llama.cpp inference, multimodal image reading and ONNX multilingual E5 retrieval. Runtime preparation verifies pinned downloads and retains licenses. Microsoft redistributable components remain subject to their distribution terms.

Fast local checks:

```powershell
npm test
npm run build
npm audit --audit-level=moderate
```

Full Windows portable qualification, after runtime preparation:

```powershell
node scripts/prepare-moodle-test.mjs
npm run prepare:pdf-check
node scripts/test-ai.mjs
npm run test:moodle
npm run dist
npm run test:release
node scripts/prepare-distribution.mjs
```

The Moodle fixture uses synthetic users; run its tests sequentially because they share a local database/ports. Desktop tests use isolated profiles in `.tools/` and write evidence to `test-results/`. Test profiles and the Qwen test model are excluded from the learner ZIP; required runtimes and the semantic model are included; generative/visual models are optional downloads. `release/win-unpacked` is a testing intermediate without the portable marker. The optional legacy installer uses `npm run dist:installer` and has a separate qualification path.

Historical 0.21 local qualification records **222 domain tests and 25 packaged workflows**, including the extracted/relocated ZIP, native resources, local models, report PDFs and live read-only Moodle source preparation. See [Windows 0.21 verification](docs/windows-0.21-verification.md) for bytes, hash and limits. The build is unsigned; a second computer/account and clean consumer Windows remain unverified. Hosted CI results must be checked separately for the relevant commit.

## Documentation

The [0.22 orientation](docs/moodle-first-alpha.md) supersedes older local-only AI and mandatory-encryption descriptions.

Start with the [documentation index](docs/README.md) for feature guides, verification records and remaining work. [Development and repository hygiene](docs/development.md) describes generated directories and safe cleanup. [GitHub Actions](docs/ci.md) explains checks, artifacts and the separate tag-based release process.
