# Offline Moodle attempt comparison

Version 0.17 adds an optional comparison inside the existing Moodle activity detail. It uses only attempts already stored in the selected local version. Opening a comparison makes no network request and creates or modifies no learning records.

For assignments, the student can compare the latest submission with earlier attempts, including their matching comments, submission state, date, personal/group context and attachment references. Attachment bytes are not compared. Numerical historical assignment grades are not invented from comments or the current gradebook.

For quizzes, only finished attempts with a nonempty, previously permitted review are eligible. Active, abandoned, restricted and unavailable reviews are excluded. Cached reviews are labeled. Points remain permission-filtered raw attempt points, not a scaled final grade. A historical local version represents what Moodle permitted when it was downloaded.

The default view shows complete original texts and comments. The student can switch to exact line changes, select either attempt and return to the originals. Narrow windows stack the two columns. Identical selections produce an explanation instead of a comparison.

The line comparison normalizes line endings but preserves indentation, blank lines, accents and repeated lines. It uses a bounded longest-common-subsequence matrix, limited to 500 lines and 50,000 JavaScript string characters per text. Over-limit comparisons show an explicit message; they do not truncate or compare partial documents. Complete large originals remain available in read-only text fields.

Added or removed text is not evidence of learning improvement, correctness or mastery. Viewing a comparison does not call AI, recalculate estimates, complete tasks, create portfolio entries or upload anything to Moodle. Version 0.18 adds an explicit [save comparison and reflection](moodle-comparison-reflections.md) action. Existing attempt detail actions can still save an individual response and reflection to the portfolio.

No migration is required; storage and portable backups remain schema 16. The comparison is computed from immutable activity data, and its temporary view selections are not saved.

Verification distinguishes unit tests from a real isolated Moodle 4.5 workflow. The latter creates two graded assignment attempts and two finished quiz attempts before connecting, disconnects credentials, stops the Moodle web server, then compares responses, comments and quiz reviews. It checks responsive columns, same-attempt handling, restart and unchanged source/task/portfolio/evidence records. Run `npm run test:moodle:comparison` or `node scripts/smoke-moodle-comparison.mjs --packaged`.
