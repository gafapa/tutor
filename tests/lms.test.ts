import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Store } from '../electron/store';
import { LmsCredentials } from '../electron/lms-credentials';
import { validateBackup } from '../electron/validation';
import { cleanLmsUrl, credentialFingerprint, moodlePlainText, normalizeMoodleUrl } from '../electron/lms-utils';
import { retrieve } from '../electron/retrieval';
import type { MoodleBatch } from '../electron/moodle';
import type { LmsConnection } from '../shared/lms';
const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID()); await mkdir(directory, { recursive: true }); const key = randomBytes(32), path = join(directory, 'history.tutor');
  const store = await Store.open(path, key, wasm), subject = store.createDemo(); const salt = randomUUID();
  const connection: LmsConnection = { id: randomUUID(), subjectId: subject.id, provider: 'moodle', siteUrl: 'https://moodle.example/centro', siteName: 'Mi centro', courseId: 2, courseName: 'Redes', accountSalt: salt, accountFingerprint: credentialFingerprint('https://moodle.example/centro', 9, salt), enabled: true, autoMinutes: 0, createdAt: new Date().toISOString(), lastSyncAt: null };
  store.saveLmsConnection(connection);
  const batch: MoodleBatch = { scopes: { activities: 'ok', resources: 'ok', submissions: 'ok', grades: 'ok' }, warnings: [], rows: [
    { remoteKey: 'activity:10', data: { kind: 'activity', moduleId: 10, assignmentId: 1, module: 'assign', title: 'Explicar bits', instructions: 'Justifica el cálculo.', dueAt: null, url: 'https://moodle.example/centro/mod/assign/view.php?id=10', submission: { status: 'submitted', text: 'Mi respuesta', group: false, attempt: 0, createdAt: null, updatedAt: null }, submissionFeedback: 'Buen intento.' } },
    ...[11, 12].map((moduleId, index) => ({ remoteKey: `file:${moduleId}`, data: { kind: 'resource' as const, moduleId, title: 'Apuntes', filename: 'apuntes.txt', url: 'https://moodle.example/centro/mod/resource/view.php?id=' + moduleId, source: 'file' as const, format: 'txt', size: 100, modifiedAt: null, contentHash: (index ? 'b' : 'a').repeat(64) }, material: { name: 'apuntes.txt', kind: 'txt', text: index ? 'Subnetting con seis bits.' : 'Cuatro bits y dieciséis combinaciones.', pageCount: 1 }, cache: { resourceState: 'ready' as const, resourceMessage: '', etag: null } })),
    { remoteKey: 'grade:5', data: { kind: 'grade', gradeItemId: 5, moduleId: 10, title: 'Explicar bits', module: 'assign', raw: 90, min: 0, max: 100, formatted: '90 / 100', feedback: 'Buena explicación.', gradedAt: null, hidden: false } }
  ] };
  const sync = (value = batch) => store.applyMoodleBatch(connection.id, structuredClone(value), { startedAt: new Date().toISOString(), trigger: 'manual' });
  return { store, directory, path, key, subject, connection, batch, sync };
}
test('las direcciones rechazan acceso inseguro y las referencias no conservan tokens', () => {
  assert.equal(normalizeMoodleUrl('https://aula.example/centro/course/view.php?id=4'), 'https://aula.example/centro');
  assert.throws(() => normalizeMoodleUrl('http://aula.example'), /HTTPS/); assert.throws(() => normalizeMoodleUrl('https://usuario:clave@aula.example'), /credenciales/);
  assert.equal(normalizeMoodleUrl('http://127.0.0.1:8181'), 'http://127.0.0.1:8181');
  assert.equal(cleanLmsUrl('/mod/assign/view.php?id=4&token=secreto&sesskey=otro', 'https://aula.example'), 'https://aula.example/mod/assign/view.php?id=4');
  assert.equal(cleanLmsUrl('javascript:alert(1)', 'https://aula.example'), '');
});
test('el texto de Moodle mantiene exponentes y entidades sin ejecutar contenido externo', () => {
  assert.equal(moodlePlainText('<p>2<sup>4</sup> = 16 &amp; 2<sub>n</sub></p><script>malicioso()</script><iframe src="https://externo.example"></iframe><p>Texto útil</p>'), '2^(4) = 16 & 2_(n)\n\nTexto útil');
});
test('las credenciales se cifran aparte del historial y se pueden olvidar', async () => {
  const { store, directory, key, connection } = await fixture();
  try { const path = join(directory, 'secrets.tutor'), vault = new LmsCredentials(path, key), token = 'tokenSyntheticUnique'; vault.set(connection.id, { siteUrl: connection.siteUrl, userId: 9, token }); assert.equal((await readFile(path)).includes(Buffer.from(token)), false); assert.equal(store.exportData().includes(token), false); assert.equal(new LmsCredentials(path, key).get(connection.id)?.token, token); vault.remove(connection.id); assert.equal(new LmsCredentials(path, key).get(connection.id), undefined); } finally { store.close(); }
});
test('las importaciones son idempotentes, separan recursos con igual nombre y no fabrican evidencias', async () => {
  const { store, sync } = await fixture();
  try { const before = store.snapshot(); sync(); const snapshot = store.snapshot(); assert.equal(snapshot.materials.filter(m => m.lms).length, 2); assert.equal(snapshot.tasks[0].dueDate, null); assert.equal(snapshot.tasks[0].status, 'completed'); assert.deepEqual(snapshot.estimates, before.estimates); assert.equal(snapshot.attempts.length, 0); assert.ok(retrieve(snapshot.materials, before.subjects[0].id, 'subnetting').length); const second = sync(); assert.equal(second.changes.length, 0); assert.equal(store.snapshot().lmsVersions.length, 4); assert.doesNotThrow(() => validateBackup(store.exportData())); } finally { store.close(); }
});
test('la sincronización conserva cambios personales y versiones originales de los materiales', async () => {
  const { store, batch, sync } = await fixture();
  try { sync(); const before = store.snapshot(), task = before.tasks[0]; store.updateTask({ ...task, title: 'Mi objetivo', dueDate: '2026-11-01', notes: 'Mi nota', estimatedMinutes: 30 }); store.completeTask({ id: task.id, completed: false }); const modified = structuredClone(batch); const activity = modified.rows[0].data; assert.equal(activity.kind, 'activity'); activity.title = 'Título nuevo del profesor'; activity.dueAt = '2026-11-10T10:00:00Z'; const resource = modified.rows[1]; assert.equal(resource.data.kind, 'resource'); resource.data.contentHash = 'c'.repeat(64); resource.material!.text = 'Cinco bits y treinta y dos combinaciones.'; sync(modified); const after = store.snapshot(), updated = after.tasks[0]; assert.equal(updated.title, 'Mi objetivo'); assert.equal(updated.dueDate, '2026-11-01'); assert.equal(updated.status, 'pending'); assert.equal(updated.notes, 'Mi nota'); assert.equal(after.materials.filter(m => m.lms).length, 3); assert.equal(after.materials.find(m => m.id === before.materials.find(m => m.lms)!.id)!.text, 'Cuatro bits y dieciséis combinaciones.'); assert.doesNotThrow(() => validateBackup(store.exportData())); } finally { store.close(); }
});
test('las retiradas requieren una consulta completa y los borrados personales no se deshacen al sincronizar', async () => {
  const { store, batch, sync } = await fixture();
  try { sync(); const partial = { ...batch, scopes: { ...batch.scopes, grades: 'unavailable' as const }, rows: batch.rows.filter(r => r.data.kind !== 'grade') }; sync(partial); assert.ok(store.snapshot().lmsItems.find(i => i.data.kind === 'grade')!.active); const task = store.snapshot().tasks[0], material = store.snapshot().materials.find(m => m.lms)!; store.deleteTask(task.id); store.deleteMaterial(material.id); sync(); assert.equal(store.snapshot().tasks.length, 0); assert.equal(store.snapshot().materials.some(m => m.id === material.id), false); assert.equal(store.snapshot().materials.filter(m => m.lms?.itemId === material.lms!.itemId).length, 0); sync({ ...batch, rows: [] }); assert.ok(store.snapshot().lmsItems.every(i => !i.active)); assert.equal(retrieve(store.snapshot().materials.filter(m => m.lms), task.subjectId, 'subnetting').length, 0); assert.doesNotThrow(() => validateBackup(store.exportData())); } finally { store.close(); }
});
test('las copias rechazan enlaces cruzados, versiones alteradas y secretos sin cambiar el historial', async () => {
  const { store, sync, subject } = await fixture();
  try { sync(); const raw = store.exportData(); const mutations = [ (b: any) => { b.tables.lms_items[0].data.instructions = 'Alterado'; }, (b: any) => { b.tables.lms_connections[0].token = 'No exportar'; }, (b: any) => { b.tables.lms_versions[0].revision = 4; }, (b: any) => { b.tables.lms_items[0].data.url += '&token=secreto'; }, (b: any) => { b.tables.materials.find((m: any) => m.lms).lms.itemId = b.tables.lms_items[0].id; } ]; for (const mutate of mutations) { const copy = JSON.parse(raw); mutate(copy); assert.throws(() => store.importData(JSON.stringify(copy))); assert.equal(store.requireSubject(subject.id).name, 'Redes locales'); assert.equal(store.exportData().includes('Alterado'), false); } const copy = JSON.parse(raw); copy.version = 5; for (const key of ['lms_connections','lms_items','lms_versions','lms_runs']) delete copy.tables[key]; copy.tables.materials = copy.tables.materials.filter((m: any) => !m.lms); copy.tables.tasks = []; store.importData(JSON.stringify(copy)); assert.equal(store.snapshot().lmsItems.length, 0); assert.equal(store.snapshot().attempts.length, 0); } finally { store.close(); }
});
