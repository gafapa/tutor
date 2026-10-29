import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Store } from '../electron/store';
import { programmeChunks, validateProgrammeRows } from '../electron/programme';
import { recommendedModel, MODEL_CATALOG, modelDefinition } from '../electron/model-catalog';
import { accountEnvironment, CodexAccount } from '../electron/account-ai';
import { moodleLearningContext } from '../electron/moodle-context';
import type { LmsItem } from '../shared/lms';
const wasm=resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const text='Unidad 1: Fracciones. Objetivo: comparar fracciones.\fCriterio C1: explica el procedimiento.';
const rows=[{kind:'unit' as const,code:'U1',title:'Fracciones',description:'Comparar fracciones.',page:1,quote:'Unidad 1: Fracciones.'},{kind:'criterion' as const,code:'C1',title:'Explicar',description:'Explica el procedimiento.',page:2,quote:'Criterio C1: explica el procedimiento.'}];
test('plain alpha history reopens without its original key and imports a programme atomically',async()=>{
  const directory=resolve('.tools/orientation-tests',randomUUID());await mkdir(directory,{recursive:true});const path=join(directory,'learning.sqlite');
  let store=await Store.open(path,randomBytes(32),wasm,true);
  const subject=store.createSubject({name:'Matemáticas',course:'',level:'ESO',teacher:'',goals:'',color:'sage'});
  store.updateSettings({onboardingCompleted:true,aiProvider:'local',localModelId:'qwen-3b'});
  store.importProgramme(subject.id,'Programme.pdf',text,validateProgrammeRows(rows,text));
  const snapshot=store.snapshot();assert.equal(snapshot.units.length,1);assert.equal(snapshot.curriculum.length,1);assert.match(snapshot.units[0].objectives,/página 1/);assert.equal(snapshot.attempts.length,0);assert.equal(snapshot.materials[0].text,text);
  assert.throws(()=>store.importProgramme(subject.id,'Again.pdf',text,rows),/ya está/);assert.equal(store.snapshot().units.length,1);
  store.close();
  assert.equal((await readFile(path)).subarray(0,15).toString(),'SQLite format 3');
  store=await Store.open(path,randomBytes(32),wasm,true);assert.equal(store.snapshot().settings.onboardingCompleted,true);assert.equal(store.snapshot().settings.localModelId,'qwen-3b');assert.equal(store.snapshot().units.length,1);
  store.updateSettings({aiProvider:'codex',cloudConsent:true,codexExecutable:'C:/synthetic/official.exe'});
  const backup=store.exportData();assert.ok(!backup.includes('official.exe'));const malicious=JSON.parse(backup);malicious.tables.settings[0].codexExecutable='C:/untrusted.exe';malicious.tables.settings[0].cloudConsent=true;malicious.tables.settings[0].aiProvider='codex';store.importData(JSON.stringify(malicious));assert.equal(store.snapshot().settings.codexExecutable,undefined);assert.equal(store.snapshot().settings.cloudConsent,undefined);assert.equal(store.snapshot().settings.onboardingCompleted,true);assert.equal(store.snapshot().settings.localModelId,'qwen-3b');
  store.close();
});
test('programme parsing rejects invented quotes, wrong pages and missing text without truncation',()=>{
  assert.throws(()=>validateProgrammeRows([{...rows[0],quote:'Fabricated quote'}],text),/no existe/);
  assert.throws(()=>validateProgrammeRows([{...rows[0],page:2}],text),/no existe/);
  const long='abcde'.repeat(1800);const chunks=programmeChunks(long+'\fsecond page');assert.equal(chunks.at(-1)?.page,2);
  const reconstructed=chunks.filter(c=>c.page===1).map((c,i)=>i?c.text.slice(300):c.text).join('');assert.ok(reconstructed.length>=long.length-300);
  assert.throws(()=>programmeChunks(' \f '),/no contiene texto/);assert.throws(()=>programmeChunks('x'.repeat(500000)),/Divide/);
});
test('the model catalogue pins every download and bases recommendations on memory limits',()=>{
  assert.equal(recommendedModel(4).id,'qwen-1.5b');assert.equal(recommendedModel(8).id,'qwen-3b');assert.equal(recommendedModel(16).id,'gemma4-e2b');assert.equal(recommendedModel(32).id,'gemma4-e4b');
  assert.throws(()=>modelDefinition('arbitrary-url'),/desconocido/);
  for(const model of MODEL_CATALOG){assert.match(model.sha256,/^[a-f0-9]{64}$/);assert.match(model.url,/^https:\/\/huggingface\.co\/(?:Qwen|ggml-org)\/[^/]+\/resolve\/[a-f0-9]{40}\//);assert.ok(model.bytes>1e9);}
});
test('provider processes cannot inherit Moodle tokens or API keys',()=>{
  process.env.TUTOR_LIVE_STUDENT_PASSWORD='synthetic-not-a-real-password';process.env.ANTHROPIC_API_KEY='synthetic-not-a-real-key';
  try{for(const provider of ['codex','claude'] as const){const env=accountEnvironment(resolve('.tools/account-test'),provider);assert.equal(env.TUTOR_LIVE_STUDENT_PASSWORD,undefined);assert.equal(env.ANTHROPIC_API_KEY,undefined);assert.equal(env.OPENAI_API_KEY,undefined);}}finally{delete process.env.TUTOR_LIVE_STUDENT_PASSWORD;delete process.env.ANTHROPIC_API_KEY;}
});
test('Moodle tutoring context stays in the selected subject and excludes withdrawn work and credentials',()=>{
  const item=(subjectId:string,active:boolean,title:string)=>({subjectId,active,updatedAt:'2026-10-29',data:{kind:'activity',title,url:'https://example.test/course',instructions:'Explain fractions',submission:{text:'Own response'},submissionFeedback:'Check denominator'}} as LmsItem);
  const context=moodleLearningContext([item('one',true,'Fractions'),item('two',true,'PRIVATE_OTHER_SUBJECT'),item('one',false,'WITHDRAWN')],'one','Fractions');
  assert.match(context,/Own response/);assert.match(context,/Check denominator/);assert.doesNotMatch(context,/PRIVATE_OTHER_SUBJECT|WITHDRAWN/);
});
test('Codex account protocol initializes, uses ChatGPT login and only accepts a completed turn',async()=>{
  const root=resolve('.tools/orientation-tests',randomUUID());await mkdir(root,{recursive:true});const fixture=join(root,'fake-codex.cjs');
  await writeFile(fixture,`const readline=require('node:readline');const send=v=>process.stdout.write(JSON.stringify(v)+'\\n');readline.createInterface({input:process.stdin}).on('line',line=>{const v=JSON.parse(line);if(!v.id)return;let result={};if(v.method==='account/login/start')result={authUrl:'https://auth.openai.com/synthetic-login'};if(v.method==='account/read')result={account:{type:'chatgpt'}};if(v.method==='thread/start'){if(v.params.sandbox!=='read-only'||v.params.approvalPolicy!=='never')process.exit(9);result={thread:{id:'thread'}};}send({id:v.id,result});if(v.method==='turn/start'){const image=v.params.input.find(i=>i.type==='localImage');if(image&&!require('node:fs').existsSync(image.path))process.exit(10);send({method:'item/agentMessage/delta',params:{threadId:'thread',delta:'Intenta comparar los denominadores.'}});send({method:'turn/completed',params:{threadId:'thread',turn:{status:'completed'}}});}});`);
  const client=new CodexAccount(process.execPath,root,[fixture]);try{assert.match(await client.login(),/^https:\/\/auth.openai.com/);assert.match(await client.status(),/conectada/);assert.match(await client.complete('Synthetic teaching request',new AbortController().signal),/denominadores/);assert.match(await client.complete('Read selected image',new AbortController().signal,undefined,{mime:'image/jpeg',base64:Buffer.from('synthetic image bytes').toString('base64')}),/denominadores/);assert.deepEqual(await readdir(join(root,'empty')),[]);await client.logout();}finally{client.stop();}
});
