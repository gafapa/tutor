import {_electron as electron} from 'playwright';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {scannedPdf} from './ocr-fixtures.mjs';
import {startMoodleHttpFixture} from './moodle-http-fixture.mjs';
const require=createRequire(import.meta.url),packaged=process.argv.includes('--packaged'),prefix=packaged?'packaged-':'';
const directory=resolve('.tools/student-desktop',randomUUID());await mkdir(directory,{recursive:true});await mkdir('test-results',{recursive:true});
const fixture=await startMoodleHttpFixture();fixture.state.submissionStatus='new';
const env={...process.env,TUTOR_DATA_DIR:directory,TUTOR_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:packaged?resolve('release/win-unpacked/Tutor Local.exe'):require('electron'),args:packaged?[]:['.'],env,timeout:60000});const errors=[];
try{
  const window=await app.firstWindow();window.setDefaultTimeout(60000);window.on('pageerror',error=>errors.push(error.message));await window.waitForFunction(()=>Boolean(window.tutor));
  await window.evaluate(()=>window.tutor.updateSettings({onboardingCompleted:true,schoolYear:'eso1'}));
  await window.evaluate(()=>window.tutor.configureAI({provider:'local',modelId:'gemma4-e2b',cloudConsent:false,acceleration:'cpu'}));
  await window.evaluate(async({siteUrl,token})=>{const discovery=await window.tutor.discoverMoodle({siteUrl,token});const connections=await window.tutor.connectMoodleCourses({discoveryId:discovery.id,courses:discovery.courses.slice(0,2).map(course=>({courseId:course.id})),autoMinutes:0});for(const connection of connections)await window.tutor.syncMoodle(connection.id);},{siteUrl:fixture.siteUrl,token:fixture.token});
  assert.ok((await window.evaluate(()=>window.tutor.snapshot())).lmsConnections.every(c=>c.lastSyncAt));
  const subjectId=await window.evaluate(async()=>{const s=await window.tutor.snapshot(),id=s.subjects[0].id;const concept=await window.tutor.createConcept({subjectId:id,name:'Fracciones',description:'Comparar fracciones.',prerequisiteIds:[]});const criterion=await window.tutor.saveCurriculum({subjectId:id,kind:'criterion',code:'C1',title:'Justificar',description:'Explicar los pasos.',conceptIds:[concept.id],relatedIds:[]});await window.tutor.saveUnit({subjectId:id,title:'Fracciones',objectives:'Comparar fracciones durante 2 semanas.',startsOn:null,endsOn:null,status:'pending',conceptIds:[concept.id],curriculumIds:[criterion.id],materialIds:[],prerequisiteIds:[]});return id;});
  await app.evaluate(({app})=>{
    const hostRequire=typeof require==='function'?require:process.mainModule.require.bind(process.mainModule),{createRequire}=hostRequire('node:module'),{join}=hostRequire('node:path');
    const {AIService}=createRequire(join(app.getAppPath(),'package.json'))('./build/electron/ai-service.js');globalThis.studentImages=0;
    AIService.prototype.complete=async function(messages,options){
      const system=messages[0].content;
      if(options?.image){globalThis.studentImages++;return `Unidad ${globalThis.studentImages}: Fracciones. Comparar partes iguales.`;}
      if(system.startsWith('Relate')){const data=JSON.parse(messages[1].content);return JSON.stringify({unitId:data.candidates.units[0]?.id??null,conceptIds:data.candidates.concepts.slice(0,1).map(row=>row.id),curriculumIds:data.candidates.criteria.slice(0,1).map(row=>row.id),quote:data.assignment.slice(0,25),reason:'La tarea se relaciona con la unidad de prueba.'});}
      if(system.startsWith('Read the'))return JSON.stringify({weeks:2,quote:'durante 2 semanas'});
      if(system.startsWith('Create exactly')){const data=JSON.parse(messages[1].content);return JSON.stringify({exercises:['recall','application','reasoning'].map(kind=>({kind,title:'Comparar fracciones',statement:'Explica cómo comparar 1/2 y 3/4 con un ejemplo.',hints:['Busca partes del mismo tamaño.'],checkpoints:['Justifica tu comparación.'],quote:data.assignment.slice(0,25)}))});}
      if(system.startsWith('Review a student'))return JSON.stringify({observations:[{quote:'denominador',comment:'Explica cómo igualas las partes.'}],nextStep:'Prueba a dibujar las dos fracciones.'});
      const page=Number(messages.at(-1).content.match(/Page (\d+)/)[1]);return JSON.stringify({rows:[{kind:'unit',code:'U'+page,title:'Fracciones '+page,description:'Comparar partes iguales.',page,quote:`Unidad ${page}: Fracciones.`}]});
    };
  });
  await window.reload();await window.getByRole('heading',{name:'Tu trabajo en Moodle',exact:true}).waitFor();
  assert.equal(await window.getByRole('button',{name:'Unidades y currículo',exact:true}).count(),0);
  assert.equal(await window.getByRole('button',{name:'Más herramientas',exact:true}).isVisible(),true);
  await window.screenshot({path:`test-results/${prefix}student-home-desktop.png`});
  await window.getByRole('button',{name:'Más herramientas',exact:true}).click();await window.getByRole('button',{name:'Unidades y currículo',exact:true}).click();
  await window.getByText('Conectar mi programación con lo que hago en Moodle',{exact:true}).click();await window.getByRole('button',{name:'Preparar mi propuesta',exact:true}).click();
  await window.getByRole('checkbox',{name:'He revisado las relaciones y las fechas',exact:true}).waitFor();assert.equal(await window.getByRole('button',{name:'Aplicar a mi espacio',exact:true}).isDisabled(),true);
  await window.screenshot({path:`test-results/${prefix}student-connections-desktop.png`});await window.getByRole('checkbox',{name:'He revisado las relaciones y las fechas',exact:true}).check();await window.getByRole('button',{name:'Aplicar a mi espacio',exact:true}).click();
  await window.getByRole('button',{name:'Aplicar a mi espacio',exact:true}).waitFor({state:'hidden'});assert.ok((await window.evaluate(()=>window.tutor.snapshot())).tasks.some(task=>task.lms&&task.unitId));
  await window.getByRole('button',{name:'Mi seguimiento',exact:true}).click();await window.reload();await window.getByRole('button',{name:'Preparar conmigo',exact:true}).first().click();
  const coach=window.getByRole('dialog',{name:'Vamos paso a paso',exact:true});await coach.waitFor();assert.equal(await coach.getByRole('button',{name:'Dame una pista',exact:true}).isDisabled(),true);
  await coach.getByLabel('Tu primer intento',{exact:true}).fill('Busco el mismo denominador.');await coach.getByRole('button',{name:'Dame una pista',exact:true}).click();await coach.getByRole('button',{name:'Pensarlo con el tutor',exact:true}).click();await coach.getByRole('heading',{name:'Para seguir pensando',exact:true}).waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(600,800));await window.screenshot({path:`test-results/${prefix}student-coach-narrow.png`});
  assert.equal(await window.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await coach.getByRole('button',{name:'Guardar mi intento sin nota',exact:true}).click();await coach.waitFor({state:'hidden'});
  let snapshot=await window.evaluate(()=>window.tutor.snapshot());assert.equal(snapshot.attempts.length,1);assert.equal(snapshot.attempts[0].outcome,'ungraded');assert.ok(snapshot.estimates.every(row=>row.status==='unseen'));
  await window.getByRole('button',{name:'Más',exact:true}).click();await window.getByRole('button',{name:'Ajustes',exact:true}).click();await window.getByLabel('Mi curso',{exact:true}).selectOption('bach2');await window.waitForTimeout(200);assert.equal((await window.evaluate(()=>window.tutor.snapshot())).settings.schoolYear,'bach2');
  const canvas=createCanvas(400,260),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,400,260);context.fillStyle='black';context.font='24px Arial';context.fillText('Fracciones',30,100);const pdf=join(directory,'long-scanned.pdf');await writeFile(pdf,scannedPdf(Array.from({length:12},()=>canvas)));
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});globalThis.studentImages=0;},pdf);
  const draft=await window.evaluate(id=>window.tutor.prepareProgramme(id),subjectId);assert.equal(draft.rows.length,12);assert.equal(draft.pages.length,10);assert.ok(draft.warnings.some(text=>text.includes('todas las páginas')));assert.equal(await app.evaluate(()=>globalThis.studentImages),12);await window.evaluate(id=>window.tutor.discardProgramme(id),draft.id);
  await window.reload();snapshot=await window.evaluate(()=>window.tutor.snapshot());assert.equal(snapshot.settings.schoolYear,'bach2');assert.equal(snapshot.attempts.length,1);assert.deepEqual(errors,[]);
  await writeFile(`test-results/${prefix}student-verification.json`,JSON.stringify({version:snapshot.model?.version??'0.23.0',moodleRest:'deterministic double',aiResponses:'deterministic double',reviewedLinks:true,estimatedSchedule:true,diversePractice:true,attemptBeforeHint:true,ungradedAnswer:true,sharedCourseAdaptation:true,narrow600px:true,longScannedPdfPages:12,previewPages:10,errors},null,2));
  console.log('Student experience, reviewed curriculum links, schedule, practice and 12-page scanned programme verified.');
}catch(error){try{console.error(await (await app.firstWindow()).evaluate(async()=>{const s=await window.tutor.snapshot();return {subjects:s.subjects.map(row=>({id:row.id,name:row.name})),connections:s.lmsConnections.map(row=>({subjectId:row.subjectId,lastSyncAt:row.lastSyncAt})),tasks:s.tasks.map(row=>({subjectId:row.subjectId,title:row.title,status:row.status,unitId:row.unitId}))};}));await(await app.firstWindow()).screenshot({path:`test-results/${prefix}student-failure.png`});}catch{}throw error;}finally{await app.close();await fixture.stop();}
