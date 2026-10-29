# Windows portable alpha

Version 0.22 uses a portable ZIP for Windows x64. Extract the complete folder to a writable drive and open `Tutor Local.exe`. There is no workspace password or installer. No Node.js, Python or Ollama is required for the local features. Optional account AI requires a separately installed official native Codex/Claude Code executable and the user's account.

## Storage, movement and updates

The `tutor-portable.json` marker selects the adjacent `Data` folder before Electron initializes its paths. Educational history is readable SQLite in `Data/learning.sqlite`. Browser state, logs, temporary files, local models and caches stay inside the portable workspace. Moodle credentials are protected separately with a Windows account/computer key. Reconnect Moodle after moving to another account or PC; existing protected files are preserved. Official account tools manage their own authentication files under `Data/accounts`. Protect the complete folder.

Close the app before copying, moving, updating or unplugging the drive. Use one writable copy at a time; copies do not merge. Keep independent backups; encryption is optional for exported backups. An unavailable/read-only drive causes a startup error instead of falling back to another profile.

This alpha starts a new workspace without migrating earlier encrypted profiles. Their files remain untouched and an existing old profile receives an explanatory startup notice. There is no backward compatibility promise. For future compatible updates, extract a fresh program folder and copy `Data` with both versions closed, keeping the original until verification succeeds.

## Building and checking

`npm run dist` builds the unpacked executable and portable ZIP. The ZIP contains the marker and an English README, never a learner profile. `release/win-unpacked` is a test intermediate without the marker. `npm run test:orientation` exercises onboarding and the new learning setup; its PDF inference is a deterministic double. `npm run test:portable` extracts and executes the actual ZIP, checks password-free startup/readable history, verifies paths, moves its private folder and reruns the bundled semantic model. `npm run test:release` verifies archive equality and all packaged workflows; `node scripts/prepare-distribution.mjs` accepts only matching receipts.

The optional legacy NSIS command remains separate. No second computer/account or clean consumer Windows qualification is implied by moving a folder on the current host. The binary remains unsigned. Earlier password-based qualification is retained in [0.20](windows-0.20-verification.md) and [0.21](windows-0.21-verification.md) as historical evidence only. See [current orientation and limits](moodle-first-alpha.md).
