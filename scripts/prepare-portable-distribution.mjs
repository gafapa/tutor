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
for (const flag of ['zipIntegrity', 'extractedZipExecuted', 'passwordSetupConfirmation', 'wrongPasswordPreservesData', 'movedFolderReopened', 'portableDataPaths', 'noWindowsKey', 'actualBundledSemanticModelBeforeAndAfterMove']) assert.equal(proof[flag], true, flag);
for (const flag of ['sourceModulesMatch', 'rendererAssetsMatch', 'ocrAssetsVerified', 'semanticAssetsVerified', 'pdfTextAndRenderVerified']) assert.equal(release[flag], true, flag);
assert.ok(release.domainTests > 0 && release.packagedChecks > 0); assert.equal(release.packagedChecks, release.checks.length); assert.ok(release.checks.includes('portable'));
assert.equal((await readFile(join('release', filename + '.sha256'), 'utf8')).trim(), `${sha256}  ${filename}`);
const sourceCommit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); assert.match(sourceCommit, /^[a-f0-9]{40}$/);
const sourceWorkingTreeDirty = process.env.GITHUB_ACTIONS === 'true' ? false : Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
const directory = 'release/distribution'; await mkdir(directory, { recursive: true });
await copyFile(join('release', filename), join(directory, filename)); await writeFile(join(directory, filename + '.sha256'), `${sha256}  ${filename}\n`);
await writeFile(join(directory, 'verification.json'), JSON.stringify({ version: pkg.version, checkedAt: release.checkedAt, sourceCommit, sourceWorkingTreeDirty, portable: { filename, bytes: bytes.length, sha256 }, domainTests: release.domainTests, packagedChecks: release.packagedChecks, checks: release.checks, movedFolderReopened: true, passwordEncryptedData: true, differentWindowsAccountOrComputer: false, codeSigned: false }, null, 2) + '\n');
await writeFile(join(directory, 'release-notes.md'), `Tutor Local ${pkg.version} for 64-bit Windows, portable development build.\n\nExtract **${filename}** completely to a writable folder and open **Tutor Local.exe**. Choose a password at first launch; the complete Data folder then moves with the program. No installation or administrator account is required. Keep independent backups and the password: it cannot be recovered.\n\nIncludes local OCR, semantic search and the AI engine. Optional Qwen tutoring needs a separate approximately 1.12 GB model download, stored in Data/models. Moodle is read-only.\n\nTo migrate installed data, export an encrypted backup from the installed app and restore it in the new portable app. Reconnect Moodle; backups exclude credentials. For updates, extract a fresh release and copy the complete Data folder with both apps closed, preserving the old folder until verification succeeds.\n\nQualification: ${release.domainTests} domain tests and ${release.packagedChecks} packaged workflows. The actual extracted ZIP was executed, moved to another path and reopened; the bundled semantic model ran before and after the move. Wrong passwords preserved the data. The different-computer/account path is cryptographically independent of Windows DPAPI and covered by local tests, but was not exercised on a second computer/account. The binary is unsigned.\n\nSource base: ${sourceCommit}.${sourceWorkingTreeDirty ? ' This local build includes uncommitted changes.' : ''} No publication is performed by this command.\n`);
console.log(`Verified portable distribution prepared: ${filename}, ${bytes.length} bytes, SHA-256 ${sha256}.`);
