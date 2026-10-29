import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
const require=createRequire(import.meta.url),pkg=JSON.parse(await readFile('package.json','utf8'));
const name=`Tutor-Local-${pkg.version}-Portable`,zip=resolve('release',name+'.zip'),bytes=await readFile(zip),sha256=createHash('sha256').update(bytes).digest('hex');
const root=resolve('.tools/portable-test',randomUUID());await mkdir(root,{recursive:true});await mkdir('test-results',{recursive:true});
execFileSync(require('7zip-bin').path7za,['t',zip],{windowsHide:true,stdio:'pipe'});
execFileSync(require('7zip-bin').path7za,['x',zip,'-o'+root,'-y'],{windowsHide:true,stdio:'pipe'});
let folder=join(root,name),app,window;const errors=[];
const env={...process.env,TUTOR_SMOKE:'1',TUTOR_DATA_DIR:join(root,'must-not-use-host-override')};delete env.ELECTRON_RUN_AS_NODE;
async function open(){app=await electron.launch({executablePath:join(folder,'Tutor Local.exe'),env,timeout:60000});window=await app.firstWindow();window.setDefaultTimeout(60000);window.on('pageerror',e=>errors.push(e.message));await window.waitForFunction(()=>Boolean(window.tutor));}
try{
  await assert.rejects(stat(join(folder,'Data')));
  await open();await window.getByRole('heading',{name:'Tu aprendizaje empieza en tu aula'}).waitFor();
  assert.equal(await window.locator('input[type=password]').count(),0);
  const paths=await app.evaluate(({app})=>Object.fromEntries(['userData','sessionData','temp','logs','crashDumps'].map(name=>[name,app.getPath(name)])));
  for(const path of Object.values(paths))assert.ok(path.startsWith(join(folder,'Data')));
  await assert.rejects(stat(join(root,'must-not-use-host-override')));
  const subject=await window.evaluate(()=>window.tutor.createDemo());
  await window.evaluate(id=>window.tutor.addNote({subjectId:id,name:'Fracciones portables',text:'Una fracción representa partes de un todo. El numerador cuenta las partes tomadas y el denominador indica las divisiones iguales.'}),subject.id);
  await window.evaluate(()=>window.tutor.updateSettings({onboardingCompleted:true}));
  const search={subjectId:subject.id,query:'¿Cómo representar una porción de pizza?',scope:'materials',conceptId:null,outcome:'all',since:null,until:null,order:'relevance',page:1};
  assert.ok((await window.evaluate(input=>window.tutor.semanticSearch(input),search)).hits.some(hit=>hit.title==='Fracciones portables'));
  const baseline=await window.evaluate(()=>window.tutor.snapshot());await app.close();app=undefined;
  const history=await readFile(join(folder,'Data/learning.sqlite'));assert.equal(history.subarray(0,15).toString(),'SQLite format 3');
  await assert.rejects(stat(join(folder,'Data/portable-key.bin')));
  const moved=join(root,'Moved folder with spaces · alumno');for(const path of [folder,moved])assert.ok(path.startsWith(root+sep));
  for(let attempt=0;;attempt++){try{await rename(folder,moved);break;}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=20)throw error;await new Promise(r=>setTimeout(r,300));}}
  folder=moved;await open();await window.getByRole('heading',{name:'Tu trabajo en Moodle',exact:true}).waitFor();
  const reopened=await window.evaluate(()=>window.tutor.snapshot());assert.deepEqual(reopened.subjects,baseline.subjects);assert.deepEqual(reopened.materials,baseline.materials);assert.equal(reopened.storagePath,join(folder,'Data'));
  assert.ok((await window.evaluate(input=>window.tutor.semanticSearch(input),search)).hits.some(hit=>hit.title==='Fracciones portables'));
  await window.screenshot({path:'test-results/portable-alpha-moved.png'});assert.deepEqual(errors,[]);
  await writeFile(`test-results/portable-${pkg.version}-verification.json`,JSON.stringify({checkedAt:new Date().toISOString(),version:pkg.version,portable:{path:'release/'+name+'.zip',bytes:bytes.length,sha256},zipIntegrity:true,extractedZipExecuted:true,noPasswordRequired:true,plainEducationalHistory:true,movedFolderReopened:true,portableDataPaths:true,hostOverrideIgnored:true,actualBundledSemanticModelBeforeAndAfterMove:true,sameWindowsHost:true,differentWindowsAccountOrComputer:false,codeSigned:false,errors},null,2)+'\n');
  console.log('Actual alpha ZIP verified without a password: SQLite history, relocation and bundled semantic model.');
}catch(error){await window?.screenshot({path:'test-results/portable-failure.png'}).catch(()=>{});throw error;}finally{await app?.close().catch(()=>{});}
