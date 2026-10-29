import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startMoodleHttpFixture } from '../scripts/moodle-http-fixture.mjs';
import { Store } from '../electron/store';
import { Lms } from '../electron/lms';
import { LmsCredentials } from '../electron/lms-credentials';
import { MoodleClient } from '../electron/moodle';

async function fixture() {
  const remote = await startMoodleHttpFixture();
  const directory = resolve('.tools/test-data',randomUUID()); await mkdir(directory,{recursive:true});
  const key=randomBytes(32), path=join(directory,'history.tutor'), vaultPath=join(directory,'credentials.tutor');
  const store=await Store.open(path,key,resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  const vault=new LmsCredentials(vaultPath,key), lms=new Lms(store,vault);
  const discover=()=>lms.discover({siteUrl:remote.siteUrl,token:remote.token});
  const setup=async()=>lms.connectCourses({discoveryId:(await discover()).id,courses:[{courseId:1},{courseId:2}],autoMinutes:0});
  return {remote,directory,key,path,vaultPath,store,vault,lms,discover,setup,close:async()=>{lms.close();store.close();await remote.stop();}};
}

test('quiz review copies are authoritative, independent and do not complete a newer active attempt', async () => {
  const f = await fixture(); try {
    f.remote.state.quiz = true;
    const [connection] = await f.setup(); await f.lms.sync(connection.id);
    const snapshot = f.store.snapshot(), quiz = snapshot.lmsItems.find(row => row.data.kind === 'activity' && row.data.module === 'quiz')!;
    assert.ok(quiz); assert.equal(snapshot.tasks.find(row => row.lms?.itemId === quiz.id)?.status, 'completed');
    const input = { itemId: quiz.id, revision: quiz.revision, attemptId: 1, reflection: 'I will verify my calculation.' };
    const copy = f.store.copyMoodleQuizReview(input); assert.match(copy.content, /Respuesta: 16/); assert.equal(f.store.copyMoodleQuizReview(input).id, copy.id);
    assert.throws(() => f.store.copyMoodleQuizReview({ ...input, attemptId: 2 })); assert.throws(() => f.store.copyMoodleQuizReview({ ...input, reviewText: 'Injected answer' }));
    f.remote.state.quizAttempts.push({ ...f.remote.state.quizAttempts[0], id: 2, attempt: 2, state: 'inprogress', timefinish: 0 });
    await f.lms.sync(connection.id); const current = f.store.snapshot();
    assert.equal(current.tasks.find(row => row.lms?.itemId === quiz.id)?.status, 'pending');
    assert.equal(f.store.copyMoodleQuizReview(input).id, copy.id); assert.equal(f.store.snapshot().attempts.length, 0);
    const backup = f.store.exportData(); f.store.importData(backup); assert.deepEqual(f.store.snapshot().lmsItems, current.lmsItems); assert.equal(JSON.parse(backup).version, 18);
    const legacy = JSON.parse(backup); legacy.version = 15;
    for (const table of ['lms_items', 'lms_versions']) for (const item of legacy.tables[table]) if (item.data.kind === 'activity') { delete item.data.quizId; delete item.data.quizAttempts; }
    f.store.importData(JSON.stringify(legacy)); assert.equal(JSON.parse(f.store.exportData()).version, 18); assert.ok(f.store.snapshot().lmsItems.every(row => row.data.kind !== 'activity' || row.data.quizAttempts === undefined));
  } finally { await f.close(); }
});

test('comparison copies preserve both authoritative attempts and structured reflections without adding mastery evidence', async () => {
  const f = await fixture(); try {
    f.remote.state.attempt = 1;
    f.remote.state.previousAttempts = [historicalSubmission(0, 'Mi primera respuesta: 12', 'Comprueba los factores.')];
    const [connection] = await f.setup(); await f.lms.sync(connection.id);
    const before = f.store.snapshot(), item = before.lmsItems.find(row => row.connectionId === connection.id && row.data.kind === 'activity' && row.data.module === 'assign')!;
    const input = { itemId: item.id, revision: item.revision, firstAttemptId: 'assign:0', secondAttemptId: 'assign:1', whatChanged: '  Corregí el producto.  ', whatChecked: 'Multipliqué los cuatro factores.', nextStep: 'Practicaré potencias.' };
    const saved = f.store.copyMoodleComparison(input);
    assert.match(saved.content, /Mi primera respuesta: 12/); assert.match(saved.content, /Mi explicación original/); assert.match(saved.content, /Comprueba los factores/); assert.match(saved.content, /Comentario recuperado/); assert.match(saved.content, /resolución.txt/);
    assert.equal(saved.subjectId, item.subjectId); assert.equal(saved.automatic, false); assert.equal(saved.kind, 'work'); assert.equal(saved.evidenceIds.length, 0); assert.match(saved.reflection, /Qué he cambiado\nCorregí el producto\./); assert.match(saved.reflection, /Qué he comprobado\nMultipliqué/); assert.match(saved.reflection, /Qué practicaré después\nPracticaré/);
    assert.equal(f.store.copyMoodleComparison(input).id, saved.id);
    const after = f.store.snapshot(); for (const key of ['lmsItems', 'lmsVersions', 'tasks', 'attempts'] as const) assert.deepEqual(after[key], before[key]);
    f.remote.state.submissionText = '<p>Otra respuesta posterior</p>'; await f.lms.sync(connection.id);
    assert.equal(f.store.copyMoodleComparison(input).id, saved.id); assert.doesNotMatch(saved.content, /Otra respuesta posterior/);
    await f.lms.disconnect(connection.id); const exported = f.store.exportData(); f.store.importData(exported); assert.equal(f.store.snapshot().portfolio[0].content, saved.content); assert.equal(f.store.snapshot().portfolio[0].reflection, saved.reflection);
  } finally { await f.close(); }
});

test('comparison copies reject fabricated sources, missing reflections and oversized text before saving', async () => {
  const f = await fixture(); try {
    f.remote.state.quiz = true; f.remote.state.quizAttempts.push({ ...f.remote.state.quizAttempts[0], id: 2, attempt: 2 });
    const [connection] = await f.setup(); await f.lms.sync(connection.id);
    const quiz = f.store.snapshot().lmsItems.find(row => row.data.kind === 'activity' && row.data.module === 'quiz')!;
    const input = { itemId: quiz.id, revision: quiz.revision, firstAttemptId: 'quiz:1', secondAttemptId: 'quiz:2', whatChanged: 'Cambié la respuesta.', whatChecked: 'Revisé el cálculo.', nextStep: 'Practicaré.' };
    for (const patch of [{ secondAttemptId: 'quiz:1' }, { firstAttemptId: 'quiz:999' }, { firstAttemptId: 'assign:0' }, { revision: 999 }, { whatChanged: ' ' }, { whatChecked: '' }, { nextStep: 'x'.repeat(3001) }, { content: 'Fabricated response' }, { itemId: randomUUID() }]) assert.throws(() => f.store.copyMoodleComparison({ ...input, ...patch }));
    assert.equal(f.store.snapshot().portfolio.length, 0);
    const saved = f.store.copyMoodleComparison(input); assert.match(saved.content, /Fuente del intento: .*review.php\?attempt=1/); assert.match(saved.content, /review.php\?attempt=2/); assert.match(saved.content, /Puntos publicados: 1/);
    const tables = JSON.parse(f.store.exportData()); for (const table of ['lms_items', 'lms_versions']) for (const row of tables.tables[table]) if (row.data.kind === 'activity' && row.data.module === 'quiz') row.data.quizAttempts[0].reviewText = 'x'.repeat(50000);
    f.store.importData(JSON.stringify(tables)); assert.throws(() => f.store.copyMoodleComparison(input), /50.000/); assert.equal(f.store.snapshot().portfolio.length, 1);
    for (const table of ['lms_items', 'lms_versions']) for (const row of tables.tables[table]) if (row.data.kind === 'activity' && row.data.module === 'quiz') { row.data.quizAttempts[0].reviewText = ''; row.data.quizAttempts[0].points = null; row.data.quizAttempts[0].reviewState = 'restricted'; }
    f.store.importData(JSON.stringify(tables)); assert.throws(() => f.store.copyMoodleComparison(input), /disponibles/); assert.equal(f.store.snapshot().portfolio.length, 1);
  } finally { await f.close(); }
});

test('multi-course setup creates isolated subjects and imports complete task text, notes and submission metadata',async()=>{
  const f=await fixture();try {
    const connections=await f.setup(); assert.equal(new Set(connections.map(row=>row.subjectId)).size,2);
    for(const connection of connections) assert.equal((await f.lms.sync(connection.id)).status,'success');
    const snapshot=f.store.snapshot(); assert.equal(snapshot.subjects.length,2);assert.equal(snapshot.materials.length,6);assert.equal(snapshot.tasks.length,2);assert.equal(snapshot.attempts.length,0);
    for(const connection of connections){
      const activity=snapshot.lmsItems.find(row=>row.connectionId===connection.id&&row.data.kind==='activity')!;
      assert.equal(activity.data.kind,'activity');if(activity.data.kind!=='activity')throw Error();
      assert.match(activity.data.instructions,/Descripción breve\n\nEnunciado completo disponible desde la entrega/);
      assert.equal(activity.data.submission?.files?.[0].filename,'resolución.txt');assert.equal(activity.data.submission?.files?.[0].size,120);
      assert.equal(activity.data.submission?.group,connection.courseId===2);
      assert.ok(activity.data.submission?.files?.[0].url.endsWith('/resolution.txt'));
      const texts=snapshot.materials.filter(row=>row.subjectId===connection.subjectId).map(row=>row.text).join('\n');
      assert.match(texts,connection.courseId===1?/fracciones/:/subredes/);assert.doesNotMatch(texts,/Hidden|forbidden/);
      assert.equal(snapshot.lmsItems.find(row=>row.remoteKey===`section:${connection.courseId*10}`)?.data.kind,'resource');
      assert.equal((await f.lms.sync(connection.id)).changes.length,0);
    }
    assert.equal(f.store.exportData().includes(f.remote.token),false);assert.equal((await readFile(f.vaultPath)).includes(Buffer.from(f.remote.token)),false);
    const original=f.store.snapshot().lmsItems;const backup=f.store.exportData();f.store.importData(backup);assert.deepEqual(f.store.snapshot().lmsItems,original);
    const tampered=JSON.parse(backup);tampered.tables.lms_items.find(row=>row.data.kind==='activity').data.submission.files[0].url+='?token=private';assert.throws(()=>f.store.importData(JSON.stringify(tampered)));assert.deepEqual(f.store.snapshot().lmsItems,original);
  } finally {await f.close();}
});

test('schema 12 course setup migrates without inventing submission file metadata',async()=>{
  const f=await fixture();try{
    await f.setup();const original=f.store.snapshot();const legacy=JSON.parse(f.store.exportData());legacy.version=12;
    f.store.importData(JSON.stringify(legacy));const current=f.store.snapshot();
    assert.equal(JSON.parse(f.store.exportData()).version, 18);assert.deepEqual(current.subjects,original.subjects);assert.deepEqual(current.lmsConnections,original.lmsConnections);assert.equal(current.lmsItems.length,0);assert.equal(current.attempts.length,0);
  }finally{await f.close();}
});

test('copying a Moodle submission preserves a chosen version, reflection and feedback without adding mastery evidence',async()=>{
  const f=await fixture();try{
    const [connection]=await f.setup();await f.lms.sync(connection.id);
    const activity=f.store.snapshot().lmsItems.find(row=>row.connectionId===connection.id&&row.data.kind==='activity')!;
    const before=f.store.snapshot(), input={itemId:activity.id,revision:activity.revision,reflection:'Revisaré mis comprobaciones.'};
    const saved=f.store.copyMoodleSubmission(input);
    assert.equal(saved.subjectId,connection.subjectId);assert.equal(saved.kind,'work');assert.equal(saved.automatic,false);assert.equal(saved.reflection,input.reflection);
    assert.match(saved.content,/Mi explicación original/);assert.match(saved.content,/Comentario recuperado/);assert.match(saved.content,/Versión local: 1/);
    assert.deepEqual(saved.evidenceIds,[]);assert.equal(f.store.copyMoodleSubmission(input).id,saved.id);assert.equal(f.store.snapshot().portfolio.length,1);
    assert.deepEqual(f.store.snapshot().estimates,before.estimates);assert.deepEqual(f.store.snapshot().attempts,before.attempts);
    f.remote.state.submissionText='<p>Mi explicación revisada</p>';await f.lms.sync(connection.id);
    const updated=f.store.snapshot().lmsItems.find(row=>row.id===activity.id)!;assert.ok(updated.revision>activity.revision);
    assert.equal(f.store.copyMoodleSubmission(input).id,saved.id);
    const next=f.store.copyMoodleSubmission({...input,revision:updated.revision});assert.match(next.content,/Mi explicación revisada/);assert.notEqual(next.id,saved.id);
    f.store.clearLmsData(connection.id);assert.equal(f.store.snapshot().portfolio.length,2);assert.match(f.store.snapshot().portfolio[0].content,/Mi explicación original/);
    const backup=f.store.exportData();f.store.importData(backup);assert.equal(f.store.snapshot().portfolio.length,2);
  }finally{await f.close();}
});

test('submission copies reject missing versions and oversized works without saving truncated portfolio content',async()=>{
  const f=await fixture();try{
    const [connection]=await f.setup();await f.lms.sync(connection.id);
    const activity=f.store.snapshot().lmsItems.find(row=>row.connectionId===connection.id&&row.data.kind==='activity')!;
    assert.throws(()=>f.store.copyMoodleSubmission({itemId:activity.id,revision:999,reflection:''}));
    f.remote.state.submissionText='<p>'+('a'.repeat(51000))+'</p>';await f.lms.sync(connection.id);
    const updated=f.store.snapshot().lmsItems.find(row=>row.id===activity.id)!;
    assert.throws(()=>f.store.copyMoodleSubmission({itemId:activity.id,revision:updated.revision,reflection:''}),/50.000/);
    assert.equal(f.store.snapshot().portfolio.length,0);
  }finally{await f.close();}
});

test('batch setup rejects reused courses, targets, consumed discoveries and account mixing before mutation',async()=>{
  const f=await fixture();try{
    const discovery=await f.discover();const input={discoveryId:discovery.id,courses:[{courseId:1},{courseId:1}],autoMinutes:0};
    assert.throws(()=>f.lms.connectCourses(input),/una sola vez/);assert.equal(f.store.snapshot().subjects.length,0);
    const connections=await f.setup();const count=f.store.snapshot().lmsConnections.length;
    assert.throws(()=>f.lms.connectCourses({discoveryId:discovery.id,courses:[{courseId:1}],autoMinutes:0}),/asignatura local/);
    const next=await f.discover();assert.throws(()=>f.lms.connectCourses({discoveryId:next.id,courses:[{courseId:1,subjectId:connections[0].subjectId},{courseId:2,subjectId:connections[0].subjectId}],autoMinutes:0}));
    f.remote.state.userId=99;const other=await f.discover();assert.throws(()=>f.lms.connectCourses({discoveryId:other.id,courses:[{courseId:1,subjectId:connections[0].subjectId}],autoMinutes:0}),/otro usuario/);
    assert.equal(f.store.snapshot().lmsConnections.length,count);
    f.lms.forgetDiscovery(next.id);assert.throws(()=>f.lms.connectCourses({discoveryId:next.id,courses:[{courseId:1,subjectId:connections[0].subjectId}],autoMinutes:0}),/caducado/);
  }finally{await f.close();}
});

test('failed setup restores credentials and database transaction leaves no orphan subjects',async()=>{
  const f=await fixture();try{
    const first=await f.discover();const existing=f.lms.connectCourses({discoveryId:first.id,courses:[{courseId:1}],autoMinutes:0})[0];
    f.vault.set(existing.id,{siteUrl:f.remote.siteUrl,userId:9,token:'PreviousSyntheticToken'});
    f.remote.state.emptyName=true;const next=await f.discover();
    assert.throws(()=>f.lms.connectCourses({discoveryId:next.id,courses:[{courseId:1,subjectId:existing.subjectId},{courseId:2}],autoMinutes:0}));
    assert.equal(f.store.snapshot().subjects.length,1);assert.equal(f.store.snapshot().lmsConnections.length,1);assert.equal(f.vault.get(existing.id)?.token,'PreviousSyntheticToken');
    const newId=randomUUID();assert.throws(()=>f.store.saveMoodleSetup([{id:newId,name:'Rolled-back subject'}],[{...existing,id:randomUUID(),subjectId:newId},{...existing,id:randomUUID(),subjectId:randomUUID()}]));
    assert.equal(f.store.snapshot().subjects.length,1);assert.equal(f.store.snapshot().lmsConnections.length,1);
    const reopened=new LmsCredentials(f.vaultPath,f.key);assert.equal(reopened.get(existing.id)?.token,'PreviousSyntheticToken');
  }finally{await f.close();}
});

test('failed course and submission requests preserve previous data while another course can sync',async()=>{
  const f=await fixture();try{
    const connections=await f.setup();for(const c of connections)await f.lms.sync(c.id);
    const before=f.store.snapshot().lmsItems.filter(row=>row.connectionId===connections[0].id);
    f.remote.state.failCourse=1;assert.equal((await f.lms.sync(connections[0].id)).status,'failed');
    assert.deepEqual(f.store.snapshot().lmsItems.filter(row=>row.connectionId===connections[0].id),before);
    f.remote.state.revision=2;assert.equal((await f.lms.sync(connections[1].id)).status,'success');
    f.remote.state.failCourse=0;f.remote.state.submissionFailure=true;
    assert.equal((await f.lms.sync(connections[0].id)).status,'partial');
    const after=f.store.snapshot().lmsItems.find(row=>row.connectionId===connections[0].id&&row.data.kind==='activity')!;
    const original=before.find(row=>row.data.kind==='activity')!;
    if(after.data.kind!=='activity'||original.data.kind!=='activity')throw Error();assert.deepEqual(after.data.submission,original.data.submission);
  }finally{await f.close();}
});

test('text-only notes honor suppression, cancelled downloads retain the last copy and explicit task text works without submission access',async()=>{
  const f=await fixture();try{
    const connections=await f.setup();await f.lms.sync(connections[0].id);
    const material=f.store.snapshot().materials.find(row=>row.text.startsWith('Resumen'))!;f.store.deleteMaterial(material.id);
    f.remote.state.revision=2;await f.lms.sync(connections[0].id);assert.equal(f.store.snapshot().materials.some(row=>row.lms?.itemId===material.lms?.itemId),false);
    f.remote.state.delayMs=200;const pending=f.lms.sync(connections[0].id);f.lms.cancel(connections[0].id);assert.equal((await pending).status,'cancelled');
    assert.equal(f.store.snapshot().lmsConnections.length,2);
    f.remote.state.delayMs=0;f.remote.state.submissionFailure=true;
    const batch=await new MoodleClient({siteUrl:f.remote.siteUrl,userId:9,token:f.remote.token},new AbortController().signal).collect(1,[]);
    const task=batch.rows.find(row=>row.data.kind==='activity')!;if(task.data.kind!=='activity')throw Error();assert.match(task.data.instructions,/Enunciado completo con cuatro pasos/);
  }finally{await f.close();}
});


test('submission originals retain byte versions offline, stay outside materials and survive encrypted restart and portable restore', async () => {
  const f = await fixture(); try {
    const [connection] = await f.setup(); await f.lms.sync(connection.id);
    const item = f.store.snapshot().lmsItems.find(row => row.connectionId === connection.id && row.data.kind === 'resource' && row.data.source === 'submission')!;
    const first = item.local.originals![0];
    assert.equal(f.store.readMoodleFile({ itemId: item.id, hash: first.hash }).bytes.toString(), f.remote.state.fileContent);
    assert.equal(f.store.rendererSnapshot().lmsItems.find(row => row.id === item.id)!.local.originals![0].base64, undefined);
    assert.equal(item.local.materialIds.length, 0); assert.equal(f.store.snapshot().materials.length, 3);
    await f.lms.sync(connection.id); assert.equal(f.store.snapshot().lmsItems.find(row => row.id === item.id)!.local.originals!.length, 1);
    f.remote.state.fileContent = 'Updated personal submission'; await f.lms.sync(connection.id);
    const updated = f.store.snapshot().lmsItems.find(row => row.id === item.id)!;
    assert.equal(updated.local.originals!.length, 2);
    f.remote.state.fileFailure = true; assert.equal((await f.lms.sync(connection.id)).status, 'partial');
    const failed = f.store.snapshot().lmsItems.find(row => row.id === item.id)!;
    assert.equal(failed.local.resourceState, 'cached'); assert.equal(failed.local.originals!.length, 2);
    f.remote.state.submissionFailure = true; await f.lms.sync(connection.id);
    assert.equal(f.store.snapshot().lmsItems.find(row => row.id === item.id)!.active, true);
    await f.lms.disconnect(connection.id);
    const backup = f.store.exportData(); f.store.importData(backup);
    const offline = f.store.readMoodleFile({ itemId: item.id, hash: first.hash });
    assert.equal(offline.bytes.toString('base64'), first.base64);
    const reopened = await Store.open(f.path, f.key, resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
    try { assert.deepEqual(reopened.readMoodleFile({ itemId: item.id, hash: first.hash }).bytes, offline.bytes); } finally { reopened.close(); }
    assert.equal((await readFile(f.path)).includes(offline.bytes), false);
    assert.throws(() => f.store.readMoodleFile({ itemId: randomUUID(), hash: first.hash }));
  } finally { await f.close(); }
});

test('portable originals reject altered bytes, hashes and unrelated history without replacing saved data', async () => {
  const f = await fixture(); try {
    const [connection] = await f.setup(); await f.lms.sync(connection.id);
    const backup = f.store.exportData();
    for (const mutate of [
      file => { file.base64 = Buffer.from('tampered').toString('base64'); },
      file => { file.hash = '0'.repeat(64); },
      file => { file.base64 += '\n'; }
    ]) {
      const value = JSON.parse(backup); mutate(value.tables.lms_items.find(row => row.local.originals?.length).local.originals[0]);
      assert.throws(() => f.store.importData(JSON.stringify(value)));
    }
    assert.equal(f.store.exportData().replace(/"exportedAt":"[^"]+"/, ''), backup.replace(/"exportedAt":"[^"]+"/, ''));
  } finally { await f.close(); }
});

test('submission download redirects are refused and leave previous original available', async () => {
  const f = await fixture(); try {
    const [connection] = await f.setup(); await f.lms.sync(connection.id);
    const item = f.store.snapshot().lmsItems.find(row => row.local.originals?.length)!;
    f.remote.state.fileRedirect = true;
    assert.equal((await f.lms.sync(connection.id)).status, 'partial');
    assert.equal(f.store.readMoodleFile({ itemId: item.id, hash: item.local.originals![0].hash }).bytes.toString(), f.remote.state.fileContent);
  } finally { await f.close(); }
});


function historicalSubmission(attempt: number, text = 'Mi primer procedimiento', feedback = 'Comprueba las unidades') {
  return { attemptnumber: attempt, submission: { userid: 9, status: 'submitted', attemptnumber: attempt, timecreated: 1600000000, timemodified: 1600000010, plugins: [{ type: 'onlinetext', editorfields: [{ name: 'onlinetext', text: `<p>${text}</p>` }] }] }, feedbackplugins: [{ editorfields: [{ name: 'comments', text: `<p>${feedback}</p>` }] }], grade: { grade: '5.00000' } };
}

test('historical Moodle attempts import before first connection, copy independently and do not affect current tasks or mastery', async () => {
  const f = await fixture(); try {
    f.remote.state.attempt = 2; f.remote.state.submissionStatus = 'draft'; f.remote.state.previousAttempts = [historicalSubmission(1, 'Procedimiento revisado'), historicalSubmission(0)];
    const [connection] = await f.setup(); assert.equal((await f.lms.sync(connection.id)).status, 'success');
    const before = f.store.snapshot(), item = before.lmsItems.find(row => row.connectionId === connection.id && row.data.kind === 'activity')!;
    if (item.data.kind !== 'activity') throw Error();
    assert.deepEqual(item.data.previousSubmissions?.map(entry => entry.submission.attempt), [0, 1]);
    assert.equal(item.data.submission?.attempt, 2); assert.equal(before.tasks[0].status, 'pending'); assert.equal(before.tasks.length, 1);
    const input = { itemId: item.id, revision: item.revision, attempt: 0, reflection: 'Ahora compruebo las unidades.' };
    const copy = f.store.copyMoodleSubmission(input); assert.match(copy.content, /Mi primer procedimiento/); assert.match(copy.content, /Comprueba las unidades/); assert.match(copy.content, /Intento histórico de Moodle: 1/); assert.doesNotMatch(copy.content, /Mi explicación original/);
    assert.equal(f.store.copyMoodleSubmission(input).id, copy.id); assert.equal(f.store.snapshot().tasks[0].status, 'pending'); assert.equal(f.store.snapshot().attempts.length, 0); assert.deepEqual(f.store.snapshot().estimates, before.estimates);
    assert.throws(() => f.store.copyMoodleSubmission({ ...input, attempt: 99 }));
    f.remote.state.submissionFailure = true; await f.lms.sync(connection.id);
    const retained = f.store.snapshot().lmsItems.find(row => row.id === item.id)!.data;
    if (retained.kind !== 'activity') throw Error();
    assert.deepEqual(retained.previousSubmissions, item.data.previousSubmissions); assert.deepEqual(retained.submission, item.data.submission); assert.equal(retained.submissionFeedback, item.data.submissionFeedback);
    f.lms.disconnect(connection.id); f.store.importData(f.store.exportData());
    assert.equal(f.store.copyMoodleSubmission(input).id, copy.id);
    f.store.clearLmsData(connection.id); assert.equal(f.store.snapshot().portfolio[0].content, copy.content);
  } finally { await f.close(); }
});

test('malformed, duplicate, foreign-user and excessive histories retain the previous submission atomically', async () => {
  const f = await fixture(); try {
    f.remote.state.attempt = 2; f.remote.state.previousAttempts = [historicalSubmission(0)];
    const [connection] = await f.setup(); await f.lms.sync(connection.id);
    const item = f.store.snapshot().lmsItems.find(row => row.connectionId === connection.id && row.data.kind === 'activity')!;
    const foreign = historicalSubmission(0); foreign.submission.userid = 500;
    for (const invalid of [[historicalSubmission(0), historicalSubmission(0)], [historicalSubmission(2)], [foreign], [null], [historicalSubmission(0), ...Array.from({ length: 100 }, (_, index) => historicalSubmission(index))]]) {
      f.remote.state.previousAttempts = invalid;
      assert.equal((await f.lms.sync(connection.id)).status, 'partial');
      assert.deepEqual(f.store.snapshot().lmsItems.find(row => row.id === item.id)!.data, item.data);
    }
    const backup = JSON.parse(f.store.exportData());
    const activity = backup.tables.lms_items.find(row => row.id === item.id);
    activity.data.previousSubmissions.push(structuredClone(activity.data.previousSubmissions[0]));
    assert.throws(() => f.store.importData(JSON.stringify(backup)));
  } finally { await f.close(); }
});

test('historical attachment originals keep separate attempt identities outside course materials', async () => {
  const f = await fixture(); try {
    f.remote.state.attempt = 1;
    const history = historicalSubmission(0);
    history.submission.plugins.push({ type: 'file', fileareas: [{ files: [{ filename: 'previous.txt', filepath: '/', filesize: 20, fileurl: `${f.remote.siteUrl}/pluginfile.php/5/assignsubmission_file/submission_files/8/previous.txt`, timemodified: 1600000010 }] }] });
    f.remote.state.previousAttempts = [history];
    const [connection] = await f.setup(); assert.equal((await f.lms.sync(connection.id)).status, 'success');
    const snapshot = f.store.snapshot(), item = snapshot.lmsItems.find(row => row.connectionId === connection.id && row.data.kind === 'activity')!;
    if (item.data.kind !== 'activity') throw Error();
    const key = item.data.previousSubmissions![0].submission.files![0].remoteKey;
    const original = snapshot.lmsItems.find(row => row.remoteKey === key)!;
    assert.match(original.remoteKey, /submission-file:101:0:/); assert.equal(original.local.originals!.length, 1); assert.equal(original.local.materialIds.length, 0); assert.equal(snapshot.materials.length, 3);
    assert.equal(f.store.readMoodleFile({ itemId: original.id, hash: original.local.originals![0].hash }).bytes.toString(), f.remote.state.fileContent);
    assert.equal((await f.lms.sync(connection.id)).changes.length, 0);
  } finally { await f.close(); }
});

test('schema 14 backups keep originals and prior copies without inventing historical attempts', async () => {
  const f = await fixture(); try {
    const [connection] = await f.setup(); await f.lms.sync(connection.id);
    const legacy = JSON.parse(f.store.exportData()); legacy.version = 14;
    for (const row of [...legacy.tables.lms_items, ...legacy.tables.lms_versions]) if (row.data.kind === 'activity') delete row.data.previousSubmissions;
    f.store.importData(JSON.stringify(legacy));
    assert.equal(JSON.parse(f.store.exportData()).version, 18);
    const snapshot = f.store.snapshot(), item = snapshot.lmsItems.find(row => row.data.kind === 'activity')!;
    assert.equal(item.data.kind === 'activity' && item.data.previousSubmissions, undefined);
    const original = snapshot.lmsItems.find(row => row.local.originals?.length)!;
    assert.equal(f.store.readMoodleFile({ itemId: original.id, hash: original.local.originals![0].hash }).bytes.toString(), f.remote.state.fileContent);
    assert.equal(snapshot.attempts.length, 0);
  } finally { await f.close(); }
});
