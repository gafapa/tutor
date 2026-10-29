# Historical Moodle assignment submissions

Version 0.15 imports the student's previous assignment attempts from `previousattempts` in the existing `mod_assign_get_submission_status` response. No additional REST function or teacher identity is used. Moodle's [4.5 submission-status implementation](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/externallib.php) supplies those records, including submission plugins and historical feedback plugins.

## Student workflow

Open an assignment detail and choose **Intento de la entrega** when Moodle has supplied earlier attempts. The latest attempt is selected initially. Earlier choices display that attempt's text, submission dates, returned comments and attachment list. **Versión** independently chooses an immutable local synchronization snapshot; changing that snapshot resets the attempt selector to its latest attempt.

The assignment instructions belong to the chosen local snapshot. They are not reconstructed as they existed at the historical submission date. Numerical grades remain in the existing gradebook view; this increment does not import the historical raw-grade objects. Quiz response/attempt history was outside the 0.15 increment and is now covered separately in [quiz history](moodle-quiz-history.md).

The selected attempt can be copied into the portfolio with a personal reflection. The main process resolves both its local revision and Moodle attempt number. A missing attempt is rejected. A historical copy identifies its attempt, retains the matching comments and attachment references, and remains independent of later synchronization or deletion of the connection's imported data. Existing copies of the latest submission keep their original deduplication behavior.

Historic attachment originals use an attempt-specific resource identity. Their download, encrypted storage, immutable byte versions, offline preview and export follow the [original-file rules](moodle-submission-portfolio.md#offline-submission-originals). They never become course reference materials.

## Integrity and limits

Previous attempts are sorted by Moodle attempt number and must be unique, precede the current attempt and match its personal/group mode. A supplied personal user ID must match the connected student. Each activity supports up to 100 previous attempts. Malformed or excessive histories make that submission read incomplete; the existing cached latest submission and history are retained together. Successful assignment-instruction/date reads can still update independently.

Only the latest submission controls the linked plan task. Selecting, importing or copying an old submission creates no verified practice attempt, mastery estimate or automatic assessment. The history follows the existing encrypted storage, portable capacity checks and mock-exam access restrictions.

History and backup schema 15 accept schema 14 backups unchanged, without fabricating earlier attempts. The older executable cannot open schema 15 history. The historical 0.14 installer and its qualification remain separate from the current build.

## Validation

The 188-test domain suite includes first-import history, stable ordering, old-attempt portfolio copies, unchanged current tasks/mastery, historical attachments, failed reads, duplicate/foreign/future/malformed/excessive attempts, invalid backup history, and schema 14 migration preserving original files.

`scripts/smoke-moodle-history.mjs` creates two synthetic, graded attempts in the isolated real Moodle fixture before the first app connection. It verifies selection, matching historical text/comments, original-file download, credential removal, offline byte-exact export, portfolio reflection, encrypted backup/restore and restart. It removes its extra assignment on fixture reset so the other Moodle tests keep their original dataset. The exercise never changes the live Aula courses.

Run `npm run test:moodle:history` for the development executable or `node scripts/smoke-moodle-history.mjs --packaged` for the packaged executable. Evidence is written to `test-results/[packaged-]moodle-history-verification.json` and matching screenshots. Development and packaged validation have both passed, including all 19 release workflows. See [Windows 0.15 qualification](windows-0.15-verification.md) for artifact identity and limits.
