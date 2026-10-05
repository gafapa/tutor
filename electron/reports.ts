import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { Attempt, Concept, Subject, Estimate } from '../shared/types.js';
import type { DidacticUnit, CurriculumItem, EducationalEvent } from '../shared/education.js';
import type { InterventionReview } from '../shared/pedagogy.js';
import type { LearningReport, ReportConcept, ReportInput, ReportPreference } from '../shared/reports.js';
import { addDays, dayKey, validDay } from '../shared/calendar.js';
import { estimate } from './learning.js';

const id = z.uuid(), stamp = z.iso.datetime(), day = z.string().refine(validDay),
  ids = z.array(id).max(100).refine(values => new Set(values).size === values.length);
const estimateRow = z.object({ conceptId: id, status: z.enum(['consolidated', 'progress', 'reinforce', 'unseen']), confidence: z.enum(['low', 'medium', 'high']), reason: z.string().max(2000), evidenceIds: z.array(id).max(8) }).strict();
export const reportInput = z.object({ subjectId: id, kind: z.enum(['weekly', 'unit', 'transition']), startsOn: day, endsOn: day, unitId: id.nullable().default(null), targetCourse: z.string().trim().max(120).default(''), conceptIds: ids.default([]), helpIds: ids.max(20).default([]), reflection: z.string().max(4000).default(''), supersedesId: id.nullable().default(null) }).strict();
const conceptRow = z.object({ conceptId: id, name: z.string().min(1).max(120), before: estimateRow, after: estimateRow, change: z.enum(['first-evidence', 'improved', 'regressed', 'stable', 'check-again']), recommendation: z.object({ action: z.enum(['practice', 'review', 'check']), reason: z.string().max(3000), evidenceIds: z.array(id).max(8) }).strict(), prerequisites: z.array(z.object({ id, name: z.string().max(120) }).strict()).max(100) }).strict();
export const reportRow = z.object({
  id, subjectId: id, kind: z.enum(['weekly', 'unit', 'transition']), title: z.string().min(1).max(300),
  subject: z.object({ name: z.string().max(120), course: z.string().max(120), level: z.string().max(120) }).strict(),
  unit: z.object({ id, title: z.string().max(160), curriculum: z.array(z.object({ id, code: z.string().max(80), title: z.string().max(200), kind: z.enum(['competency', 'criterion', 'content', 'outcome']) }).strict()).max(100) }).strict().nullable(),
  targetCourse: z.string().max(120), startsOn: day, endsOn: day, periodStartAt: stamp, asOf: stamp, timezone: z.string().max(100),
  concepts: z.array(conceptRow).min(1).max(10000), attemptIds: z.array(id).max(100000), activityEventIds: z.array(id).max(200000),
  stats: z.object({ verified: z.number().int().nonnegative(), personal: z.number().int().nonnegative(), correctWithoutHints: z.number().int().nonnegative(), activeDays: z.number().int().nonnegative(), exerciseSeconds: z.number().int().nonnegative(), otherActivities: z.number().int().nonnegative() }).strict(),
  help: z.array(z.object({ reviewId: id, interventionId: id, whatHelped: z.string().max(4000), nextStep: z.string().max(4000) }).strict()).max(20),
  reflection: z.string().max(4000), origin: z.enum(['automatic', 'manual']), supersedesId: id.nullable(), revision: z.number().int().positive(), engineVersion: z.literal('reports-1'), createdAt: stamp,
}).strict();
export const reportPreferenceRow = z.object({ id, subjectId: id, automaticWeekly: z.boolean(), lastWeek: day.nullable(), updatedAt: stamp }).strict();
export interface ReportData { subjects: Subject[]; concepts: Concept[]; attempts: Attempt[]; events: EducationalEvent[]; units: DidacticUnit[]; curriculum: CurriculumItem[]; intervention_reviews: InterventionReview[]; learning_reports: LearningReport[]; report_preferences: ReportPreference[]; }
export function reportActivity(event: EducationalEvent) { return ['flashcard.reviewed', 'study.completed', 'task.completed', 'reinforcement.practiced', 'reinforcement.checked', 'reinforcement.reflected', 'goal.reviewed', 'reflection.recorded'].includes(event.type) || event.type === 'activity.completed' && typeof event.payload.projectId === 'string'; }

