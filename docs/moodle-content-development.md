# Expanded Moodle content import

This development increment extends the read-only connector for the student's own Moodle courses. Subjects remain separate local workspaces connected to independent Moodle courses. No administrative Moodle operation is added to the executable.

## Imported content

- Assignment instructions combine the introduction and the separate activity text, with duplicate text omitted. The connector also reads activity text returned in submission status, when Moodle makes it available to that student. It does not request unreleased instructions using another identity.
- Visible section summaries become local note materials. Each uses the stable remote key `section:<section id>`, a section source URL and no course-module identifier. Changes use the existing material and LMS revision history; deleting a local material retains the existing suppression behavior.
- Visible Text and media areas (`label` modules) become local note materials with the stable remote key `label:<module id>`.
- The latest personal or group submission includes a list of file names, paths, sizes, sanitized source URLs and modification dates returned by the file submission plugin. The detail view displays file names and sizes. The subsequent offline-originals increment downloads supported original bytes into encrypted, versioned attachment records and offers local text extraction or byte-exact export. These records stay separate from course materials and are never graded by the connector. See [submission originals](moodle-submission-portfolio.md#offline-submission-originals).

HTML becomes plain text using the existing parser. Scripts and remote assets are not executed. Content retains the existing text and response-size limits. Submission metadata is limited to 2,000 files, and credential-bearing URL parameters are removed before persistence. The connector retains its existing read-operation allowlist and current-user checks.

## Persistence

The encrypted history and portable backup schema advance from 12 to 13. Version 12 and older supported backups migrate to 13 without adding attempts, grades or mastery evidence. Existing submission snapshots do not receive invented file lists. The new optional `files` field and `section` resource source are validated in both current items and immutable versions. Older executables cannot read schema 13 histories or backups; use this executable to open an upgraded workspace.

The existing transaction, backup capacity and export validation apply to the additional content. A metadata or content update remains part of the synchronization transaction. A failed submission lookup keeps the existing last-known submission behavior and marks the corresponding scope incomplete.

## Validation status

Local validation on 2026-10-28 passes the domain suite (181 tests), the existing development-desktop smoke and the new multi-course development-desktop smoke. The new tests use a deterministic HTTP REST double, not a Moodle installation. They cover full task text, topic and label notes, hidden-content exclusion, personal/group file metadata, failed lookups, suppression, cancellation, metadata URL validation, schema 12 setup migration and schema 13 backup/restore. The desktop flow reads the complete instructions and file list, preserves data across restart and restore, and checks dialog overflow at 960 × 700. See `test-results/domain-tests-current.log` and `test-results/moodle-courses-desktop-verification.json`.

Live development-Electron validation now also passes on Aula Moodle 4.5.15 with the existing `alumno` test account. Password login, two independent course connections, 24 materials, 26 submitted works, their published grades and feedback, a portfolio copy and restart with encrypted access were verified without renderer errors. Evidence: `test-results/live-student-desktop-verification.json`. The seed data was explicitly authorized and contains no real student attainment. A newly packaged installer and live attachment-file submissions remain unqualified. The earlier account-creation capability blocker was bypassed by using the authorized existing test account; no account or password was changed.

The next functional pass should cover independent Mathematics and Networks connections; introduction plus activity text; activity text released only through submission status; section and label updates, removals and suppression; personal/group file lists; failed or malformed submission responses; credential redaction; schema 12 import and schema 13 round-trip; and rollback at backup limits.

## API references

The fields follow the official Moodle 4.5 implementation of [assignment web services](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/externallib.php), including `activity`, `assignmentdata` and plugin file areas, and the [file submission plugin](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/submission/file/locallib.php). These references define the consumed fields; they do not establish compatibility with every Moodle site or service configuration.
