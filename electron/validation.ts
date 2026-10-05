import { z } from 'zod';
import { validDay } from '../shared/calendar.js';
import { EXERCISES } from './learning.js';
import { nextDiagnosticQuestion } from './planning.js';
import { curriculumRow, unitRow, cardRow, cardRevisionRow, reviewRow, portfolioRow } from './education-validation.js';
import { assertAcyclic, automaticPortfolioContent } from './education.js';
import { studySessionRow } from './study.js';
import { sessionElapsed } from '../shared/study.js';
import { BANK_VERSION, classificationSchema, classifyBank, mockExamRow } from './assessment.js';
import { matchesBankAnswer } from './learning.js';
import { rubricRow, rubricVersionRow, submissionRow, reviewRow as rubricReviewRow, validateRubricTables } from './rubrics.js';
import { lmsSourceRow, lmsTaskSourceRow, lmsConnectionRow, lmsItemRow, lmsVersionRow, lmsRunRow, validateLmsTables } from './lms-validation.js';
import { analysisRow, observationReviewRow, interventionRow, interventionResponseRow, interventionReviewRow, validatePedagogyTables } from './pedagogy.js';
import {relationRow,relationReviewRow,projectRow,projectVersionRow,projectWorkRow,projectReviewRow,validateConnections} from './connections.js';
import { MATERIAL_KINDS } from '../shared/materials.js';
import { captureRow, captureReviewRow, captureSource, validateCaptureTables } from './ocr-validation.js';

export const id = z.uuid();
const text = (max: number) => z.string().max(max);
const title = z.string().trim().min(1, 'Escribe un nombre.').max(120);
const timestamp = z.iso.datetime();
export const subjectInput = z.object({ name: title, course: text(120).default(''), level: text(120), teacher: text(120), goals: text(2000), color: z.enum(['sage', 'blue', 'amber', 'rose', 'violet']) });
export const conceptInput = z.object({ subjectId: id, name: title, description: text(1000), prerequisiteIds: z.array(id).max(30).refine(ids => new Set(ids).size === ids.length, 'Hay prerrequisitos repetidos.') });
export const attemptInput = z.object({ subjectId: id, conceptId: id.nullable(), statement: z.string().trim().min(1).max(10000), answer: text(20000), feedback: text(10000), outcome: z.enum(['correct', 'incorrect', 'partial', 'ungraded']), hints: z.number().int().min(0).max(50), durationSeconds: z.number().int().min(0).max(86400) });
export const settingsInput = z.object({ name: text(80).optional(), dailyMinutes: z.number().int().min(5).max(120).optional(), largeText: z.boolean().optional(), highContrast: z.boolean().optional() });
const citation = z.object({ materialId: id, name: title, page: z.number().int().min(1).max(300), text: text(2000) });
const subject = subjectInput.extend({ id, createdAt: timestamp, isDemo: z.boolean() });
const concept = conceptInput.extend({ id, position: z.number().int().nonnegative() });
export const materialInput = z.object({ subjectId: id, name: title, kind: z.enum(MATERIAL_KINDS), text: z.string().max(2000000).refine(value => Boolean(value.trim()), 'El material no contiene texto.'), pageCount: z.number().int().min(1).max(300) });
const material = materialInput.extend({ id, createdAt: timestamp, hash: z.string().regex(/^[a-f0-9]{64}$/), version: z.number().int().min(1), lms: lmsSourceRow.optional(), ocrSource: captureSource.optional() });
const attempt = attemptInput.extend({ id, expected: text(10000), source: z.enum(['verified', 'self']), purpose: z.enum(['practice', 'diagnostic', 'mock']).default('practice'), classification: classificationSchema.optional(), createdAt: timestamp, ocrSource: captureSource.optional() });
const message = z.object({ id, subjectId: id, role: z.enum(['user', 'assistant']), text: text(30000), mode: z.enum(['socratic', 'explain', 'practice']), citations: z.array(citation).max(10), createdAt: timestamp, retrieval: z.enum(['hybrid', 'textual']).optional(), evidenceIds: z.array(id).max(3).optional() });
const event = z.object({ id, subjectId: id.optional(), type: text(80), createdAt: timestamp, payload: z.record(z.string(), z.unknown()) });
const settings = z.object({ id: z.literal('profile'), name: text(80), dailyMinutes: z.number().int().min(5).max(120), largeText: z.boolean(), highContrast: z.boolean() });
export const selfRatings = z.array(z.object({ conceptId: id, rating: z.enum(['unsure', 'learning', 'confident']) })).max(12);
export const taskInput = z.object({ subjectId: id, title, notes: text(4000), dueDate: z.string().refine(validDay, 'La fecha no es válida.').nullable(), conceptIds: z.array(id).max(30).refine(ids => new Set(ids).size === ids.length, 'Hay conceptos repetidos.'), estimatedMinutes: z.number().int().min(5).max(120), unitId: id.nullable().default(null), curriculumIds: z.array(id).max(100).default([]) });
const task = taskInput.extend({ id, status: z.enum(['pending', 'completed']), createdAt: timestamp, completedAt: timestamp.nullable(), lms: lmsTaskSourceRow.optional() });
const diagnostic = z.object({
  id, subjectId: id, conceptIds: z.array(id).min(1).max(12), selfRatings,
  responses: z.array(z.object({ conceptId: id, exerciseId: text(150), attemptId: id })).max(24),
  current: z.object({ conceptId: id, exerciseId: text(150) }).nullable(),
  status: z.enum(['active', 'completed', 'cancelled']), startedAt: timestamp, completedAt: timestamp.nullable(), reflection: text(4000)
});

