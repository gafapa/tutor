import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const prepare = resolve('scripts/prepare-distribution.mjs'), publish = resolve('scripts/publish-release.mjs');
const version = '0.13.0', filename = `Tutor-Local-${version}-Instalador.exe`, sourceCommit = 'a'.repeat(40);
async function fixture() {
  const directory = resolve('.tools/distribution-tests', randomUUID());
  await mkdir(join(directory, 'release'), { recursive: true });
  await mkdir(join(directory, 'test-results'));
  const bytes = Buffer.from('synthetic installer fixture'), sha256 = createHash('sha256').update(bytes).digest('hex');
  const release = {
    version, checkedAt: '2026-10-06T00:00:00Z', installer: { bytes: bytes.length, sha256 },
    domainTests: 3, packagedChecks: 1, checks: ['desktop'], sourceModulesMatch: true, rendererAssetsMatch: true,
    ocrAssetsVerified: true, semanticAssetsVerified: true, pdfTextAndRenderVerified: true,
    codeSigned: false, fullRequirementCount: 80, remainingScope: 'active', privateField: 'PRIVATE_REPORT_DATA'
  };
  const installed = {
    version, installerSha256: sha256, install: { exitCode: 0, target: 'PRIVATE_PROFILE_PATH' },
    uninstall: { exitCode: 0, removed: true, profilePreserved: true },
    startedWithPrivateTestProfile: true, actualInstalledSemanticModel: true, installedAsarMatchesVerifiedRelease: true,
    cleanWindows: false, interactiveWizard: false
  };
  await writeFile(join(directory, 'package.json'), JSON.stringify({ version }));
  await writeFile(join(directory, 'release', filename), bytes);
  await writeFile(join(directory, 'release', filename + '.sha256'), `${sha256}  ${filename}\n`);
  const save = async () => {
    await writeFile(join(directory, 'test-results', `release-${version}-verification.json`), JSON.stringify(release));
    await writeFile(join(directory, 'test-results', `installer-${version}-verification.json`), JSON.stringify(installed));
  };
  await save();
  const env = { ...process.env, GITHUB_SHA: sourceCommit, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'gafapa/tutor', GITHUB_RUN_ID: '123', GH_TOKEN: 'synthetic-unused-token', GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: `v${version}`, GITHUB_REF: `refs/tags/v${version}` };
  const run = (script = prepare, overrides = {}) => spawnSync(process.execPath, [script], { cwd: directory, env: { ...env, ...overrides }, encoding: 'utf8' });
  return { directory, bytes, release, installed, save, run };
}

test('la descarga conserva el ejecutable probado y excluye datos privados del comprobante', async () => {
  const f = await fixture(), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const distribution = join(f.directory, 'release/distribution');
  assert.deepEqual((await readdir(distribution)).sort(), [filename, filename + '.sha256', 'release-notes.md', 'verification.json'].sort());
  assert.deepEqual(await readFile(join(distribution, filename)), f.bytes);
  const text = await readFile(join(distribution, 'verification.json'), 'utf8'), manifest = JSON.parse(text);
  assert.equal(manifest.sourceCommit, sourceCommit);
  assert.equal(manifest.cleanWindows, false);
  assert.equal(manifest.interactiveWizard, false);
  assert.equal(manifest.codeSigned, false);
  assert.ok(!text.includes('PRIVATE_'));
});

test('un instalador modificado después de las pruebas no se prepara para distribuir', async () => {
  const f = await fixture();
  await writeFile(join(f.directory, 'release', filename), Buffer.from('tampered installer fixture'));
  assert.notEqual(f.run().status, 0);
  await assert.rejects(access(join(f.directory, 'release/distribution')));
});

test('la distribución exige probar ese instalador y conservar el perfil tras desinstalar', async () => {
  const f = await fixture();
  f.installed.installerSha256 = 'b'.repeat(64); await f.save();
  assert.notEqual(f.run().status, 0);
  f.installed.installerSha256 = f.release.installer.sha256;
  f.installed.uninstall.profilePreserved = false; await f.save();
  assert.notEqual(f.run().status, 0);
  await assert.rejects(access(join(f.directory, 'release/distribution')));
});

test('la publicación rechaza etiquetas y commits distintos antes de llamar a GitHub', async () => {
  const f = await fixture(); assert.equal(f.run().status, 0);
  const tag = f.run(publish, { GITHUB_REF_NAME: 'v0.14.0', GITHUB_REF: 'refs/tags/v0.14.0' });
  assert.notEqual(tag.status, 0); assert.match(tag.stderr, /refs\/tags\/v0\.14\.0/);
  const commit = f.run(publish, { GITHUB_SHA: 'b'.repeat(40) });
  assert.notEqual(commit.status, 0); assert.match(commit.stderr, /otro commit/);
});

test('la publicación vuelve a comprobar el ejecutable descargado del artefacto', async () => {
  const f = await fixture(); assert.equal(f.run().status, 0);
  const tampered = Buffer.from(f.bytes); tampered[0] ^= 1;
  await writeFile(join(f.directory, 'release/distribution', filename), tampered);
  const result = f.run(publish);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /artefacto descargado no coincide/);
});
