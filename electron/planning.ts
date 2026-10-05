import type { Attempt, Concept, DailyPlan, Diagnostic, Estimate, PlanItem, Review, StudyTask } from '../shared/types.js';
import { addDays, dayKey } from '../shared/calendar.js';
import { EXERCISES } from './learning.js';
import { sessionRemaining, type StudySession } from '../shared/study.js';
import type { PersonalGoal, GoalProgress } from '../shared/goals.js';
import type{InterdisciplinaryProject,ProjectActivityReview}from'../shared/connections.js';

export function reviewSchedule(concept: Concept, attempts: Attempt[], now = new Date()): Review | null {
  const evidence = attempts.filter(a => a.conceptId === concept.id && a.source === 'verified' && a.outcome !== 'ungraded' && a.createdAt <= now.toISOString())
    .reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!evidence.length) return null;
  const latest = evidence[0];
  const days = new Set<string>();
  const supporting: string[] = [];
  for (const attempt of evidence) {
    if (attempt.outcome !== 'correct' || attempt.hints > 0) break;
    days.add(dayKey(new Date(attempt.createdAt)));
    supporting.push(attempt.id);
  }
  const intervals = [1, 3, 7, 14, 30];
  const independent = latest.outcome === 'correct' && latest.hints === 0;
  const intervalDays = independent ? intervals[Math.min(intervals.length - 1, Math.max(0, days.size - 1))] : 1;
  return {
    conceptId: concept.id, nextDate: addDays(dayKey(new Date(latest.createdAt)), intervalDays), intervalDays,
    evidenceIds: independent ? supporting.slice(0, 8) : [latest.id],
    reason: independent
      ? `Hay aciertos sin pistas en ${days.size} ${days.size === 1 ? 'día' : 'días'} desde la última dificultad. Proponemos comprobarlo de nuevo tras ${intervalDays} ${intervalDays === 1 ? 'día' : 'días'}.`
      : 'El último intento incluyó una dificultad o una pista. Proponemos una comprobación al día siguiente antes de ampliar el intervalo.'
  };
}

export function nextDiagnosticQuestion(session: Pick<Diagnostic, 'conceptIds' | 'responses'>, concepts: Concept[], attempts: Attempt[]): Diagnostic['current'] {
  const available = concepts.filter(c => session.conceptIds.includes(c.id)).sort((a, b) => b.position - a.position);
  const counts = new Map(available.map(c => [c.id, session.responses.filter(r => r.conceptId === c.id).length]));
  const pending = available.filter(c => (counts.get(c.id) ?? 0) < Math.min(2, EXERCISES[c.name]?.length ?? 0));
  if (!pending.length) return null;
  const last = session.responses.at(-1);
  let chosen: Concept | undefined;
  if (last) {
    const attempt = attempts.find(a => a.id === last.attemptId);
    const previous = available.find(c => c.id === last.conceptId);
    if (attempt?.outcome === 'incorrect' && previous) {
      chosen = pending.filter(c => previous.prerequisiteIds.includes(c.id)).sort((a, b) => a.position - b.position)[0];
    } else if (attempt?.outcome === 'correct') chosen = pending.find(c => c.id === last.conceptId);
  }
  chosen ??= pending.find(c => !counts.get(c.id)) ?? pending[0];
  const index = counts.get(chosen.id) ?? 0;
  return { conceptId: chosen.id, exerciseId: `${chosen.name}:${index}` };
}

