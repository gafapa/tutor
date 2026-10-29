import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8')), filename = `Tutor-Local-${pkg.version}-Portable.zip`;
const release = JSON.parse(await readFile(`test-results/release-${pkg.version}-verification.json`, 'utf8'));
const proof = JSON.parse(await readFile(`test-results/portable-${pkg.version}-verification.json`, 'utf8'));
const bytes = await readFile(join('release', filename)), sha256 = createHash('sha256').update(bytes).digest('hex');
assert.equal(release.version, pkg.version); assert.equal(proof.version, pkg.version);
for (const receipt of [release.portable, proof.portable]) { assert.equal(receipt.bytes, bytes.length); assert.equal(receipt.sha256, sha256); }
for (const flag of ['zipIntegrity', 'extractedZipExecuted', 'noPasswordRequired', 'plainEducationalHistory', 'movedFolderReopened', 'portableDataPaths', 'actualBundledSemanticModelBeforeAndAfterMove']) assert.equal(proof[flag], true, flag);
for (const flag of ['sourceModulesMatch', 'rendererAssetsMatch', 'multimodalCaptureWorkflow', 'semanticAssetsVerified', 'pdfTextAndRenderVerified']) assert.equal(release[flag], true, flag);
assert.ok(release.domainTests > 0 && release.packagedChecks > 0); assert.equal(release.packagedChecks, release.checks.length); assert.ok(release.checks.includes('portable'));
assert.equal((await readFile(join('release', filename + '.sha256'), 'utf8')).trim(), `${sha256}  ${filename}`);
const sourceCommit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); assert.match(sourceCommit, /^[a-f0-9]{40}$/);
const sourceWorkingTreeDirty = process.env.GITHUB_ACTIONS === 'true' ? false : Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
const directory = 'release/distribution'; await mkdir(directory, { recursive: true });
await copyFile(join('release', filename), join(directory, filename)); await writeFile(join(directory, filename + '.sha256'), `${sha256}  ${filename}\n`);
await writeFile(join(directory, 'verification.json'), JSON.stringify({ version: pkg.version, checkedAt: release.checkedAt, sourceCommit, sourceWorkingTreeDirty, portable: { filename, bytes: bytes.length, sha256 }, domainTests: release.domainTests, packagedChecks: release.packagedChecks, checks: release.checks, movedFolderReopened: true, passwordEncryptedData: false, plainEducationalHistory: true, differentWindowsAccountOrComputer: false, codeSigned: false }, null, 2) + '\n');
await writeFile(join(directory, 'release-notes.md'), `Tutor Local ${pkg.version} - Windows x64 portable alpha\n\nExtract **${filename}** completely and open **Tutor Local.exe**. No installation or workspace password is required. Moodle onboarding starts first. The connector is read-only.\n\nEducational history is readable SQLite in Data. Credentials are protected separately by the Windows account/computer; reconnect after moving to another account or PC. This alpha does not migrate older encrypted profiles. Keep independent backups; backup encryption is optional.\n\nIncludes semantic search, document preparation and the local AI engine. Six optional local models include Gemma 4 E2B/E4B for text and images; their downloads include the required visual projector. There is no separate OCR engine. Claude/Codex account integrations use separately installed official native executables, explicit context consent and the user's own plan.\n\nQualification: ${release.domainTests} domain tests and ${release.packagedChecks} packaged workflows. The actual ZIP ran and reopened after relocation on this Windows host. The bundled semantic model ran before/after relocation. A second account/computer and clean Windows remain unverified. The binary is unsigned.\n\nSource base: ${sourceCommit}.${sourceWorkingTreeDirty ? ' Includes uncommitted changes.' : ''} No publication is performed by this command.\n`);
console.log(`Verified portable distribution prepared: ${filename}, ${bytes.length} bytes, SHA-256 ${sha256}.`);