import { reportRow, reportPreferenceRow, validateReports } from './reports.js';

import { goalRow, goalReviewRow, alertReviewRow, validateGoals } from './goals.js';

export const backupSchema = z.object({
  format: z.literal('tutor-local'), version: z.literal(12), exportedAt: timestamp,
  tables: z.object({ captures: z.array(captureRow).max(200), capture_reviews: z.array(captureReviewRow).max(2000), subjects: z.array(subject).max(200), concepts: z.array(concept).max(10000), materials: z.array(material).max(2000), attempts: z.array(attempt).max(100000), messages: z.array(message).max(100000), events: z.array(event).max(200000), settings: z.array(settings).max(1), diagnostics: z.array(diagnostic).max(10000), tasks: z.array(task).max(10000), curriculum: z.array(curriculumRow).max(10000), units: z.array(unitRow).max(10000), flashcards: z.array(cardRow).max(10000), card_revisions: z.array(cardRevisionRow).max(100000), card_reviews: z.array(reviewRow).max(200000), portfolio: z.array(portfolioRow).max(10000), study_sessions: z.array(studySessionRow).max(10000), mock_exams: z.array(mockExamRow).max(10000), rubrics: z.array(rubricRow).max(10000), rubric_versions: z.array(rubricVersionRow).max(100000), rubric_submissions: z.array(submissionRow).max(100000), rubric_reviews: z.array(rubricReviewRow).max(200000), lms_connections: z.array(lmsConnectionRow).max(200), lms_items: z.array(lmsItemRow).max(50000), lms_versions: z.array(lmsVersionRow).max(200000), lms_runs: z.array(lmsRunRow).max(100000), learning_analyses: z.array(analysisRow).max(100000), observation_reviews: z.array(observationReviewRow).max(200000), interventions: z.array(interventionRow).max(100000), intervention_responses: z.array(interventionResponseRow).max(300000), intervention_reviews: z.array(interventionReviewRow).max(200000),concept_relations:z.array(relationRow).max(10000),relation_reviews:z.array(relationReviewRow).max(100000),interdisciplinary_projects:z.array(projectRow).max(2000),project_versions:z.array(projectVersionRow).max(20000),project_works:z.array(projectWorkRow).max(100000),project_activity_reviews:z.array(projectReviewRow).max(100000),learning_reports:z.array(reportRow).max(20000),report_preferences:z.array(reportPreferenceRow).max(200),personal_goals:z.array(goalRow).max(10000),goal_reviews:z.array(goalReviewRow).max(100000),alert_reviews:z.array(alertReviewRow).max(100000) })
});

