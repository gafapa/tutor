import { _electron as electron } from 'playwright';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const pkg = JSON.parse(await readFile('package.json', 'utf8')), verification = JSON.parse(await readFile(`test-results/release-${pkg.version}-verification.json`, 'utf8'));
const installerBytes = await readFile(verification.installer.path); assert.equal(createHash('sha256').update(installerBytes).digest('hex'), verification.installer.sha256);
const root = resolve('.tools/installer-test', randomUUID()), target = join(root, 'app'), dataDirectory = join(root, 'profile'); await mkdir(root, { recursive: true });
const run = action => new Promise((resolveResult, reject) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('scripts/installer-test.ps1'), '-Action', action, '-Target', target, '-DataDirectory', dataDirectory], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [], err = []; child.stdout.on('data', bytes => out.push(bytes)); child.stderr.on('data', bytes => err.push(bytes)); child.once('error', reject);
  child.once('exit', code => { if (code) reject(new Error(Buffer.concat(err).toString('utf8').slice(0, 1200) || 'La instalación de prueba no terminó.')); else resolveResult(JSON.parse(Buffer.concat(out).toString('utf8').trim())); });
});
let installed = false, app;
const proof = { checkedAt: new Date().toISOString(), version: pkg.version, installerSha256: verification.installer.sha256, mode: 'silent install on current Windows host', cleanWindows: false, interactiveWizard: false };
try {
  proof.install = await run('install'); installed = true; console.log('Instalador real: instalación silenciosa completada en la carpeta de pruebas.');
  assert.ok(proof.install.desktopShortcut && proof.install.startMenuShortcut);
  assert.ok((await readFile(join(target, 'resources/app.asar'))).equals(await readFile('release/win-unpacked/resources/app.asar')));
  const env = { ...process.env, TUTOR_DATA_DIR: dataDirectory, TUTOR_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: join(target, 'Tutor Local.exe'), env, timeout: 60000 }); const window = await app.firstWindow();
  await window.getByRole('heading', { name: 'Aprender empieza' }).waitFor();
  const subject = await window.evaluate(() => window.tutor.createDemo()); await window.evaluate(subjectId => window.tutor.addNote({ subjectId, name: 'Fracciones instaladas', text: 'Las fracciones expresan partes de un todo. El numerador cuenta las partes tomadas y el denominador las divisiones iguales.' }), subject.id);
  const result = await window.evaluate(subjectId => window.tutor.semanticSearch({ subjectId, query: '¿Cómo representar una porción de pizza?', scope: 'materials', conceptId: null, outcome: 'all', since: null, until: null, order: 'relevance', page: 1 }), subject.id);
  assert.ok(result.hits.some(hit => hit.title === 'Fracciones instaladas'));
  proof.startedWithPrivateTestProfile = true; proof.actualInstalledSemanticModel = true; proof.installedAsarMatchesVerifiedRelease = true;
  await app.close(); app = undefined;
} finally {
  await app?.close().catch(() => {});
  if (installed) { proof.uninstall = await run('uninstall'); assert.ok(proof.uninstall.profilePreserved); console.log('Desinstalación silenciosa completada; el historial de pruebas se conserva.'); }
}
await writeFile(`test-results/installer-${pkg.version}-verification.json`, JSON.stringify(proof, null, 2)); console.log('Prueba del instalador terminada. Windows limpio y asistente interactivo siguen sin verificar.');