export function previousWeek(now = new Date()) {
  const monday = addDays(dayKey(now), -((now.getDay() + 6) % 7) - 7);
  return { startsOn: monday, endsOn: addDays(monday, 6) };
}
function boundary(day: string, end = false) { return new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}`).toISOString(); }
function dateInZone(stamp: string, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp)); }
export function reportStats(attempts: Attempt[], timezone: string, activity: EducationalEvent[] = []): LearningReport['stats'] {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return { verified: attempts.filter(a => a.source === 'verified').length, personal: attempts.filter(a => a.source === 'self').length, correctWithoutHints: attempts.filter(a => a.source === 'verified' && a.outcome === 'correct' && a.hints === 0).length, activeDays: new Set(attempts.map(a => formatter.format(new Date(a.createdAt)))).size, exerciseSeconds: attempts.reduce((sum, a) => sum + a.durationSeconds, 0), otherActivities: activity.length };
}
export function conceptSummary(concept: Concept, before: Estimate, after: Estimate): ReportConcept {
  const rank = { unseen: 0, reinforce: 1, progress: 2, consolidated: 3 };
  const changedEvidence = after.evidenceIds.some(id => !before.evidenceIds.includes(id));
  const change = before.status === 'unseen' && after.status !== 'unseen' ? 'first-evidence' : changedEvidence && rank[after.status] > rank[before.status] ? 'improved' : changedEvidence && rank[after.status] < rank[before.status] ? 'regressed' : before.status === 'consolidated' && after.status === 'progress' && !changedEvidence ? 'check-again' : 'stable';
  const recommendation: ReportConcept['recommendation'] = after.status === 'unseen'
    ? { action: 'check', reason: 'Todavía no hay ejercicios comprobados. Haz un intento para saber por dónde empezar.', evidenceIds: [] }
    : after.status === 'consolidated' ? { action: 'review', reason: 'Las evidencias apoyan esta estimación. Comprueba el recuerdo en otro día y después aplica el concepto en una situación nueva.', evidenceIds: after.evidenceIds }
    : { action: 'practice', reason: after.reason, evidenceIds: after.evidenceIds };
  return { conceptId: concept.id, name: concept.name, before, after, change, recommendation, prerequisites: [] };
}
export function makeReport(value: ReportInput, d: ReportData, now = new Date(), origin: LearningReport['origin'] = 'manual'): LearningReport {
  const input = reportInput.parse(value), subject = d.subjects.find(s => s.id === input.subjectId);
  if (!subject) throw new Error('No se encuentra esta asignatura.');
  if (input.startsOn > input.endsOn || input.endsOn > dayKey(now)) throw new Error('El periodo debe terminar hoy o antes y comenzar antes de terminar.');
  if (input.kind === 'weekly' && (new Date(`${input.startsOn}T12:00:00`).getDay() !== 1 || input.endsOn !== addDays(input.startsOn, 6))) throw new Error('El resumen semanal abarca una semana completa, de lunes a domingo.');
  const unit = input.unitId ? d.units.find(u => u.id === input.unitId && u.subjectId === subject.id) : undefined;
  if (input.kind === 'unit' ? !unit : input.unitId !== null) throw new Error('Selecciona una unidad de esta asignatura solo para el informe de unidad.');
  if (input.kind === 'transition' && (!input.targetCourse || !input.conceptIds.length)) throw new Error('Para la transición, indica el curso de destino y selecciona los conocimientos que quieres conservar.');
  if (input.kind !== 'transition' && input.targetCourse) throw new Error('El curso de destino pertenece al informe de transición.');
  if (input.kind !== 'transition' && input.conceptIds.length) throw new Error('La selección personal de conceptos pertenece al informe de transición.');
  const owned = d.concepts.filter(c => c.subjectId === subject.id);
  const scope = input.kind === 'unit' ? unit!.conceptIds : input.kind === 'transition' ? input.conceptIds : owned.map(c => c.id);
  if (scope.length > 10000 || !scope.length || scope.some(id => !owned.some(c => c.id === id))) throw new Error('El informe necesita conceptos existentes de esta asignatura.');
  const previous = input.supersedesId ? d.learning_reports.find(r => r.id === input.supersedesId) : undefined;
  if (input.supersedesId && (!previous || previous.subjectId !== subject.id || previous.kind !== input.kind || d.learning_reports.some(r => r.supersedesId === previous.id))) throw new Error('Solo puedes actualizar la última versión de un informe de esta asignatura y tipo.');
  const periodStartAt = boundary(input.startsOn), asOf = new Date(Math.min(now.getTime(), Date.parse(boundary(input.endsOn, true)))).toISOString();
  const beforeTime = new Date(Date.parse(periodStartAt) - 1);
  const grouped = new Map<string, Attempt[]>();
  for (const attempt of d.attempts) if (attempt.conceptId) { const group = grouped.get(attempt.conceptId) ?? []; group.push(attempt); grouped.set(attempt.conceptId, group); }
  const concepts = owned.filter(c => scope.includes(c.id)).map(concept => {
    const history = grouped.get(concept.id) ?? [], summary = conceptSummary(concept, estimate(concept.id, history, beforeTime), estimate(concept.id, history, new Date(asOf)));
    summary.prerequisites = concept.prerequisiteIds.map(id => ({ id, name: owned.find(c => c.id === id)!.name }));
    return summary;
  });
  const selectedIds = new Set(concepts.flatMap(c => c.after.evidenceIds));
  const attempts = d.attempts.filter(a => a.subjectId === subject.id && a.createdAt <= asOf && (input.kind === 'transition' ? selectedIds.has(a.id) : a.createdAt >= periodStartAt && (input.kind === 'weekly' || !!a.conceptId && scope.includes(a.conceptId))));
  const help = input.helpIds.map(id => {
    const review = d.intervention_reviews.find(r => r.id === id && r.subjectId === subject.id && r.createdAt <= asOf);
    if (!review) throw new Error('La ayuda seleccionada debe pertenecer a esta asignatura y existir antes de cerrar el periodo.');
    return { reviewId: review.id, interventionId: review.interventionId, whatHelped: review.whatHelped, nextStep: review.nextStep };
  });
  const activity = input.kind === 'weekly' ? d.events.filter(e => e.subjectId === subject.id && reportActivity(e) && e.createdAt >= periodStartAt && e.createdAt <= asOf) : [];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const title = input.kind === 'weekly' ? `Mi semana: ${input.startsOn} a ${input.endsOn}` : input.kind === 'unit' ? `Fin de unidad: ${unit!.title}` : `Mi transición a ${input.targetCourse}`;
  return reportRow.parse({ id: randomUUID(), subjectId: subject.id, kind: input.kind, title, subject: { name: subject.name, course: subject.course, level: subject.level }, unit: unit ? { id: unit.id, title: unit.title, curriculum: d.curriculum.filter(c => unit.curriculumIds.includes(c.id)).map(({ id, code, title, kind }) => ({ id, code, title, kind })) } : null, targetCourse: input.targetCourse, startsOn: input.startsOn, endsOn: input.endsOn, periodStartAt, asOf, timezone, concepts, attemptIds: attempts.map(a => a.id), activityEventIds: activity.map(e => e.id), stats: reportStats(attempts, timezone, activity), help, reflection: input.reflection, origin, supersedesId: previous?.id ?? null, revision: (previous?.revision ?? 0) + 1, engineVersion: 'reports-1', createdAt: now.toISOString() });
}

export function validateReports(d: ReportData) {
  const reports = new Map(d.learning_reports.map(r => [r.id, r])), attempts = new Map(d.attempts.map(a => [a.id, a])), events = new Map(d.events.map(e => [e.id, e])), positions = new Map(d.attempts.map((a, i) => [a.id, i])), successors = new Set<string>();
  for (const r of d.learning_reports) {
    if (!d.subjects.some(s => s.id === r.subjectId) || r.startsOn > r.endsOn || r.periodStartAt > r.asOf || r.asOf > r.createdAt || dateInZone(r.periodStartAt, r.timezone) !== r.startsOn || dateInZone(r.asOf, r.timezone) !== r.endsOn) throw new Error('El informe contiene un periodo incompatible.');
    if (r.kind === 'weekly' && (r.endsOn !== addDays(r.startsOn, 6) || new Date(`${r.startsOn}T12:00:00`).getDay() !== 1) || (r.kind === 'unit') !== !!r.unit || r.kind === 'transition' && !r.targetCourse || r.kind !== 'transition' && r.targetCourse) throw new Error('El informe contiene una selección incompatible con su tipo.');
    if (r.origin === 'automatic' && r.kind !== 'weekly') throw new Error('Solo el resumen semanal es automático.');
    const localTime = (time: string) => new Intl.DateTimeFormat('en', { timeZone: r.timezone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(time));
    if (localTime(r.periodStartAt) !== '00:00:00' || new Date(r.periodStartAt).getUTCMilliseconds() !== 0 || dateInZone(r.createdAt, r.timezone) !== r.endsOn && (localTime(r.asOf) !== '23:59:59' || new Date(r.asOf).getUTCMilliseconds() !== 999)) throw new Error('Los límites del periodo no corresponden al calendario del informe.');
    if (r.unit && d.units.some(u => u.id === r.unit!.id && u.subjectId !== r.subjectId) || r.unit?.curriculum.some(c => d.curriculum.some(n => n.id === c.id && n.subjectId !== r.subjectId))) throw new Error('La unidad o currículo del informe pertenece a otra asignatura.');
    const prior = r.supersedesId ? reports.get(r.supersedesId) : undefined;
    if (r.supersedesId ? !prior || prior.subjectId !== r.subjectId || prior.kind !== r.kind || prior.createdAt > r.createdAt || r.revision !== prior.revision + 1 || successors.has(r.supersedesId) : r.revision !== 1) throw new Error('El historial de informes contiene una revisión incompatible.');
    if (r.supersedesId) successors.add(r.supersedesId);
    if (new Set(r.concepts.map(c => c.conceptId)).size !== r.concepts.length || new Set(r.attemptIds).size !== r.attemptIds.length || new Set(r.activityEventIds).size !== r.activityEventIds.length || new Set(r.help.map(h => h.reviewId)).size !== r.help.length) throw new Error('El informe contiene evidencias repetidas.');
    for (const c of r.concepts) {
      const concept = d.concepts.find(n => n.id === c.conceptId && n.subjectId === r.subjectId);
      if (!concept || c.name !== concept.name || c.before.conceptId !== c.conceptId || c.after.conceptId !== c.conceptId || c.prerequisites.some(p => !d.concepts.some(n => n.id === p.id && n.subjectId === r.subjectId && n.name === p.name))) throw new Error('El informe contiene conceptos incompatibles.');
      for (const [state, cutoff] of [[c.before, new Date(Date.parse(r.periodStartAt) - 1)], [c.after, new Date(r.asOf)]] as const) {
        const supporting = state.evidenceIds.map(id => attempts.get(id));
        if (new Set(state.evidenceIds).size !== state.evidenceIds.length || supporting.some(a => !a || a.subjectId !== r.subjectId || a.conceptId !== c.conceptId || a.source !== 'verified' || a.createdAt > cutoff.toISOString())) throw new Error('Faltan evidencias comprobadas del informe.');
        // Reports preserve the evidence available when created; later historical imports do not rewrite them.
        const selected = (supporting as Attempt[]).slice().sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
        if (!isDeepStrictEqual(estimate(c.conceptId, selected, cutoff), state)) throw new Error('La estimación del informe no coincide con sus ejercicios de apoyo.');
      }
      const expected = conceptSummary(concept, c.before, c.after);
      if (c.change !== expected.change || !isDeepStrictEqual(c.recommendation, expected.recommendation)) throw new Error('La recomendación del informe no corresponde a las evidencias.');
    }
    const selected = r.attemptIds.map(id => attempts.get(id));
    const activity = r.activityEventIds.map(id => events.get(id)), concepts = new Set(r.concepts.map(c => c.conceptId)), support = new Set(r.concepts.flatMap(c => c.after.evidenceIds));
    if (activity.some(e => !e || r.kind !== 'weekly' || !reportActivity(e) || e.subjectId !== r.subjectId || e.createdAt < r.periodStartAt || e.createdAt > r.asOf)) throw new Error('El registro de actividades del informe contiene referencias incompatibles.');
    if (selected.some(a => !a || a.subjectId !== r.subjectId || a.createdAt > r.asOf || !(r.kind === 'weekly' && a.conceptId === null) && !concepts.has(a.conceptId!) || (r.kind === 'transition' ? !support.has(a.id) : a.createdAt < r.periodStartAt)) || JSON.stringify(reportStats(selected as Attempt[], r.timezone, activity as EducationalEvent[])) !== JSON.stringify(r.stats)) throw new Error('Las cifras del informe no corresponden a sus ejercicios.');
    for (const help of r.help) {
      const source = d.intervention_reviews.find(h => h.id === help.reviewId);
      if (!source || source.subjectId !== r.subjectId || source.createdAt > r.asOf || source.interventionId !== help.interventionId || source.whatHelped !== help.whatHelped || source.nextStep !== help.nextStep) throw new Error('La ayuda del informe no corresponde a la reflexión original.');
    }
  }
  const owned = new Set<string>();
  for (const preference of d.report_preferences) {
    if (!d.subjects.some(s => s.id === preference.subjectId) || owned.has(preference.subjectId) || preference.lastWeek && (new Date(`${preference.lastWeek}T12:00:00`).getDay() !== 1 || addDays(preference.lastWeek, 6) > dayKey(new Date(preference.updatedAt)))) throw new Error('La configuración de informes contiene referencias incompatibles.');
    owned.add(preference.subjectId);
  }
}

const statusNames = { consolidated: 'Consolidado', progress: 'En progreso', reinforce: 'Necesita refuerzo', unseen: 'Sin evidencias' };
const confidenceNames = { low: 'Baja', medium: 'Media', high: 'Alta' };
export function reportCsv(r: LearningReport) {
  const cell = (value: string | number) => { let text = String(value); if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
  const rows: (string | number)[][] = [['Tipo', 'Campo', 'Valor', 'Concepto', 'Estado anterior', 'Estado al cierre', 'Confianza anterior', 'Confianza al cierre', 'Cambio', 'Recomendación', 'Evidencias anteriores', 'Evidencias al cierre', 'Identificador', 'Referencia original']];
  const metadata = { informe: r.title, asignatura: r.subject.name, curso: r.subject.course, nivel: r.subject.level, cursoDestino: r.targetCourse, inicio: r.startsOn, fin: r.endsOn, cierre: r.asOf, zonaHoraria: r.timezone, origen: r.origin, version: r.revision, creado: r.createdAt, motor: r.engineVersion, reflexion: r.reflection, anterior: r.supersedesId ?? '' };
  for (const [key, value] of Object.entries(metadata)) rows.push(['informe', key, value]);
  for (const [key, value] of Object.entries(r.stats)) rows.push(['actividad', key, value]);
  for (const c of r.concepts) {
    rows.push(['concepto', '', '', c.name, statusNames[c.before.status], statusNames[c.after.status], confidenceNames[c.before.confidence], confidenceNames[c.after.confidence], c.change, c.recommendation.reason, c.before.evidenceIds.join(' | '), c.after.evidenceIds.join(' | '), c.conceptId]);
    for (const p of c.prerequisites) rows.push(['prerrequisito', p.name, p.id, c.name]);
  }
  for (const help of r.help) { rows.push(['ayuda', 'queMeAyudo', help.whatHelped, '', '', '', '', '', '', help.nextStep, '', '', help.reviewId, help.interventionId]); }
  if (r.unit) { rows.push(['unidad', 'titulo', r.unit.title, '', '', '', '', '', '', '', '', '', r.unit.id]); for (const c of r.unit.curriculum) rows.push(['curriculo', c.code || c.kind, c.title, '', '', '', '', '', '', '', '', '', c.id, r.unit.id]); }
  for (const id of r.attemptIds) rows.push(['ejercicioPeriodo', '', '', '', '', '', '', '', '', '', '', '', id]);
  for (const id of r.activityEventIds) rows.push(['actividadPeriodo', '', '', '', '', '', '', '', '', '', '', '', id]);
  rows.push(['informe', 'identificador', r.id]);
  return '\uFEFF' + rows.map(row => [...row, ...Array(Math.max(0, rows[0].length - row.length)).fill('')].map(cell).join(';')).join('\r\n') + '\r\n';
}
export const REPORT_STATUS_NAMES = statusNames;
