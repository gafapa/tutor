# Windows portable distribution

Tutor Local 0.21 is distributed as `Tutor-Local-0.21.0-Portable.zip` for Windows x64. Extract the entire folder to a writable local disk or USB drive, then open `Tutor Local.exe`. Do not launch from the ZIP preview. No installation, administrator privileges, Node.js, Python or Ollama is required.

## Unlocking and storage

At first launch, choose and confirm a password containing 12 to 256 characters. This password belongs to the portable workspace and is separate from Moodle credentials. Every launch requires it. The key is generated randomly and wrapped with scrypt (N=32768, r=8, p=1; random 16-byte salt) and AES-256-GCM. Educational history, Moodle credentials and the semantic index retain their existing encrypted formats with this random key. The key is never wrapped with Windows DPAPI in portable mode.

The `tutor-portable.json` marker beside the executable enables portable mode. The application places the workspace at `Data` beside that executable, including its browser session, logs, temporary and crash directories. Portable mode takes precedence over the development `TUTOR_DATA_DIR` override. Read-only or unavailable drives produce a startup error rather than falling back to the installed profile. Preserve the marker when moving or updating the folder.

Wrong passwords cannot replace the key or history. Missing keys with existing encrypted data, or an installed-profile key in a new portable folder, cause a refusal to create a replacement. Keep the password and independent encrypted backups: there is no password recovery. Normal Windows operating-system records, antivirus activity and explicit exports may exist outside this folder; portable mode does not promise a trace-free host.

OCR, semantic search and the AI engine are included. Optional Qwen tutoring requires downloading its approximately 1.12 GB model. Downloaded models are stored in `Data/models` and move with the complete folder. Imported materials and Moodle attachments retain their existing encrypted local representations. Moodle remains strictly read-only; making the app portable does not add remote writes.

## Moving and updating

Close Tutor Local before copying or moving the complete program folder, unplugging the drive or updating. Open the executable at the new location and enter the same password. Keep a backup before moving between drives. Use only one writable copy of a workspace at a time; copies do not merge changes.

To update, extract the newer ZIP into a new folder. With both versions closed, copy the entire `Data` folder from the old folder into the new one. Keep the original folder until the new version opens successfully. Never replace program files while the application is running. A newer schema may prevent downgrading; retain a backup from before the update. The educational schema is 18 in version 0.21; version 0.20 cannot open an upgraded workspace.

## Migrating from the installed app

Open the installed app, export an encrypted backup through Settings and close it. Extract the portable version into a new folder, choose a portable password and restore that backup through Settings. Reconnect Moodle: educational backups deliberately exclude Moodle credentials. The installed workspace and its Windows-protected key are not changed. Do not copy `vault-key.bin` into the portable workspace. An already downloaded Qwen model can be copied from the installed profile's `models` folder into the portable `Data/models` folder while both apps are closed.

## Building and verification

`npm run dist` builds the unpacked Windows executable and a clean portable ZIP. Packaging uses a new temporary staging directory, includes the portable marker and an English README, and does not include any learner profile. `npm run dist:installer` retains the optional legacy NSIS build. The raw `release/win-unpacked` directory is a packaging/test intermediate without the portable marker; the ZIP is the portable deliverable.

`npm run test:portable` extracts the actual ZIP to a private test directory and verifies password confirmation, rejection of wrong passwords without data changes, encrypted history, portable paths, cancellation and moving to a path containing spaces and Unicode. It runs the bundled semantic model both before and after the move and detects a previously downloaded Qwen model after another move. Prepare that test-model fixture with `node scripts/test-ai.mjs` first; it is not included in the learner ZIP. Domain tests additionally relocate encrypted history and Moodle credentials using only the password, without Windows safeStorage. `npm run test:release` checks compiled/archive equality, included resources and all packaged workflows before `node scripts/prepare-distribution.mjs` prepares the verified download. Legacy installer qualification can be invoked with `npm run test:release -- --installer` and `node scripts/prepare-distribution.mjs --installer` after an installer build and installation smoke test.

The [0.21 local qualification](windows-0.21-verification.md) passed 222 domain tests and 25 packaged workflows. Relocation testing uses the current Windows host. A second computer/account and clean Windows remain unverified. The build remains unsigned and unpublished. Evidence is recorded under `test-results/portable-0.21.0-verification.json` and `test-results/release-0.21.0-verification.json`. Hosted CI is configured for the portable path but is not claimed as executed locally.

For a final portable smoke failure after the other workflows have passed, the verifier can use `--resume-log <original-captured-npm-release-log>`. It rechecks source/archive and resource equality, and reuses only explicit successful checks with versioned logs newer than the current archive. The portable ZIP test always runs again. Rebuilds invalidate this reuse through the archive timestamp; normal CI performs the full verification without resuming.

Electron storage locations are configured before app readiness as required by the [official app path documentation](https://www.electronjs.org/docs/latest/api/app#appsetpathname-path).
