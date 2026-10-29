# Moodle read-only boundary

The application only retrieves the connected student's Moodle data. It has no application flow for creating or editing Moodle courses, users, activities, files, answers, submissions or grades. Personal tasks, portfolio copies, reflections and learning records are stored locally and are never synchronized back to Moodle.

`electron/moodle.ts` allows only these REST functions:

- `core_webservice_get_site_info`
- `core_enrol_get_users_courses`
- `core_course_get_contents`
- `mod_assign_get_assignments`
- `mod_assign_get_submission_status`
- `gradereport_user_get_grade_items`
- `mod_page_get_pages_by_courses`
- `mod_quiz_get_user_attempts`
- `mod_quiz_get_attempt_review`

The connector rejects every other REST function before HTTP, even if the authenticated service advertises write permissions. Reserved parameters (`wsfunction`, `wstoken`, `moodlewsrestformat`) cannot be overridden through the function arguments. Password authentication and authorized file downloads use their dedicated existing endpoints; they are not content-upload operations.

Quiz reviews are requested only for finished attempts belonging to the connected student. In-progress answers are not retrieved, created or submitted. The app has no upload, save-submission, submit-for-grading, start-quiz, process-quiz, edit-module, create-course, create-user or save-grade path.

Synthetic Moodle fixture scripts under `scripts/` are development tooling, excluded from the application package. They are not app features. Domain tests explicitly exercise attempted mutation names and reserved-parameter overrides and verify that no HTTP request is sent. Desktop workflows verify independent local tasks and copies without a Moodle connection.
