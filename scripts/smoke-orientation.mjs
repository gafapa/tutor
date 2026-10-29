import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createImportFixtures } from './fixtures.mjs';
import { startMoodleHttpFixture } from './moodle-http-fixture.mjs';
const require=createRequire(import.meta.url),directory=resolve('.tools/orientation-desktop',randomUUID());
await mkdir(directory,{recursive:true});await mkdir('test-results',{recursive:true});
const fixtures=await createImportFixtures(directory),fixture=await startMoodleHttpFixture();
const env={...process.env,TUTOR_DATA_DIR:directory,TUTOR_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;
const packaged=process.argv.includes('--packaged');
const launch=()=>electron.launch({executablePath:packaged?resolve('release/win-unpacked/Tutor Local.exe'):require('electron'),args:packaged?[]:['.'],env,timeout:60000});
let app,window;const errors=[];
async function open(){app=await launch();window=await app.firstWindow();window.setDefaultTimeout(45000);window.on('pageerror',error=>errors.push(error.message));await window.waitForFunction(()=>Boolean(window.tutor));}
try{
  await open();await window.getByRole('heading',{name:'Tu aprendizaje empieza en tu aula'}).waitFor();
  await window.screenshot({path:'test-results/orientation-onboarding.png'});
  await window.getByRole('button',{name:'Conectar varias asignaturas',exact:true}).click();
  await window.getByLabel('Dirección de Moodle').fill(fixture.siteUrl);
  await window.getByLabel('Token',{exact:true}).fill(fixture.token);
  await window.getByRole('button',{name:'Consultar mis cursos',exact:true}).click();
  await window.getByRole('checkbox',{name:/Matemáticas/}).check();
  await window.getByRole('checkbox',{name:/Redes/}).check();
  await window.getByRole('button',{name:/Conectar 2 cursos/}).click();
  await window.waitForFunction(async()=>{const s=await window.tutor.snapshot();return s.subjects.length===2&&s.lmsConnections.every(c=>c.lastSyncAt);});
  await window.getByRole('button',{name:'Continuar con la IA',exact:true}).click();
  await window.getByLabel('Modelo local',{exact:true}).waitFor();
  assert.equal(await window.getByLabel('Modelo local',{exact:true}).locator('option').count(),6);
  await window.getByLabel('Proveedor de IA').selectOption('codex');
  assert.equal(await window.getByRole('button',{name:'Usar esta cuenta',exact:true}).isDisabled(),true);
  await window.getByLabel('Proveedor de IA').selectOption('local');
  await window.getByLabel('Modelo local',{exact:true}).selectOption('qwen-3b');
  await window.getByRole('button',{name:'Usar este modelo',exact:true}).click();
  await window.waitForFunction(async()=>(await window.tutor.snapshot()).settings.localModelId==='qwen-3b');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,700));
  await window.screenshot({path:'test-results/orientation-ai-960.png'});
  await window.getByRole('button',{name:'Continuar con la programación',exact:true}).click();
  await app.evaluate(({app,dialog},pdf)=>{
    const hostRequire=typeof require==='function'?require:process.mainModule.require.bind(process.mainModule);const {createRequire}=hostRequire('node:module'),{join}=hostRequire('node:path');const req=createRequire(join(app.getAppPath(),'package.json'));
    const {AIService}=req('./build/electron/ai-service.js');
    // Deterministic extraction double qualifies the pipeline, not AI quality.
    AIService.prototype.complete=async function(messages){const page=Number(messages.at(-1).content.match(/Page (\d+)/)[1]);return JSON.stringify({rows:[{kind:page===1?'unit':'criterion',code:page===1?'U1':'C1',title:page===1?'Fracciones':'Suma de fracciones',description:'Propuesta sintética para revisar.',page,quote:page===1?'Fracciones: partes iguales de un todo.':'Segunda pagina: suma de fracciones con el mismo denominador.'}]});};
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[pdf]});
  },fixtures.pdf);
  await window.getByRole('button',{name:'Importar programación PDF',exact:true}).click();
  await window.getByRole('button',{name:'Guardar unidades y currículo',exact:true}).waitFor();
  await window.getByLabel('Título',{exact:true}).first().fill('Fracciones revisadas');
  await window.getByRole('button',{name:'Guardar unidades y currículo',exact:true}).click();
  await window.waitForFunction(async()=>(await window.tutor.snapshot()).units.length===1);
  await window.getByRole('button',{name:'Abrir mi espacio',exact:true}).click();
  await window.getByRole('heading',{name:'Tu trabajo en Moodle',exact:true}).waitFor();
  const snapshot=await window.evaluate(()=>window.tutor.snapshot());assert.equal(snapshot.settings.onboardingCompleted,true);assert.equal(snapshot.units[0].title,'Fracciones revisadas');assert.equal(snapshot.curriculum.length,1);assert.equal(snapshot.attempts.length,0);
  await window.screenshot({path:'test-results/orientation-moodle-support-960.png'});
  await app.close();app=undefined;assert.equal((await readFile(join(directory,'learning.sqlite'))).subarray(0,15).toString(),'SQLite format 3');
  await open();await window.getByRole('heading',{name:'Tu trabajo en Moodle',exact:true}).waitFor();const reopened=await window.evaluate(()=>window.tutor.snapshot());assert.equal(reopened.units.length,1);assert.ok(reopened.lmsConnections.every(c=>c.hasCredentials));
  assert.deepEqual(errors,[]);
  await writeFile('test-results/orientation-verification.json',JSON.stringify({version:JSON.parse(await readFile('package.json','utf8')).version,packaged,onboarding:true,twoSyntheticMoodleCourses:true,sixModels:true,cloudConsentGate:true,programmePdfExtraction:'deterministic AI double; real local PDF reader',editableProposal:true,pageQuotes:true,plainSQLiteRestart:true,protectedMoodleCredentialsRestart:true,noInventedMastery:true,errors},null,2));
  console.log('Moodle onboarding, AI selection, reviewed PDF programme and restart verified.');
}catch(error){await window?.screenshot({path:'test-results/orientation-failure.png'}).catch(()=>{});throw error;}
finally{await app?.close().catch(()=>{});await fixture.stop();}
