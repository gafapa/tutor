# Student-first product scope

Effective 2026-10-28, Tutor Local is a personal learning companion for the student. This decision supersedes the teacher-facing scope in earlier requirement and release notes.

## Distribution and integration boundaries

Tutor Local is distributed as a portable local desktop executable in a ZIP for 64-bit Windows. No installation is required; the complete program folder includes its password-protected workspace in `Data`. See [portable operation and migration](windows-portable.md). A website, hosted application, mobile version, and PWA are outside scope. AI inference, OCR, semantic search, and educational data remain local.

Moodle is the only supported learning platform and the only learning-platform integration on the roadmap. Google Classroom, Open edX, Drive connectors, and a general plugin ecosystem are outside scope. The Moodle connector remains read-only for the student's own courses. Each subject belongs to a separate Moodle course; topic sections organize content within that subject. Provisioning synthetic Moodle test courses through an administrator's MoodlIA CLI is development tooling, not a teacher or administration feature in Tutor Local.

## Primary user

The student organizes subjects and materials, studies with the local tutor, practices, reviews evidence, sets goals, and decides the next step. Planning, explanations, practice, and progress views serve that personal learning process.

Teacher names, course instructions, feedback, grades, and materials may remain as context entered by the student or imported from Moodle. They do not establish a teacher account or access to the student's local workspace.

The application cannot create or edit anything in Moodle. Student-created tasks, portfolio selections and reflections belong only to the encrypted local workspace. The enforced [read-only connector boundary](moodle-read-only-boundary.md) is independent of any write permissions that the Moodle service might advertise.

## Reports and family involvement

Reports primarily help the student understand progress, difficulties, useful strategies, and next steps. The student may choose to export a report for their parents or family to support a conversation about learning.

Family sharing is optional and manual. Before export, the interface explains that the selected report includes exercises and personal reflections. The student chooses the report, format, destination, and whether to share the resulting file. Creating an automatic weekly summary only saves it locally; it does not send it to anyone.

There is no automatic delivery, family account, remote family dashboard, or access to the full history. Teacher reports, teacher dashboards, class analytics, teacher permissions, and teacher-controlled assessments are outside the product scope.

## Learning activities

Mock exams are personal practice. Tutor modes and help settings support student autonomy. They are not institutional examination controls or policies configured by a teacher.

## Requirement tracking

The historical 80 requirement identifiers are retained for traceability. Requirements 36, 37, and 48 are outside scope. Requirements 3, 4, and 73 cover Moodle only; requirement 44 covers local engines rather than cloud AI providers. Requirements 51, 52, 53, and 55 are interpreted around personal use, optional family sharing, and independent practice. These changes do not count excluded features as implemented.

Future work should prioritize the student's learning experience, reliable evidence, understandable feedback, accessible use, local privacy, and durable data. Optional family summaries must preserve the student's control over what leaves the application.
