import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Attempt, Concept, Snapshot } from '../shared/types.js';
import type { PortfolioEntry } from '../shared/education.js';
import type { RubricSubmission } from '../shared/rubrics.js';
import { SKILLS, type WorkContext, type WorkRef, type LearningAnalysis, type LearningObservation, type ObservationReview, type SkillProfile, type Intervention, type PracticeActivity, type InterventionResponse, type InterventionReview } from '../shared/pedagogy.js';
import { arithmeticSteps, arithmeticValue, arithmeticVariants, sameArithmeticValue } from './arithmetic.js';
import { rubricFragments } from './rubrics.js';
import { dayKey, addDays } from '../shared/calendar.js';
import { EXERCISES, matchesBankAnswer } from './learning.js';
export const SKILL_NAMES = { reading: 'Comprensión lectora', graphs: 'Interpretación de gráficas', 'problem-solving': 'Resolución de problemas', writing: 'Expresión escrita', calculation: 'Cálculo', logic: 'Pensamiento lógico' };
export const ERROR_NAMES = { conceptual: 'Posible error conceptual', procedure: 'Posible error de procedimiento', calculation: 'Posible error de cálculo', reading: 'Posible error de comprensión', writing: 'Posible error de expresión' };
export const PEDAGOGY_PROMPT_VERSION = 'pedagogy-1';
const id = z.uuid(), stamp = z.iso.datetime(), hash = z.string().regex(/^[a-f0-9]{64}$/);
const quote = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(20000) }).strict();
const step = quote.extend({ expression: z.string().min(1).max(300), value: z.string().max(1500), claimed: z.string().max(2000), correct: z.boolean(), line: z.number().int().positive() });
const skill = z.enum(SKILLS), error = z.enum(['conceptual', 'procedure', 'calculation', 'reading', 'writing']);
export const workInput = z.object({ kind: z.enum(['attempt', 'submission']), id }).strict();
export const workRefRow = workInput.extend({ hash });
export const observationInput = workInput.extend({ skill, signal: z.enum(['difficulty', 'strength']), error: error.nullable(), quote, description: z.string().trim().min(1).max(1500) });
export const analysisRow = z.object({ id, subjectId: id, source: workRefRow, engine: z.enum(['arithmetic', 'local-ai', 'self']), model: z.object({ name: z.string().min(1).max(200), promptVersion: z.literal(PEDAGOGY_PROMPT_VERSION) }).nullable(), coverage: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })).max(100), observations: z.array(z.object({ id, signal: z.enum(['difficulty','strength']), skill, error: error.nullable(), quotes: z.array(quote).min(1).max(3), description: z.string().max(1500), arithmetic: step.nullable() }).strict()).max(1000), steps: z.array(step).max(1000), createdAt: stamp }).strict();
export const observationReviewInput = z.object({ analysisId: id, observationId: id, decision: z.enum(['accepted','rejected','forgotten']), reason: z.string().trim().min(1).max(2000), followUpResponseId: id.nullable().default(null) });
export const observationReviewRow = observationReviewInput.extend({ id, subjectId: id, supersedesId: id.nullable(), createdAt: stamp }).strict();
const activityRow = z.object({ id, kind: z.enum(['arithmetic','bank','open']), statement: z.string().min(1).max(10000), hint: z.string().max(2000), expression: z.string().max(300).nullable(), conceptId: id.nullable(), followUp: z.boolean(), expected: z.string().max(2000), feedback: z.string().max(10000), bankName: z.string().max(120).nullable(), bankIndex: z.number().int().nonnegative().nullable() }).strict();
export const interventionInput = z.object({ analysisId: id, observationId: id, minutes: z.union([z.literal(10),z.literal(20),z.literal(30)]) });
export const interventionRow = z.object({ id, subjectId: id, analysisId: id, observationId: id, skill, help: z.string().max(2000), explanation: z.string().max(2000), minutes: z.union([z.literal(10),z.literal(20),z.literal(30)]), activities: z.array(activityRow).length(3), followUpOn: z.string(), createdAt: stamp }).strict();
export type InterventionRecord = z.infer<typeof interventionRow>;
export const interventionAnswerInput = z.object({ interventionId: id, activityId: id, answer: z.string().trim().min(1).max(20000), hints: z.number().int().min(0).max(50), durationSeconds: z.number().int().min(0).max(86400) });
export const interventionResponseRow = interventionAnswerInput.extend({ id, subjectId: id, expected: z.string().max(2000), feedback: z.string().max(10000), outcome: z.enum(['correct','incorrect','ungraded']), createdAt: stamp }).strict();
export const interventionReviewInput = z.object({ interventionId: id, whatHelped: z.string().trim().min(1).max(2000), reflection: z.string().max(2000), nextStep: z.string().trim().min(1).max(2000) });
export const interventionReviewRow = interventionReviewInput.extend({ id, subjectId: id, createdAt: stamp }).strict();
export function workHash(text: string) { return createHash('sha256').update(text).digest('hex'); }
export function workContext(ref: Pick<WorkRef, 'kind' | 'id'>, attempts: Attempt[], submissions: RubricSubmission[], portfolio: PortfolioEntry[]): WorkContext {
  if (ref.kind === 'attempt') {
    const row = attempts.find(a => a.id === ref.id); if (!row) throw new Error('No se encuentra el ejercicio original.');
    return { ref: { kind: ref.kind, id: ref.id, hash: workHash(row.answer) }, subjectId: row.subjectId, question: row.statement, text: row.answer, conceptIds: row.conceptId ? [row.conceptId] : [], evidenceKey: row.ocrSource ? `capture:${row.ocrSource.sourceHash}:${row.ocrSource.sourcePage}` : `attempt:${row.id}`, createdAt: row.createdAt };
  }
  const row = submissions.find(s => s.id === ref.id); if (!row) throw new Error('No se encuentra la entrega original.');
  let evidenceKey = `submission:${row.id}`;
  const attemptKey = (id: string) => { const source = attempts.find(a => a.id === id)?.ocrSource; return source ? `capture:${source.sourceHash}:${source.sourcePage}` : `attempt:${id}`; };
  if (row.source?.kind === 'attempt') evidenceKey = attemptKey(row.source.id);
  if (row.source?.kind === 'portfolio') { const entry = portfolio.find(p => p.id === row.source!.id); if (entry?.evidenceIds.length === 1) evidenceKey = attemptKey(entry.evidenceIds[0]); }
  return { ref: { kind: ref.kind, id: ref.id, hash: workHash(row.text) }, subjectId: row.subjectId, question: row.instructions, text: row.text, conceptIds: [], evidenceKey, createdAt: row.createdAt };
}
export function checkQuote(q: { start: number; end: number; text: string }, text: string) {
  if (q.end <= q.start || q.end > text.length || text.slice(q.start, q.end) !== q.text) throw new Error('El fragmento no coincide con el trabajo original.');
}
export function observationDescription(row: Pick<LearningObservation, 'skill' | 'error' | 'signal'>) { return row.signal === 'strength' ? `Posible fortaleza en ${SKILL_NAMES[row.skill].toLowerCase()}. Contrasta el fragmento con lo que pide la actividad.` : `${row.error ? ERROR_NAMES[row.error] : 'Posible dificultad'} relacionada con ${SKILL_NAMES[row.skill].toLowerCase()}. Revisa el fragmento y decide si esta hipótesis te representa.`; }
export function arithmeticAnalysis(work: WorkContext): Omit<LearningAnalysis, 'id' | 'createdAt'> {
  const steps = arithmeticSteps(work.text);
  const observations: LearningObservation[] = steps.filter(s => !s.correct).map(s => ({ id: randomUUID(), signal: 'difficulty', skill: 'calculation', error: 'calculation', quotes: [{ start:s.start,end:s.end,text:s.text }], arithmetic: s, description: `La igualdad numérica no coincide: ${s.expression} vale ${s.value}. Esta comprobación no evalúa el resto del razonamiento.` }));
  return { subjectId: work.subjectId, source: work.ref, engine: 'arithmetic', model: null, coverage: [{ start:0,end:work.text.length }], observations, steps };
}
export function validateAnalysis(row: LearningAnalysis, work: WorkContext) {
  if (row.subjectId !== work.subjectId || row.source.hash !== work.ref.hash || row.createdAt < work.createdAt) throw new Error('El análisis no corresponde al trabajo original.');
  let end = 0; for (const span of row.coverage) { if (span.start !== end || span.end < span.start || span.end > work.text.length) throw new Error('El análisis contiene una cobertura incompatible.'); end = span.end; } if (end !== work.text.length) throw new Error('El análisis no cubre el trabajo original.');
  if ((row.engine === 'local-ai') !== Boolean(row.model) || row.engine !== 'arithmetic' && row.steps.length) throw new Error('El análisis tiene un origen incompatible.');
  if (new Set(row.observations.map(o => o.id)).size !== row.observations.length) throw new Error('Hay observaciones duplicadas.');
  for (const observation of row.observations) {
    for (const q of observation.quotes) checkQuote(q, work.text);
    if (observation.signal === 'strength' && observation.error !== null) throw new Error('Una fortaleza no puede tener un tipo de error.');
    if (row.engine !== 'arithmetic' && observation.arithmetic) throw new Error('Una propuesta no es una comprobación aritmética.');
    if (row.engine === 'local-ai' && observation.description !== observationDescription(observation)) throw new Error('La propuesta automática contiene feedback no verificable.');
  }
  if (row.engine === 'arithmetic') {
    const expected = arithmeticAnalysis(work); if (JSON.stringify(row.steps) !== JSON.stringify(expected.steps) || row.observations.length !== expected.observations.length || row.observations.some((o,i) => { const e=expected.observations[i]; return o.skill!==e.skill || o.error!==e.error || o.signal!==e.signal || o.description!==e.description || JSON.stringify(o.arithmetic)!==JSON.stringify(e.arithmetic) || JSON.stringify(o.quotes)!==JSON.stringify(e.quotes); })) throw new Error('Las comprobaciones aritméticas no coinciden con el trabajo.');
  }
}
export function skillProfiles(analyses: LearningAnalysis[], reviews: ObservationReview[], contexts: Map<string, WorkContext>): SkillProfile[] {
  const latest = new Map<string, ObservationReview>(); for (const r of reviews) latest.set(r.observationId, r);
  return SKILLS.map(skill => {
    const accepted = analyses.flatMap(a => a.observations.filter(o => o.skill===skill && latest.get(o.id)?.decision==='accepted').map(o => ({ analysis:a, observation:o, context:contexts.get(a.id)! })));
    const groups: typeof accepted[] = [];
    const keys = (item: typeof accepted[number]) => [item.context.evidenceKey, `content:${workHash(JSON.stringify([item.context.question.trim().replace(/\s+/g,' '),item.context.text.trim().replace(/\s+/g,' ')]))}`];
    for (const item of accepted) {
      const matches=groups.filter(group=>group.some(previous=>keys(previous).some(key=>keys(item).includes(key))));
      if(!matches.length)groups.push([item]);else{matches[0].push(item);for(const extra of matches.slice(1)){matches[0].push(...extra);groups.splice(groups.indexOf(extra),1);}}
    }
    const negative = groups.filter(g=>g.some(i=>i.observation.signal==='difficulty')).length, positive = groups.filter(g=>g.some(i=>i.observation.signal==='strength')).length;
    const representatives=groups.map(group=>group.slice().sort((a,b)=>a.context.createdAt.localeCompare(b.context.createdAt)||a.analysis.createdAt.localeCompare(b.analysis.createdAt))[0]);
    const subjectIds = [...new Set(representatives.map(a=>a.analysis.subjectId))], dayCount = new Set(representatives.map(a=>dayKey(new Date(a.context.createdAt)))).size;
    const consistent = negative === 0 || positive === 0, supported = groups.length>=3 && subjectIds.length>=2 && dayCount>=2 && consistent;
    const state: SkillProfile['state'] = !groups.length?'unseen':!consistent?'mixed':negative ? supported?'supported-hypothesis':'to-check':'positive';
    return { skill,state,confidence:supported?'medium':'low',analysisIds:[...new Set(accepted.map(i=>i.analysis.id))],observationIds:accepted.map(i=>i.observation.id),subjectIds,workCount:groups.length,dayCount,reason:!groups.length?'No hay observaciones aceptadas para esta habilidad.':!consistent?'Hay observaciones de dificultad y fortaleza. Revisa sus contextos antes de concluir.':negative ? supported?`Hipótesis apoyada por ${groups.length} trabajos de ${subjectIds.length} asignaturas en ${dayCount} días. No constituye un diagnóstico.`:'Es una hipótesis inicial. Faltan trabajos de otras asignaturas y días para contrastarla.':`Hay observaciones positivas en ${groups.length} trabajos. Esto no demuestra todavía un dominio general de la habilidad.` };
  });
}
export function analysisPrompts(work: WorkContext) {
  if (!work.text.trim()) throw new Error('El trabajo no contiene un intento para analizar.');
  const fragments = rubricFragments(work.text); const groups: typeof fragments[] = []; let current: typeof fragments = [], length=0;
  for (const fragment of fragments) { if (length+fragment.text.length>3200 && current.length) {groups.push(current);current=[];length=0;} current.push(fragment);length+=fragment.text.length;} if(current.length)groups.push(current);
  const checked=arithmeticSteps(work.text);
  return groups.map(group => {
    const system = 'Classify the student work. A wrong numerical equality means signal=difficulty, skill=calculation, error=calculation. Return JSON with quoteIds from the work. No work means signal=none.';
    const numeric=checked.filter(s=>!s.correct&&s.start>=group[0].start&&s.end<=group.at(-1)!.end).slice(0,3).map(s=>({studentEquality:s.text.slice(0,200),isCorrect:false,...(s.value.length<=160?{verifiedValue:s.value}:{})}));
    const user=`TASK (context): ${work.question}\nVERIFIED ARITHMETIC ERRORS: ${JSON.stringify(numeric)}\nORIGINAL STUDENT WORK (characters ${group[0].start} to ${group.at(-1)!.end}):\n${group.map(f=>`[${f.index}] ${JSON.stringify(f.text)}`).join('\n')}`;
    if(system.length+user.length>6000)throw new Error('El enunciado completo y el trabajo superan el contexto del análisis. Puedes revisarlos personalmente. No se ha recortado ni guardado un análisis parcial.');
    const schema={type:'object',properties:{signal:{type:'string',enum:['none','difficulty','strength']},skill:{type:'string',enum:SKILLS},error:{type:'string',enum:['none','conceptual','procedure','calculation','reading','writing']},quoteIds:{type:'array',items:{type:'integer',enum:group.map(f=>f.index)},minItems:0,maxItems:3}},required:['signal','skill','error','quoteIds'],additionalProperties:false};
    return {messages:[{role:'system',content:system},{role:'user',content:user}],schema,fragments:group,coverage:{start:group[0].start,end:group.at(-1)!.end}};
  });
}
export function parseObservation(raw:string, fragments:ReturnType<typeof rubricFragments>):LearningObservation|null{
  const parsed=z.object({signal:z.enum(['none','difficulty','strength']),skill,error:z.union([error,z.literal('none')]),quoteIds:z.array(z.number().int().nonnegative()).max(3)}).strict().parse(JSON.parse(raw));
  if(parsed.signal==='none')return null; if(!parsed.quoteIds.length)throw new Error('La propuesta necesita un fragmento del trabajo.');
  const quotes=[...new Set(parsed.quoteIds)].map(id=>{const f=fragments.find(f=>f.index===id);if(!f||!f.text.trim())throw new Error('La IA citó un fragmento inexistente.');return {start:f.start,end:f.end,text:f.text};});
  const result:LearningObservation={id:randomUUID(),signal:parsed.signal,skill:parsed.skill,error:parsed.signal==='strength'||parsed.error==='none'?null:parsed.error,quotes,arithmetic:null,description:''};result.description=observationDescription(result);return result;
}
export function pedagogyContext(data:Pick<Snapshot,'learningAnalyses'|'observationReviews'|'interventions'|'interventionReviews'>,subjectId:string,query:string):string {
  const latest=new Map(data.observationReviews.map(r=>[r.observationId,r]));
  const candidates=data.learningAnalyses.filter(a=>a.subjectId===subjectId).flatMap(a=>a.observations.filter(o=>latest.get(o.id)?.decision==='accepted').map(o=>({a,o})));
  const words=query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[];
  candidates.sort((a,b)=>words.filter(w=>b.o.quotes.some(q=>q.text.toLowerCase().includes(w))).length-words.filter(w=>a.o.quotes.some(q=>q.text.toLowerCase().includes(w))).length||b.a.createdAt.localeCompare(a.a.createdAt));
  const chosen=candidates[0];if(!chosen)return '';
  const plan=data.interventions.filter(i=>i.observationId===chosen.o.id).at(-1),reflection=plan?data.interventionReviews.filter(r=>r.interventionId===plan.id).at(-1):undefined;
  const result={hipotesisPersonal:SKILL_NAMES[chosen.o.skill],señal:chosen.o.signal,evidencia:chosen.o.quotes[0].text.slice(0,140),ayudaQueDiceQueFunciono:reflection?.whatHelped.slice(0,120)??'',sinValorDiagnostico:true};
  return JSON.stringify(result);
}
const HELP:Record<Intervention['skill'],string>={reading:'Reformula qué pide la actividad y separa los datos relevantes antes de responder.',graphs:'Identifica los ejes, unidades y escala. Describe un dato concreto antes de interpretar la tendencia.','problem-solving':'Separa datos, objetivo y estrategia. Justifica cada paso y comprueba si el resultado responde a la pregunta.',writing:'Escribe una idea por frase, conecta las ideas y revisa si un lector entendería tu explicación.',calculation:'Escribe cada operación, comprueba el orden de cálculo y estima el resultado antes de calcular.',logic:'Explica la regla que aplicas, prueba un ejemplo y busca un caso que permita comprobarla.'};
function interventionStep(observation:LearningObservation,work:WorkContext){return observation.arithmetic??(observation.skill==='calculation'&&observation.error==='calculation'?arithmeticSteps(work.text).find(s=>!s.correct&&observation.quotes.some(q=>q.start<=s.start&&q.end>=s.end)):undefined);}
export function createIntervention(analysis:LearningAnalysis,observation:LearningObservation,work:WorkContext,minutes:Intervention['minutes'],concept?:{id:string;name:string}):InterventionRecord{
  let activities:z.infer<typeof activityRow>[]=[];
  const numeric=interventionStep(observation,work);
  if(numeric){ activities=arithmeticVariants(numeric.expression).map((expression,i)=>({id:randomUUID(),kind:'arithmetic',statement:`Calcula ${expression}. Escribe el resultado numérico o una fracción.`,hint:'Resuelve primero los paréntesis y las potencias; después multiplicaciones y divisiones, y finalmente sumas y restas.',expression,conceptId:null,followUp:i===2,expected:arithmeticValue(expression),feedback:`${expression} = ${arithmeticValue(expression)}.`,bankName:null,bankIndex:null})); }
  else if(concept && EXERCISES[concept.name]?.length>=3){activities=EXERCISES[concept.name].map((item,index)=>({item,index})).filter(({item})=>item.statement!==work.question).slice(0,3).map(({item,index},i)=>({id:randomUUID(),kind:'bank',statement:item.statement,hint:item.hint,expression:null,conceptId:concept.id,followUp:i===2,expected:item.answer,feedback:item.feedback,bankName:concept.name,bankIndex:index}));}
  if(activities.length!==3)activities=[`Revisa este fragmento de tu trabajo: «${observation.quotes[0].text}». Explica qué querías expresar y qué revisarías.`,`Vuelve al enunciado: ${work.question.slice(0,1200)}. Propón una nueva respuesta siguiendo la estrategia de ayuda.`,`Sin mirar tu respuesta anterior, explica qué estrategia usarías ante una actividad parecida y cómo comprobarías tu respuesta.`].map((statement,i)=>({id:randomUUID(),kind:'open',statement,hint:HELP[observation.skill],expression:null,conceptId:null,followUp:i===2,expected:'',feedback:'Respuesta conservada para reflexión y comparación. Esta actividad abierta no tiene corrección automática.',bankName:null,bankIndex:null}));
  const time=new Date(Math.max(Date.now(),Date.parse(analysis.createdAt))).toISOString();
  return {id:randomUUID(),subjectId:analysis.subjectId,analysisId:analysis.id,observationId:observation.id,skill:observation.skill,help:HELP[observation.skill],explanation:`Se propone este refuerzo por el fragmento «${observation.quotes[0].text.slice(0,500)}». Comprueba la observación antes de utilizarlo.`,minutes,activities,createdAt:time,followUpOn:addDays(dayKey(new Date(time)),1)};
}
export function publicIntervention(row:InterventionRecord):Intervention{return {...row,activities:row.activities.map(({expected:_expected,feedback:_feedback,bankName:_name,bankIndex:_index,...activity})=>activity)};}
export function gradeIntervention(activity:InterventionRecord['activities'][number],answer:string):Pick<InterventionResponse,'outcome'|'expected'|'feedback'>{return {outcome:activity.kind==='open'?'ungraded':(activity.kind==='arithmetic'?sameArithmeticValue(answer,activity.expected):matchesBankAnswer(answer,activity.expected))?'correct':'incorrect',expected:activity.expected,feedback:activity.feedback};}
export function validatePedagogyTables(t:{learning_analyses:LearningAnalysis[];observation_reviews:ObservationReview[];interventions:InterventionRecord[];intervention_responses:InterventionResponse[];intervention_reviews:InterventionReview[];attempts:Attempt[];rubric_submissions:RubricSubmission[];portfolio:PortfolioEntry[];concepts:Concept[]}){
  const analyses=new Map(t.learning_analyses.map(a=>[a.id,a])),reviews=new Map(t.observation_reviews.map(r=>[r.id,r])),interventions=new Map(t.interventions.map(i=>[i.id,i])),responses=new Map(t.intervention_responses.map(r=>[r.id,r]));const globalObservations=new Set<string>();
  for(const a of t.learning_analyses){const work=workContext(a.source,t.attempts,t.rubric_submissions,t.portfolio);validateAnalysis(a,work);for(const o of a.observations){if(globalObservations.has(o.id))throw new Error('Observaciones duplicadas.');globalObservations.add(o.id);}}
  const latest=new Map<string,ObservationReview>();
  for(const r of t.observation_reviews){const a=analyses.get(r.analysisId),previous=latest.get(r.observationId);if(!a||a.subjectId!==r.subjectId||!a.observations.some(o=>o.id===r.observationId)||r.createdAt<a.createdAt||r.supersedesId!==(previous?.id??null)||previous&&r.createdAt<previous.createdAt)throw new Error('La revisión contiene referencias incompatibles.');if(r.followUpResponseId){const response=responses.get(r.followUpResponseId),plan=response?interventions.get(response.interventionId):undefined;if(!response||plan?.observationId!==r.observationId||response.createdAt>r.createdAt)throw new Error('La revisión no corresponde a la comprobación posterior.');}latest.set(r.observationId,r);}
  for(const i of t.interventions){const a=analyses.get(i.analysisId),o=a?.observations.find(o=>o.id===i.observationId);if(!a||!o||a.subjectId!==i.subjectId||o.skill!==i.skill||i.createdAt<a.createdAt||i.followUpOn!==addDays(dayKey(new Date(i.createdAt)),1)||i.activities.filter(a=>a.followUp).length!==1||!i.activities[2].followUp||new Set(i.activities.map(a=>a.id)).size!==3)throw new Error('El refuerzo contiene referencias incompatibles.');for(const activity of i.activities){if(activity.kind==='arithmetic'){if(!activity.expression||activity.expected!==arithmeticValue(activity.expression)||activity.statement!==`Calcula ${activity.expression}. Escribe el resultado numérico o una fracción.`||activity.feedback!==`${activity.expression} = ${activity.expected}.`||activity.conceptId||activity.bankName!==null||activity.bankIndex!==null)throw new Error('El cálculo del refuerzo no es verificable.');}else if(activity.kind==='bank'){const bank=activity.bankName?EXERCISES[activity.bankName]:undefined,original=activity.bankIndex!==null?bank?.[activity.bankIndex]:undefined;if(!original||!activity.conceptId||!t.concepts.some(c=>c.id===activity.conceptId&&c.name===activity.bankName&&c.subjectId===i.subjectId)||activity.statement!==original.statement||activity.expected!==original.answer||activity.feedback!==original.feedback||activity.hint!==original.hint||activity.expression!==null)throw new Error('El ejercicio del refuerzo no pertenece al banco.');}else if(activity.expected||activity.expression||activity.conceptId||activity.bankName!==null||activity.bankIndex!==null)throw new Error('Una actividad abierta no puede tener una corrección automática.');}}
  for(const plan of t.interventions){
    const analysis=analyses.get(plan.analysisId)!,observation=analysis.observations.find(o=>o.id===plan.observationId)!;
    const accepted=t.observation_reviews.filter(r=>r.observationId===observation.id&&r.createdAt<=plan.createdAt).at(-1);
    if(observation.signal!=='difficulty'||accepted?.decision!=='accepted')throw new Error('El refuerzo necesita una observación aceptada antes de iniciarse.');
    const numeric=interventionStep(observation,workContext(analysis.source,t.attempts,t.rubric_submissions,t.portfolio));
    if(numeric){const variants=arithmeticVariants(numeric.expression);if(plan.activities.some((a,i)=>a.kind!=='arithmetic'||a.expression!==variants[i]))throw new Error('El refuerzo no deriva del cálculo original.');}
    else if(plan.activities.some(a=>a.kind==='arithmetic'))throw new Error('El refuerzo aritmético necesita un cálculo comprobado.');
  }
  const answered=new Set<string>();
  for(const r of t.intervention_responses){const i=interventions.get(r.interventionId),a=i?.activities.find(a=>a.id===r.activityId);if(!i||!a||i.subjectId!==r.subjectId||r.createdAt<i.createdAt||answered.has(r.activityId))throw new Error('La respuesta no corresponde al refuerzo.');answered.add(r.activityId);const grade=gradeIntervention(a,r.answer);if(r.expected!==grade.expected||r.feedback!==grade.feedback||r.outcome!==grade.outcome)throw new Error('La corrección del refuerzo no es verificable.');if(a.followUp&&(dayKey(new Date(r.createdAt))<i.followUpOn||i.activities.filter(a=>!a.followUp).some(a=>!t.intervention_responses.some(previous=>previous.activityId===a.id&&previous.createdAt<=r.createdAt))))throw new Error('La comprobación posterior debe realizarse después de la práctica y en otro día.');}
  for(const r of t.intervention_reviews){const i=interventions.get(r.interventionId);if(!i||i.subjectId!==r.subjectId||r.createdAt<i.createdAt)throw new Error('La reflexión no corresponde al refuerzo.');}
}
