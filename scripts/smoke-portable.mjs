import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { link, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url), pkg = JSON.parse(await readFile('package.json', 'utf8'));
const name = `Tutor-Local-${pkg.version}-Portable`, zip = resolve('release', `${name}.zip`), bytes = await readFile(zip), sha256 = createHash('sha256').update(bytes).digest('hex');
const root = resolve('.tools/portable-test', randomUUID()); await mkdir(root, { recursive: true }); await mkdir('test-results', { recursive: true });
execFileSync(require('7zip-bin').path7za, ['t', zip], { windowsHide: true, stdio: 'pipe' });
execFileSync(require('7zip-bin').path7za, ['x', zip, `-o${root}`, '-y'], { windowsHide: true, stdio: 'pipe' });
let folder = join(root, name), app, window;
const env = { ...process.env, TUTOR_SMOKE: '1', TUTOR_DATA_DIR: join(root, 'must-not-use-host-override') }; delete env.ELECTRON_RUN_AS_NODE;
const password = 'Synthetic portable test password', errors = [];
async function moveClosedFolder(source, destination) {
  for (const path of [source, destination]) assert.ok(path.startsWith(root + '\\'), 'Moves must stay in the private Windows test directory.');
  for (let attempt = 0; ; attempt++) {
    try { await rename(source, destination); return; }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 39) throw error;
      await new Promise(resolveResult => setTimeout(resolveResult, 250));
    }
  }
}
const launch = async () => {
  app = await electron.launch({ executablePath: join(folder, 'Tutor Local.exe'), env, timeout: 60000 });
  window = await app.firstWindow(); window.on('pageerror', error => errors.push(error.message)); window.setDefaultTimeout(60000); return window;
};
const unlock = async (existing = true) => {
  await window.getByLabel('Contraseña de la carpeta portable', { exact: true }).fill(password);
  if (!existing) await window.getByLabel('Repite la contraseña', { exact: true }).fill(password);
  const ready = app.waitForEvent('window'); await window.getByRole('button', { name: existing ? 'Abrir mi espacio' : 'Crear mi espacio portable', exact: true }).click();
  window = await ready; window.setDefaultTimeout(60000); window.on('pageerror', error => errors.push(error.message)); await window.waitForFunction(() => Boolean(window.tutor));
};
try {
  assert.ok((await readFile(join(folder, 'resources/app.asar'))).equals(await readFile('release/win-unpacked/resources/app.asar')));
  await assert.rejects(stat(join(folder, 'Data')));
  await launch(); await window.getByRole('heading', { name: 'Prepara tu espacio portable.', exact: true }).waitFor();
  await window.getByLabel('Contraseña de la carpeta portable', { exact: true }).fill(password); await window.getByLabel('Repite la contraseña', { exact: true }).fill('Mismatched synthetic password'); await window.getByRole('button', { name: 'Crear mi espacio portable', exact: true }).click(); await window.getByRole('alert').getByText('Las contraseñas no coinciden.', { exact: true }).waitFor();
  await window.screenshot({ path: 'test-results/portable-setup.png' }); await unlock(false);
  const paths = await app.evaluate(({ app }) => Object.fromEntries(['userData', 'sessionData', 'temp', 'logs', 'crashDumps'].map(name => [name, app.getPath(name)])));
  assert.equal(paths.userData, join(folder, 'Data')); for (const path of Object.values(paths)) assert.ok(path.startsWith(join(folder, 'Data')));
  await assert.rejects(stat(join(root, 'must-not-use-host-override')));
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), pkg.version);
  const subject = await window.evaluate(() => window.tutor.createDemo());
  await window.evaluate(subjectId => window.tutor.addNote({ subjectId, name: 'Fracciones portables', text: 'Una fracción representa partes de un todo. El numerador cuenta las partes tomadas y el denominador indica las divisiones iguales.' }), subject.id);
  const searchInput = { subjectId: subject.id, query: '¿Cómo representar una porción de pizza?', scope: 'materials', conceptId: null, outcome: 'all', since: null, until: null, order: 'relevance', page: 1 };
  assert.ok((await window.evaluate(input => window.tutor.semanticSearch(input), searchInput)).hits.some(hit => hit.title === 'Fracciones portables'));
  const baseline = await window.evaluate(() => window.tutor.snapshot());
  await app.close(); app = undefined;
  const originalKey = await readFile(join(folder, 'Data/portable-key.bin')), originalHistory = await readFile(join(folder, 'Data/learning.tutor'));
  assert.equal(originalHistory.includes(Buffer.from('Fracciones portables')), false); assert.equal(originalKey.includes(Buffer.from(password)), false); await assert.rejects(stat(join(folder, 'Data/vault-key.bin')));
  const relocated = join(root, 'Moved folder with spaces · alumno'); await moveClosedFolder(folder, relocated); folder = relocated;
  await launch(); await window.getByRole('heading', { name: 'Vuelve a tu aprendizaje.', exact: true }).waitFor();
  await window.getByLabel('Contraseña de la carpeta portable', { exact: true }).fill('Wrong synthetic password'); await window.getByRole('button', { name: 'Abrir mi espacio', exact: true }).click(); await window.getByRole('alert').getByText('La contraseña es incorrecta o la clave portable está dañada.', { exact: true }).waitFor();
  assert.deepEqual(await readFile(join(folder, 'Data/portable-key.bin')), originalKey); assert.deepEqual(await readFile(join(folder, 'Data/learning.tutor')), originalHistory);
  await window.screenshot({ path: 'test-results/portable-unlock.png' }); await unlock();
  const restored = await window.evaluate(() => window.tutor.snapshot()); assert.equal(restored.storagePath, join(folder, 'Data')); assert.deepEqual(restored.subjects, baseline.subjects); assert.deepEqual(restored.materials, baseline.materials);
  assert.ok((await window.evaluate(input => window.tutor.semanticSearch(input), searchInput)).hits.some(hit => hit.title === 'Fracciones portables'));
  await app.close(); app = undefined;
  await launch(); await window.getByRole('heading', { name: 'Vuelve a tu aprendizaje.', exact: true }).waitFor(); await app.close(); app = undefined;
  assert.deepEqual(await readFile(join(folder, 'Data/portable-key.bin')), originalKey);
  const { MODEL } = require('../build/electron/model-config.js');
  await mkdir(join(folder, 'Data/models'), { recursive: true });
  await link(resolve('.tools/ai-test/models', MODEL.filename), join(folder, 'Data/models', MODEL.filename));
  const withModel = join(root, 'Moved with downloaded model'); await moveClosedFolder(folder, withModel); folder = withModel;
  await launch(); await window.getByRole('heading', { name: 'Vuelve a tu aprendizaje.', exact: true }).waitFor(); await unlock();
  assert.equal((await window.evaluate(() => window.tutor.modelStatus())).state, 'ready');
  assert.equal((await stat(join(folder, 'Data/models', MODEL.filename))).size, MODEL.bytes);
  await app.close(); app = undefined;
  assert.deepEqual(errors, []);
  await writeFile(`test-results/portable-${pkg.version}-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), version: pkg.version, portable: { path: `release/${name}.zip`, bytes: bytes.length, sha256 }, zipIntegrity: true, extractedZipExecuted: true, passwordSetupConfirmation: true, wrongPasswordPreservesData: true, cancelWithoutChangingKey: true, movedFolderReopened: true, downloadedModelDetectedAfterMove: true, portableDataPaths: true, hostOverrideIgnored: true, encryptedHistory: true, noWindowsKey: true, actualBundledSemanticModelBeforeAndAfterMove: true, sameWindowsHost: true, differentWindowsAccountOrComputer: false, codeSigned: false, errors }, null, 2) + '\n');
  console.log('Extracted portable ZIP verified: password gate, encrypted data, moved folder and actual semantic model.');
} catch (error) { await window?.screenshot({ path: 'test-results/portable-failure.png' }).catch(() => {}); throw error; }
finally { await app?.close().catch(() => {}); }
