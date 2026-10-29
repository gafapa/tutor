import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Store } from '../electron/store';
import { portfolioTaskHash } from '../electron/portfolio-tasks';
import { MoodleClient } from '../electron/moodle';
import { startMoodleHttpFixture } from '../scripts/moodle-http-fixture.mjs';

async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID()); await mkdir(directory, { recursive: true }); const key = randomBytes(32), path = join(directory, 'portfolio.tutor'), wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
  const store = await Store.open(path, key, wasm), subject = store.createDemo();
  const entry = store.savePortfolio({ subjectId: subject.id, title: 'Comparación de mis intentos', kind: 'work', content: 'Primer intento: 12. Segundo intento: 16.', reflection: 'Qué practicaré después\nPracticaré cinco bits.', conceptIds: [], evidenceIds: [] });
  const input = { portfolioId: entry.id, title: 'Practicar cinco bits', notes: 'Escribiré las potencias y comprobaré la multiplicación.', dueDate: '2026-11-01', estimatedMinutes: 20 };
  return { store, subject, entry, input, path, key, wasm };
}

test('portfolio practice tasks preserve authoritative sources, deduplicate pending requests and never create mastery evidence', async () => {
  const f = await fixture(); try {
    const before = f.store.snapshot(), task = f.store.createPortfolioTask(f.input);
    assert.equal(task.subjectId, f.entry.subjectId); assert.equal(task.status, 'pending'); assert.equal(task.lms, undefined); assert.equal(task.portfolioSource?.content, f.entry.content); assert.equal(task.portfolioSource?.reflection, f.entry.reflection); assert.equal(task.portfolioSource?.hash, portfolioTaskHash(f.entry));
    assert.equal(f.store.createPortfolioTask(f.input).id, task.id);
    f.store.updateTask({ ...task, title: 'Practicar y explicar cinco bits' }); assert.deepEqual(f.store.snapshot().tasks.find(row => row.id === task.id)?.portfolioSource, task.portfolioSource);
    f.store.completeTask({ id: task.id, completed: true }); assert.deepEqual(f.store.snapshot().attempts, before.attempts); assert.deepEqual(f.store.snapshot().estimates, before.estimates); assert.deepEqual(f.store.snapshot().portfolio, before.portfolio);
    const next = f.store.createPortfolioTask(f.input); assert.notEqual(next.id, task.id); assert.equal(next.status, 'pending');
    assert.throws(() => f.store.createPortfolioTask({ ...f.input, subjectId: randomUUID() })); assert.throws(() => f.store.createPortfolioTask({ ...f.input, content: 'Fabricated origin' })); assert.throws(() => f.store.createPortfolioTask({ ...f.input, estimatedMinutes: 121 })); assert.throws(() => f.store.createPortfolioTask({ ...f.input, portfolioId: randomUUID() }));
  } finally { f.store.close(); }
});

test('deleting a portfolio entry detaches links while preserving source snapshots through encrypted restart and restoration', async () => {
  const f = await fixture(); let reopened: Store | undefined; try {
    const task = f.store.createPortfolioTask(f.input); f.store.deletePortfolio(f.entry.id); const detached = f.store.snapshot().tasks.find(row => row.id === task.id)!;
    assert.equal(detached.portfolioSource?.entryId, null); assert.equal(detached.portfolioSource?.content, f.entry.content); assert.equal(detached.portfolioSource?.hash, task.portfolioSource?.hash);
    const backup = f.store.exportData(); f.store.importData(backup); assert.equal(JSON.parse(backup).version, 18); f.store.close(); reopened = await Store.open(f.path, f.key, f.wasm); assert.deepEqual(reopened.snapshot().tasks.find(row => row.id === task.id), detached);
    reopened.deleteSubject(f.subject.id); assert.equal(reopened.snapshot().tasks.length, 0);
  } finally { reopened?.close(); if (!reopened) f.store.close(); }
});

