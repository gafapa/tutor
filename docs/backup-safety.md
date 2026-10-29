# Portable backup safety

Portable files are limited to 75 MiB, including the 64-byte envelope of an encrypted backup. Exports use compact UTF-8 JSON and reserve the encryption overhead for both formats, so the same history fits in either JSON or password-protected form.

`electron/backup-limits.ts` defines the size budget and collection limits used by both persistence and restoration. Before committing a change, the store counts records and complete serialized JSON bytes, including Unicode, escaping, separators, and the backup envelope. A change that exceeds a limit is rolled back before it reaches disk. No records are truncated or discarded.

Existing local histories above a limit remain readable. Changes that reduce an exceeded limit are allowed; exports fail explicitly until the history fits. Export also runs the complete restoration validator before writing a file. Restoration reads through a bounded file handle and rejects files that change while being read. Mock-exam restrictions are checked again after file selection.

Mastery estimates use local calendar days. New reports (`reports-2`) retain their timezone and validate estimates in that timezone, including when restored on another computer. Existing reports (`reports-1`) retain their original UTC-based estimates and are not rewritten by this correction.

Regression coverage is in `tests/backup-safety.test.ts` and `tests/learning-calendar.test.ts`. GitHub Actions also audits dependencies and fails on advisories at moderate severity or above. Local results do not establish a successful hosted CI run or a qualified installer.
