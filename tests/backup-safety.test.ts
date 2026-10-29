import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Store } from '../electron/store';
import { encodeBackup, decodeBackup } from '../electron/backup';
import { BACKUP_TABLE_LIMITS, ENCRYPTED_BACKUP_OVERHEAD, MAX_BACKUP_FILE_BYTES, MAX_BACKUP_JSON_BYTES, assertBackupFileSize, assertBackupJsonSize } from '../electron/backup-limits';
import { backupSchema } from '../electron/validation';
import initSqlJs from 'sql.js';
import { decrypt, writeEncrypted } from '../electron/vault';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const subjectInput = { name: 'Capacity fixture', course: '', level: '', teacher: '', goals: '', color: 'sage' as const };
async function fixture() {
  const directory = resolve('.tools/backup-safety', randomUUID());
  await mkdir(directory, { recursive: true });
  const key = randomBytes(32), path = join(directory, 'history.tutor');
  return { key, path, store: await Store.open(path, key, wasm) };
}

test('backup limits cover exactly the tables accepted by restoration', () => {
  assert.deepEqual(Object.keys(BACKUP_TABLE_LIMITS).sort(), Object.keys(backupSchema.shape.tables.shape).sort());
  for (const [table, schema] of Object.entries(backupSchema.shape.tables.shape)) {
    assert.equal(schema.safeParse(Array(BACKUP_TABLE_LIMITS[table as keyof typeof BACKUP_TABLE_LIMITS] + 1).fill(null)).success, false);
  }
});

test('the 201st subject is rolled back and the remaining history can be restored', async () => {
  const { store, key, path } = await fixture();
  try {
    for (let index = 0; index < BACKUP_TABLE_LIMITS.subjects; index++) store.createSubject({ ...subjectInput, name: `Subject ${index}` });
    const before = await readFile(path), original = JSON.parse(store.exportData());
    assert.throws(() => store.createSubject(subjectInput), /límite de registros/);
    assert.deepEqual(await readFile(path), before);
    assert.equal(store.snapshot().subjects.length, BACKUP_TABLE_LIMITS.subjects);
    store.importData(store.exportData());
    assert.deepEqual(JSON.parse(store.exportData()).tables, original.tables);
    store.deleteSubject(original.tables.subjects[0].id);
    assert.doesNotThrow(() => store.createSubject(subjectInput));
  } finally { store.close(); }
  const reopened = await Store.open(path, key, wasm);
  try { assert.equal(reopened.snapshot().subjects.length, BACKUP_TABLE_LIMITS.subjects); }
  finally { reopened.close(); }
});

test('backup capacity measures complete UTF-8 JSON including punctuation and encryption overhead', async () => {
  const { store } = await fixture();
  try {
    const subject = store.createSubject(subjectInput);
    store.addMaterial(subject.id, 'Unicode notes', 'note', '学\n"\\\t😀\u0000');
    const raw = store.exportData();
    const usage = (store as unknown as { backupUsage(): { bytes: number } }).backupUsage();
    assert.equal(usage.bytes, Buffer.byteLength(raw, 'utf8'));
    const encrypted = encodeBackup(raw, 'portable-fixture-password');
    assert.equal(encrypted.length, usage.bytes + ENCRYPTED_BACKUP_OVERHEAD);
    assert.equal(decodeBackup(encrypted, 'portable-fixture-password'), raw);
    assertBackupFileSize(MAX_BACKUP_FILE_BYTES);
    assert.throws(() => assertBackupFileSize(MAX_BACKUP_FILE_BYTES + 1), /75 MB/);
    store.erase(); store.importData(decodeBackup(encrypted, 'portable-fixture-password'));
    assert.equal(store.snapshot().materials[0].text, '学\n"\\\t😀\u0000');
  } finally { store.close(); }
});

test('oversized multibyte backups are rejected before encryption', () => {
  const oversized = '学'.repeat(Math.floor(MAX_BACKUP_JSON_BYTES / 3) + 1);
  assert.ok(oversized.length < MAX_BACKUP_JSON_BYTES);
  assert.throws(() => assertBackupJsonSize(oversized), /75 MB/);
  assert.throws(() => encodeBackup(oversized, 'portable-fixture-password'), /75 MB/);
});

test('a legacy history above the row limit opens intact and can be reduced safely', async () => {
  const { store, path, key } = await fixture();
  store.close();
  const sql = await initSqlJs({ locateFile: () => wasm });
  const db = new sql.Database(decrypt(await readFile(path), key));
  const subjects = Array.from({ length: BACKUP_TABLE_LIMITS.subjects + 1 }, () => ({ ...subjectInput, id: randomUUID(), createdAt: new Date().toISOString(), isDemo: false }));
  for (const subject of subjects) db.run('INSERT INTO subjects (id, data) VALUES (?, ?)', [subject.id, JSON.stringify(subject)]);
  writeEncrypted(path, db.export(), key); db.close();
  const legacy = await Store.open(path, key, wasm);
  try {
    assert.equal(legacy.snapshot().subjects.length, subjects.length);
    assert.throws(() => legacy.exportData(), /límite de registros/);
    legacy.deleteSubject(subjects[0].id);
    assert.equal(JSON.parse(legacy.exportData()).tables.subjects.length, BACKUP_TABLE_LIMITS.subjects);
  } finally { legacy.close(); }
});