test('restoration rejects changed source snapshots, broken links, mixed Moodle ownership and cross-subject portfolio origins atomically', async () => {
  const f = await fixture(); try {
    f.store.createPortfolioTask(f.input); const good = f.store.exportData(), before = f.store.snapshot();
    const other = f.store.createSubject({ name: 'Other subject', level: '', teacher: '', goals: '', color: 'blue' });
    const foreign = f.store.savePortfolio({ subjectId: other.id, title: 'Other work', content: 'Other answer', reflection: '', kind: 'work', conceptIds: [], evidenceIds: [] });
    const baseline = f.store.exportData();
    for (const mode of ['text', 'reflection', 'missing', 'foreign', 'moodle']) {
      const bad = JSON.parse(baseline), row = bad.tables.tasks.find((row: { portfolioSource?: unknown }) => row.portfolioSource);
      if (mode === 'text') row.portfolioSource.content = 'Changed';
      if (mode === 'reflection') row.portfolioSource.reflection = 'Changed';
      if (mode === 'missing') row.portfolioSource.entryId = randomUUID();
      if (mode === 'foreign') row.portfolioSource = { entryId: foreign.id, title: foreign.title, content: foreign.content, reflection: foreign.reflection, createdAt: foreign.createdAt, hash: portfolioTaskHash(foreign) };
      if (mode === 'moodle') row.lms = { connectionId: randomUUID(), itemId: randomUUID(), titleOverridden: false, dateOverridden: false, statusOverridden: false };
      assert.throws(() => f.store.importData(JSON.stringify(bad))); assert.equal(f.store.snapshot().tasks.length, before.tasks.length);
    }
    f.store.importData(good); assert.deepEqual(f.store.snapshot().tasks, before.tasks);
  } finally { f.store.close(); }
});

test('schema 16 histories migrate without creating portfolio sources or personal tasks', async () => {
  const f = await fixture(); try {
    const before = f.store.snapshot(), old = JSON.parse(f.store.exportData()); old.version = 16; f.store.importData(JSON.stringify(old));
    assert.equal(JSON.parse(f.store.exportData()).version, 18); assert.deepEqual(f.store.snapshot().tasks, before.tasks); assert.deepEqual(f.store.snapshot().portfolio, before.portfolio); assert.ok(f.store.snapshot().tasks.every(row => row.portfolioSource === undefined));
  } finally { f.store.close(); }
});

test('portfolio work above the task concept limit is rejected without creating unrestorable history', async () => {
  const f = await fixture(); try {
    const conceptIds = Array.from({ length: 31 }, (_, index) => f.store.createConcept({ subjectId: f.subject.id, name: `Topic ${index}`, description: '', prerequisiteIds: [] }).id);
    const source = f.store.savePortfolio({ subjectId: f.subject.id, title: 'Broad work', content: 'Complete original', reflection: '', kind: 'work', conceptIds, evidenceIds: [] });
    const count = f.store.snapshot().tasks.length; assert.throws(() => f.store.createPortfolioTask({ ...f.input, portfolioId: source.id }), /30 conceptos/); assert.equal(f.store.snapshot().tasks.length, count); assert.doesNotThrow(() => f.store.importData(f.store.exportData()));
  } finally { f.store.close(); }
});

test('Moodle mutation functions are rejected before HTTP even when a service advertises write permissions', async () => {
  const remote = await startMoodleHttpFixture(); try {
    const names = ['core_course_create_courses', 'core_course_update_courses', 'core_user_create_users', 'mod_assign_save_submission', 'mod_assign_submit_for_grading', 'mod_assign_save_grade', 'mod_quiz_start_attempt', 'mod_quiz_process_attempt', 'core_course_edit_module', 'core_files_upload'];
    const client = new MoodleClient({ siteUrl: remote.siteUrl, userId: remote.state.userId, token: remote.token }, new AbortController().signal);
    const boundary = client as unknown as { functions: Set<string>; call(name: string, input: Record<string, unknown>): Promise<unknown> }; boundary.functions = new Set(names);
    for (const name of names) await assert.rejects(boundary.call(name, {}), /operación no está permitida/);
    for (const key of ['wsfunction', 'wstoken', 'moodlewsrestformat', 'WSFUNCTION']) await assert.rejects(boundary.call('core_webservice_get_site_info', { [key]: 'core_course_create_courses' }), /reservados/);
    assert.equal(remote.requests.length, 0);
  } finally { await remote.stop(); }
});
