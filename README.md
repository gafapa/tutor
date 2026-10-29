# Tutor Local

[![Tests](https://github.com/gafapa/tutor/actions/workflows/tests.yml/badge.svg)](https://github.com/gafapa/tutor/actions/workflows/tests.yml)

Tutor Local is a student-controlled learning companion for Windows x64. It runs as a portable executable, keeps educational data and AI inference on the student's computer, and retrieves the student's own Moodle courses through a strictly read-only connector. Each subject uses a separate Moodle course.

The interface is currently in Spanish. Reports support personal reflection and optional manual sharing with parents or family. Teacher dashboards, remote family accounts, cloud AI, other learning platforms, hosted web applications and mobile distributions are outside the [product scope](docs/product-scope.md).

## Portable use

The current development version is **0.21.0**. The locally qualified download is `release/distribution/Tutor-Local-0.21.0-Portable.zip`, with an adjacent SHA-256 file and verification manifest. The binary has not been published to GitHub Releases.

1. Extract the complete ZIP to a writable local drive or USB drive.
2. Open `Tutor Local.exe` and choose a portable password of 12 to 256 characters.
3. Keep the complete folder, including `tutor-portable.json` and the adjacent `Data` folder. Close the app before moving it or unplugging the drive.

No installation, administrator privileges, Node.js, Python or Ollama is required. OCR, semantic search and the local AI engine are included. Optional tutoring downloads a checksum-verified Qwen 2.5 1.5B model of approximately 1.12 GB when explicitly requested in Settings; inference then works offline. Planning, materials and the exercise bank work without that download.

To update, extract the newer ZIP into a new folder and copy the complete `Data` folder with both versions closed. Keep the old folder and an independent encrypted backup until the new version opens successfully. Version 0.21 uses educational schema **18**; version 0.20 cannot read an upgraded workspace. Installed profiles migrate through an encrypted backup and explicit Moodle reconnection. See [portable operation, passwords and migration](docs/windows-portable.md).

## Implemented learning tools

- Separate subjects, curriculum, units, materials and versioned sources. Import textual/scanned PDF, DOCX, PPTX, saved HTML, notes and existing subtitle transcripts; local OCR requires text review.
- Daily planning, timed study sessions, exercises, flashcards, personal mock exams, goals and progress views with supporting evidence.
- Moodle synchronization, assignments, published feedback/grades, permitted submission/quiz histories, offline originals and attempt comparison. Imported grades do not establish mastery.
- Independent portfolio selections, reflections, versioned rubrics and personal practice tasks. Local copies never submit work or change Moodle.
- A guided learning cycle: review a personal Moodle submission, confirm a difficulty, attempt sequential practice before requesting hints, and complete a later-day check without hints. Home and My plan show pending checks.
- Local tutoring with bounded source context/citations, multilingual semantic retrieval, exact arithmetic analysis, accepted observations and cross-subject connections.
- Local weekly/unit/transition reports, manual PDF/CSV/JSON report exports, full-history JSON export and encrypted backups.

Automatic correction covers supported arithmetic and the curated exercise bank. Open work and AI suggestions require review. Estimates, observations and streaks are learning aids; they do not establish pedagogical validity or a teacher grade. The [requirements matrix](docs/requirements.md) distinguishes implemented, partial, pending and excluded work.

## Privacy and recovery

Educational history is encrypted with AES-256-GCM. In portable mode, a random workspace key is protected by the portable password using scrypt and AES-256-GCM, independently of the Windows account. Installed/development profiles retain operating-system secure key storage. Moodle credentials are encrypted separately and excluded from educational backups; restoration requires reconnection.

The renderer is isolated and its network access is blocked. Local inference listens only on loopback with a random per-run key. Intended network access covers authorized Moodle reads and explicit public model downloads. There are no external AI services, analytics or automatic report deliveries. Model downloads reveal normal connection metadata to the provider.

Encrypted `.tutor` backups are portable. JSON, CSV and PDF exports are readable files under the student's control. Keep the password and independent backups: forgotten passwords cannot be recovered. See [backup validation](docs/backup-safety.md) and the enforced [Moodle read-only boundary](docs/moodle-read-only-boundary.md).

## Development

Use Node.js 24 and npm. Windows x64 is required for desktop qualification/packaging; Linux domain/build checks do not qualify a Linux desktop app.

```powershell
npm ci
node node_modules/electron/install.js
npm run prepare:runtime
npm run dev
```

React/TypeScript implement the interface; Electron provides the desktop shell, sql.js the database, llama.cpp inference, Tesseract OCR and ONNX multilingual E5 retrieval. Runtime preparation verifies pinned downloads and retains licenses. Microsoft redistributable components remain subject to their distribution terms.

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

The Moodle fixture uses synthetic users; run its tests sequentially because they share a local database/ports. Desktop tests use isolated profiles in `.tools/` and write evidence to `test-results/`. Test profiles and the Qwen test model are excluded from the learner ZIP; required runtimes and OCR/semantic models are included. `release/win-unpacked` is a testing intermediate without the portable marker. The optional legacy installer uses `npm run dist:installer` and has a separate qualification path.

Current local qualification records **222 domain tests and 25 packaged workflows**, including the extracted/relocated ZIP, native resources, local models, report PDFs and live read-only Moodle source preparation. See [Windows 0.21 verification](docs/windows-0.21-verification.md) for bytes, hash and limits. The build is unsigned; a second computer/account and clean consumer Windows remain unverified. Hosted CI results must be checked separately for the relevant commit.

## Documentation

Start with the [documentation index](docs/README.md) for feature guides, verification records and remaining work. [Development and repository hygiene](docs/development.md) describes generated directories and safe cleanup. [GitHub Actions](docs/ci.md) explains checks, artifacts and the separate tag-based release process.
