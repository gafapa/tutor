# Connecting independent Moodle courses

This development increment adds a desktop workflow for connecting up to 30 Moodle courses after one authenticated course discovery. Every selected course targets a different local subject. The existing single-course entry remains available.

## Student workflow

Open **Mi Moodle**, select **Conectar varias asignaturas**, and authenticate with a token or the site's permitted mobile-service login. The workflow is available before any local subject exists. It lists only courses returned for that authenticated Moodle user.

Search and select courses. A new subject is proposed for each course, with an editable name. Alternatively, assign it to an existing subject without another Moodle course. For a course already connected to this site, select its existing subject to restore access and keep its history. The search preserves selections, exposes a complete selection review when selected rows are hidden, and initially renders 50 matches with a control to show more.

Choose manual updates or one of the existing periodic intervals. Submitting saves the subject and connection setup, then downloads the courses sequentially. Results distinguish successful, incomplete, failed and pending downloads. A failed course does not prevent the remaining courses from being attempted. The stop control cancels the active synchronization and skips the remaining initial downloads; it preserves the saved connections and any completed course updates. Periodic updates retain the interval explicitly selected by the student.

The subject list provides navigation to each course's independent materials and history. A pending or failed course can be updated from its subject. This setup does not create Moodle courses, enrolments or accounts, and does not submit work.

## Integrity and credentials

The main process validates the discovery lifetime, course membership, distinct courses, distinct destination subjects and account fingerprints before saving. A course already connected elsewhere cannot be silently duplicated into a new subject, and this workflow cannot add another course to a subject already connected to a different course. A course with an active synchronization must finish before reconnection.

New subjects and their connections are saved in one educational-database transaction, including the existing portable-backup capacity checks. No partially created subject list remains after an ordinary setup failure. Initial downloads are independent transactions after setup, so one failed download does not roll back another course's completed import.

Credentials are stored separately in the encrypted credential file with one batch update. On an ordinary database setup failure, the previous credential entries are restored. The credential file and educational database are separate files, not one crash-atomic transaction: startup pruning removes credential entries without corresponding connections. Existing connections can only receive credentials for the same account identity. A credential rollback failure is reported explicitly and requires reconnection.

Successful setup consumes the temporary discovery. Dismissing its selection or leaving that view requests immediate disposal; unused discoveries also retain their ten-minute expiry. Passwords are used only to obtain the service token. Tokens are never returned to the renderer or included in educational exports.

The course-setup workflow originally added no persisted field and kept backup schema 13. The subsequent offline-originals increment advanced the history and backup format to schema 14; the subsequent attempt-history increment uses schema 15; existing course setup migrates unchanged.

## Validation status

Local validation on 2026-10-28 passes 181 domain tests, the existing development-desktop smoke and `npm run test:moodle:courses`. The new course tests use a deterministic HTTP REST double. They verify independent subjects, duplicate/account protections, credential restoration after failed setup, database rollback without orphan subjects, failed course requests, retained submissions, cancellation, suppression and schema 12 migration.

The new Electron flow verifies empty-workspace setup, keyboard selection, search-preserved selection, full instructions and file metadata, dialog overflow at 960 × 700, restart, credential-free portable restore, reconnection without duplicate subjects, a failed second-course download and cancellation with completed copies preserved. It records no renderer errors. Evidence: `test-results/domain-tests-current.log`, `test-results/moodle-courses-desktop-verification.json` and the associated screenshots. The Windows CI workflow now includes this synthetic desktop flow; no hosted run is claimed here.

The live development-Electron workflow also passes using the existing authorized `alumno` account on Aula: two courses, 24 materials, 26 submissions with published evaluations, portfolio copying and restart. Evidence: `test-results/live-student-desktop-verification.json`. New-installer qualification, large selection lists, expired-discovery UI recovery, periodic scheduling of a long batch and credential rollback under actual disk failure remain unverified. The test used the existing student account and required no account creation.

The later test pass should include empty-workspace setup, mixed new/existing subjects, duplicate targets, stale discoveries, course ownership changes, another account, a course already syncing, a full credential store, failed persistence, search-preserved selections, failed middle-course download, cancellation, periodic scheduling and separate Mathematics/Networks histories.
