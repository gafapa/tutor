import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Attempt, Concept, Subject } from '../shared/types.js';
import type { EducationalEvent, CardReview } from '../shared/education.js';
import { sessionElapsed, type StudySession } from '../shared/study.js';
import type { PersonalGoal, GoalReview, GoalProgress, LearningAlert, AlertReview, LearningHabit, ConceptTimeline, AlertKind, RecentChange } from '../shared/goals.js';
import { dayKey, addDays, validDay } from '../shared/calendar.js';
import { estimate } from './learning.js';
import { reportActivity, conceptSummary } from './reports.js';

const id = z.uuid(), stamp = z.iso.datetime(), day = z.string().refine(validDay), ids = z.array(id).max(100).refine(v => new Set(v).size === v.length);
export const goalInput = z.object({ subjectId: id, title: z.string().trim().min(1).max(160), kind: z.enum(['improve', 'exam', 'recover', 'advance']), description: z.string().max(4000), conceptIds: ids.min(1), targetDays: z.number().int().min(1).max(60), startsOn: day, dueOn: day.nullable(), supersedesId: id.nullable() }).strict();
export const goalRow = goalInput.extend({ id, revision: z.number().int().positive(), createdAt: stamp }).strict();
export const goalReviewInput = z.object({ goalId: id, action: z.enum(['progress', 'paused', 'resumed', 'achieved', 'abandoned']), reflection: z.string().trim().min(1).max(4000), evidenceIds: ids }).strict();
export const goalReviewRow = goalReviewInput.extend({ id, subjectId: id, previousId: id.nullable(), createdAt: stamp }).strict();
const alertKind = z.enum(['regression', 'persistent', 'unconsolidated', 'inactivity', 'review']);
export const alertReviewRow = z.object({ id, subjectId: id, alertKey: z.string().regex(/^[a-f0-9]{64}$/), conceptId: id.nullable(), kind: alertKind, evidenceIds: ids, eventIds: ids, lastActivityAt: stamp.nullable(), reflection: z.string().trim().min(1).max(4000), createdAt: stamp }).strict();
export const alertReviewInput = z.object({ key: z.string().regex(/^[a-f0-9]{64}$/), reflection: z.string().trim().min(1).max(4000) }).strict();
export const timelineInput = z.object({ conceptId: id, startsOn: day, endsOn: day }).strict();
export interface GoalsData {
  subjects: Subject[]; concepts: Concept[]; attempts: Attempt[]; events: EducationalEvent[];
  card_reviews: CardReview[]; study_sessions: StudySession[];
  personal_goals: PersonalGoal[]; goal_reviews: GoalReview[]; alert_reviews: AlertReview[];
}
export function currentGoals(goals: PersonalGoal[]) { const old = new Set(goals.flatMap(g => g.supersedesId ? [g.supersedesId] : [])); return goals.filter(g => !old.has(g.id)); }
export function recentChanges(d: GoalsData, now = new Date()): RecentChange[] {
  const startsOn = addDays(dayKey(now), -29), before = new Date(new Date(`${startsOn}T00:00:00`).getTime() - 1), endsOn = dayKey(now);
  const grouped = new Map<string, Attempt[]>();
  for (const a of d.attempts) if (a.conceptId) { const group = grouped.get(a.conceptId) ?? []; group.push(a); grouped.set(a.conceptId, group); }
  return d.concepts.map(c => { const history = grouped.get(c.id) ?? [], summary = conceptSummary(c, estimate(c.id, history, before), estimate(c.id, history, now)); return { conceptId: c.id, before: summary.before, after: summary.after, change: summary.change, startsOn, endsOn }; });
}
export function goalStatus(goalId: string, reviews: GoalReview[]): GoalProgress['status'] {
  const latest = reviews.filter(r => r.goalId === goalId && r.action !== 'progress').at(-1);
  return !latest || latest.action === 'resumed' ? 'active' : latest.action as GoalProgress['status'];
}
export function zoneDay(at: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at)); }
const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
export function goalProgress(goal: PersonalGoal, d: GoalsData, now = new Date()): GoalProgress {
  const support = d.attempts.filter(a => a.subjectId === goal.subjectId && !!a.conceptId && goal.conceptIds.includes(a.conceptId) && a.source === 'verified' && a.hints === 0 && a.createdAt <= now.toISOString() && dayKey(new Date(a.createdAt)) >= goal.startsOn);
  const practiceDays = new Set(support.map(a => dayKey(new Date(a.createdAt)))).size, targetMet = practiceDays >= goal.targetDays;
  return { goalId: goal.id, status: goalStatus(goal.id, d.goal_reviews), practiceDays, targetMet, evidenceIds: support.map(a => a.id), estimates: goal.conceptIds.map(id => estimate(id, d.attempts, now)), overdue: !!goal.dueOn && goal.dueOn < dayKey(now), reason: `${practiceDays} de ${goal.targetDays} días de práctica sin pistas registrados desde el ${goal.startsOn}. Los intentos incorrectos también cuentan como práctica; alcanzar este ritmo no demuestra dominio ni da la meta por alcanzada.` };
}
function activity(d: GoalsData, subjectId: string, now: Date) {
  return [...d.attempts.filter(a => a.subjectId === subjectId && a.answer.trim()).map(a => ({ at: a.createdAt, attemptId: a.id, eventId: '' })), ...d.events.filter(e => e.subjectId === subjectId && reportActivity(e)).map(e => ({ at: e.createdAt, attemptId: '', eventId: e.id }))].filter(a => a.at <= now.toISOString()).sort((a, b) => a.at.localeCompare(b.at));
}
export function learningHabit(d: GoalsData, subjectId: string, now = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): LearningHabit {
  const times = [...d.attempts.filter(a => a.subjectId === subjectId && a.answer.trim()).map(a => a.createdAt), ...d.card_reviews.filter(r => r.subjectId === subjectId).map(r => r.createdAt), ...d.study_sessions.filter(s => s.subjectId === subjectId && s.status === 'completed' && s.completedAt && sessionElapsed(s) >= 120000).map(s => s.completedAt!)];
  const days = [...new Set(times.filter(t => t <= now.toISOString()).map(t => zoneDay(t, timezone)))].sort(), active = new Set(days), today = zoneDay(now.toISOString(), timezone);
  let longestStreak = 0, streak = 0, prior = '';
  for (const date of days) { streak = prior && date === addDays(prior, 1) ? streak + 1 : 1; longestStreak = Math.max(longestStreak, streak); prior = date; }
  let currentStreak = 0, date = active.has(today) ? today : addDays(today, -1);
  while (active.has(date)) { currentStreak++; date = addDays(date, -1); }
  return { subjectId, timezone, currentStreak, longestStreak, totalDays: days.length, recentDays: Array.from({ length: 28 }, (_, i) => { const date = addDays(today, i - 27); return { date, active: active.has(date) }; }) };
}
export function alertKey(value: Pick<LearningAlert, 'subjectId' | 'kind' | 'conceptId' | 'evidenceIds' | 'eventIds' | 'lastActivityAt'>) { return createHash('sha256').update(JSON.stringify([value.subjectId, value.kind, value.conceptId, value.evidenceIds, value.eventIds, value.lastActivityAt])).digest('hex'); }
export function learningAlerts(d: GoalsData, now = new Date()): LearningAlert[] {
  const alerts: LearningAlert[] = [], reviewed = new Set(d.alert_reviews.map(r => r.alertKey));
  function add(subjectId: string, conceptId: string | null, kind: AlertKind, title: string, reason: string, evidenceIds: string[], eventIds: string[] = [], lastActivityAt: string | null = null) { const row = { subjectId, conceptId, kind, title, reason, evidenceIds, eventIds, lastActivityAt }; const key = alertKey(row); alerts.push({ ...row, key, reviewed: reviewed.has(key) }); }
  for (const concept of d.concepts) {
    const history = d.attempts.filter(a => a.conceptId === concept.id && a.subjectId === concept.subjectId && a.source === 'verified' && a.createdAt <= now.toISOString()).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const recent = history.filter(a => daysApart(dayKey(new Date(a.createdAt)), dayKey(now)) <= 30), last = recent.slice(-3), state = estimate(concept.id, history, now);
    const varied = new Set(last.map(a => a.statement)).size >= 2 && new Set(last.map(a => dayKey(new Date(a.createdAt)))).size >= 2;
    if (last.length === 3 && varied && last.every(a => a.outcome !== 'correct' || a.hints > 0)) {
      const before = estimate(concept.id, history, new Date(Date.parse(last[0].createdAt) - 1));
      add(concept.subjectId, concept.id, before.status === 'consolidated' ? 'regression' : 'persistent', before.status === 'consolidated' ? `Revisa el cambio en ${concept.name}` : `Busca otra estrategia para ${concept.name}`, `Los tres últimos intentos comprobados incluyen dificultades o pistas, en al menos dos preguntas y dos días. ${before.status === 'consolidated' ? 'Antes de estos intentos había una estimación consolidada. ' : ''}Es una señal para revisar los trabajos y sus prerrequisitos, sin diagnosticar una dificultad personal.`, [...new Set([...before.evidenceIds, ...last.map(a => a.id)])]);
    } else if (recent.length >= 4 && new Set(recent.map(a => dayKey(new Date(a.createdAt)))).size >= 2 && state.status !== 'consolidated') {
      add(concept.subjectId, concept.id, 'unconsolidated', `Comprueba la autonomía en ${concept.name}`, 'Hay al menos cuatro intentos recientes en distintos días, pero las evidencias todavía no apoyan consolidación. Comprueba una pregunta diferente sin pistas y revisa el motivo de la estimación.', state.evidenceIds);
    } else if (history.length && !recent.length) {
      add(concept.subjectId, concept.id, 'review', `Comprueba el recuerdo de ${concept.name}`, 'Han pasado más de 30 días desde el último ejercicio comprobado. Esto no demuestra olvido ni retroceso; un nuevo intento permitirá actualizar la estimación.', state.evidenceIds);
    }
  }
  for (const subject of d.subjects) {
    const latest = activity(d, subject.id, now).at(-1), lastActivityAt = latest?.at ?? subject.createdAt;
    const elapsed = daysApart(dayKey(new Date(lastActivityAt)), dayKey(now));
    if (elapsed >= 7) add(subject.id, null, 'inactivity', 'Retoma con un paso pequeño', `No hay actividad registrada en esta asignatura desde el ${dayKey(new Date(lastActivityAt))} (${elapsed} días). Puedes haber estudiado fuera de la app: el aviso solo describe este registro.`, latest?.attemptId ? [latest.attemptId] : [], latest?.eventId ? [latest.eventId] : [], lastActivityAt);
  }
  return alerts;
}
export function conceptTimeline(value: unknown, d: GoalsData, now = new Date()): ConceptTimeline {
  const input = timelineInput.parse(value), concept = d.concepts.find(c => c.id === input.conceptId);
  if (!concept || input.startsOn > input.endsOn || input.endsOn > dayKey(now) || daysApart(input.startsOn, input.endsOn) > 366) throw new Error('Selecciona un concepto y un periodo pasado de hasta un año.');
  const history = d.attempts.filter(a => a.conceptId === concept.id && a.subjectId === concept.subjectId && a.source === 'verified' && a.createdAt <= now.toISOString());
  const start = new Date(`${input.startsOn}T00:00:00`).getTime(), grouped = new Map<string, Attempt[]>();
  for (const a of history) { const date = dayKey(new Date(a.createdAt)); if (date < input.startsOn || date > input.endsOn) continue; const group = grouped.get(date) ?? []; group.push(a); grouped.set(date, group); }
  const points = [{ at: new Date(start - 1).toISOString(), date: input.startsOn, estimate: estimate(concept.id, history, new Date(start - 1)), newEvidenceIds: [] as string[] }];
  for (const [date, group] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) { const at = new Date(Math.min(now.getTime(), new Date(`${date}T23:59:59.999`).getTime())); points.push({ at: at.toISOString(), date, estimate: estimate(concept.id, history, at), newEvidenceIds: group.map(a => a.id) }); }
  const end = new Date(Math.min(now.getTime(), new Date(`${input.endsOn}T23:59:59.999`).getTime()));
  if (points.at(-1)!.at !== end.toISOString()) points.push({ at: end.toISOString(), date: input.endsOn, estimate: estimate(concept.id, history, end), newEvidenceIds: [] });
  return { ...input, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, generatedAt: now.toISOString(), points };
}
export function validateGoalReview(goal: PersonalGoal, reviews: GoalReview[], action: GoalReview['action']) {
  const status = goalStatus(goal.id, reviews);
  if (action === 'resumed' ? status === 'active' : action !== 'progress' && status !== 'active' && !(status === 'paused' && action === 'abandoned')) throw new Error('Esta decisión no corresponde al estado actual de la meta.');
}
export function validateGoals(d: GoalsData) {
  const goals = new Map(d.personal_goals.map(g => [g.id, g])), attempts = new Map(d.attempts.map(a => [a.id, a])), events = new Map(d.events.map(e => [e.id, e])), children = new Set<string>();
  for (const g of d.personal_goals) {
    const prior = g.supersedesId ? goals.get(g.supersedesId) : null;
    if (!d.subjects.some(s => s.id === g.subjectId) || g.conceptIds.some(id => !d.concepts.some(c => c.id === id && c.subjectId === g.subjectId)) || g.dueOn && g.dueOn < g.startsOn || (g.supersedesId ? !prior || prior.subjectId !== g.subjectId || prior.createdAt > g.createdAt || g.revision !== prior.revision + 1 || children.has(g.supersedesId) : g.revision !== 1)) throw new Error('La copia contiene una meta o versión incompatible.');
    if (g.supersedesId) children.add(g.supersedesId);
  }
  const reviewed: GoalReview[] = [];
  for (const r of d.goal_reviews) {
    const goal = goals.get(r.goalId), previous = reviewed.filter(p => p.goalId === r.goalId).at(-1);
    if (!goal || goal.subjectId !== r.subjectId || r.createdAt < goal.createdAt || (previous?.id ?? null) !== r.previousId || previous && previous.createdAt > r.createdAt || r.evidenceIds.some(id => { const a = attempts.get(id); return !a || a.subjectId !== r.subjectId || !a.conceptId || !goal.conceptIds.includes(a.conceptId) || a.createdAt > r.createdAt; })) throw new Error('La reflexión de una meta contiene referencias incompatibles.');
    validateGoalReview(goal, reviewed, r.action); reviewed.push(r);
  }
  const keys = new Set<string>();
  for (const r of d.alert_reviews) {
    const inactivity = r.kind === 'inactivity';
    if (inactivity ? r.conceptId !== null || !r.lastActivityAt || r.evidenceIds.length + r.eventIds.length > 1 : !r.conceptId || r.lastActivityAt !== null || r.eventIds.length > 0 || !r.evidenceIds.length || r.evidenceIds.some(id => attempts.get(id)?.source !== 'verified')) throw new Error('Las fuentes del aviso no corresponden a su tipo.');
    if (inactivity) {
      const anchor = r.evidenceIds.length ? attempts.get(r.evidenceIds[0])?.createdAt : r.eventIds.length ? events.get(r.eventIds[0])?.createdAt : d.subjects.find(s => s.id === r.subjectId)?.createdAt;
      if (anchor !== r.lastActivityAt) throw new Error('El aviso de inactividad no conserva su último registro.');
    }
    if (!d.subjects.some(s => s.id === r.subjectId) || r.conceptId && !d.concepts.some(c => c.id === r.conceptId && c.subjectId === r.subjectId) || keys.has(r.alertKey) || alertKey(r) !== r.alertKey || r.lastActivityAt && r.lastActivityAt > r.createdAt || r.evidenceIds.some(id => { const a = attempts.get(id); return !a || a.subjectId !== r.subjectId || r.conceptId && a.conceptId !== r.conceptId || a.createdAt > r.createdAt; }) || r.eventIds.some(id => { const e = events.get(id); return !e || e.subjectId !== r.subjectId || !reportActivity(e) || e.createdAt > r.createdAt; })) throw new Error('La revisión de un aviso contiene referencias incompatibles.');
    keys.add(r.alertKey);
  }
}
