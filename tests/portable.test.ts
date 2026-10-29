import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openPortableKey, portableKeyExists, PORTABLE_KEY_FILE, wrapPortableKey, unwrapPortableKey } from '../electron/portable-key';
import { Store } from '../electron/store';
import { LmsCredentials } from '../electron/lms-credentials';

test('portable wrapping requires a password and authenticates key bytes without Windows encryption', () => {
  const key = randomBytes(32), password = 'Synthetic portable password';
  const bytes = wrapPortableKey(key, password);
  assert.deepEqual(unwrapPortableKey(bytes, password), key);
  assert.equal(bytes.includes(key), false); assert.equal(bytes.includes(Buffer.from(password)), false);
  assert.notDeepEqual(wrapPortableKey(key, password), bytes);
  assert.throws(() => unwrapPortableKey(bytes, 'Another portable password'));
  const modified = Buffer.from(bytes); modified[modified.length - 1] ^= 1;
  assert.throws(() => unwrapPortableKey(modified, password));
  assert.throws(() => unwrapPortableKey(bytes.subarray(0, -1), password));
  assert.throws(() => wrapPortableKey(key, 'short'));
  assert.throws(() => wrapPortableKey(key, 'x'.repeat(257)));
});

test('portable key creation never replaces existing or orphaned history after failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tutor-portable-')), password = 'Synthetic portable password';
  assert.equal(portableKeyExists(directory), false);
  assert.throws(() => openPortableKey(directory, password, 'different'));
  assert.equal(portableKeyExists(directory), false);
  const key = openPortableKey(directory, password, password), path = join(directory, PORTABLE_KEY_FILE), original = readFileSync(path);
  assert.throws(() => openPortableKey(directory, 'Another portable password'));
  assert.deepEqual(readFileSync(path), original); assert.deepEqual(openPortableKey(directory, password), key);
  const orphaned = mkdtempSync(join(tmpdir(), 'tutor-orphan-'));
  writeFileSync(join(orphaned, 'learning.tutor'), randomBytes(50));
  assert.throws(() => openPortableKey(orphaned, password, password));
  const installed = mkdtempSync(join(tmpdir(), 'tutor-installed-'));
  writeFileSync(join(installed, 'vault-key.bin'), randomBytes(50));
  assert.throws(() => portableKeyExists(installed));
});

test('portable history and Moodle credentials survive moving the whole folder using only the password', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tutor-move-')), original = join(root, 'original'), moved = join(root, 'moved'); mkdirSync(original);
  const password = 'Synthetic portable password', key = openPortableKey(original, password, password), wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
  const store = await Store.open(join(original, 'learning.tutor'), key, wasm), subject = store.createDemo(); store.close();
  const connectionId = randomUUID(), credential = { siteUrl: 'https://moodle.example.test', userId: 4, token: 'synthetic-portable-token' };
  new LmsCredentials(join(original, 'moodle-credentials.tutor'), key).set(connectionId, credential);
  key.fill(0); renameSync(original, moved);
  const reopenedKey = openPortableKey(moved, password), reopened = await Store.open(join(moved, 'learning.tutor'), reopenedKey, wasm);
  try { assert.ok(reopened.snapshot().subjects.some(row => row.id === subject.id)); assert.deepEqual(new LmsCredentials(join(moved, 'moodle-credentials.tutor'), reopenedKey).get(connectionId), credential); }
  finally { reopened.close(); reopenedKey.fill(0); }
});