export function validateBackup(raw: string): string {
  const input = JSON.parse(raw);
  // Older portable copies remain readable; no invented educational evidence is added.
  if (input?.format === 'tutor-local' && input.version === 1 && input.tables) {
    input.version = 2; input.tables.diagnostics = []; input.tables.tasks = [];
  }
  if (input?.format === 'tutor-local' && input.version === 2 && input.tables) {
    input.version = 3;
    for (const table of ['curriculum', 'units', 'flashcards', 'card_revisions', 'card_reviews', 'portfolio']) input.tables[table] = [];
  }
  if (input?.format === 'tutor-local' && input.version === 3 && input.tables) { input.version = 4; input.tables.study_sessions = []; input.tables.mock_exams = []; }
  if (input?.format === 'tutor-local' && input.version === 4 && input.tables) {
    input.version = 5; input.tables.rubrics = []; input.tables.rubric_versions = []; input.tables.rubric_submissions = []; input.tables.rubric_reviews = [];
  }
  if (input?.format === 'tutor-local' && input.version === 5 && input.tables) { input.version = 6; for (const table of ['lms_connections', 'lms_items', 'lms_versions', 'lms_runs']) input.tables[table] = []; }
  if (input?.format === 'tutor-local' && input.version === 6 && input.tables) { input.version = 7; for (const table of ['learning_analyses', 'observation_reviews', 'interventions', 'intervention_responses', 'intervention_reviews']) input.tables[table] = []; }
  if (input?.format === 'tutor-local' && input.version === 7 && input.tables) { input.version = 8; for (const table of ['concept_relations','relation_reviews','interdisciplinary_projects','project_versions','project_works','project_activity_reviews']) input.tables[table] = []; }
  if (input?.format === 'tutor-local' && input.version === 8 && input.tables) { input.version = 9; input.tables.learning_reports = []; input.tables.report_preferences = []; }
  if (input?.format === 'tutor-local' && input.version === 9 && input.tables) { input.version = 10; input.tables.personal_goals = []; input.tables.goal_reviews = []; input.tables.alert_reviews = []; }
  if (input?.format === 'tutor-local' && input.version === 10 && input.tables) input.version = 11;
  if (input?.format === 'tutor-local' && input.version === 11 && input.tables) { input.version = 12; input.tables.captures = []; input.tables.capture_reviews = []; }
  const backup = backupSchema.parse(input);
  validateCaptureTables(backup.tables);
  const subjects = new Set(backup.tables.subjects.map(s => s.id));
  const concepts = new Map(backup.tables.concepts.map(c => [c.id, c]));
  const materials = new Map(backup.tables.materials.map(m => [m.id, m]));
  const attempts = new Map(backup.tables.attempts.map(a => [a.id, a]));
  const curriculum = new Map(backup.tables.curriculum.map(c => [c.id, c]));
  const units = new Map(backup.tables.units.map(u => [u.id, u]));
  const cards = new Map(backup.tables.flashcards.map(c => [c.id, c]));
  for (const rows of Object.values(backup.tables)) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('La copia contiene identificadores duplicados.');
    for (const row of rows) {
      if ('subjectId' in row && row.subjectId && !subjects.has(row.subjectId)) throw new Error('La copia contiene una referencia a una asignatura inexistente.');
    }
  }
  for (const concept of backup.tables.concepts) {
    if (concept.prerequisiteIds.some(prerequisite => concepts.get(prerequisite)?.subjectId !== concept.subjectId || prerequisite === concept.id)) throw new Error('La copia contiene prerrequisitos incompatibles.');
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(conceptId: string) {
    if (visiting.has(conceptId)) throw new Error('La copia contiene un ciclo de prerrequisitos.');
    if (visited.has(conceptId)) return;
    visiting.add(conceptId);
    for (const prerequisite of concepts.get(conceptId)!.prerequisiteIds) visit(prerequisite);
    visiting.delete(conceptId); visited.add(conceptId);
  }
  for (const concept of backup.tables.concepts) visit(concept.id);
  for (const attempt of backup.tables.attempts) {
    if (attempt.conceptId && concepts.get(attempt.conceptId)?.subjectId !== attempt.subjectId) throw new Error('La copia contiene evidencias vinculadas a otra asignatura.');
    if (attempt.classification) {
      const concept = attempt.conceptId ? concepts.get(attempt.conceptId) : null;
      const expected = concept ? classifyBank(concept, attempt.statement, []) : undefined;
      if (!expected || attempt.source !== 'verified' || attempt.classification.difficulty !== expected.difficulty || attempt.classification.reasoning !== expected.reasoning || JSON.stringify(attempt.classification.conceptIds) !== JSON.stringify(expected.conceptIds) || attempt.classification.prerequisiteIds.some(id => concepts.get(id)?.subjectId !== attempt.subjectId) || attempt.classification.curriculum.some(ref => curriculum.has(ref.id) && curriculum.get(ref.id)!.subjectId !== attempt.subjectId)) throw new Error('La copia contiene una clasificación de ejercicio incompatible.');
    }
  }
  for (const message of backup.tables.messages) {
    if (message.citations.some(source => materials.get(source.materialId)?.subjectId !== message.subjectId)) throw new Error('La copia contiene fuentes vinculadas a otra asignatura.');
    if (message.evidenceIds?.some(id => attempts.get(id)?.subjectId !== message.subjectId)) throw new Error('La copia contiene evidencias del tutor vinculadas a otra asignatura.');
  }
  for (const task of backup.tables.tasks) {
    if (task.conceptIds.some(conceptId => concepts.get(conceptId)?.subjectId !== task.subjectId)) throw new Error('La copia contiene una tarea vinculada a otra asignatura.');
    if ((task.status === 'completed') !== Boolean(task.completedAt)) throw new Error('La copia contiene una tarea con un estado incompatible.');
    if (task.unitId && units.get(task.unitId)?.subjectId !== task.subjectId) throw new Error('La copia contiene una tarea vinculada a otra unidad.');
    if (task.curriculumIds.some(id => curriculum.get(id)?.subjectId !== task.subjectId) || new Set(task.curriculumIds).size !== task.curriculumIds.length) throw new Error('La copia contiene una tarea con currículo incompatible.');
  }
  const activeSubjects = new Set<string>();
  const diagnosticAttempts = new Set<string>();
  for (const session of backup.tables.diagnostics) {
    const owned = new Set(session.conceptIds);
    if (owned.size !== session.conceptIds.length || session.conceptIds.some(conceptId => concepts.get(conceptId)?.subjectId !== session.subjectId || !EXERCISES[concepts.get(conceptId)!.name])) throw new Error('La copia contiene un diagnóstico con conceptos incompatibles.');
    if (session.selfRatings.length !== owned.size || new Set(session.selfRatings.map(r => r.conceptId)).size !== owned.size || session.selfRatings.some(r => !owned.has(r.conceptId))) throw new Error('La copia contiene autoevaluaciones incompatibles.');
    if ((session.status === 'active') !== Boolean(session.current) || (session.status !== 'active') !== Boolean(session.completedAt)) throw new Error('La copia contiene un diagnóstico con un estado incompatible.');
    if (session.status === 'active') {
      if (activeSubjects.has(session.subjectId)) throw new Error('La copia contiene dos diagnósticos activos de la misma asignatura.');
      activeSubjects.add(session.subjectId);
    }
    const questions = new Set<string>();
    const checkQuestion = (conceptId: string, exerciseId: string) => {
      const name = concepts.get(conceptId)?.name;
      const index = Number(exerciseId.split(':').at(-1));
      if (!owned.has(conceptId) || !name || !Number.isInteger(index) || index < 0 || index >= Math.min(2, EXERCISES[name].length) || exerciseId !== `${name}:${index}`) throw new Error('La copia contiene una pregunta de diagnóstico incompatible.');
    };
    for (const response of session.responses) {
      checkQuestion(response.conceptId, response.exerciseId);
      const evidence = attempts.get(response.attemptId);
      if (!evidence || evidence.conceptId !== response.conceptId || evidence.subjectId !== session.subjectId || evidence.source !== 'verified' || evidence.purpose !== 'diagnostic' || evidence.hints !== 0 || diagnosticAttempts.has(evidence.id)) throw new Error('La copia contiene una evidencia de diagnóstico incompatible.');
      const key = `${response.conceptId}:${response.exerciseId}`;
      if (questions.has(key)) throw new Error('La copia contiene una pregunta de diagnóstico repetida.');
      questions.add(key); diagnosticAttempts.add(evidence.id);
    }
    const relevantConcepts = session.conceptIds.map(conceptId => concepts.get(conceptId)!);
    const relevantAttempts = session.responses.map(response => attempts.get(response.attemptId)!);
    const replay = { conceptIds: session.conceptIds, responses: [] as typeof session.responses };
    for (const response of session.responses) {
      const expected = nextDiagnosticQuestion(replay, relevantConcepts, relevantAttempts);
      if (expected?.conceptId !== response.conceptId || expected.exerciseId !== response.exerciseId) throw new Error('La copia contiene un recorrido de diagnóstico incompatible.');
      replay.responses.push(response);
    }
    const expectedNext = nextDiagnosticQuestion(replay, relevantConcepts, relevantAttempts);
    if (session.current) {
      checkQuestion(session.current.conceptId, session.current.exerciseId);
      if (questions.has(`${session.current.conceptId}:${session.current.exerciseId}`)) throw new Error('La copia contiene una pregunta ya contestada.');
      if (expectedNext?.conceptId !== session.current.conceptId || expectedNext.exerciseId !== session.current.exerciseId) throw new Error('La copia contiene una siguiente pregunta incompatible.');
    }
    if (session.status === 'completed' && session.responses.length !== session.conceptIds.reduce((count, conceptId) => count + Math.min(2, EXERCISES[concepts.get(conceptId)!.name].length), 0)) throw new Error('La copia contiene un diagnóstico incompleto marcado como terminado.');
  }
  for (const row of backup.tables.curriculum) {
    if (row.conceptIds.some(id => concepts.get(id)?.subjectId !== row.subjectId) || row.relatedIds.some(id => id === row.id || curriculum.get(id)?.subjectId !== row.subjectId)) throw new Error('La copia contiene un currículo con referencias incompatibles.');
  }
  assertAcyclic(backup.tables.units);
  for (const row of backup.tables.units) {
    if (row.startsOn && row.endsOn && row.startsOn > row.endsOn) throw new Error('La copia contiene fechas de unidad incompatibles.');
    if (row.conceptIds.some(id => concepts.get(id)?.subjectId !== row.subjectId) || row.curriculumIds.some(id => curriculum.get(id)?.subjectId !== row.subjectId) || row.materialIds.some(id => materials.get(id)?.subjectId !== row.subjectId)) throw new Error('La copia contiene una unidad con referencias incompatibles.');
    if (row.prerequisiteIds.some(id => units.get(id)?.subjectId !== row.subjectId || units.get(id)!.position >= row.position)) throw new Error('La copia contiene una secuencia con prerrequisitos incompatibles.');
  }
  for (const subjectId of subjects) {
    const ownedUnits = backup.tables.units.filter(u => u.subjectId === subjectId);
    if (new Set(ownedUnits.map(u => u.position)).size !== ownedUnits.length) throw new Error('La copia contiene posiciones de unidad repetidas.');
    if (ownedUnits.map(u => u.position).sort((a, b) => a - b).some((position, index) => position !== index)) throw new Error('La copia contiene posiciones de unidad discontinuas.');
  }
  const validateCardSources = (row: z.infer<typeof cardRow> | z.infer<typeof cardRevisionRow>) => {
    if (row.conceptId && concepts.get(row.conceptId)?.subjectId !== row.subjectId || row.evidenceIds.some(id => attempts.get(id)?.subjectId !== row.subjectId)) throw new Error('La copia contiene una tarjeta vinculada a otra asignatura.');
    if (row.origin === 'material') {
      const material = row.source ? materials.get(row.source.materialId) : undefined;
      if (!material || material.subjectId !== row.subjectId || material.version !== row.source!.materialVersion || !material.text.split('\f')[row.source!.page - 1]?.includes(row.source!.quote) || row.back !== row.source!.quote) throw new Error('La copia contiene una fuente de tarjeta no verificable.');
    } else if (row.source) throw new Error('La copia contiene una fuente de tarjeta incompatible.');
    if (row.origin === 'attempt') {
      const evidence = row.evidenceIds.length === 1 ? attempts.get(row.evidenceIds[0]) : undefined;
      if (!evidence || evidence.source !== 'verified' || evidence.outcome !== 'incorrect' || row.front !== evidence.statement || row.back !== `Respuesta: ${evidence.expected}\n\n${evidence.feedback}`) throw new Error('La copia contiene una tarjeta de error no verificable.');
    }
  };
  const revisions = new Map<string, z.infer<typeof cardRevisionRow>>();
  const revisionCounts = new Map<string, number>();
  for (const revision of backup.tables.card_revisions) {
    validateCardSources(revision);
    const card = cards.get(revision.cardId);
    const key = `${revision.cardId}:${revision.revision}`;
    if (!card || card.subjectId !== revision.subjectId || revisions.has(key) || revision.revision > card.revision) throw new Error('La copia contiene versiones de tarjeta incompatibles.');
    revisions.set(key, revision);
    revisionCounts.set(revision.cardId, (revisionCounts.get(revision.cardId) ?? 0) + 1);
  }
  for (const card of backup.tables.flashcards) {
    validateCardSources(card);
    const current = revisions.get(`${card.id}:${card.revision}`);
    if (!current || current.front !== card.front || current.back !== card.back || current.conceptId !== card.conceptId || current.origin !== card.origin || JSON.stringify(current.source) !== JSON.stringify(card.source) || JSON.stringify(current.evidenceIds) !== JSON.stringify(card.evidenceIds)) throw new Error('La copia contiene una versión actual de tarjeta incompatible.');
    if (revisionCounts.get(card.id) !== card.revision) throw new Error('La copia contiene un historial de tarjeta incompleto.');
  }
  for (const review of backup.tables.card_reviews) if (cards.get(review.cardId)?.subjectId !== review.subjectId || !revisions.has(`${review.cardId}:${review.revision}`)) throw new Error('La copia contiene un repaso de tarjeta incompatible.');
  for (const entry of backup.tables.portfolio) {
    if (entry.conceptIds.some(id => concepts.get(id)?.subjectId !== entry.subjectId) || entry.evidenceIds.some(id => attempts.get(id)?.subjectId !== entry.subjectId)) throw new Error('La copia contiene un portfolio con referencias incompatibles.');
    if (entry.automatic && (entry.kind !== 'attempt' || entry.evidenceIds.length !== 1 || entry.evidenceIds.some(id => { const evidence = attempts.get(id)!; return evidence.source !== 'verified' || evidence.outcome !== 'correct' || evidence.hints > 0; }))) throw new Error('La copia contiene un portfolio automático sin evidencia autónoma.');
    if (entry.automatic) {
      const evidence = attempts.get(entry.evidenceIds[0])!;
      if (entry.title !== evidence.statement.slice(0, 120) || entry.content !== automaticPortfolioContent(evidence) || entry.createdAt !== evidence.createdAt || JSON.stringify(entry.conceptIds) !== JSON.stringify(evidence.conceptId ? [evidence.conceptId] : [])) throw new Error('La copia contiene un portfolio automático incompatible con su evidencia.');
    }
  }
  const tasksById = new Map(backup.tables.tasks.map(row => [row.id, row]));
  const reviewsById = new Map(backup.tables.card_reviews.map(row => [row.id, row]));
  const evidenceOwners = new Set<string>();
  const pendingSessionSubjects = new Set<string>();
  let runningCount = 0;
  for (const row of backup.tables.study_sessions) {
    const fail = () => { throw new Error('La copia contiene una sesión de estudio incompatible.'); };
    if (row.conceptIds.some(id => concepts.get(id)?.subjectId !== row.subjectId) || row.unitId && units.get(row.unitId)?.subjectId !== row.subjectId || row.taskId && tasksById.get(row.taskId)?.subjectId !== row.subjectId) fail();
    if (new Set(row.materials.map(ref => ref.id)).size !== row.materials.length || row.materials.some(ref => { const material = materials.get(ref.id); return !material || material.subjectId !== row.subjectId || material.version !== ref.version || material.name !== ref.name; })) fail();
    if (['running', 'paused', 'review'].includes(row.status)) {
      if (pendingSessionSubjects.has(row.subjectId)) fail(); pendingSessionSubjects.add(row.subjectId);
    }
    if (row.status === 'running') {
      runningCount++;
      if (!row.runningSince || !row.checkpointAt || row.checkpointAt < row.runningSince || row.stoppedAt || row.completedAt || row.review) fail();
    } else if (row.runningSince || row.checkpointAt) fail();
    if (row.status === 'paused' && (row.stoppedAt || row.completedAt || row.review)) fail();
    if (row.status === 'review' && (!row.stoppedAt || row.completedAt || row.review)) fail();
    if (row.status === 'completed' && (!row.stoppedAt || !row.completedAt || !row.review)) fail();
    if (row.status === 'cancelled' && (!row.stoppedAt || !row.completedAt || row.review)) fail();
    let previousEnd = row.createdAt; let elapsedMs = 0;
    for (const span of row.intervals) {
      if (span.startedAt < previousEnd || span.endedAt < span.startedAt) fail();
      elapsedMs += Date.parse(span.endedAt) - Date.parse(span.startedAt); previousEnd = span.endedAt;
    }
    if (elapsedMs > row.minutes * 60000 || row.runningSince && row.runningSince < previousEnd || row.stoppedAt && row.stoppedAt < previousEnd || row.completedAt && row.completedAt < row.stoppedAt!) fail();
    if (row.status === 'running' && sessionElapsed(row, new Date(row.checkpointAt!)) >= row.minutes * 60000) fail();
    if (row.status === 'paused' && elapsedMs >= row.minutes * 60000) fail();
    const spans = [...row.intervals, ...(row.runningSince ? [{ startedAt: row.runningSince, endedAt: row.checkpointAt! }] : [])];
    for (const [field, map] of [['attemptIds', attempts], ['cardReviewIds', reviewsById]] as const) for (const id of row[field]) {
      const evidence = map.get(id);
      if (!evidence || evidence.subjectId !== row.subjectId || evidenceOwners.has(`${field}:${id}`) || !spans.some(span => evidence.createdAt >= span.startedAt && evidence.createdAt <= span.endedAt)) fail();
      evidenceOwners.add(`${field}:${id}`);
    }
  }
  if (runningCount > 1) throw new Error('La copia contiene más de una sesión de estudio en marcha.');
  let activeMocks = 0; const mockAttempts = new Set<string>();
  for (const exam of backup.tables.mock_exams) {
    const fail = () => { throw new Error('La copia contiene un simulacro incompatible.'); };
    if (exam.bankVersion !== BANK_VERSION || exam.conceptIds.some(id => concepts.get(id)?.subjectId !== exam.subjectId) || exam.unitId && units.get(exam.unitId)?.subjectId !== exam.subjectId) fail();
    const start = Date.parse(exam.startedAt); const due = Date.parse(exam.dueAt); const end = exam.completedAt ? Date.parse(exam.completedAt) : due;
    if (due - start !== exam.minutes * 60000 || end < start || end > due) fail();
    if (exam.status === 'active') { activeMocks++; if (!exam.currentQuestionId || !exam.questionStartedAt || exam.completedAt || exam.endReason || exam.attemptIds.length || Date.parse(exam.questionStartedAt) < start || Date.parse(exam.questionStartedAt) >= due) fail(); }
    else if (exam.currentQuestionId || exam.questionStartedAt || !exam.completedAt || !exam.endReason) fail();
    if (exam.status === 'completed' && (exam.attemptIds.length !== exam.questions.length || !['submitted', 'timeout'].includes(exam.endReason!))) fail();
    if (exam.endReason === 'timeout' && exam.completedAt !== exam.dueAt || exam.status === 'cancelled' && (exam.endReason !== 'cancelled' || exam.attemptIds.length)) fail();
    const questionIds = new Set(exam.questions.map(question => question.id));
    if (questionIds.size !== exam.questions.length || new Set(exam.questions.map(question => `${question.conceptId}:${question.exerciseId}`)).size !== exam.questions.length || exam.currentQuestionId && !questionIds.has(exam.currentQuestionId)) fail();
    if (exam.answers.length !== exam.questions.length || new Set(exam.answers.map(answer => answer.questionId)).size !== exam.answers.length || exam.answers.some(answer => !questionIds.has(answer.questionId) || Date.parse(answer.updatedAt) < start || Date.parse(answer.updatedAt) > end)) fail();
    if (exam.answers.reduce((sum, answer) => sum + answer.durationMs, 0) > end - start) fail();
    for (const [index, question] of exam.questions.entries()) {
      const concept = concepts.get(question.conceptId); const bankIndex = Number(question.exerciseId.split(':').at(-1));
      const bank = concept ? EXERCISES[concept.name]?.[bankIndex] : undefined;
      const expected = concept ? classifyBank(concept, question.statement, []) : undefined;
      if (!concept || concept.subjectId !== exam.subjectId || !exam.conceptIds.includes(concept.id) || question.conceptName !== concept.name || question.exerciseId !== `${concept.name}:${bankIndex}` || !bank || bank.statement !== question.statement || bank.answer !== question.answerKey || bank.feedback !== question.feedback || !expected || question.classification.difficulty !== expected.difficulty || question.classification.reasoning !== expected.reasoning || question.classification.difficulty > exam.maxDifficulty || JSON.stringify(question.classification.conceptIds) !== JSON.stringify(expected.conceptIds) || question.classification.prerequisiteIds.some(id => concepts.get(id)?.subjectId !== exam.subjectId) || question.classification.curriculum.some(ref => curriculum.has(ref.id) && curriculum.get(ref.id)!.subjectId !== exam.subjectId)) fail();
      if (exam.status === 'completed') {
        const evidence = attempts.get(exam.attemptIds[index]); const answer = exam.answers.find(answer => answer.questionId === question.id)!;
        const answered = Boolean(answer.value.trim()); const correct = answered && matchesBankAnswer(answer.value, question.answerKey);
        const feedback = answered ? correct ? question.feedback : `La respuesta esperada es ${question.answerKey}. ${question.feedback}` : `Sin respuesta registrada. Puedes revisar ahora un ejemplo: ${question.feedback}`;
        if (!evidence || mockAttempts.has(evidence.id) || evidence.purpose !== 'mock' || evidence.subjectId !== exam.subjectId || evidence.conceptId !== question.conceptId || evidence.source !== 'verified' || evidence.hints !== 0 || evidence.answer !== answer.value || evidence.statement !== question.statement || evidence.expected !== question.answerKey || evidence.outcome !== (answered ? correct ? 'correct' : 'incorrect' : 'ungraded') || evidence.feedback !== feedback || evidence.createdAt !== exam.completedAt || evidence.durationSeconds !== Math.round(answer.durationMs / 1000) || JSON.stringify(evidence.classification) !== JSON.stringify(question.classification)) fail();
        mockAttempts.add(exam.attemptIds[index]);
      }
    }
  }
  if (activeMocks > 1 || activeMocks && runningCount) throw new Error('La copia contiene actividades simultáneas incompatibles con un simulacro.');
  if (backup.tables.attempts.some(attempt => attempt.purpose === 'mock' && !mockAttempts.has(attempt.id))) throw new Error('La copia contiene una evidencia de simulacro sin su corrección original.');
  validateRubricTables(backup.tables);
  validateLmsTables(backup.tables);
  validatePedagogyTables(backup.tables);
  validateConnections(backup.tables);
  validateReports(backup.tables);
  validateGoals(backup.tables);
  return JSON.stringify(backup);
}
