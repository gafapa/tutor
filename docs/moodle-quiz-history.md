# Moodle quiz attempt history

The Windows application reads the connected student's quiz attempt metadata and permitted reviews. It adds only `mod_quiz_get_user_attempts` and `mod_quiz_get_attempt_review` to its REST allowlist. It never starts, resumes, answers, submits or finishes a quiz. Teacher and other students' attempts are rejected.

The API behavior is checked against Moodle's [4.5 quiz external implementation](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/quiz/classes/external.php) and the pinned local Moodle installation used by the regression fixture.

Only finished attempts request a review. In-progress, overdue and abandoned attempts retain metadata without question or response content. Moodle controls review access. A permission denial clears the latest review content; a temporary review failure explicitly labels an earlier permitted copy as cached. Existing local versions and independent portfolio copies remain historical snapshots, including after credentials are removed.

The parser converts question HTML, visible text responses, checked choices, selected options and permitted feedback into plain text. It does not execute HTML, retrieve question images or attachments, or reconstruct interactive question types. Hidden fields and password controls are excluded. The scaled `grade` returned by the review endpoint is ignored because it is not a visibility signal. Only the permission-filtered `attempt.sumgrades` becomes published raw points; this is not a grade out of ten.

The detail dialog separates the selected local version from the selected Moodle attempt. A finished review can be copied with a personal reflection to the portfolio. The copy identifies its source, attempt, local version and import date. It creates no mastery evidence and does not change the linked plan task. Only the latest Moodle attempt controls that task unless the student has overridden its status.

Limits: 100 attempts per quiz, 300 questions per review, two million characters across a quiz's reviews and ten MiB of review characters per synchronization. Portfolio copies reject content above 50,000 characters rather than truncating it. Portable backups use schema 16 and migrate supported older versions without fabricating reviews. Version 0.15 cannot read a schema 16 profile; preserve an older backup when downgrading.

Tests distinguish unit/REST doubles from a real isolated Moodle 4.5 installation. Quiz qualification uses synthetic local attempts. Existing Aula assignment data is retained; this increment does not create quiz attempts on Aula.
