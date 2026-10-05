import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

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
const manifest = {
  version: pkg.version, sourceCommit, workflowUrl, checkedAt: release.checkedAt,
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
await writeFile(join(directory, 'release-notes.md'), `Tutor Local ${pkg.version} para Windows de 64 bits, en desarrollo.\n\nDescarga **${filename}** y abre el asistente en castellano. No necesitas Node.js, Python ni Ollama. Los datos del alumno permanecen en su ordenador.\n\nIncluye OCR, búsqueda semántica y el motor de IA local. Para activar la tutoría con Qwen, la app ofrece una descarga opcional de aproximadamente 1,12 GB; después funciona sin Internet.\n\nVerificación: ${release.domainTests} pruebas de dominio, ${release.packagedChecks} recorridos de la app empaquetada e instalación/desinstalación silenciosa. Adjuntos: instalador, SHA-256 y comprobante con el commit de origen.${workflowUrl ? ` [Ejecución de GitHub Actions](${workflowUrl}).` : ''}\n\nEsta versión todavía no tiene firma digital. El asistente interactivo en un Windows limpio y la validación pedagógica con alumnos reales siguen pendientes. Consulta el [alcance de los 80 requisitos](https://github.com/gafapa/tutor/blob/v${pkg.version}/docs/requirements.md).\n`);
console.log(`Distribución ${pkg.version} preparada: ${filename}, ${bytes.length} bytes, SHA-256 ${sha256}.`);
