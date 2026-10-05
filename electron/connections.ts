import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Subject,Concept,Attempt,Estimate,Review,Snapshot} from '../shared/types.js';
import type {CurriculumItem,PortfolioEntry} from '../shared/education.js';
import type {RubricSubmission,RubricVersion} from '../shared/rubrics.js';
import type {ConceptRelation,RelationReview,LearningGraph,RelationSuggestion,TransferSuggestion,InterdisciplinaryProject,ProjectInput,ProjectVersion,ProjectWork,ProjectActivityReview,ProjectSuggestion} from '../shared/connections.js';
import {validDay,dayKey} from '../shared/calendar.js';
const id=z.uuid(),stamp=z.iso.datetime(),ids=z.array(id).max(100).refine(a=>new Set(a).size===a.length,'Hay referencias repetidas.'),title=z.string().trim().min(1).max(160),reason=z.string().trim().min(1).max(2000),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const relationInput=z.object({fromId:id,toId:id,kind:z.enum(['equivalent','prerequisite','related']),reason}).strict();
export const relationRow=relationInput.extend({id,subjectId:id,createdAt:stamp}).strict();
export const relationReviewInput=z.object({id,decision:z.enum(['accepted','rejected','forgotten']),reason}).strict();
export const relationReviewRow=z.object({id,subjectId:id,relationId:id,decision:z.enum(['accepted','rejected','forgotten']),reason,supersedesId:id.nullable(),createdAt:stamp}).strict();
export const projectActivityRow=z.object({id,title,instructions:z.string().trim().min(1).max(6000),subjectIds:ids.refine(a=>a.length>0),conceptIds:ids,curriculumIds:ids,dueOn:z.string().refine(validDay).nullable(),minutes:z.number().int().min(5).max(240)}).strict();
export const projectInput=z.object({subjectIds:ids.refine(a=>a.length>=2,'Elige al menos dos asignaturas.'),title,goal:z.string().trim().min(1).max(2000),description:z.string().max(6000),conceptIds:ids,curriculumIds:ids,activities:z.array(projectActivityRow).min(1).max(30).refine(a=>new Set(a.map(v=>v.id)).size===a.length,'Hay actividades repetidas.')}).strict();
export const projectRow=projectInput.extend({id,subjectId:id,revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp}).strict();
export const projectVersionRow=projectRow.omit({id:true}).extend({id,projectId:id}).strict();
export const projectWorkInput=z.object({projectId:id,activityId:id,source:z.object({kind:z.enum(['attempt','submission','portfolio']),id}).strict(),conceptIds:ids,reflection:z.string().max(4000)}).strict();
export const projectWorkRow=projectWorkInput.omit({source:true}).extend({id,subjectId:id,projectRevision:z.number().int().positive(),source:z.object({kind:z.enum(['attempt','submission','portfolio']),id:id.nullable(),hash}).strict(),evidenceKey:z.string().min(1).max(180),statement:z.string().max(10000),text:z.string().max(50000),originalCreatedAt:stamp,createdAt:stamp}).strict();
export const projectReviewInput=z.object({projectId:id,activityId:id,completed:z.boolean(),workIds:ids,reflection:z.string().max(4000)}).strict();
export const projectReviewRow=projectReviewInput.extend({id,subjectId:id,projectRevision:z.number().int().positive(),supersedesId:id.nullable(),createdAt:stamp}).strict();
export interface ConnectionData { subjects:Subject[];concepts:Concept[];curriculum:CurriculumItem[];attempts:Attempt[];rubric_submissions:RubricSubmission[];rubric_versions:RubricVersion[];portfolio:PortfolioEntry[];concept_relations:ConceptRelation[];relation_reviews:RelationReview[];interdisciplinary_projects:InterdisciplinaryProject[];project_versions:ProjectVersion[];project_works:ProjectWork[];project_activity_reviews:ProjectActivityReview[]; }
export const contentHash=(text:string)=>createHash('sha256').update(text).digest('hex');
export function activeRelations(relations:ConceptRelation[],reviews:RelationReview[]){const latest=new Map(reviews.map(r=>[r.relationId,r]));return relations.filter(r=>latest.get(r.id)?.decision==='accepted');}
export function assertRelationGraph(concepts:Concept[],relations:ConceptRelation[]){
  const byId=new Map(concepts.map(c=>[c.id,c])),parent=new Map(concepts.map(c=>[c.id,c.id]));
  const root=(id:string):string=>{let current=id;const path:string[]=[];while(parent.get(current)!==current){path.push(current);current=parent.get(current)!;}for(const node of path)parent.set(node,current);return current;};
  for(const relation of relations){if(!byId.has(relation.fromId)||!byId.has(relation.toId)||relation.fromId===relation.toId)throw new Error('La relación necesita dos conceptos distintos existentes.');if(relation.kind==='equivalent')parent.set(root(relation.toId),root(relation.fromId));}
  const edges=new Map<string,Set<string>>();
  const add=(from:string,to:string)=>{const a=root(from),b=root(to);if(a===b)throw new Error('Una equivalencia no puede unir un concepto con su prerrequisito.');if(!edges.has(a))edges.set(a,new Set());edges.get(a)!.add(b);};
  for(const concept of concepts)for(const from of concept.prerequisiteIds)add(from,concept.id);
  for(const relation of relations)if(relation.kind==='prerequisite')add(relation.fromId,relation.toId);
  const pending=new Map([...new Set(concepts.map(c=>root(c.id)))].map(id=>[id,0]));for(const tos of edges.values())for(const to of tos)pending.set(to,pending.get(to)!+1);
  const queue=[...pending].filter(([,count])=>!count).map(([id])=>id);let visited=0;
  for(let index=0;index<queue.length;index++){const node=queue[index];visited++;for(const to of edges.get(node)??[]){pending.set(to,pending.get(to)!-1);if(!pending.get(to))queue.push(to);}}
  if(visited!==pending.size)throw new Error('Esta conexión introduce un ciclo de prerrequisitos, también al combinar equivalencias.');
}
export function relationSuggestions(concepts:Concept[],relations:ConceptRelation[]):RelationSuggestion[]{
  const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();const groups=new Map<string,Concept[]>();
  for(const concept of concepts){const key=normal(concept.name);if(key.length>=3)groups.set(key,[...(groups.get(key)??[]),concept]);}
  const existing=new Set(relations.map(r=>[r.fromId,r.toId].sort().join(':'))),result:RelationSuggestion[]=[];
  for(const group of groups.values())for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const a=group[i],b=group[j];if(a.subjectId!==b.subjectId&&!existing.has([a.id,b.id].sort().join(':')))result.push({fromId:a.id,toId:b.id,reason:'Los nombres coinciden al normalizar mayúsculas, acentos y puntuación. Contrasta sus contenidos antes de considerarlos equivalentes.'});}
  return result;
}
export function transferSuggestions(concepts:Concept[],relations:ConceptRelation[],estimates:Estimate[],attempts:Attempt[],reviews:Review[],now=new Date()):TransferSuggestion[]{
  const cs=new Map(concepts.map(c=>[c.id,c])),states=new Map(estimates.map(e=>[e.conceptId,e])),result:TransferSuggestion[]=[];
  for(const relation of relations){if(relation.kind==='related')continue;for(const [fromId,toId] of relation.kind==='equivalent'?[[relation.fromId,relation.toId],[relation.toId,relation.fromId]]:[[relation.fromId,relation.toId]]){
    const from=cs.get(fromId)!,to=cs.get(toId)!,state=states.get(fromId);if(from.subjectId===to.subjectId||state?.status!=='consolidated'||states.get(toId)?.status==='consolidated'||reviews.some(r=>r.conceptId===fromId&&r.nextDate<=dayKey(now)))continue;
    const evidenceIds=state.evidenceIds.filter(id=>attempts.some(a=>a.id===id&&a.conceptId===fromId&&a.source==='verified'&&a.outcome==='correct'&&a.hints===0&&a.createdAt<=now.toISOString()));if(!evidenceIds.length)continue;
    result.push({relationId:relation.id,fromId,toId,evidenceIds,reason:`Hay evidencias comprobadas sin pistas de ${from.name} y una conexión aceptada con ${to.name}. Puedes partir de ese conocimiento y comprobar su aplicación en la otra asignatura; el dominio de destino no cambia.`});
  }}return result;
}
export function learningGraph(d:ConnectionData,relations:ConceptRelation[]):LearningGraph{
  const nodes:LearningGraph['nodes']=[],edges:LearningGraph['edges']=[];const add=(from:string,to:string,kind:LearningGraph['edges'][number]['kind'],relationId:string|null=null)=>edges.push({id:`${kind}:${from}:${to}:${relationId??''}`,from,to,kind,relationId});
  for(const s of d.subjects)nodes.push({id:`subject:${s.id}`,kind:'subject',refId:s.id,subjectId:s.id,label:s.name});
  for(const c of d.concepts){nodes.push({id:`concept:${c.id}`,kind:'concept',refId:c.id,subjectId:c.subjectId,label:c.name});add(`subject:${c.subjectId}`,`concept:${c.id}`,'belongs');for(const id of c.prerequisiteIds)add(`concept:${id}`,`concept:${c.id}`,'prerequisite');}
  for(const c of d.curriculum.filter(c=>c.kind==='competency')){nodes.push({id:`competency:${c.id}`,kind:'competency',refId:c.id,subjectId:c.subjectId,label:c.code?`${c.code} · ${c.title}`:c.title});add(`subject:${c.subjectId}`,`competency:${c.id}`,'belongs');for(const id of c.conceptIds)add(`concept:${id}`,`competency:${c.id}`,'competency');}
  for(const a of d.attempts){nodes.push({id:`evidence:${a.id}`,kind:'evidence',evidenceKind:'attempt',refId:a.id,subjectId:a.subjectId,label:a.statement});if(a.conceptId)add(`evidence:${a.id}`,`concept:${a.conceptId}`,'evidence');else add(`subject:${a.subjectId}`,`evidence:${a.id}`,'belongs');}
  const workNode=(kind:GraphNodeKind,refId:string,subjectId:string,label:string,conceptIds:string[])=>{
    const id=`evidence:${kind}:${refId}`;nodes.push({id,kind:'evidence',evidenceKind:kind,refId,subjectId,label});
    const existing=[...new Set(conceptIds)].filter(id=>d.concepts.some(c=>c.id===id));
    if(existing.length)for(const conceptId of existing)add(id,`concept:${conceptId}`,'evidence');else add(`subject:${subjectId}`,id,'belongs');
  };
  for(const s of d.rubric_submissions){const rubric=d.rubric_versions.find(r=>r.rubricId===s.rubricId&&r.revision===s.rubricRevision);workNode('submission',s.id,s.subjectId,s.title,rubric?.criteria.flatMap(c=>c.conceptIds)??[]);}
  for(const w of d.project_works)workNode('project-work',w.id,w.subjectId,w.statement||'Trabajo de proyecto',w.conceptIds);
  for(const p of d.portfolio)workNode('portfolio',p.id,p.subjectId,p.title,p.conceptIds);
  for(const relation of relations)add(`concept:${relation.fromId}`,`concept:${relation.toId}`,relation.kind,relation.id);
  return {nodes,edges};
}
type GraphNodeKind='submission'|'project-work'|'portfolio';
export function transferContext(d:Pick<Snapshot,'transfers'|'concepts'|'subjects'|'attempts'>,subjectId:string,query:string){
  const candidates=d.transfers.filter(t=>d.concepts.find(c=>c.id===t.toId)?.subjectId===subjectId),words=query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[];
  const score=(id:string)=>words.filter(w=>d.concepts.find(c=>c.id===id)?.name.toLocaleLowerCase().includes(w)).length;
  const selected=candidates.sort((a,b)=>score(b.toId)-score(a.toId))[0];if(!selected)return '';
  const from=d.concepts.find(c=>c.id===selected.fromId)!,to=d.concepts.find(c=>c.id===selected.toId)!,work=d.attempts.find(a=>a.id===selected.evidenceIds[0])!;
  return JSON.stringify({origen:from.name.slice(0,60),materia:d.subjects.find(s=>s.id===from.subjectId)!.name.slice(0,60),destino:to.name.slice(0,60),ejercicio:work.statement.slice(0,80),evidencia:work.id,conexionAceptada:true,dominioDeDestinoNoInferido:true});
}
export function validateProject(input:ProjectInput,d:ConnectionData,historical=false){
  const subjects=new Set(input.subjectIds);if(subjects.size<2||input.subjectIds.some(id=>!d.subjects.some(s=>s.id===id)))throw new Error('El proyecto necesita al menos dos asignaturas existentes.');
  const check=(conceptIds:string[],curriculumIds:string[],scope:Set<string>)=>{if(conceptIds.some(id=>{const c=d.concepts.find(c=>c.id===id);return c?!scope.has(c.subjectId):true;})||curriculumIds.some(id=>{const c=d.curriculum.find(c=>c.id===id);return c?!scope.has(c.subjectId):!historical;}))throw new Error('Los contenidos y currículo deben pertenecer a las asignaturas de la actividad.');};
  check(input.conceptIds,input.curriculumIds,subjects);
  for(const activity of input.activities){if(activity.subjectIds.some(id=>!subjects.has(id))||activity.conceptIds.some(id=>!input.conceptIds.includes(id))||activity.curriculumIds.some(id=>!input.curriculumIds.includes(id)))throw new Error('La actividad debe usar asignaturas, conceptos y currículo del proyecto.');check(activity.conceptIds,activity.curriculumIds,new Set(activity.subjectIds));}
  if(input.subjectIds.some(id=>!input.activities.some(a=>a.subjectIds.includes(id))))throw new Error('Cada asignatura debe participar al menos en una actividad.');
}
export function projectSource(source:{kind:ProjectWork['source']['kind'];id:string},d:ConnectionData){
  if(source.kind==='attempt'){const a=d.attempts.find(a=>a.id===source.id);if(!a)throw new Error('No se encuentra el ejercicio de origen.');return {subjectId:a.subjectId,statement:a.statement,text:a.answer,evidenceKey:`attempt:${a.id}`,createdAt:a.createdAt};}
  if(source.kind==='submission'){const s=d.rubric_submissions.find(s=>s.id===source.id);if(!s)throw new Error('No se encuentra la entrega de origen.');let key=`submission:${s.id}`;if(s.source?.kind==='attempt')key=`attempt:${s.source.id}`;if(s.source?.kind==='portfolio'){const p=d.portfolio.find(p=>p.id===s.source!.id);if(p?.evidenceIds.length===1)key=`attempt:${p.evidenceIds[0]}`;}return {subjectId:s.subjectId,statement:s.instructions,text:s.text,evidenceKey:key,createdAt:s.createdAt};}
  const p=d.portfolio.find(p=>p.id===source.id);if(!p)throw new Error('No se encuentra el trabajo del portfolio.');return {subjectId:p.subjectId,statement:p.title,text:p.content,evidenceKey:p.evidenceIds.length===1?`attempt:${p.evidenceIds[0]}`:`portfolio:${p.id}`,createdAt:p.createdAt};
}
export function projectSuggestions(d:ConnectionData,relations:ConceptRelation[]):ProjectSuggestion[]{return relations.flatMap(relation=>{
  const from=d.concepts.find(c=>c.id===relation.fromId)!,to=d.concepts.find(c=>c.id===relation.toId)!;if(from.subjectId===to.subjectId)return [];const subjectIds=[from.subjectId,to.subjectId],conceptIds=[from.id,to.id],curriculumIds=d.curriculum.filter(c=>subjectIds.includes(c.subjectId)&&c.conceptIds.some(id=>conceptIds.includes(id))).map(c=>c.id);
  const a=d.subjects.find(s=>s.id===from.subjectId)!.name,b=d.subjects.find(s=>s.id===to.subjectId)!.name;
  const stages=[['Comparar los dos contextos',`Explica ${from.name} en ${a} y ${to.name} en ${b}. Identifica datos, reglas y diferencias. Conserva un trabajo original de cada asignatura.`],['Aplicar la conexión',`Elige una situación real que necesite ${from.name} y ${to.name}. Desarrolla una solución desde cada asignatura y comprueba qué conocimientos puedes reutilizar.`],['Explicar y contrastar',`Compara las dos soluciones. Justifica qué se mantiene y qué cambia al pasar de ${a} a ${b}. Señala qué evidencia apoya tu conclusión y qué falta comprobar.`]];
  const input:ProjectInput={title:`Conectar ${from.name} y ${to.name}`.slice(0,160),goal:'Comprobar cómo se aplica un conocimiento en dos asignaturas.',description:`Propuesta basada en una conexión que has aceptado: ${relation.reason}`,subjectIds,conceptIds,curriculumIds,activities:stages.map(([title,instructions])=>({id:randomUUID(),title,instructions,subjectIds,conceptIds,curriculumIds,dueOn:null,minutes:30}))};return [{relationId:relation.id,input,reason:'Esta conexión aceptada permite comparar contenidos y conservar evidencias de ambas materias. Adapta la actividad al currículo y a tu contexto.'}];
});}
export function validateConnections(d:ConnectionData){
  const concepts=new Map(d.concepts.map(c=>[c.id,c])),relations=new Map(d.concept_relations.map(r=>[r.id,r])),latest=new Map<string,RelationReview>(),keys=new Set<string>();
  for(const r of d.concept_relations){if(concepts.get(r.fromId)?.subjectId!==r.subjectId||!concepts.has(r.toId)||r.fromId===r.toId)throw new Error('La relación contiene referencias incompatibles.');const key=`${[r.fromId,r.toId].sort().join(':')}:${r.kind==='prerequisite'?r.fromId:r.kind}`;if(keys.has(key))throw new Error('Hay conexiones duplicadas.');keys.add(key);}
  for(const r of d.relation_reviews){const relation=relations.get(r.relationId),previous=latest.get(r.relationId);if(!relation||r.subjectId!==relation.subjectId||r.createdAt<relation.createdAt||r.supersedesId!==(previous?.id??null)||previous&&r.createdAt<previous.createdAt)throw new Error('La revisión de conexión contiene referencias incompatibles.');latest.set(r.relationId,r);assertRelationGraph(d.concepts,activeRelations(d.concept_relations,[...latest.values()]));}
  assertRelationGraph(d.concepts,activeRelations(d.concept_relations,d.relation_reviews));
  const projects=new Map(d.interdisciplinary_projects.map(p=>[p.id,p])),versions=new Map<string,ProjectVersion>();
  for(const version of d.project_versions){const project=projects.get(version.projectId);if(!project||version.subjectId!==version.subjectIds[0]||version.createdAt!==project.createdAt||version.updatedAt<version.createdAt)throw new Error('La versión no corresponde al proyecto.');const key=`${version.projectId}:${version.revision}`;if(versions.has(key))throw new Error('Versiones de proyecto duplicadas.');versions.set(key,version);validateProject(version,d,true);}
  for(const p of d.interdisciplinary_projects){validateProject(p,d);if(p.subjectId!==p.subjectIds[0])throw new Error('El proyecto contiene un propietario incompatible.');const archived=versions.get(`${p.id}:${p.revision}`);if(!archived)throw new Error('Falta la versión original del proyecto.');const {id:_id,...fields}=p,{id:_version,projectId:_project,...frozen}=archived;if(JSON.stringify(fields)!==JSON.stringify(frozen))throw new Error('La versión actual del proyecto ha sido modificada.');const own=d.project_versions.filter(v=>v.projectId===p.id).sort((a,b)=>a.revision-b.revision);if(own.length!==p.revision||own.some((v,i)=>v.revision!==i+1||v.updatedAt<(own[i-1]?.updatedAt??p.createdAt)))throw new Error('El historial del proyecto es incompatible.');}
  const works=new Map(d.project_works.map(w=>[w.id,w])),duplicates=new Set<string>(),contents=new Set<string>();
  for(const work of d.project_works){const version=versions.get(`${work.projectId}:${work.projectRevision}`),activity=version?.activities.find(a=>a.id===work.activityId);if(!activity||!activity.subjectIds.includes(work.subjectId)||work.conceptIds.some(id=>!activity.conceptIds.includes(id)||concepts.get(id)?.subjectId!==work.subjectId)||work.source.hash!==contentHash(work.text)||work.createdAt<version!.updatedAt||work.createdAt<work.originalCreatedAt)throw new Error('El trabajo no corresponde a la actividad o al original.');if(work.source.id){const source=projectSource({kind:work.source.kind,id:work.source.id},d);if(source.subjectId!==work.subjectId||source.statement!==work.statement||source.text!==work.text||source.createdAt!==work.originalCreatedAt||source.evidenceKey!==work.evidenceKey)throw new Error('La evidencia no coincide con el trabajo original.');}const scope=`${work.projectId}:${work.projectRevision}:${work.activityId}`,key=`${scope}:${work.evidenceKey}`,content=`${scope}:${contentHash(JSON.stringify([work.subjectId,work.statement,work.text]))}`;if(duplicates.has(key)||contents.has(content))throw new Error('El mismo trabajo está repetido en la actividad.');duplicates.add(key);contents.add(content);}
  const prior=new Map<string,ProjectActivityReview>();for(const review of d.project_activity_reviews){const version=versions.get(`${review.projectId}:${review.projectRevision}`),activity=version?.activities.find(a=>a.id===review.activityId),key=`${review.projectId}:${review.projectRevision}:${review.activityId}`,previous=prior.get(key);if(!version||!activity||review.subjectId!==version.subjectId||review.createdAt<version.updatedAt||review.supersedesId!==(previous?.id??null)||previous&&review.createdAt<previous.createdAt||review.workIds.some(id=>{const w=works.get(id);return !w||w.projectId!==review.projectId||w.projectRevision!==review.projectRevision||w.activityId!==review.activityId||w.createdAt>review.createdAt;}))throw new Error('La revisión no corresponde a la actividad del proyecto.');if(review.completed&&activity.subjectIds.some(id=>!review.workIds.some(workId=>works.get(workId)?.subjectId===id)))throw new Error('La actividad necesita una evidencia de cada asignatura participante.');prior.set(key,review);}
}