export function dailyPlan(subjectId: string, concepts: Concept[], estimates: Estimate[], reviews: Review[], tasks: StudyTask[], diagnostics: Diagnostic[], budgetMinutes: number, now = new Date(), sessions: StudySession[] = [],projects:InterdisciplinaryProject[]=[],projectReviews:ProjectActivityReview[]=[], goals: PersonalGoal[] = [], goalStates: GoalProgress[] = []): DailyPlan {
  const today = dayKey(now);
  const owned = concepts.filter(c => c.subjectId === subjectId).sort((a, b) => a.position - b.position);
  const estimatesById = new Map(estimates.map(e => [e.conceptId, e]));
  const candidates: (PlanItem & { priority: number; order: string })[] = [];
  for(const project of projects.filter(p=>p.subjectIds.includes(subjectId)))for(const [activityIndex,activity] of project.activities.entries()){
    if(!activity.subjectIds.includes(subjectId)||activity.dueOn&&activity.dueOn>addDays(today,3)||projectReviews.filter(r=>r.projectId===project.id&&r.projectRevision===project.revision&&r.activityId===activity.id).at(-1)?.completed)continue;
    candidates.push({id:`project:${project.id}:${project.revision}:${activity.id}`,subjectId,kind:'project',targetId:project.id,title:`${project.title}: ${activity.title}`,minutes:activity.minutes,reason:activity.dueOn?`Actividad compartida prevista para el ${activity.dueOn}. Comprueba las instrucciones y conserva evidencias de las asignaturas participantes.`:'Actividad compartida sin fecha prevista. Puedes empezar por comparar los contenidos y conservar tus trabajos.',evidenceIds:[],priority:activity.dueOn?activity.dueOn<=today?100:75:40,order:`${activity.dueOn??project.createdAt}:${project.id}:${String(activityIndex).padStart(2,'0')}`});
  }
  const pendingSession = sessions.find(row => row.subjectId === subjectId && ['running', 'paused', 'review'].includes(row.status));
  if (pendingSession) candidates.push({ id: `session:${pendingSession.id}`, subjectId, kind: 'session', targetId: pendingSession.id, title: pendingSession.status === 'review' ? `Revisar mi sesión: ${pendingSession.goal}` : `Continuar mi sesión: ${pendingSession.goal}`, minutes: pendingSession.status === 'review' ? 5 : Math.max(1, Math.ceil(sessionRemaining(pendingSession, now) / 60000)), reason: pendingSession.status === 'review' ? 'La sesión terminó; conserva lo que aprendiste y decide el siguiente paso.' : 'Este objetivo ya está empezado. Puedes continuar con el tiempo que queda.', evidenceIds: pendingSession.attemptIds.slice(-8), priority: 110, order: pendingSession.createdAt });
  const addConcept = (concept: Concept, priority: number, reason: string, evidenceIds: string[]) => {
    const existing = candidates.find(item => item.id === `concept:${concept.id}`);
    if (existing && existing.priority >= priority) {
      if (reason.startsWith('Meta personal:') && !existing.reason.includes(reason)) existing.reason += ` ${reason}`;
      return;
    }
    if (existing?.reason.startsWith('Meta personal:') && !reason.startsWith('Meta personal:')) reason = `${existing.reason} ${reason}`;
    if (existing) candidates.splice(candidates.indexOf(existing), 1);
    candidates.push({ id: `concept:${concept.id}`, subjectId, kind: 'practice', targetId: concept.id, title: `Practicar ${concept.name}`, minutes: 10, reason, evidenceIds, priority, order: String(concept.position).padStart(6, '0') });
  };
  for (const goal of goals.filter(g => g.subjectId === subjectId && g.startsOn <= today)) {
    const progress = goalStates.find(p => p.goalId === goal.id);
    if (!progress || progress.status !== 'active') continue;
    const selected = owned.filter(c => goal.conceptIds.includes(c.id)).sort((a, b) => ['reinforce', 'unseen', 'progress', 'consolidated'].indexOf(estimatesById.get(a.id)!.status) - ['reinforce', 'unseen', 'progress', 'consolidated'].indexOf(estimatesById.get(b.id)!.status));
    if (!selected.length || progress.targetMet && selected.every(c => estimatesById.get(c.id)?.status === 'consolidated')) continue;
    const concept = selected[0], state = estimatesById.get(concept.id)!;
    addConcept(concept, goal.dueOn && goal.dueOn <= addDays(today, 3) ? 80 : 45, 'Meta personal: ' + goal.title + '. ' + (goal.dueOn ? 'Fecha prevista: ' + goal.dueOn + '. ' : '') + progress.reason + ' ' + state.reason, state.evidenceIds);
  }
  for (const task of tasks.filter(t => t.subjectId === subjectId && t.status === 'pending' && (t.dueDate === null || t.dueDate <= addDays(today, 3))).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))) {
    candidates.push({ id: `task:${task.id}`, subjectId, kind: 'task', targetId: task.id, title: task.title, minutes: task.estimatedMinutes,
      reason: task.dueDate === null ? 'Esta tarea no tiene fecha prevista. Puedes elegir cuándo trabajar en ella.' : task.dueDate < today ? `La fecha prevista era el ${task.dueDate}. Revisa si sigue pendiente o si necesitas cambiarla.` : task.dueDate === today ? 'La tarea está prevista para hoy.' : `La tarea está prevista para el ${task.dueDate}, dentro de los próximos tres días.`,
      evidenceIds: [], priority: task.dueDate === null ? 30 : task.dueDate <= today ? 100 : 75, order: task.dueDate ?? '9999' });
  }
  for (const concept of owned) {
    const current = estimatesById.get(concept.id)!;
    const review = reviews.find(r => r.conceptId === concept.id);
    const due = review && review.nextDate <= today;
    if (current.status === 'reinforce' || due) {
      const priority = current.status === 'reinforce' ? 85 : 65;
      addConcept(concept, priority, current.status === 'reinforce' ? current.reason : `Toca comprobar qué recuerdas de este concepto. ${review!.reason}`, current.status === 'reinforce' ? current.evidenceIds : review!.evidenceIds);
      // Only propose checking prerequisites. Missing evidence never asserts a difficulty.
      const seen = new Set<string>([concept.id]);
      const checkPrerequisite = (ids: string[]) => {
        for (const id of ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          const prerequisite = owned.find(c => c.id === id);
          const state = estimatesById.get(id);
          if (!prerequisite || !state || state.status === 'consolidated') continue;
          checkPrerequisite(prerequisite.prerequisiteIds);
          addConcept(prerequisite, priority + 5,
            state.status === 'unseen' ? `Es un prerrequisito de ${concept.name} y no hay evidencias comprobadas. Conviene comprobarlo; todavía no sabemos si existe una dificultad.` : `Es un prerrequisito de ${concept.name}. Revisarlo puede ayudar a resolver el concepto posterior. ${state.reason}`, state.evidenceIds);
        }
      };
      checkPrerequisite(concept.prerequisiteIds);
    }
  }
  const supported = owned.filter(c => EXERCISES[c.name]);
  if (supported.length && !diagnostics.some(d => d.subjectId === subjectId && d.status === 'completed')) {
    const active = diagnostics.find(d => d.subjectId === subjectId && d.status === 'active');
    candidates.push({ id: `diagnostic:${subjectId}`, subjectId, kind: 'diagnostic', targetId: active?.id ?? subjectId, title: active ? 'Continuar mi punto de partida' : 'Comprobar mi punto de partida', minutes: 10,
      reason: `Hay preguntas comprobadas para ${supported.length} ${supported.length === 1 ? 'concepto' : 'conceptos'}. Un recorrido inicial permitirá orientar el estudio con evidencias.`, evidenceIds: [], priority: 55, order: '' });
  }
  for (const concept of owned) {
    const current = estimatesById.get(concept.id)!;
    if (current.status === 'unseen' || current.status === 'progress') addConcept(concept, current.status === 'unseen' ? 25 : 20, current.reason, current.evidenceIds);
  }
  candidates.sort((a, b) => b.priority - a.priority || a.order.localeCompare(b.order) || a.id.localeCompare(b.id));
  let remaining = budgetMinutes;
  const items: PlanItem[] = [];
  for (const candidate of candidates) {
    if (remaining < 5 || items.length >= 4) break;
    const { priority: _priority, order: _order, ...item } = candidate;
    const minutes = Math.min(item.minutes, remaining);
    items.push({ ...item, minutes, reason: minutes < item.minutes ? `${item.reason} Hoy reservamos ${minutes} de los ${item.minutes} minutos previstos; puedes continuar en otra sesión.` : item.reason });
    remaining -= minutes;
  }
  return { subjectId, date: today, budgetMinutes, items };
}
