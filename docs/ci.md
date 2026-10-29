# GitHub Actions verification

The [workflow](https://github.com/gafapa/tutor/actions/workflows/tests.yml) runs on pushes to main, pull requests, stable version tags and manual dispatch. It uses Node.js 24, lockfile installs and official actions pinned by SHA. This configuration does not establish that hosted CI has run successfully for the current workspace.

## Domain and build

Ubuntu 24.04 and Windows Server 2025 run the domain tests, dependency audit and TypeScript/Vite build. Linux domain/build checks do not qualify a Linux desktop distribution.

## Windows portable qualification

The Windows job prepares pinned native runtimes, OCR and semantic models, a local synthetic Moodle installation and the Qwen test model. It verifies the real Moodle connector, builds the portable ZIP and runs the release verifier. The release verifier checks source/archive equality, included native resources, domain tests, 24 packaged functional workflows, including the guided learning cycle, report PDF text/rendering and the new portable ZIP workflow. The latter extracts and runs the actual deliverable, tests password confirmation and wrong-password preservation, moves its folder and runs the bundled semantic model again. No real student credentials or external AI services are used.

PHP 8.3.35 and MariaDB 11.4.13 downloads are checksum-verified. Moodle is pinned to commit 1990fc9201b23e0b0c8fdc44d537840a85d73503. Other preparers verify their model/runtime manifests. Qwen requires approximately 1.12 GB on the first download.

The portable-windows artifact retains the verified ZIP, SHA-256, English notes and a sanitized verification manifest for 30 days. Synthetic reports, logs, screenshots and PDF previews are retained for seven days. Download caches exclude profiles, tokens and keys. See [portable operation](windows-portable.md) for local commands and the optional legacy installer path.

## Publishing

Publishing requires an explicitly authorized commit and a stable tag matching package.json and its lockfile. The tag workflow rebuilds and qualifies the artifact, then a separate job with contents:write rechecks its hash, version, commit and portable evidence before uploading a draft and publishing it. Existing releases are never overwritten. Pull requests cannot publish. The build remains unsigned and does not add automatic updates.

## Limits

The runner is a Windows image with development tools. A moved folder on the same host does not establish operation on another Windows account/computer or a clean consumer installation. These checks do not establish pedagogical validity, real handwriting accuracy or completion of every tracked requirement. Local qualification and screenshots are recorded separately from hosted CI.
