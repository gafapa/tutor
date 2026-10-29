# Development and repository hygiene

Use Node.js 24, the committed npm lockfile and setup commands in the [project README](../README.md). Identifiers, comments and documentation use English; Spanish interface labels and educational fixtures are intentional.

## Directory responsibilities

| Directory | Purpose | Repository policy |
|---|---|---|
| `src`, `electron`, `shared` | Interface, desktop services and contracts | Track source. |
| `assets`, `scripts`, `tests` | Assets, tooling and tests | Track reviewed source and synthetic fixtures only. |
| `docs`, `.github` | Documentation and CI | Track; distinguish current behavior from historical receipts. |
| `build`, `dist` | Generated backend/renderer | Ignore; regenerate with `npm run build`. |
| `release` | Unpacked app and verified distributions | Ignore; preserve qualified archives/checksums and local download paths. Binary releases use a separate tag workflow. |
| `.tools` | Caches, local Moodle, test profiles and package staging | Ignore; profiles/configuration can contain credentials. |
| `test-results`, `tmp` | Receipts, logs, screenshots and PDF previews | Ignore; preserve evidence used by qualification documents. |
| `node_modules` | Installed dependencies | Ignore; reproduce with `npm ci`. |
| Portable `Data` | Learner workspace beside the executable | Never track, merge or remove as build cleanup. |

## Safe cleanup

Remove only identified generated scratch. Resolve the absolute target, verify it stays inside the intended workspace directory, reject links/reparse points and check for learner data and active processes before recursively deleting. Use PowerShell filesystem commands end to end on Windows.

`.tools/portable-package/<uuid>` contains intermediate program copies. After a completed package has a verified checksum and no process uses the staging directory, its profile-free copy can be removed. Failed staging can be useful for diagnosis; inspect first. Do not blanket-delete learner data, backups, keys, credentials, local Moodle, model/runtime caches, verified distributions or qualification receipts.

The 2026-10-29 cleanup removed five profile-free package staging copies (4,205,215,611 logical bytes, approximately 3.92 GiB). Qualified distributions, previous download links, caches and test evidence were retained. The portable running outside the repository was left untouched.

## Before committing

Review Git status, the staged diff and file sizes. Keep passwords, tokens, cookies, private keys, learner exports, models and generated binaries out of Git. Test credentials must be visibly synthetic. Authorized live credentials must not be written to tracked configuration or command arguments.

Run `npm test`, `npm run build`, `npm audit --audit-level=moderate` and `git diff --check` as appropriate. Package changes require relevant packaged checks; full qualification uses the README commands. Do not run local real-Moodle fixture tests concurrently. Local qualification does not establish hosted CI success.

## Source and binary publication

Pushes to `main` trigger checks without publishing a binary release. Stable version tags trigger fresh qualification and the separate publishing job. Source publication does not change a previously built ZIP's provenance: retain its original hash, source base/dirty state and qualification limits. See [CI](ci.md).
