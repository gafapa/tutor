import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
assert.equal(process.env.GITHUB_REF, `refs/tags/v${pkg.version}`);
assert.equal(tag, `v${pkg.version}`, 'La etiqueta debe coincidir con package.json.');
assert.ok(process.env.GH_TOKEN, 'Falta el token de publicación de GitHub.');
assert.match(process.env.GITHUB_REPOSITORY || '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const directory = 'release/distribution';
const manifest = JSON.parse(await readFile(join(directory, 'verification.json'), 'utf8'));
const filename = `Tutor-Local-${pkg.version}-Instalador.exe`;
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.sourceCommit, process.env.GITHUB_SHA, 'El artefacto pertenece a otro commit.');
assert.equal(manifest.installer.filename, filename);
const bytes = await readFile(join(directory, filename));
const sha256 = createHash('sha256').update(bytes).digest('hex');
assert.equal(bytes.length, manifest.installer.bytes);
assert.equal(sha256, manifest.installer.sha256, 'El artefacto descargado no coincide con el probado.');
assert.equal((await readFile(join(directory, filename + '.sha256'), 'utf8')).trim(), `${sha256}  ${filename}`);
assert.equal(manifest.silentInstallAndUninstall, true);
assert.equal(manifest.profilePreservedOnUninstall, true);
assert.ok(manifest.domainTests > 0 && manifest.packagedChecks > 0);
assert.equal(manifest.packagedChecks, manifest.checks.length);

const gh = args => execFileSync('gh', args, { stdio: 'inherit' });
// El borrador se publica solo después de subir todos los adjuntos; nunca se reemplazan versiones existentes.
gh(['release', 'create', tag, join(directory, filename), join(directory, filename + '.sha256'),
  join(directory, 'verification.json'), '--repo', process.env.GITHUB_REPOSITORY,
  '--verify-tag', '--draft', '--title', `Tutor Local ${pkg.version}`, '--notes-file', join(directory, 'release-notes.md')]);
gh(['release', 'edit', tag, '--repo', process.env.GITHUB_REPOSITORY, '--draft=false', '--latest']);
