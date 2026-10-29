# Live Moodle test fixtures

Target: `https://aula.gallego.top`. Mathematics (`TUTOR-LOCAL-MATH-TEST`) and Networks (`TUTOR-LOCAL-NET-TEST`) are independent Moodle courses. The existing test account `alumno` is enrolled in both. No student password or token is included.

Each course contains four topic sections. Each section provides a substantial Spanish reading page, a worked example, downloadable UTF-8 notes and three online-text assignments with four prompts each. That is 48 exercises and one integrative final project per course: 96 exercises and two projects overall. The exercises cover procedures, explanation, error diagnosis, comparison, modelling and transfer. Assignment grading uses a shared ten-point rubric and requires human review; no automatic grading is implied.

The `course.json` manifest is the provisioning source. Topic materials live in `mathematics/unit-01` through `unit-04` and `networks/unit-01` through `unit-04`. Legacy introductory files are retained as source history but are not published by the expanded manifest. Due dates are relative to provisioning: topic work is staggered over four weeks, with projects due after 35 days.

The output uses the `universal-html` profile for Moodle Page content: semantic HTML, no JavaScript, remote assets, iframe or MoodlIA runtime dependency. Each topic also includes a text resource. Networks reference sources: [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918) for private IPv4 ranges and [RFC 4632](https://www.rfc-editor.org/rfc/rfc4632) for CIDR. Conventional usable-host calculations in these exercises apply to /24 through /30; /31 and /32 require separate treatment.

Provisioning requires authorized site credentials and live capability checks through the MoodlIA CLI. Do not commit passwords, tokens or cookies. Store sanitized identifiers and readback evidence under ignored `test-results/`; protect student credentials outside the repository. Record course creation, content readback, student creation and student access independently. Static validation does not establish site sanitization, backup/restore portability or tutoring quality.

## Live status on 2026-10-28

- Mathematics: [course 9](https://aula.gallego.top/course/view.php?id=9), four topic sections, four Pages, four File resources and thirteen online-text assignments.
- Networks: [course 10](https://aula.gallego.top/course/view.php?id=10), the same resource and assignment counts in an independent course.
- Exact Page HTML and all assignment prompts were read back through the MoodlIA CLI. The eight File resources match the local byte lengths and SHA-1 content hashes returned by Moodle. All eight topic packages passed the portable-content static validator.
- The initial mixed-subject sections were removed after checking their recorded identities and confirming that the test course had no enrolled users. The initial sanitized receipt was retained.
- The user supplied access to the existing `alumno` test account (user id 4). Its password login succeeded, and its student enrolment in courses 9 and 10 was verified through the MoodlIA CLI. No account creation or password change was needed.
- Live backend verification with this student's mobile-service token imported both courses into independent local subjects: 13 assignments and 12 materials per course, including four downloaded text files per course. All complete assignment prompts matched the manifest. Both synchronizations completed successfully with all scopes available and no warnings. Export excluded credentials, and restoration required reconnection. No activity was submitted or graded.
- Subsequently, at the user's explicit request, all 26 online-text assignments were submitted by `alumno` and evaluated from the authorized teacher account. Saved grades range from 4.5 to 10 out of 10, with comments and criterion totals verified as visible to the student. `submissions.json` contains the deliberately varied synthetic answers and evaluations; `test-results/live-moodle-assessments.json` records the remote readback evidence. These results are test fixtures, not evidence of a real student's attainment.

Ignored evidence: `test-results/live-moodle-lab-expanded.json`, `test-results/moodle-expanded-content-readback.json` and `test-results/live-student-moodle-verification.json`. The last receipt verifies live student synchronization; none establishes tutoring quality or a packaged-installer qualification.

## Additional attachment fixture on 2026-10-29

`attachments.json` describes a supplemental technical assignment in Mathematics section 4, with one TXT original, online text, and a synthetic 10/10 evaluation. The live assignment is module 183 (assignment 94). Mathematics now has fourteen assignments; Networks retains thirteen. The original 26 answers, grades and feedback were preserved. File-submission defaults allow one file, so this fixture deliberately supplies one original.

The packaged Windows app authenticated as the existing student, imported both courses and the TXT, verified SHA-256 against `attachments/response.txt`, retained encrypted access and data after restart, then disconnected both courses and previewed/exported the original without credentials. Exported bytes matched the source exactly. The 24 course materials remain separate from this student's attachment. Ignored evidence: `test-results/live-moodle-attachments.json`, `test-results/live-student-packaged-desktop-verification.json` and `test-results/live-student-packaged-attachment-offline.png`.

To repeat the read-only app flow, provide the authorized student's password through `TUTOR_LIVE_STUDENT_PASSWORD` in the process environment and run `node scripts/smoke-moodle-live.mjs --packaged`. The script consumes and removes that variable before launching Electron; never put the password in command arguments or a file. Live provisioning and grading are separate development operations and are not application features.

## Windows 0.15 readback

The packaged 0.15 app repeated the live read-only flow successfully. Its versioned receipt is `test-results/live-student-packaged-0.15.0-desktop-verification.json`. Historical-attempt import was separately qualified with two attempts created in the isolated local Moodle fixture before connection; no live Aula submission was reopened or changed for that test.
