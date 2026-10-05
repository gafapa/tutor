import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,link,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url),{MODEL}=require('../build/electron/model-config.js');
const packaged=process.argv.includes('--packaged'),prefix=packaged?'packaged-':'';
const directory=resolve('.tools/pedagogy-ai-test',randomUUID());await mkdir(join(directory,'models'),{recursive:true});await mkdir('test-results',{recursive:true});await link(resolve('.tools/ai-test/models',MODEL.filename),join(directory,'models',MODEL.filename));
const env={...process.env,TUTOR_DATA_DIR:directory,TUTOR_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:packaged?resolve('release/win-unpacked/Tutor Local.exe'):require('electron'),args:packaged?[]:['.'],env,timeout:90000});let progress;const errors=[];
try{
  const window=await app.firstWindow();window.setDefaultTimeout(45000);window.on('pageerror',e=>errors.push(e.message));await window.getByRole('button',{name:'Explorar un ejemplo',exact:true}).click();await window.getByRole('heading',{name:'Un poco de potencias de 2.'}).waitFor();
  await app.evaluate(({session})=>session.defaultSession.enableNetworkEmulation({offline:true}));
  progress=setInterval(()=>{void window.evaluate(()=>window.tutor.modelStatus()).then(s=>console.log(`Análisis local: ${s.state} · ${s.message}`)).catch(()=>{});},15000);
  const results=[];
  for(const [title,text,expected] of [['Resta incorrecta','2^4=16\n16-2=13','difficulty'],['Sin intento','Todavía no he escrito el procedimiento ni la respuesta.',null]]){
    const result=await window.evaluate(async({text})=>{const data=await window.tutor.snapshot();const attempt=await window.tutor.saveAttempt({subjectId:data.subjects[0].id,conceptId:null,statement:'Calcula dos elevado a cuatro y después resta dos.',answer:text,feedback:'',outcome:'ungraded',hints:0,durationSeconds:35});const analysis=await window.tutor.analyzeWorkLocally({kind:'attempt',id:attempt.id});return {attempt,analysis,estimates:(await window.tutor.snapshot()).estimates};},{text});
    assert.equal(result.analysis.engine,'local-ai');assert.equal(result.analysis.model.name,MODEL.name);assert.deepEqual(result.analysis.coverage,[{start:0,end:text.length}]);assert.ok(result.estimates.every(e=>e.status==='unseen'));
    if(expected){assert.ok(result.analysis.observations.some(o=>o.signal===expected&&o.skill==='calculation'&&o.error==='calculation'));assert.ok(result.analysis.observations.every(o=>o.quotes.length>0&&o.quotes.every(q=>text.slice(q.start,q.end)===q.text)));assert.ok(result.analysis.observations.every(o=>o.description.startsWith('Posible')));}else assert.equal(result.analysis.observations.length,0,'Pedir ayuda sin intento no demuestra una dificultad educativa.');
    results.push({title,...result});console.log(`Caso pedagógico verificado: ${title}.`);
  }
  const plan=await window.evaluate(async analysis=>{const observation=analysis.observations[0];await window.tutor.reviewObservation({analysisId:analysis.id,observationId:observation.id,decision:'accepted',reason:'Compruebo la resta original.'});return window.tutor.startIntervention({analysisId:analysis.id,observationId:observation.id,minutes:10});},results[0].analysis);assert.ok(plan.activities.every(a=>a.kind==='arithmetic'&&!('expected'in a)));
  const source=results[0].attempt;const pending=window.evaluate(async id=>{try{await window.tutor.analyzeWorkLocally({kind:'attempt',id});return 'unexpected-success';}catch(error){return error.message;}},source.id);
  await window.waitForFunction(async()=>['starting','running'].includes((await window.tutor.modelStatus()).state));await window.evaluate(()=>window.tutor.cancelChat());assert.match(await pending,/cancelad/i);assert.equal((await window.evaluate(()=>window.tutor.snapshot())).learningAnalyses.length,2);
  await window.reload();await window.getByRole('button',{name:'Cómo aprendo',exact:true}).click();await window.getByText('HIPÓTESIS DE IA LOCAL',{exact:true}).first().waitFor();await window.screenshot({path:`test-results/${prefix}pedagogy-ai.png`});assert.deepEqual(errors,[]);
  await writeFile(`test-results/${prefix}pedagogy-ai-verification.json`,JSON.stringify({checkedAt:new Date().toISOString(),packaged,model:MODEL.name,offlineRenderer:true,realLocalModel:true,schemaConstrained:true,literalEvidence:true,fullWorkCoverage:true,noAttemptAbstention:true,cancellationNoPartialAnalysis:true,noMasteryChange:true,results,errors},null,2));console.log('Pedagogy with real local AI verified.');
}catch(error){const page=app.windows()[0];await page?.screenshot({path:`test-results/${prefix}pedagogy-ai-failure.png`}).catch(()=>{});const snapshot=await page?.evaluate(()=>window.tutor.snapshot()).catch(()=>null);if(snapshot)await writeFile(`test-results/${prefix}pedagogy-ai-failure.json`,JSON.stringify({message:String(error),analyses:snapshot.learningAnalyses},null,2));throw error;}finally{clearInterval(progress);await app.close();}
