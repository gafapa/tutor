# Documentation

Read [Moodle-first alpha](moodle-first-alpha.md) for the current onboarding, programme PDF, storage and AI-account contract. Historical verification records keep their original claims.

## Scope and development

- [Product scope](product-scope.md): student-first, local executable, Moodle only, optional family sharing.
- [Requirements](requirements.md): stable identifiers, implementation evidence and remaining work.
- [Development and repository hygiene](development.md): setup, checks, generated files and cleanup.
- [CI](ci.md): hosted checks, artifacts and the separate release process.

## Portable operation and data safety

- [Windows portable](windows-portable.md): first launch, storage, movement and updates.
- [Backup safety](backup-safety.md): restoration limits and transactional validation.
- [Read-only Moodle boundary](moodle-read-only-boundary.md): enforced allowlist and local-only actions.

## Learning and Moodle workflows

- [Student experience and curriculum support](student-experience.md).

- [Guided learning cycle](guided-learning-cycle.md).
- [Course setup](moodle-course-setup.md) and [supported content](moodle-content-development.md).
- [Assignment attempt history](moodle-attempt-history.md) and [quiz review history](moodle-quiz-history.md).
- [Attempt comparison](moodle-attempt-comparison.md) and [comparison reflections](moodle-comparison-reflections.md).
- [Submission copies in the portfolio](moodle-submission-portfolio.md).
- [Portfolio practice tasks](portfolio-practice-tasks.md).

## Qualification records

Start with [Windows 0.23.1 portable layout](windows-0.23.1-verification.md) and the [0.23 student-feature verification](windows-0.23-verification.md). The [verification history](verification-history.md) links previous records and distinguishes historical installer checks from the portable ZIP. Local receipts/screenshots remain in ignored development directories; tracked documents summarize their scope and limits. Historical build provenance is preserved after later source commits.

The [synthetic Moodle fixture guide](../tests/fixtures/moodle-live/README.md) describes test courses and deliberately varied example answers. Course provisioning/grading are separate authorized development operations; Tutor Local cannot perform them.
