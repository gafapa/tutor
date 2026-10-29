import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

if (!process.argv.includes('--installer')) { await import('./prepare-portable-distribution.mjs'); process.exit(0); }

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'La distribución requiere una versión numérica estable.');
const filename = `Tutor-Local-${pkg.version}-Instalador.exe`;
const release = JSON.parse(await readFile(`test-results/release-${pkg.version}-verification.json`, 'utf8'));
const installed = JSON.parse(await readFile(`test-results/installer-${pkg.version}-verification.json`, 'utf8'));
const bytes = await readFile(join('release', filename));
const sha256 = createHash('sha256').update(bytes).digest('hex');
assert.equal(release.version, pkg.version);
assert.equal(installed.version, pkg.version);
assert.equal(release.installer.bytes, bytes.length);
assert.equal(release.installer.sha256, sha256, 'El instalador no coincide con el que superó las pruebas.');
assert.equal(installed.installerSha256, sha256, 'La instalación no se probó con este ejecutable.');
assert.equal((await readFile(join('release', filename + '.sha256'), 'utf8')).trim(), `${sha256}  ${filename}`);
assert.ok(release.domainTests > 0 && release.packagedChecks > 0);
assert.equal(release.packagedChecks, release.checks.length);
for (const flag of ['sourceModulesMatch', 'rendererAssetsMatch', 'ocrAssetsVerified', 'semanticAssetsVerified', 'pdfTextAndRenderVerified']) assert.equal(release[flag], true, flag);
assert.equal(installed.install.exitCode, 0);
assert.equal(installed.uninstall.exitCode, 0);
for (const flag of ['startedWithPrivateTestProfile', 'actualInstalledSemanticModel', 'installedAsarMatchesVerifiedRelease']) assert.equal(installed[flag], true, flag);
assert.equal(installed.uninstall.removed, true);
assert.equal(installed.uninstall.profilePreserved, true);

const sourceCommit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.match(sourceCommit, /^[a-f0-9]{40}$/);
const workflowUrl = process.env.GITHUB_ACTIONS === 'true'
  ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
const sourceWorkingTreeDirty = process.env.GITHUB_ACTIONS === 'true' ? false : Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
const manifest = {
  version: pkg.version, sourceCommit, sourceWorkingTreeDirty, workflowUrl, checkedAt: release.checkedAt,
  installer: { filename, bytes: bytes.length, sha256 },
  domainTests: release.domainTests, packagedChecks: release.packagedChecks, checks: release.checks,
  silentInstallAndUninstall: true, profilePreservedOnUninstall: true,
  codeSigned: release.codeSigned, cleanWindows: installed.cleanWindows, interactiveWizard: installed.interactiveWizard,
  fullRequirementCount: release.fullRequirementCount, remainingScope: release.remainingScope
};
const directory = 'release/distribution';
await mkdir(directory, { recursive: true });
await copyFile(join('release', filename), join(directory, filename));
await writeFile(join(directory, filename + '.sha256'), `${sha256}  ${filename}\n`);
await writeFile(join(directory, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(directory, 'release-notes.md'), `Tutor Local ${pkg.version} for 64-bit Windows, in development.\n\nOpen **${filename}** and follow the Spanish installer. Python, Node.js and Ollama are not required. Student data stays on the local computer.\n\nIncludes local OCR, semantic search and the AI engine. Activating Qwen tutoring requires an optional download of approximately 1.12 GB; inference then works offline.\n\nVerification: ${release.domainTests} domain tests, ${release.packagedChecks} packaged workflows and silent installation/uninstallation on the current Windows host. The SHA-256 and verification manifest accompany the installer.${workflowUrl ? ` [GitHub Actions run](${workflowUrl}).` : ''}\n\nSource: ${sourceCommit}.${sourceWorkingTreeDirty ? ' This local build includes uncommitted workspace changes; the commit identifies its base, not the complete source.' : ''}\n\nCode signing, the interactive installer wizard on clean Windows, and pedagogical validation with real students remain outside this qualification. See the [current product scope](https://github.com/gafapa/tutor/blob/main/docs/product-scope.md).\n`);
console.log(`Distribución ${pkg.version} preparada: ${filename}, ${bytes.length} bytes, SHA-256 ${sha256}.`);
