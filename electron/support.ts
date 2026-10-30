import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Snapshot,StudyTask} from '../shared/types.js';
import type {LmsItem} from '../shared/lms.js';
import type {MoodleLinkProposal,ScheduleProposal,StudyExercise,AnswerReview} from '../shared/support.js';
import {validDay} from '../shared/calendar.js';
const ids=z.array(z.uuid()).max(30).refine(rows=>new Set(rows).size===rows.length);
export const linkRow=z.object({taskId:z.uuid(),taskVersion:z.string().regex(/^[a-f0-9]{64}$/),itemId:z.uuid(),revision:z.number().int().positive(),unitId:z.uuid().nullable(),conceptIds:ids,curriculumIds:ids,quote:z.string().min(5).max(500),reason:z.string().trim().min(1).max(1000)}).strict();
const day=z.string().refine(validDay,'La fecha no es válida.');
export const scheduleRow=z.object({unitId:z.uuid(),unitVersion:z.string().regex(/^[a-f0-9]{64}$/),startsOn:day,endsOn:day,weeks:z.number().int().min(1).max(12),quote:z.string().max(500),estimated:z.boolean()}).strict().refine(row=>row.startsOn<=row.endsOn,'Revisa el orden de las fechas.');
export const versionHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function activityText(item:LmsItem){if(item.data.kind!=='activity')throw new Error('Selecciona una actividad de Moodle.');return [item.data.title,item.data.instructions,item.data.submissionFeedback??''].join('\n');}
export function validateLinks(value:unknown,subjectId:string,snapshot:Omit<Snapshot,'model'|'storagePath'>):MoodleLinkProposal[]{
  const rows=z.array(linkRow).max(500).parse(value),seen=new Set<string>();
  for(const row of rows){
    const task=snapshot.tasks.find(task=>task.id===row.taskId),item=snapshot.lmsItems.find(item=>item.id===row.itemId);
    if(seen.has(row.taskId)||!task||!item||!item.active||task.subjectId!==subjectId||item.subjectId!==subjectId||task.lms?.itemId!==item.id||item.revision!==row.revision||versionHash(task)!==row.taskVersion)throw new Error('Moodle o la tarea han cambiado. Prepara una propuesta nueva.');
    seen.add(row.taskId);
    if(!activityText(item).includes(row.quote))throw new Error('La propuesta no cita el trabajo original.');
    if(row.unitId&&!snapshot.units.some(unit=>unit.id===row.unitId&&unit.subjectId===subjectId)||row.conceptIds.some(id=>!snapshot.concepts.some(c=>c.id===id&&c.subjectId===subjectId))||row.curriculumIds.some(id=>!snapshot.curriculum.some(c=>c.id===id&&c.subjectId===subjectId)))throw new Error('La propuesta relaciona elementos de otra asignatura.');
  }
  return rows;
}
export function validateSchedule(value:unknown,subjectId:string,snapshot:Omit<Snapshot,'model'|'storagePath'>){
  const rows=z.array(scheduleRow).max(300).parse(value),seen=new Set<string>();
  for(const row of rows){const unit=snapshot.units.find(unit=>unit.id===row.unitId&&unit.subjectId===subjectId);if(!unit||seen.has(row.unitId)||versionHash(unit)!==row.unitVersion)throw new Error('La unidad ha cambiado. Prepara un calendario nuevo.');seen.add(row.unitId);if(row.quote&&!unit.objectives.includes(row.quote))throw new Error('La temporalización no cita la unidad original.');if(!row.estimated&&!row.quote)throw new Error('Falta la referencia de la temporalización.');}
  return rows;
}
export function sourceTask(snapshot:Omit<Snapshot,'model'|'storagePath'>,task:StudyTask){const item=snapshot.lmsItems.find(item=>item.id===task.lms?.itemId&&item.active);if(!item||item.data.kind!=='activity')return;return item;}
export const exerciseRow=z.object({kind:z.enum(['recall','application','reasoning']),title:z.string().trim().min(1).max(120),statement:z.string().trim().min(10).max(4000),hints:z.array(z.string().trim().min(1).max(1000)).min(1).max(3),checkpoints:z.array(z.string().trim().min(1).max(1000)).min(1).max(5),quote:z.string().min(5).max(500)}).strict();
export const packSchema={type:'object',properties:{exercises:{type:'array',minItems:3,maxItems:3,items:{type:'object',properties:{kind:{type:'string',enum:['recall','application','reasoning']},title:{type:'string',minLength:1,maxLength:120},statement:{type:'string',minLength:10,maxLength:4000},hints:{type:'array',minItems:1,maxItems:3,items:{type:'string',minLength:1,maxLength:1000}},checkpoints:{type:'array',minItems:1,maxItems:5,items:{type:'string',minLength:1,maxLength:1000}},quote:{type:'string',minLength:5,maxLength:500}},required:['kind','title','statement','hints','checkpoints','quote'],additionalProperties:false}}},required:['exercises'],additionalProperties:false};
export function validateExercises(value:unknown,source:string):StudyExercise[]{const rows=z.array(exerciseRow).length(3).parse(value);if(new Set(rows.map(row=>row.kind)).size!==3||rows.some(row=>!source.includes(row.quote)))throw new Error('La práctica no cubre las tres formas de trabajar o inventa una referencia.');return rows;}
export function validateAnswerReview(value:unknown,answer:string):AnswerReview {const row=z.object({observations:z.array(z.object({quote:z.string().min(1).max(1000),comment:z.string().min(1).max(1500)}).strict()).max(5),nextStep:z.string().min(1).max(1500)}).strict().parse(value);if(row.observations.some(o=>!answer.includes(o.quote)))throw new Error('El comentario no cita tu respuesta.');return row;}
export function addDays(value:string,count:number){const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10);}
