# Personal practice tasks from portfolio work

Version 0.19 lets a student turn a portfolio work or reflection into a personal study task. Open the portfolio entry, choose **Crear tarea desde este trabajo**, review the title, describe the practice, choose an optional date and allocate 5–120 minutes. The task uses the existing daily planner and task completion controls.

This is a local task, not a Moodle activity. It has no Moodle task ownership or remote submission identifier. Creation, editing, completion and deletion use only the encrypted local store. Marking a task complete records personal activity, not verified practice, mastery or a grade.

The backend accepts the portfolio entry identifier and the student's task fields. It derives the subject and concept references from the actual local entry, checks the task constraints, and captures the complete source title, content, reflection and original entry date. A SHA-256 hash covers those snapshot fields. Renderer-supplied subject or source content is rejected. Works with more than 30 linked concepts are rejected before mutation; the student can instead create a regular task and choose the concepts to practice.

An identical request returns an existing pending task instead of duplicating it. A completed task does not prevent the student from explicitly creating a later practice. Normal task editing preserves the captured source. The plan identifies it as personal work from the portfolio and offers a read-only source viewer.

Removing the portfolio entry detaches the reference and retains the source snapshot with the task, in one local transaction. The deletion dialog explains this retention. To remove the retained snapshot as well, delete the task. Removing the subject removes its tasks. A Moodle disconnection, synchronization or removal cannot turn this task into a Moodle submission or overwrite it.

History and portable backups use schema 17. Supported older backups migrate without inventing source snapshots or additional tasks. Version 0.18 cannot open schema 17 history. Restoration verifies hashes, existing portfolio links and subject ownership, rejects mixed Moodle/personal provenance, and preserves the current profile when validation fails. Detached snapshots remain valid historical context.

Domain tests cover ownership, snapshots, pending-request deduplication, completion without mastery, deletion, migration, malformed restoration and concept limits. The desktop workflow checks creation in the real UI, daily-plan inclusion, source viewing, removal notices, encrypted backup/restore and restart. A real isolated Moodle workflow also creates a local practice from a copied Moodle comparison after credentials have been removed and its web server stopped. Run `npm run test:portfolio:tasks` or `node scripts/smoke-portfolio-tasks.mjs --packaged`.
