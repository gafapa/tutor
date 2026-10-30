import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Store} from '../electron/store';
import {registerSupportHandlers} from '../electron/support-service';
import type {AIService} from '../electron/ai-service';
import {validateAnswerReview,validateExercises} from '../electron/support';
async function fixture(){
  const directory=resolve('.tools/support-tests',randomUUID());await mkdir(directory,{recursive:true});const store=await Store.open(join(directory,'history.sqlite'),randomBytes(32),resolve('node_modules/sql.js/dist/sql-wasm.wasm'),true);
  const subject=store.createSubject({name:'Matemáticas',level:'ESO',teacher:'',goals:'',color:'blue'}),concept=store.createConcept({subjectId:subject.id,name:'Fracciones',description:'Comparar fracciones.',prerequisiteIds:[]});
  const criterion=store.saveCurriculum({subjectId:subject.id,kind:'criterion',code:'C1',title:'Justificar comparaciones',description:'Explica la comparación de fracciones.',conceptIds:[concept.id],relatedIds:[]});
  const unit=store.saveUnit({subjectId:subject.id,title:'Fracciones',objectives:'Trabajamos fracciones durante 2 semanas.',startsOn:null,endsOn:null,status:'pending',conceptIds:[concept.id],curriculumIds:[criterion.id],materialIds:[],prerequisiteIds:[]});
  const connection={id:randomUUID(),subjectId:subject.id,provider:'moodle' as const,siteUrl:'https://school.example',siteName:'Synthetic school',courseId:1,courseName:'Matemáticas',accountSalt:randomUUID(),accountFingerprint:'a'.repeat(64),enabled:true,autoMinutes:0 as const,createdAt:new Date().toISOString(),lastSyncAt:null};store.saveLmsConnection(connection);
  const instructions='Compara fracciones y explica cómo lo has hecho.';
  store.applyMoodleBatch(connection.id,{scopes:{activities:'ok',resources:'ok',submissions:'ok',grades:'ok'},warnings:[],rows:[{remoteKey:'activity:1',data:{kind:'activity',moduleId:1,assignmentId:1,module:'assign',title:'Comparar fracciones',instructions,dueAt:null,url:'https://school.example/mod/assign/view.php?id=1'}}]},{startedAt:new Date().toISOString(),trigger:'manual'});
  const item=store.snapshot().lmsItems[0],handlers=new Map<string,(value:any)=>any>(),prompts:string[]=[];
  const ai={complete:async(messages:{role:string;content:string}[])=>{prompts.push(messages[0].content);const system=messages[0].content;if(system.startsWith('Relate'))return JSON.stringify({unitId:unit.id,conceptIds:[concept.id],curriculumIds:[criterion.id],quote:'Compara fracciones',reason:'La actividad pide la comparación de la unidad.'});if(system.startsWith('Read the'))return JSON.stringify({weeks:2,quote:'durante 2 semanas'});if(system.startsWith('Create exactly'))return JSON.stringify({exercises:['recall','application','reasoning'].map(kind=>({kind,title:'Comparar fracciones',statement:'Explica cómo comparar dos fracciones con un ejemplo.',hints:['Piensa en el denominador.'],checkpoints:['Justifica la comparación.'],quote:'Compara fracciones'}))});return JSON.stringify({observations:[{quote:'mismo denominador',comment:'Explica también cómo se compara el numerador.'}],nextStep:'Prueba con otro ejemplo.'});}} as unknown as AIService;
  registerSupportHandlers((name,callback)=>handlers.set(name,callback),()=>store,()=>ai,async(_subject,work)=>work(new AbortController().signal));
  return {store,subject,concept,criterion,unit,item,prompts,call:(name:string,value:any)=>handlers.get(name)!(value)};
}
test('reviewed Moodle links and estimated unit dates commit atomically, survive backup and do not establish mastery',async()=>{
  const f=await fixture();try{const before=f.store.snapshot();const draft=await f.call('prepareSubjectSupport',{subjectId:f.subject.id,startDate:'2026-11-02'});
    assert.equal(f.store.snapshot().tasks[0].unitId,null);assert.equal(draft.schedule[0].endsOn,'2026-11-15');assert.equal(draft.schedule[0].estimated,true);
    assert.throws(()=>f.call('commitSubjectSupport',{draftId:draft.id,links:[{...draft.links[0],quote:'Invented reference'}],schedule:draft.schedule,createStudyTasks:true}),/cita/);
    assert.deepEqual(f.store.snapshot().tasks,before.tasks);
    f.call('commitSubjectSupport',{draftId:draft.id,links:draft.links,schedule:draft.schedule,createStudyTasks:true});
    let snapshot=f.store.snapshot();assert.equal(snapshot.tasks.find(task=>task.lms)!.unitId,f.unit.id);assert.equal(snapshot.tasks.filter(task=>!task.lms).length,1);assert.equal(snapshot.units[0].startsOn,'2026-11-02');assert.equal(snapshot.attempts.length,0);
    f.store.importData(f.store.exportData());snapshot=f.store.snapshot();assert.deepEqual(snapshot.tasks.find(task=>task.lms)!.curriculumIds,[f.criterion.id]);assert.ok(snapshot.estimates.every(row=>row.status==='unseen'));
    assert.throws(()=>f.call('commitSubjectSupport',{draftId:draft.id,links:draft.links,schedule:draft.schedule,createStudyTasks:true}),/caducado/);
  }finally{f.store.close();}
});
test('a curriculum edit invalidates the full relationship proposal before any partial save',async()=>{
  const f=await fixture();try{const draft=await f.call('prepareSubjectSupport',{subjectId:f.subject.id,startDate:'2026-11-02'});f.store.saveUnit({...f.unit,title:'Unidad revisada'});assert.throws(()=>f.call('commitSubjectSupport',{draftId:draft.id,links:draft.links,schedule:draft.schedule,createStudyTasks:true}),/cambiado/);assert.equal(f.store.snapshot().tasks[0].unitId,null);assert.equal(f.store.snapshot().units[0].startsOn,null);}finally{f.store.close();}
});
test('course-adapted diverse practice saves an ungraded attempt and source withdrawal blocks reuse',async()=>{
  const f=await fixture();try{f.store.updateSettings({schoolYear:'eso1'});const pack=await f.call('prepareStudyPack',f.item.id);assert.equal(new Set(pack.exercises.map((row:any)=>row.kind)).size,3);assert.ok(f.prompts.some(prompt=>prompt.includes('one instruction at a time')));
    const review=await f.call('reviewStudyAnswer',{packId:pack.id,exercise:0,answer:'Busco el mismo denominador.'});assert.equal(review.observations.length,1);
    f.call('saveStudyAnswer',{packId:pack.id,exercise:0,answer:'Busco el mismo denominador.',reflection:'Compararé los numeradores.',hints:1});assert.equal(f.store.snapshot().attempts[0].outcome,'ungraded');assert.ok(f.store.snapshot().estimates.every(row=>row.status==='unseen'));
    f.store.updateSettings({schoolYear:'bach2'});const laterPack=await f.call('prepareStudyPack',f.item.id);assert.ok(f.prompts.some(prompt=>prompt.includes('exam-level depth')));f.store.importData(f.store.exportData());assert.equal(f.store.snapshot().settings.schoolYear,'bach2');const connection=f.store.snapshot().lmsConnections[0];f.store.applyMoodleBatch(connection.id,{scopes:{activities:'ok',resources:'ok',submissions:'ok',grades:'ok'},warnings:[],rows:[]},{startedAt:new Date().toISOString(),trigger:'manual'});await assert.rejects(()=>f.call('reviewStudyAnswer',{packId:laterPack.id,exercise:0,answer:'Busco el mismo denominador.'}),/cambiado/);
  }finally{f.store.close();}
});
test('practice rejects fabricated source references and feedback quotes',()=>{
  assert.throws(()=>validateAnswerReview({observations:[{quote:'invented',comment:'A claim'}],nextStep:'Try again'},'Actual answer'),/cita/);
  assert.throws(()=>validateExercises(['recall','application','reasoning'].map(kind=>({kind,title:'Exercise',statement:'A synthetic exercise statement',hints:['Try'],checkpoints:['Check'],quote:'Invented source'})),'Actual source'),/referencia/);
});
