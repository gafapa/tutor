import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { createHash, randomUUID } from 'node:crypto';
import {z} from 'zod';
import { existsSync } from 'node:fs';
import type { Attempt, AttemptInput, Concept, ConceptInput, Diagnostic, DiagnosticView, Material, Message, Subject, SubjectInput, Snapshot, StudyTask, TaskInput } from '../shared/types.js';
import { readEncrypted, writeEncrypted } from './vault.js';
import { estimate, getExercise, gradeExercise, matchesBankAnswer, EXERCISES } from './learning.js';
import { dailyPlan, nextDiagnosticQuestion, reviewSchedule } from './planning.js';
import { validateBackup, subjectInput, materialInput } from './validation.js';
import type { CurriculumItem, CurriculumInput, DidacticUnit, UnitInput, Flashcard, FlashcardInput, FlashcardRevision, CardReview, RecallRating, PortfolioEntry, PortfolioInput, EducationalEvent } from '../shared/education.js';
import { scheduleCard, materialCardDrafts, errorCardDrafts, assertAcyclic, automaticPortfolioContent, type CardDraft } from './education.js';
import { curriculumInput, unitInput, cardInput, portfolioInput, educationId } from './education-validation.js';
import type { StudySession, SessionInput, SessionReview, StopReason } from '../shared/study.js';
import { sessionElapsed, sessionRemaining } from '../shared/study.js';
import { sessionInput, sessionReview, stopSession } from './study.js';
import type { MockExamInput } from '../shared/assessment.js';
import { BANK_VERSION, mockInput, mockPool, chooseMockQuestions, classifyBank, exerciseCatalog, publicMock, type MockExamRecord } from './assessment.js';
import type { Rubric, RubricInput, RubricVersion, RubricSubmission, RubricSubmissionInput, RubricReview, RubricReviewInput, RubricResult, RubricWorkState } from '../shared/rubrics.js';
import { rubricInput, submissionInput, submissionHash, validateReview, RUBRIC_PROMPT_VERSION } from './rubrics.js';
import type { LmsConnection, LmsItem, LmsItemVersion, LmsSyncRun } from '../shared/lms.js';
import type { MoodleBatch } from './moodle.js';
import { lmsConnectionRow, lmsItemRow, lmsRunRow } from './lms-validation.js';
import { lmsHash, shortLmsTitle } from './lms-utils.js';
import { dayKey, addDays } from '../shared/calendar.js';
import type { WorkInput, LearningAnalysis, LearningObservation, ObservationReview, InterventionResponse, InterventionReview } from '../shared/pedagogy.js';
import { workContext, arithmeticAnalysis, validateAnalysis, skillProfiles, analysisRow, observationInput, observationReviewInput, createIntervention, interventionInput, interventionAnswerInput, gradeIntervention, interventionReviewInput, publicIntervention, type InterventionRecord } from './pedagogy.js';
import type {ConceptRelation,RelationReview,InterdisciplinaryProject,ProjectVersion,ProjectWork,ProjectActivityReview} from '../shared/connections.js';
import {relationInput,relationReviewInput,projectInput,projectWorkInput,projectReviewInput,projectWorkRow,activeRelations,assertRelationGraph,relationSuggestions,transferSuggestions,learningGraph,validateProject,projectSource,projectSuggestions,contentHash,type ConnectionData} from './connections.js';
import type { LearningReport, ReportPreference, ReportInput } from '../shared/reports.js';
import { makeReport, previousWeek, reportInput, reportActivity, type ReportData } from './reports.js';

import type { PersonalGoal, GoalReview, AlertReview, GoalInput } from '../shared/goals.js';
import { goalInput, goalReviewInput, alertReviewInput, goalProgress, learningAlerts, learningHabit, recentChanges, currentGoals, validateGoalReview, conceptTimeline, type GoalsData } from './goals.js';
import type { Capture, CaptureReview, CaptureSource, OcrReviewInput } from '../shared/ocr.js';
import { ocrReviewInput, validateCapture } from './ocr-validation.js';
import { MAX_CAPTURE_STORAGE } from './ocr-config.js';

const EDUCATION_TABLES = ['curriculum', 'units', 'flashcards', 'card_revisions', 'card_reviews', 'portfolio', 'study_sessions', 'mock_exams', 'rubrics', 'rubric_versions', 'rubric_submissions', 'rubric_reviews', 'lms_connections', 'lms_items', 'lms_versions', 'lms_runs', 'learning_analyses', 'observation_reviews', 'interventions', 'intervention_responses', 'intervention_reviews', 'concept_relations', 'relation_reviews', 'interdisciplinary_projects', 'project_versions', 'project_works', 'project_activity_reviews', 'learning_reports', 'report_preferences', 'personal_goals', 'goal_reviews', 'alert_reviews', 'captures', 'capture_reviews'] as const;
const TABLES = ['subjects', 'concepts', 'materials', 'attempts', 'messages', 'events', 'settings', 'diagnostics', 'tasks', ...EDUCATION_TABLES] as const;
const DEFAULT_SETTINGS: Snapshot['settings'] = { name: '', dailyMinutes: 20, largeText: false, highContrast: false };

export class Store {
  private constructor(private db: Database, private sql: SqlJsStatic, private path: string, private key: Buffer) {}

  static async open(path: string, key: Buffer, wasmPath: string) {
    const sql = await initSqlJs({ locateFile: () => wasmPath });
    const db = existsSync(path) ? new sql.Database(readEncrypted(path, key)) : new sql.Database();
    const version = db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0;
    if (Number(version) > 12) { db.close(); throw new Error('Este historial pertenece a una versión más reciente de Tutor Local.'); }
    db.run('PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
    db.run(`
      CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS concepts (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS diagnostics (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL);
      PRAGMA user_version = 12;
    `);
    for (const table of EDUCATION_TABLES) db.run(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL)`);
    const store = new Store(db, sql, path, key);
    for (const subject of store.list<Subject>('subjects')) if (subject.course === undefined) store.replace('subjects', { ...subject, course: '' });
    if (!store.list('settings').length) store.put('settings', { id: 'profile', ...DEFAULT_SETTINGS });
    if (Number(version) < 3) store.backfillPortfolio();
    store.recoverSessions();
    store.tickMock();
    store.maintainReports();
    store.persist();
    return store;
  }

  private list<T>(table: typeof TABLES[number]): T[] {
    const statement = this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`);
    const result: T[] = [];
    try { while (statement.step()) result.push(JSON.parse(statement.getAsObject().data as string) as T); }
    finally { statement.free(); }
    return result;
  }

  private put<T extends { id: string; subjectId?: string }>(table: typeof TABLES[number], data: T) {
    if (table !== 'subjects' && table !== 'settings') {
      this.db.run(`INSERT INTO ${table} (id, subject_id, data) VALUES (?, ?, ?)`, [data.id, data.subjectId ?? null, JSON.stringify(data)]);
    } else this.db.run(`INSERT INTO ${table} (id, data) VALUES (?, ?)`, [data.id, JSON.stringify(data)]);
  }

  private transaction<T>(action: () => T): T {
    const before = this.bytes();
    this.db.run('BEGIN TRANSACTION');
    try {
      const result = action();
      this.db.run('COMMIT');
      this.persist();
      return result;
    } catch (error) {
      this.db.close();
      this.db = new this.sql.Database(before);
      this.db.run('PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
      throw error;
    }
  }

  private bytes() {
    // sql.js reopens its SQLite connection on export and resets connection pragmas.
    const bytes = this.db.export();
    this.db.run('PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
    return bytes;
  }
  private persist() { writeEncrypted(this.path, this.bytes(), this.key); }
  private event(type: string, subjectId?: string, payload: object = {}) {
    this.put('events', { id: randomUUID(), subjectId, type, createdAt: new Date().toISOString(), payload });
  }
  requireSubject(id: string): Subject {
    const subject = this.list<Subject>('subjects').find(s => s.id === id);
    if (!subject) throw new Error('No se encuentra esta asignatura.');
    return subject;
  }
  requireConcept(id: string): Concept {
    const concept = this.list<Concept>('concepts').find(c => c.id === id);
    if (!concept) throw new Error('No se encuentra este concepto.');
    return concept;
  }

  snapshot() {
    const connections=this.connectionData(),active=activeRelations(connections.concept_relations,connections.relation_reviews);
    const concepts = this.list<Concept>('concepts');
    const attempts = this.list<Attempt>('attempts');
    const goals = this.goalsData();
    const goalStates = currentGoals(goals.personal_goals).map(g => goalProgress(g, goals));
    const settings = this.list<Snapshot['settings']>('settings')[0] ?? DEFAULT_SETTINGS;
    const estimates = concepts.map(c => estimate(c.id, attempts));
    const diagnostics = this.list<Diagnostic>('diagnostics');
    const tasks = this.list<StudyTask>('tasks');
    const reviews = concepts.flatMap(c => { const review = reviewSchedule(c, attempts); return review ? [review] : []; });
    const subjects = this.list<Subject>('subjects');
    const lmsConnections = this.list<LmsConnection>('lms_connections'), lmsItems = this.list<LmsItem>('lms_items');
    const currentItems = new Map(lmsItems.map(row => [row.id, row]));
    const flashcards = this.list<Flashcard>('flashcards');
    const cardReviews = this.list<CardReview>('card_reviews');
    const learningAnalyses = this.list<LearningAnalysis>('learning_analyses'), observationReviews = this.list<ObservationReview>('observation_reviews');
    const workContexts = new Map(learningAnalyses.map(row => [row.id, this.workContext(row.source)]));
    return {
      recentChanges: recentChanges(goals), personalGoals: goals.personal_goals, goalReviews: goals.goal_reviews, goalProgress: goalStates, learningAlerts: learningAlerts(goals), alertReviews: goals.alert_reviews, learningHabits: goals.subjects.map(s => learningHabit(goals, s.id)),
      learningReports: this.list<LearningReport>('learning_reports'), reportPreferences: this.list<ReportPreference>('report_preferences'),
      conceptRelations:connections.concept_relations,relationReviews:connections.relation_reviews,relationSuggestions:relationSuggestions(connections.concepts,connections.concept_relations),
      transfers:transferSuggestions(connections.concepts,active,estimates,attempts,reviews),learningGraph:learningGraph(connections,active),
      interdisciplinaryProjects:connections.interdisciplinary_projects,projectVersions:connections.project_versions,projectWorks:connections.project_works,projectActivityReviews:connections.project_activity_reviews,projectSuggestions:projectSuggestions(connections,active),
      captures: this.list<Capture>('captures').map(c => ({ id: c.id, subjectId: c.subjectId, name: c.name, sourceFormat: c.sourceFormat, sourcePage: c.sourcePage, width: c.image.width, height: c.image.height, confidence: c.recognition.confidence, createdAt: c.createdAt })),
      captureReviews: this.list<CaptureReview>('capture_reviews').map(({ text: _text, confirmed: _confirmed, ...summary }) => summary),
      subjects, concepts, attempts, diagnostics, tasks, reviews,
      lmsConnections, lmsItems, lmsVersions: this.list<LmsItemVersion>('lms_versions'), lmsRuns: this.list<LmsSyncRun>('lms_runs'),
      learningAnalyses, observationReviews, skillProfiles: skillProfiles(learningAnalyses, observationReviews, workContexts),
      interventions: this.list<InterventionRecord>('interventions').map(publicIntervention), interventionResponses: this.list<InterventionResponse>('intervention_responses'), interventionReviews: this.list<InterventionReview>('intervention_reviews'),
      studySessions: this.list<StudySession>('study_sessions'),
      rubrics: this.list<Rubric>('rubrics'), rubricVersions: this.list<RubricVersion>('rubric_versions'), rubricSubmissions: this.list<RubricSubmission>('rubric_submissions'), rubricReviews: this.list<RubricReview>('rubric_reviews'),
      mockExams: this.list<MockExamRecord>('mock_exams').map(publicMock), exerciseCatalog: exerciseCatalog(concepts),
      practiceConceptIds: concepts.filter(c => Boolean(EXERCISES[c.name])).map(c => c.id),
      exerciseConceptNames: Object.keys(EXERCISES),
      plans: subjects.map(s => dailyPlan(s.id, concepts, estimates, reviews, tasks.filter(t => !t.lms || currentItems.get(t.lms.itemId)?.active), diagnostics, settings.dailyMinutes, new Date(), this.list<StudySession>('study_sessions'),connections.interdisciplinary_projects,connections.project_activity_reviews, currentGoals(goals.personal_goals), goalStates)),
      materials: this.list<Material>('materials').map(m => m.lms ? { ...m, retrievalAvailable: Boolean(currentItems.get(m.lms.itemId)?.active && currentItems.get(m.lms.itemId)?.local.resourceState === 'ready' && currentItems.get(m.lms.itemId)?.local.materialIds.at(-1) === m.id) } : m), messages: this.list<Message>('messages'),
      estimates,
      curriculum: this.list<CurriculumItem>('curriculum'), units: this.list<DidacticUnit>('units'),
      flashcards, cardReviews, cardRevisions: this.list<FlashcardRevision>('card_revisions'),
      cardSchedules: flashcards.filter(c => c.approved).map(card => scheduleCard(card, cardReviews)),
      portfolio: this.list<PortfolioEntry>('portfolio'), events: this.list<EducationalEvent>('events'),
      settings: { name: settings.name, dailyMinutes: settings.dailyMinutes, largeText: settings.largeText, highContrast: settings.highContrast }
    };
  }

  createSubject(input: SubjectInput, isDemo = false): Subject {
    const fields = subjectInput.parse(input);
    return this.transaction(() => {
      const subject: Subject = { ...fields, id: randomUUID(), createdAt: new Date().toISOString(), isDemo };
      this.put('subjects', subject);
      this.event('subject.created', subject.id);
      return subject;
    });
  }
  updateSubject(value: SubjectInput & { id: string }): Subject {
    const fields = subjectInput.parse(value); const previous = this.requireSubject(value.id);
    return this.transaction(() => {
      const subject: Subject = { ...previous, ...fields };
      this.replace('subjects', subject);
      this.event('subject.updated', subject.id, { before: previous, after: subject });
      return subject;
    });
  }
  rendererSnapshot() {
    this.tickMock(); const snapshot = this.snapshot(); const active = snapshot.mockExams.find(row => row.status === 'active');
    if (!active) return snapshot;
    return { ...snapshot, subjects: snapshot.subjects.map(subject => ({ ...subject, goals: '' })), mockExams: [active], concepts: snapshot.concepts.map(concept => ({ ...concept, description: '' })), attempts: [], diagnostics: [], materials: [], messages: [], estimates: [], reviews: [], plans: [], tasks: [], curriculum: [], units: [], flashcards: [], cardReviews: [], cardRevisions: [], cardSchedules: [], portfolio: [], events: [], studySessions: [], exerciseCatalog: [], rubrics: [], rubricVersions: [], rubricSubmissions: [], rubricReviews: [], lmsConnections: [], lmsItems: [], lmsVersions: [], lmsRuns: [], learningAnalyses: [], observationReviews: [], skillProfiles: [], interventions: [], interventionResponses: [], interventionReviews: [],conceptRelations:[],relationReviews:[],relationSuggestions:[],transfers:[],learningGraph:{nodes:[],edges:[]},interdisciplinaryProjects:[],projectVersions:[],projectWorks:[],projectActivityReviews:[],projectSuggestions:[],learningReports:[],reportPreferences:[],personalGoals:[],goalReviews:[],goalProgress:[],learningAlerts:[],alertReviews:[],learningHabits:[],recentChanges:[],captures:[],captureReviews:[] };
  }
  deleteSubject(id: string) {
    this.requireSubject(id);
    this.transaction(() => {
      const concepts=new Set(this.list<Concept>('concepts').filter(c=>c.subjectId===id).map(c=>c.id));
      for(const relation of this.list<ConceptRelation>('concept_relations'))if(concepts.has(relation.fromId)||concepts.has(relation.toId))this.removeRelation(relation.id);
      const projects=new Set(this.list<ProjectVersion>('project_versions').filter(p=>p.subjectIds.includes(id)).map(p=>p.projectId));for(const projectId of projects)this.removeProject(projectId);
      this.db.run('DELETE FROM subjects WHERE id = ?', [id]);
    });
  }
  createConcept(input: ConceptInput): Concept {
    this.requireSubject(input.subjectId);
    for (const id of input.prerequisiteIds) {
      if (this.requireConcept(id).subjectId !== input.subjectId) throw new Error('El prerrequisito debe pertenecer a la misma asignatura.');
    }
    return this.transaction(() => {
      const concept: Concept = { ...input, id: randomUUID(), position: this.list<Concept>('concepts').filter(c => c.subjectId === input.subjectId).length };
      this.put('concepts', concept);
      this.event('concept.created', input.subjectId, { conceptId: concept.id });
      return concept;
    });
  }
  captureData(id: string): { capture: Capture; reviews: CaptureReview[] } {
    const capture = this.requireEducation<Capture>('captures', id);
    return { capture, reviews: this.list<CaptureReview>('capture_reviews').filter(row => row.captureId === id) };
  }
  commitCapture(draft: Capture, value: OcrReviewInput) {
    validateCapture(draft);
    const input = ocrReviewInput.parse(value); this.checkCaptureContext(draft.subjectId, input);
    const all = this.list<Capture>('captures');
    const existing = all.find(row => row.subjectId === draft.subjectId && row.sourceHash === draft.sourceHash && row.sourcePage === draft.sourcePage && row.image.hash === draft.image.hash && row.recognition.language === draft.recognition.language);
    if (!existing && (all.length >= 200 || all.reduce((sum, row) => sum + Buffer.from(row.image.base64, 'base64').length, 0) + Buffer.from(draft.image.base64, 'base64').length > MAX_CAPTURE_STORAGE)) throw new Error('La biblioteca de imágenes está llena (200 capturas o 24 MB). Elimina alguna imagen antes de guardar otra.');
    this.checkReviewLimit();
    return this.transaction(() => {
      const capture = existing ?? draft;
      if (!existing) this.put('captures', capture);
      const previous = this.list<CaptureReview>('capture_reviews').filter(row => row.captureId === capture.id).at(-1);
      const review = this.insertCaptureReview(capture, previous?.id ?? null, input.text);
      const duplicate = !this.insertCaptureWork(capture, review, input);
      return { captureId: capture.id, reviewId: review.id, duplicate };
    });
  }
  reviewCapture(captureId: string, previousId: string, value: OcrReviewInput): CaptureReview {
    const { capture, reviews } = this.captureData(captureId), input = ocrReviewInput.parse(value);
    this.checkCaptureContext(capture.subjectId, input); this.checkReviewLimit();
    if (reviews.at(-1)?.id !== previousId) throw new Error('Hay una revisión más reciente. Vuelve a abrir la captura antes de editarla.');
    return this.transaction(() => {
      const review = this.insertCaptureReview(capture, previousId, input.text);
      this.insertCaptureWork(capture, review, input); return review;
    });
  }
  private checkCaptureContext(subjectId: string, input: OcrReviewInput) {
    this.requireSubject(subjectId);
    if (input.conceptId && this.requireConcept(input.conceptId).subjectId !== subjectId) throw new Error('El concepto debe pertenecer a esta asignatura.');
    if (this.hasActiveMock()) throw new Error('La captura estará disponible al terminar el simulacro.');
  }
  private checkReviewLimit() { if (this.list('capture_reviews').length >= 2000) throw new Error('Se ha alcanzado el límite de 2.000 revisiones. Elimina alguna captura antes de continuar.'); }
  private insertCaptureReview(capture: Capture, previousId: string | null, text: string): CaptureReview {
    const previous = previousId ? this.list<CaptureReview>('capture_reviews').find(row => row.id === previousId) : null;
    const createdAt = new Date(Math.max(Date.now(), Date.parse(capture.createdAt), Date.parse(previous?.createdAt ?? capture.createdAt))).toISOString();
    const review: CaptureReview = { id: randomUUID(), subjectId: capture.subjectId, captureId: capture.id, previousId, text, confirmed: true, createdAt };
    this.put('capture_reviews', review); this.event('capture.reviewed', capture.subjectId, { captureId: capture.id, reviewId: review.id, previousId }); return review;
  }
  private insertCaptureWork(capture: Capture, review: CaptureReview, input: OcrReviewInput): boolean {
    const ocrSource: CaptureSource = { captureId: capture.id, reviewId: review.id, sourceHash: capture.sourceHash, sourcePage: capture.sourcePage };
    const createdAt = new Date(Math.max(Date.now(), Date.parse(review.createdAt))).toISOString();
    if (input.destination === 'attempt') {
      if (this.list<Attempt>('attempts').some(row => row.ocrSource?.sourceHash === capture.sourceHash && row.ocrSource.sourcePage === capture.sourcePage && row.subjectId === capture.subjectId && row.answer === review.text && row.statement === input.statement.trim())) return false;
      this.insertAttempt({ subjectId: capture.subjectId, conceptId: input.conceptId, statement: input.statement.trim(), answer: review.text, expected: '', feedback: 'Texto transcrito y revisado por el alumno. Resolución pendiente de corrección.', outcome: 'ungraded', source: 'self', hints: 0, durationSeconds: 0, ocrSource }, createdAt);
    } else {
      const hash = createHash('sha256').update(review.text).digest('hex'), materials = this.list<Material>('materials').filter(row => row.subjectId === capture.subjectId && !row.lms);
      if (materials.some(row => row.hash === hash)) return false;
      const material: Material = { id: randomUUID(), subjectId: capture.subjectId, name: input.name, kind: 'ocr', text: review.text, pageCount: 1, hash, version: Math.max(0, ...materials.filter(row => row.name === input.name).map(row => row.version)) + 1, createdAt, ocrSource };
      this.put('materials', material); this.event('material.added', capture.subjectId, { materialId: material.id, hash, version: material.version });
    }
    return true;
  }
  deleteCapture(id: string) {
    const { capture } = this.captureData(id);
    this.transaction(() => {
      for (const table of ['materials', 'attempts'] as const) for (const row of this.list<Material | Attempt>(table)) if (row.ocrSource?.captureId === id) this.db.run(`UPDATE ${table} SET data = ? WHERE id = ?`, [JSON.stringify({ ...row, ocrSource: { ...row.ocrSource, removed: true } }), row.id]);
      this.db.run('DELETE FROM capture_reviews WHERE json_extract(data, \'$.captureId\') = ?', [id]);
      this.db.run('DELETE FROM captures WHERE id = ?', [id]);
      this.event('capture.deleted', capture.subjectId, { captureId: id });
    });
  }
  addMaterial(subjectId: string, name: string, kind: string, text: string, pageCount = 1): boolean {
    ({ subjectId, name, kind, text, pageCount } = materialInput.parse({ subjectId, name, kind, text, pageCount }));
    this.requireSubject(subjectId);
    if (!text.trim()) throw new Error('El documento no contiene texto seleccionable. Usa «Leer imagen o PDF escaneado» para reconocerlo y revisarlo.');
    const hash = createHash('sha256').update(text).digest('hex');
    const materials = this.list<Material>('materials').filter(m => m.subjectId === subjectId);
    if (materials.some(m => !m.lms && m.hash === hash)) return false;
    this.transaction(() => {
      const previous = materials.filter(m => !m.lms && m.name === name);
      const material: Material = { id: randomUUID(), subjectId, name, kind, text, pageCount, hash, version: Math.max(0, ...previous.map(m => m.version)) + 1, createdAt: new Date().toISOString() };
      this.put('materials', material);
      this.event('material.added', subjectId, { materialId: material.id, hash, version: material.version });
    });
    return true;
  }
  deleteMaterial(id: string) {
    this.transaction(() => this.removeMaterial(id));
  }
  private removeMaterial(id: string) {
    const material = this.list<Material>('materials').find(m => m.id === id);
    if (!material) throw new Error('No se encuentra este material.');
    {
      const affectedCards = new Set(this.list<FlashcardRevision>('card_revisions').filter(r => r.source?.materialId === id).map(r => r.cardId));
      for (const cardId of affectedCards) this.removeCard(cardId);
      for (const unit of this.list<DidacticUnit>('units')) if (unit.materialIds.includes(id)) this.replace('units', { ...unit, materialIds: unit.materialIds.filter(materialId => materialId !== id) });
      for (const row of this.list<StudySession>('study_sessions')) if (row.materials.some(ref => ref.id === id)) this.replace('study_sessions', { ...row, materials: row.materials.filter(ref => ref.id !== id) });
      for (const row of this.list<RubricSubmission>('rubric_submissions')) if (row.materials.some(ref => ref.id === id)) this.replace('rubric_submissions', { ...row, materials: row.materials.filter(ref => ref.id !== id) });
      this.db.run('DELETE FROM materials WHERE id = ?', [id]);
      if (material.lms) { const item = this.list<LmsItem>('lms_items').find(row => row.id === material.lms!.itemId); if (item) this.replace('lms_items', { ...item, local: { ...item.local, materialIds: item.local.materialIds.filter(ref => ref !== id), suppressed: item.local.suppressed || item.local.materialIds.at(-1) === id, etag: null } }); }
      // Remove stored source excerpts too, so deletion really removes the material's text.
      for (const message of this.list<Message>('messages')) {
        const citations = message.citations.filter(c => c.materialId !== id);
        if (citations.length !== message.citations.length) {
          this.db.run('UPDATE messages SET data = ? WHERE id = ?', [JSON.stringify({ ...message, citations }), message.id]);
        }
      }
      this.event('material.deleted', material.subjectId, { materialId: id });
    }
  }
  saveAttempt(input: AttemptInput): Attempt {
    this.requireSubject(input.subjectId);
    if (input.conceptId && this.requireConcept(input.conceptId).subjectId !== input.subjectId) throw new Error('El concepto pertenece a otra asignatura.');
    return this.recordAttempt({ ...input, expected: '', source: 'self' });
  }
  private recordAttempt(input: Omit<Attempt, 'id' | 'createdAt'>): Attempt {
    return this.transaction(() => {
      return this.insertAttempt(input);
    });
  }
  private insertAttempt(input: Omit<Attempt, 'id' | 'createdAt'>, createdAt = new Date().toISOString()): Attempt {
    const previous = input.conceptId ? estimate(input.conceptId, this.list<Attempt>('attempts')) : null;
    const classification = input.classification ?? (input.source === 'verified' && input.conceptId ? classifyBank(this.requireConcept(input.conceptId), input.statement, this.list<CurriculumItem>('curriculum')) : undefined);
    const attempt: Attempt = { purpose: 'practice', ...input, classification, id: randomUUID(), createdAt };
    this.put('attempts', attempt);
    this.attachSessionEvidence(attempt.subjectId, 'attemptIds', attempt.id, attempt.createdAt);
    this.event('activity.completed', attempt.subjectId, { attemptId: attempt.id, conceptId: attempt.conceptId, purpose: attempt.purpose });
    if (attempt.outcome === 'incorrect') this.event('exercise.failed', attempt.subjectId, { attemptId: attempt.id });
    if (attempt.conceptId && previous) {
      const current = estimate(attempt.conceptId, this.list<Attempt>('attempts'));
      if (previous.status !== current.status || previous.confidence !== current.confidence) this.event('learning.estimate_changed', attempt.subjectId, { attemptId: attempt.id, before: previous, after: current });
      if (previous.status !== 'consolidated' && current.status === 'consolidated') this.event('concept.mastered', attempt.subjectId, { conceptId: attempt.conceptId, evidenceIds: current.evidenceIds });
      if (previous.status === 'reinforce' && current.status !== 'reinforce' && attempt.outcome === 'correct' && attempt.hints === 0) this.event('reinforcement.completed', attempt.subjectId, { conceptId: attempt.conceptId, attemptId: attempt.id, resultingStatus: current.status });
    }
    this.saveAutomaticPortfolio(attempt);
    return attempt;
  }
  private portfolioKeys() {
    const attempts = new Map(this.list<Attempt>('attempts').map(row => [row.id, row]));
    return new Set(this.list<PortfolioEntry>('portfolio').filter(entry => entry.automatic).flatMap(entry => entry.evidenceIds.flatMap(id => {
      const original = attempts.get(id); return original ? [this.portfolioKey(original)] : [];
    })));
  }
  private portfolioKey(attempt: Attempt) { return JSON.stringify([attempt.subjectId, attempt.conceptId, attempt.statement]); }
  private saveAutomaticPortfolio(attempt: Attempt, existing = this.portfolioKeys()) {
    if (attempt.source !== 'verified' || attempt.outcome !== 'correct' || attempt.hints !== 0) return;
    const key = this.portfolioKey(attempt);
    if (existing.has(key)) return;
    const entry: PortfolioEntry = { id: randomUUID(), subjectId: attempt.subjectId, title: attempt.statement.slice(0, 120), kind: 'attempt', content: automaticPortfolioContent(attempt), reflection: '', conceptIds: attempt.conceptId ? [attempt.conceptId] : [], evidenceIds: [attempt.id], automatic: true, createdAt: attempt.createdAt };
    this.put('portfolio', entry); this.event('portfolio.saved', attempt.subjectId, { entryId: entry.id, attemptId: attempt.id, automatic: true });
    existing.add(key);
  }
  private backfillPortfolio() {
    const existing = this.portfolioKeys();
    for (const attempt of this.list<Attempt>('attempts')) this.saveAutomaticPortfolio(attempt, existing);
  }
  nextExercise(conceptId: string) {
    const concept = this.requireConcept(conceptId);
    return getExercise(concept, this.list<Attempt>('attempts').filter(a => a.conceptId === conceptId && a.source === 'verified').length);
  }
  submitExercise(input: { exerciseId: string; conceptId: string; answer: string; hints: number; durationSeconds: number }) {
    const concept = this.requireConcept(input.conceptId);
    const graded = gradeExercise(concept, input.exerciseId, input.answer);
    return this.recordAttempt({ subjectId: concept.subjectId, conceptId: concept.id, statement: graded.statement, answer: input.answer, expected: graded.answer, feedback: graded.feedback, outcome: graded.correct ? 'correct' : 'incorrect', source: 'verified', hints: input.hints, durationSeconds: input.durationSeconds });
  }
  private replace<T extends { id: string;subjectId?:string }>(table: 'subjects' | 'diagnostics' | 'tasks' | typeof EDUCATION_TABLES[number], data: T) {
    if(data.subjectId&&table!=='subjects')this.db.run(`UPDATE ${table} SET subject_id = ?, data = ? WHERE id = ?`,[data.subjectId,JSON.stringify(data),data.id]);
    else this.db.run(`UPDATE ${table} SET data = ? WHERE id = ?`, [JSON.stringify(data), data.id]);
  }
  private requireDiagnostic(id: string): Diagnostic {
    const session = this.list<Diagnostic>('diagnostics').find(d => d.id === id);
    if (!session) throw new Error('No se encuentra este diagnóstico.');
    return session;
  }
  diagnostic(id: string): DiagnosticView {
    const session = this.requireDiagnostic(id);
    if (!session.current) return { session, exercise: null };
    const concept = this.requireConcept(session.current.conceptId);
    const index = Number(session.current.exerciseId.split(':').at(-1));
    return { session, exercise: getExercise(concept, index) };
  }
  startDiagnostic(input: { subjectId: string; selfRatings: Diagnostic['selfRatings'] }): DiagnosticView {
    this.requireSubject(input.subjectId);
    const active = this.list<Diagnostic>('diagnostics').find(d => d.subjectId === input.subjectId && d.status === 'active');
    if (active) return this.diagnostic(active.id);
    const concepts = this.list<Concept>('concepts').filter(c => c.subjectId === input.subjectId && EXERCISES[c.name]).sort((a, b) => a.position - b.position);
    if (!concepts.length) throw new Error('Todavía no hay un banco de preguntas comprobadas para los conceptos de esta asignatura.');
    if (concepts.length > 12) throw new Error('El diagnóstico admite hasta 12 conceptos con preguntas comprobadas por asignatura.');
    if (input.selfRatings.length !== concepts.length || new Set(input.selfRatings.map(r => r.conceptId)).size !== concepts.length || input.selfRatings.some(r => !concepts.some(c => c.id === r.conceptId))) throw new Error('Valora una vez cada concepto incluido en el diagnóstico.');
    const session: Diagnostic = { id: randomUUID(), subjectId: input.subjectId, conceptIds: concepts.map(c => c.id), selfRatings: input.selfRatings, responses: [], current: null, status: 'active', startedAt: new Date().toISOString(), completedAt: null, reflection: '' };
    session.current = nextDiagnosticQuestion(session, concepts, []);
    this.transaction(() => { this.put('diagnostics', session); this.event('diagnostic.started', input.subjectId, { diagnosticId: session.id }); });
    return this.diagnostic(session.id);
  }
  answerDiagnostic(input: { id: string; conceptId: string; exerciseId: string; answer: string; durationSeconds: number }): DiagnosticView {
    const session = this.requireDiagnostic(input.id);
    if (session.status !== 'active' || !session.current || session.current.exerciseId !== input.exerciseId || session.current.conceptId !== input.conceptId) throw new Error('Esta pregunta ya se ha contestado o el diagnóstico ha terminado.');
    const concept = this.requireConcept(session.current.conceptId);
    const graded = gradeExercise(concept, input.exerciseId, input.answer);
    this.transaction(() => {
      const attempt = this.insertAttempt({ subjectId: session.subjectId, conceptId: concept.id, statement: graded.statement, answer: input.answer, expected: graded.answer, feedback: graded.feedback, outcome: graded.correct ? 'correct' : 'incorrect', source: 'verified', purpose: 'diagnostic', hints: 0, durationSeconds: input.durationSeconds });
      session.responses.push({ conceptId: concept.id, exerciseId: input.exerciseId, attemptId: attempt.id });
      session.current = nextDiagnosticQuestion(session, this.list<Concept>('concepts'), this.list<Attempt>('attempts'));
      if (!session.current) { session.status = 'completed'; session.completedAt = new Date().toISOString(); this.event('diagnostic.completed', session.subjectId, { diagnosticId: session.id }); }
      this.replace('diagnostics', session);
    });
    return this.diagnostic(session.id);
  }
  reflectDiagnostic(input: { id: string; reflection: string }) {
    const session = this.requireDiagnostic(input.id);
    if (session.status !== 'completed') throw new Error('Termina el diagnóstico antes de registrar tu reflexión.');
    this.transaction(() => { this.replace('diagnostics', { ...session, reflection: input.reflection }); this.event('reflection.recorded', session.subjectId, { diagnosticId: session.id }); });
  }
  cancelDiagnostic(id: string) {
    const session = this.requireDiagnostic(id);
    if (session.status !== 'active') throw new Error('Este diagnóstico ya ha terminado.');
    this.transaction(() => { this.replace('diagnostics', { ...session, status: 'cancelled', current: null, completedAt: new Date().toISOString() }); this.event('diagnostic.cancelled', session.subjectId, { diagnosticId: id }); });
  }
  private checkTask(input: TaskInput) {
    this.requireSubject(input.subjectId);
    for (const id of input.conceptIds) if (this.requireConcept(id).subjectId !== input.subjectId) throw new Error('Los conceptos de la tarea deben pertenecer a la misma asignatura.');
    if (input.unitId) this.checkReferences('units', [input.unitId], input.subjectId);
    this.checkReferences('curriculum', input.curriculumIds ?? [], input.subjectId);
  }
  createTask(input: TaskInput): StudyTask {
    this.checkTask(input);
    return this.transaction(() => {
      const task: StudyTask = { ...input, id: randomUUID(), status: 'pending', createdAt: new Date().toISOString(), completedAt: null };
      this.put('tasks', task); this.event('task.created', task.subjectId, { taskId: task.id }); return task;
    });
  }
  private requireTask(id: string): StudyTask {
    const task = this.list<StudyTask>('tasks').find(t => t.id === id);
    if (!task) throw new Error('No se encuentra esta tarea.');
    return task;
  }
  updateTask(input: TaskInput & { id: string }) {
    const task = this.requireTask(input.id);
    if (task.subjectId !== input.subjectId) throw new Error('Una tarea no puede trasladarse a otra asignatura.');
    this.checkTask(input);
    this.transaction(() => { this.replace('tasks', { ...task, ...input, ...(task.lms ? { lms: { ...task.lms, titleOverridden: task.lms.titleOverridden || input.title !== task.title, dateOverridden: task.lms.dateOverridden || input.dueDate !== task.dueDate } } : {}) }); this.event('task.updated', task.subjectId, { taskId: task.id, previousDate: task.dueDate, dueDate: input.dueDate, estimatedMinutes: input.estimatedMinutes, conceptIds: input.conceptIds }); });
  }
  completeTask(input: { id: string; completed: boolean }) {
    const task = this.requireTask(input.id);
    this.transaction(() => { this.replace('tasks', { ...task, ...(task.lms ? { lms: { ...task.lms, statusOverridden: true } } : {}), status: input.completed ? 'completed' : 'pending', completedAt: input.completed ? new Date().toISOString() : null }); this.event(input.completed ? 'task.completed' : 'task.reopened', task.subjectId, { taskId: task.id }); });
  }
  deleteTask(id: string) {
    const task = this.requireTask(id);
    this.transaction(() => {
      this.db.run('DELETE FROM tasks WHERE id = ?', [id]);
      if (task.lms) { const item = this.requireLmsItem(task.lms.itemId); this.replace('lms_items', { ...item, local: { ...item.local, taskId: null, suppressed: true } }); }
      for (const row of this.list<StudySession>('study_sessions')) if (row.taskId === id) this.replace('study_sessions', { ...row, taskId: null });
      this.event('task.deleted', task.subjectId, { taskId: id });
    });
  }
  private checkReferences(table: 'concepts' | 'materials' | 'attempts' | typeof EDUCATION_TABLES[number], ids: string[], subjectId: string) {
    if (new Set(ids).size !== ids.length) throw new Error('Hay referencias repetidas.');
    const rows = new Map(this.list<{ id: string; subjectId: string }>(table).map(row => [row.id, row]));
    if (ids.some(id => rows.get(id)?.subjectId !== subjectId)) throw new Error('Las referencias deben existir y pertenecer a la misma asignatura.');
  }
  private requireEducation<T extends { id: string; subjectId: string }>(table: typeof EDUCATION_TABLES[number], id: string): T {
    educationId.parse(id);
    const row = this.list<T>(table).find(r => r.id === id);
    if (!row) throw new Error('No se encuentra este elemento educativo.');
    return row;
  }
  saveCurriculum(value: CurriculumInput & { id?: string }): CurriculumItem {
    const input = curriculumInput.parse(value); this.requireSubject(input.subjectId);
    const previous = value.id ? this.requireEducation<CurriculumItem>('curriculum', value.id) : undefined;
    if (previous && previous.subjectId !== input.subjectId) throw new Error('No se puede trasladar un elemento a otra asignatura.');
    this.checkReferences('concepts', input.conceptIds, input.subjectId); this.checkReferences('curriculum', input.relatedIds, input.subjectId);
    if (value.id && input.relatedIds.includes(value.id)) throw new Error('Un elemento curricular no puede relacionarse consigo mismo.');
    const row: CurriculumItem = { ...input, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? new Date().toISOString() };
    this.transaction(() => { previous ? this.replace('curriculum', row) : this.put('curriculum', row); this.event('curriculum.saved', row.subjectId, { curriculumId: row.id, kind: row.kind }); });
    return row;
  }
  deleteCurriculum(id: string) {
    const item = this.requireEducation<CurriculumItem>('curriculum', id);
    this.transaction(() => {
      this.db.run('DELETE FROM curriculum WHERE id = ?', [id]);
      for (const row of this.list<CurriculumItem>('curriculum')) if (row.relatedIds.includes(id)) this.replace('curriculum', { ...row, relatedIds: row.relatedIds.filter(ref => ref !== id) });
      for (const row of this.list<DidacticUnit>('units')) if (row.curriculumIds.includes(id)) this.replace('units', { ...row, curriculumIds: row.curriculumIds.filter(ref => ref !== id) });
      for (const row of this.list<StudyTask>('tasks')) if (row.curriculumIds?.includes(id)) this.replace('tasks', { ...row, curriculumIds: row.curriculumIds.filter(ref => ref !== id) });
      for (const rubric of this.list<Rubric>('rubrics')) if (rubric.criteria.some(item => item.curriculumIds.includes(id))) this.writeRubric({ ...rubric, criteria: rubric.criteria.map(item => ({ ...item, curriculumIds: item.curriculumIds.filter(ref => ref !== id) })) });
      for(const project of this.list<InterdisciplinaryProject>('interdisciplinary_projects'))if(project.curriculumIds.includes(id)){
        const next={...project,curriculumIds:project.curriculumIds.filter(ref=>ref!==id),activities:project.activities.map(a=>({...a,curriculumIds:a.curriculumIds.filter(ref=>ref!==id)})),revision:project.revision+1,updatedAt:new Date(Math.max(Date.now(),Date.parse(project.updatedAt)+1)).toISOString()};this.replace('interdisciplinary_projects',next);this.archiveProject(next);this.event('project.updated',project.subjectId,{projectId:project.id,revision:next.revision});
      }
      this.event('curriculum.deleted', item.subjectId, { curriculumId: id });
    });
  }
  saveUnit(value: UnitInput & { id?: string }): DidacticUnit {
    const input = unitInput.parse(value); this.requireSubject(input.subjectId);
    if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) throw new Error('La fecha final debe ser posterior a la inicial.');
    const previous = value.id ? this.requireEducation<DidacticUnit>('units', value.id) : undefined;
    if (previous && previous.subjectId !== input.subjectId) throw new Error('No se puede trasladar una unidad a otra asignatura.');
    for (const [table, ids] of [['concepts', input.conceptIds], ['materials', input.materialIds], ['curriculum', input.curriculumIds], ['units', input.prerequisiteIds]] as const) this.checkReferences(table, ids, input.subjectId);
    const owned = this.list<DidacticUnit>('units').filter(u => u.subjectId === input.subjectId);
    const row: DidacticUnit = { ...input, id: previous?.id ?? randomUUID(), position: previous?.position ?? owned.length, createdAt: previous?.createdAt ?? new Date().toISOString() };
    const proposed = [...owned.filter(u => u.id !== row.id), row]; assertAcyclic(proposed);
    if (row.prerequisiteIds.some(id => proposed.find(u => u.id === id)!.position >= row.position)) throw new Error('Un prerrequisito debe aparecer antes en la secuencia.');
    this.transaction(() => { previous ? this.replace('units', row) : this.put('units', row); this.event('unit.saved', row.subjectId, { unitId: row.id, previousStatus: previous?.status ?? null, status: row.status, position: row.position }); });
    return row;
  }
  reorderUnits(input: { subjectId: string; ids: string[] }) {
    this.requireSubject(input.subjectId);
    const rows = this.list<DidacticUnit>('units').filter(u => u.subjectId === input.subjectId);
    if (new Set(input.ids).size !== rows.length || input.ids.length !== rows.length || rows.some(u => !input.ids.includes(u.id))) throw new Error('Incluye exactamente una vez cada unidad de esta asignatura.');
    const positions = new Map(input.ids.map((id, position) => [id, position]));
    if (rows.some(u => u.prerequisiteIds.some(id => positions.get(id)! >= positions.get(u.id)!))) throw new Error('El orden debe respetar los prerrequisitos.');
    this.transaction(() => { for (const row of rows) this.replace('units', { ...row, position: positions.get(row.id)! }); this.event('units.reordered', input.subjectId, { ids: input.ids }); });
  }
  deleteUnit(id: string) {
    const unit = this.requireEducation<DidacticUnit>('units', id);
    this.transaction(() => {
      this.db.run('DELETE FROM units WHERE id = ?', [id]);
      const remaining = this.list<DidacticUnit>('units').filter(u => u.subjectId === unit.subjectId).sort((a, b) => a.position - b.position);
      remaining.forEach((row, position) => this.replace('units', { ...row, position, prerequisiteIds: row.prerequisiteIds.filter(ref => ref !== id) }));
      for (const task of this.list<StudyTask>('tasks')) if (task.unitId === id) this.replace('tasks', { ...task, unitId: null });
      for (const row of this.list<StudySession>('study_sessions')) if (row.unitId === id) this.replace('study_sessions', { ...row, unitId: null });
      for (const row of this.list<MockExamRecord>('mock_exams')) if (row.unitId === id) this.replace('mock_exams', { ...row, unitId: null });
      this.event('unit.deleted', unit.subjectId, { unitId: id });
    });
  }
  private insertCard(subjectId: string, draft: CardDraft, approved: boolean): Flashcard {
    const card: Flashcard = { ...draft, id: randomUUID(), subjectId, approved, revision: 1, createdAt: new Date().toISOString() };
    this.put('flashcards', card); this.cardRevision(card); this.event('flashcard.created', subjectId, { cardId: card.id, origin: card.origin, approved }); return card;
  }
  private cardRevision(card: Flashcard) {
    const { approved: _approved, id, ...snapshot } = card;
    this.put('card_revisions', { ...snapshot, createdAt: new Date().toISOString(), id: randomUUID(), cardId: id });
  }
  createFlashcard(value: FlashcardInput): Flashcard {
    const input = cardInput.parse(value); this.requireSubject(input.subjectId);
    if (input.conceptId) this.checkReferences('concepts', [input.conceptId], input.subjectId);
    return this.transaction(() => this.insertCard(input.subjectId, { front: input.front, back: input.back, conceptId: input.conceptId, origin: 'manual', source: null, evidenceIds: [] }, true));
  }
  generateFlashcards(input: { subjectId: string; materialId?: string; fromErrors?: boolean }): number {
    this.requireSubject(input.subjectId);
    const drafts: CardDraft[] = [];
    if (input.materialId) {
      this.checkReferences('materials', [input.materialId], input.subjectId);
      drafts.push(...materialCardDrafts(this.list<Material>('materials').find(m => m.id === input.materialId)!, this.list<Concept>('concepts')));
    }
    if (input.fromErrors) drafts.push(...errorCardDrafts(input.subjectId, this.list<Attempt>('attempts')));
    if (!input.materialId && !input.fromErrors) throw new Error('Elige un material o tus errores comprobados.');
    return this.transaction(() => {
      const existing = this.list<Flashcard>('flashcards').filter(c => c.subjectId === input.subjectId);
      let count = 0;
      for (const draft of drafts) {
        if (existing.some(c => c.front === draft.front && c.back === draft.back && c.source?.materialId === draft.source?.materialId)) continue;
        existing.push(this.insertCard(input.subjectId, draft, false)); count++;
      }
      return count;
    });
  }
  approveFlashcard(input: { id: string; approved: boolean }) {
    const card = this.requireEducation<Flashcard>('flashcards', input.id);
    this.transaction(() => { this.replace('flashcards', { ...card, approved: input.approved }); this.event('flashcard.approved', card.subjectId, { cardId: card.id, approved: input.approved, revision: card.revision }); });
  }
  editFlashcard(input: { id: string; front: string; back: string; conceptId: string | null }) {
    const card = this.requireEducation<Flashcard>('flashcards', input.id);
    const parsed = cardInput.parse({ ...input, subjectId: card.subjectId });
    if (parsed.conceptId) this.checkReferences('concepts', [parsed.conceptId], card.subjectId);
    const changed = card.front !== parsed.front || card.back !== parsed.back || card.conceptId !== parsed.conceptId;
    if (!changed) return;
    const updated: Flashcard = { ...card, ...parsed, approved: false, revision: card.revision + 1, origin: card.front !== parsed.front || card.back !== parsed.back ? 'manual' : card.origin, source: card.front !== parsed.front || card.back !== parsed.back ? null : card.source };
    this.transaction(() => { this.replace('flashcards', updated); this.cardRevision(updated); this.event('flashcard.edited', card.subjectId, { cardId: card.id, revision: updated.revision }); });
  }
  private removeCard(id: string) {
    this.db.run('DELETE FROM flashcards WHERE id = ?', [id]);
    const reviews = new Set(this.list<CardReview>('card_reviews').filter(r => r.cardId === id).map(r => r.id));
    for (const row of this.list<StudySession>('study_sessions')) if (row.cardReviewIds.some(ref => reviews.has(ref))) this.replace('study_sessions', { ...row, cardReviewIds: row.cardReviewIds.filter(ref => !reviews.has(ref)) });
    for (const table of ['card_reviews', 'card_revisions'] as const) for (const row of this.list<{ id: string; cardId: string }>(table)) if (row.cardId === id) this.db.run(`DELETE FROM ${table} WHERE id = ?`, [row.id]);
  }
  deleteFlashcard(id: string) {
    const card = this.requireEducation<Flashcard>('flashcards', id);
    this.transaction(() => { this.removeCard(id); this.event('flashcard.deleted', card.subjectId, { cardId: id }); });
  }
  reviewFlashcard(input: { id: string; rating: RecallRating }): CardReview {
    const card = this.requireEducation<Flashcard>('flashcards', input.id);
    if (!card.approved) throw new Error('Revisa y aprueba la tarjeta antes de practicarla.');
    if (!['again', 'hard', 'good', 'easy'].includes(input.rating)) throw new Error('La valoración de recuerdo no es válida.');
    return this.transaction(() => {
      const review: CardReview = { id: randomUUID(), subjectId: card.subjectId, cardId: card.id, revision: card.revision, rating: input.rating, createdAt: new Date().toISOString() };
      this.put('card_reviews', review); this.attachSessionEvidence(card.subjectId, 'cardReviewIds', review.id, review.createdAt);
      this.event('flashcard.reviewed', card.subjectId, { cardId: card.id, reviewId: review.id, revision: review.revision, rating: review.rating }); return review;
    });
  }
  savePortfolio(value: PortfolioInput): PortfolioEntry {
    const input = portfolioInput.parse(value); this.requireSubject(input.subjectId);
    this.checkReferences('concepts', input.conceptIds, input.subjectId); this.checkReferences('attempts', input.evidenceIds, input.subjectId);
    return this.transaction(() => { const row: PortfolioEntry = { ...input, id: randomUUID(), automatic: false, createdAt: new Date().toISOString() }; this.put('portfolio', row); this.event('portfolio.saved', row.subjectId, { entryId: row.id, automatic: false }); return row; });
  }
  deletePortfolio(id: string) {
    const entry = this.requireEducation<PortfolioEntry>('portfolio', id);
    this.transaction(() => {
      this.detachProjectSource('portfolio',id);
      this.db.run('DELETE FROM portfolio WHERE id = ?', [id]);
      for (const row of this.list<RubricSubmission>('rubric_submissions')) if (row.source?.kind === 'portfolio' && row.source.id === id){this.detachProjectSource('submission',row.id);this.replace('rubric_submissions', { ...row, source: null });}
      this.event('portfolio.deleted', entry.subjectId, { entryId: id });
    });
  }
  private writeRubric(value: RubricInput & { id?: string }): Rubric {
    const input = rubricInput.parse(value); this.requireSubject(input.subjectId);
    const previous = value.id ? this.requireEducation<Rubric>('rubrics', value.id) : undefined;
    if (previous && previous.subjectId !== input.subjectId) throw new Error('No se puede trasladar una rúbrica a otra asignatura.');
    for (const criterion of input.criteria) { this.checkReferences('concepts', criterion.conceptIds, input.subjectId); this.checkReferences('curriculum', criterion.curriculumIds, input.subjectId); }
    const now = new Date(Math.max(Date.now(), Date.parse(previous?.updatedAt ?? '1970-01-01T00:00:00Z'))).toISOString();
    const row: Rubric = { ...input, id: previous?.id ?? randomUUID(), revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
    previous ? this.replace('rubrics', row) : this.put('rubrics', row);
    const { id: rubricId, ...fields } = row; this.put('rubric_versions', { ...fields, id: randomUUID(), rubricId });
    this.event('rubric.saved', row.subjectId, { rubricId, revision: row.revision }); return row;
  }
  saveRubric(value: RubricInput & { id?: string }): Rubric { return this.transaction(() => this.writeRubric(value)); }
  deleteRubric(id: string) {
    const rubric = this.requireEducation<Rubric>('rubrics', id);
    this.transaction(() => {
      for (const row of this.list<RubricSubmission>('rubric_submissions')) if (row.rubricId === id) this.removeRubricSubmission(row.id);
      for (const row of this.list<RubricVersion>('rubric_versions')) if (row.rubricId === id) this.db.run('DELETE FROM rubric_versions WHERE id = ?', [row.id]);
      this.db.run('DELETE FROM rubrics WHERE id = ?', [id]); this.event('rubric.deleted', rubric.subjectId, { rubricId: id });
    });
  }
  createRubricSubmission(value: RubricSubmissionInput): RubricSubmission {
    const input = submissionInput.parse(value); this.requireSubject(input.subjectId);
    const rubric = this.requireEducation<Rubric>('rubrics', input.rubricId);
    if (rubric.subjectId !== input.subjectId) throw new Error('La rúbrica debe pertenecer a esta asignatura.');
    this.checkReferences('materials', input.materialIds, input.subjectId);
    if (input.source) {
      const source = input.source.kind === 'attempt' ? this.list<Attempt>('attempts').find(a => a.id === input.source!.id) : this.list<PortfolioEntry>('portfolio').find(p => p.id === input.source!.id);
      if (!source || source.subjectId !== input.subjectId || ('answer' in source ? source.answer : source.content) !== input.text) throw new Error('El trabajo debe coincidir con la entrega de origen de esta asignatura. Si lo has cambiado, guárdalo como una entrega nueva.');
    }
    const { materialIds, ...fields } = input;
    const materials = this.list<Material>('materials');
    const row: RubricSubmission = { ...fields, id: randomUUID(), rubricRevision: rubric.revision, hash: submissionHash(input.text), materials: materialIds.map(id => { const material = materials.find(m => m.id === id)!; return { id, name: material.name, version: material.version }; }), createdAt: new Date(Math.max(Date.now(), Date.parse(rubric.updatedAt))).toISOString() };
    this.transaction(() => { this.put('rubric_submissions', row); this.event('submission.created', row.subjectId, { submissionId: row.id, rubricId: row.rubricId, rubricRevision: row.rubricRevision, materialIds }); }); return row;
  }
  rubricContext(submissionId: string) {
    const submission = this.requireEducation<RubricSubmission>('rubric_submissions', submissionId);
    const rubric = this.list<RubricVersion>('rubric_versions').find(row => row.rubricId === submission.rubricId && row.revision === submission.rubricRevision);
    if (!rubric) throw new Error('No se encuentra la versión original de esta rúbrica.');
    return { submission, rubric };
  }
  private insertRubricReview(input: RubricReviewInput, origin: RubricReview['origin'], model: RubricReview['model']): RubricReview {
    const { submission, rubric } = this.rubricContext(input.submissionId); const fields = validateReview(input, rubric, submission.text);
    const previous = input.supersedesId ? this.requireEducation<RubricReview>('rubric_reviews', input.supersedesId) : undefined;
    if (previous && (previous.submissionId !== submission.id || origin !== 'self')) throw new Error('La revisión anterior debe corresponder a esta entrega.');
    const row: RubricReview = { ...fields, id: randomUUID(), subjectId: submission.subjectId, origin, model, createdAt: new Date(Math.max(Date.now(), Date.parse(submission.createdAt), Date.parse(previous?.createdAt ?? submission.createdAt))).toISOString() };
    this.put('rubric_reviews', row); this.event('rubric.reviewed', row.subjectId, { submissionId: row.submissionId, reviewId: row.id, origin, supersedesId: row.supersedesId }); return row;
  }
  saveRubricReview(input: RubricReviewInput): RubricReview { return this.transaction(() => this.insertRubricReview(input, 'self', null)); }
  saveRubricProposal(submissionId: string, results: RubricResult[], modelName: string, workState: RubricWorkState): RubricReview {
    const { submission } = this.rubricContext(submissionId);
    if (!['attempt', 'no-attempt', 'uncertain'].includes(workState) || workState !== 'attempt' && results.some(result => result.levelId !== null || result.quotes.length)) throw new Error('Una revisión sin intento debe conservar sus niveles sin estimar.');
    return this.transaction(() => this.insertRubricReview({ submissionId, supersedesId: null, results, reflection: '', nextStep: '' }, 'local-ai', { name: modelName, promptVersion: RUBRIC_PROMPT_VERSION, workState, coverage: [{ start: 0, end: submission.text.length }] }));
  }
  private removeRubricSubmission(id: string) {
    this.detachProjectSource('submission',id);
    for (const row of this.list<LearningAnalysis>('learning_analyses')) if (row.source.kind === 'submission' && row.source.id === id) this.removeAnalysis(row.id);
    for (const row of this.list<RubricReview>('rubric_reviews')) if (row.submissionId === id) this.db.run('DELETE FROM rubric_reviews WHERE id = ?', [row.id]);
    this.db.run('DELETE FROM rubric_submissions WHERE id = ?', [id]);
  }
  deleteRubricSubmission(id: string) {
    const row = this.requireEducation<RubricSubmission>('rubric_submissions', id);
    this.transaction(() => { this.removeRubricSubmission(id); this.event('submission.deleted', row.subjectId, { submissionId: id }); });
  }
  startSession(value: SessionInput, now = new Date()): StudySession {
    const input = sessionInput.parse(value); this.requireSubject(input.subjectId); this.tickStudy(now);
    if (this.list<StudySession>('study_sessions').some(row => row.status === 'running')) throw new Error('Pausa la sesión en marcha antes de empezar otra.');
    if (this.list<StudySession>('study_sessions').some(row => row.subjectId === input.subjectId && ['paused', 'review'].includes(row.status))) throw new Error('Continúa o termina la sesión pendiente de esta asignatura.');
    this.checkReferences('concepts', input.conceptIds, input.subjectId); this.checkReferences('materials', input.materialIds, input.subjectId);
    const unit = input.unitId ? this.requireEducation<DidacticUnit>('units', input.unitId) : null;
    const task = input.taskId ? this.requireTask(input.taskId) : null;
    if (unit && unit.subjectId !== input.subjectId || task && task.subjectId !== input.subjectId) throw new Error('La unidad y la tarea deben pertenecer a la misma asignatura.');
    const { materialIds, ...fields } = input;
    const materials = this.list<Material>('materials');
    const time = now.toISOString();
    const row: StudySession = { ...fields, id: randomUUID(), unitTitle: unit?.title ?? '', taskTitle: task?.title ?? '', materials: materialIds.map(id => { const ref = materials.find(m => m.id === id)!; return { id, name: ref.name, version: ref.version }; }), status: 'running', intervals: [], runningSince: time, checkpointAt: time, attemptIds: [], cardReviewIds: [], review: null, createdAt: time, stoppedAt: null, completedAt: null };
    this.transaction(() => { this.put('study_sessions', row); this.event('study.started', row.subjectId, { sessionId: row.id, goal: row.goal, minutes: row.minutes }); }); return row;
  }
  private requireSession(id: string) { return this.requireEducation<StudySession>('study_sessions', id); }
  studySession(id: string) { return this.requireSession(id); }
  private attachSessionEvidence(subjectId: string, field: 'attemptIds' | 'cardReviewIds', id: string, createdAt: string) {
    const row = this.list<StudySession>('study_sessions').find(s => s.subjectId === subjectId && s.status === 'running');
    if (!row || !row.runningSince || createdAt < row.runningSince || sessionRemaining(row, new Date(createdAt)) <= 0) return;
    this.replace('study_sessions', { ...row, [field]: [...row[field], id], checkpointAt: createdAt });
  }
  pauseSession(id: string, now = new Date()) {
    const row = this.requireSession(id);
    if (row.status === 'paused' || row.status === 'review') return;
    if (row.status !== 'running') throw new Error('Esta sesión ya está cerrada.');
    this.transaction(() => { const paused = stopSession(row, 'pause', now); this.replace('study_sessions', paused); this.event('study.paused', row.subjectId, { sessionId: id, reason: paused.status === 'review' ? 'timeout' : 'pause', elapsedMs: sessionElapsed(paused) }); });
  }
  resumeSession(id: string, now = new Date()) {
    this.tickStudy(now); const row = this.requireSession(id);
    if (row.status === 'running') return;
    if (row.status !== 'paused' || !sessionRemaining(row)) throw new Error('Esta sesión está pendiente de revisión o ya ha terminado.');
    if (this.list<StudySession>('study_sessions').some(s => s.status === 'running')) throw new Error('Pausa primero la otra sesión en marcha.');
    const time = new Date(Math.max(now.getTime(), Date.parse(row.intervals.at(-1)?.endedAt ?? row.createdAt))).toISOString();
    this.transaction(() => { this.replace('study_sessions', { ...row, status: 'running', runningSince: time, checkpointAt: time }); this.event('study.resumed', row.subjectId, { sessionId: id }); });
  }
  finishSession(id: string, now = new Date()) {
    const row = this.requireSession(id);
    if (row.status === 'review') return;
    if (!['running', 'paused'].includes(row.status)) throw new Error('Esta sesión ya está cerrada.');
    const stopped = stopSession(row, 'finish', now);
    this.transaction(() => { this.replace('study_sessions', { ...stopped, status: 'review', stoppedAt: stopped.stoppedAt ?? new Date(Math.max(now.getTime(), Date.parse(stopped.intervals.at(-1)?.endedAt ?? row.createdAt))).toISOString() }); this.event('study.review_requested', row.subjectId, { sessionId: id, elapsedMs: sessionElapsed(stopped) }); });
  }
  completeSession(input: { id: string; review: SessionReview }, now = new Date()) {
    const review = sessionReview.parse(input.review); const row = this.requireSession(input.id);
    if (row.status !== 'review') throw new Error('Termina la sesión antes de guardar su revisión.');
    const completedAt = new Date(Math.max(now.getTime(), Date.parse(row.stoppedAt!))).toISOString();
    this.transaction(() => { this.replace('study_sessions', { ...row, status: 'completed', review, completedAt }); this.event('study.completed', row.subjectId, { sessionId: row.id, attemptIds: row.attemptIds, cardReviewIds: row.cardReviewIds, review, elapsedMs: sessionElapsed(row) }); });
  }
  cancelSession(id: string, now = new Date()) {
    const row = this.requireSession(id);
    if (row.status === 'cancelled') return;
    if (row.status === 'completed') throw new Error('Una sesión revisada conserva su histórico.');
    const stopped = stopSession(row, 'finish', now);
    const time = new Date(Math.max(now.getTime(), Date.parse(stopped.stoppedAt ?? row.createdAt), Date.parse(stopped.intervals.at(-1)?.endedAt ?? row.createdAt))).toISOString();
    this.transaction(() => { this.replace('study_sessions', { ...stopped, status: 'cancelled', stoppedAt: stopped.stoppedAt ?? time, completedAt: time }); this.event('study.cancelled', row.subjectId, { sessionId: id, attemptIds: row.attemptIds }); });
  }
  tickStudy(now = new Date()) {
    const row = this.list<StudySession>('study_sessions').find(s => s.status === 'running');
    if (!row) return;
    if (sessionRemaining(row, now) === 0) {
      this.transaction(() => { const stopped = stopSession(row, 'timeout', now); this.replace('study_sessions', stopped); this.event('study.time_completed', row.subjectId, { sessionId: row.id, elapsedMs: sessionElapsed(stopped) }); });
    } else if (now.getTime() - Date.parse(row.checkpointAt!) >= 15000) this.transaction(() => this.replace('study_sessions', { ...row, checkpointAt: now.toISOString() }));
  }
  suspendSessions(reason: Extract<StopReason, 'closed' | 'suspended'>, now = new Date()) {
    const row = this.list<StudySession>('study_sessions').find(s => s.status === 'running');
    if (!row) return;
    this.transaction(() => { const stopped = stopSession(row, reason, now); this.replace('study_sessions', stopped); this.event('study.paused', row.subjectId, { sessionId: row.id, reason, elapsedMs: sessionElapsed(stopped) }); });
  }
  private recoverSessions() {
    for (const row of this.list<StudySession>('study_sessions')) if (row.status === 'running') {
      const stopped = stopSession(row, 'recovered', new Date(Math.min(Date.now(), Date.parse(row.checkpointAt!))));
      this.replace('study_sessions', stopped); this.event('study.recovered', row.subjectId, { sessionId: row.id, elapsedMs: sessionElapsed(stopped), reason: 'Se conserva solo el tiempo confirmado antes de la interrupción.' });
    }
  }
  hasActiveMock() { return this.list<MockExamRecord>('mock_exams').some(row => row.status === 'active'); }
  activeMockId() { return this.list<MockExamRecord>('mock_exams').find(row => row.status === 'active')?.id; }
  private requireMock(id: string) { return this.requireEducation<MockExamRecord>('mock_exams', id); }
  startMockExam(value: MockExamInput, now = new Date()) {
    const input = mockInput.parse(value); this.requireSubject(input.subjectId); this.tickMock(now);
    if (this.hasActiveMock()) throw new Error('Termina o interrumpe el simulacro en marcha antes de empezar otro.');
    const pool = mockPool(input, this.list<Concept>('concepts'), this.list<DidacticUnit>('units'), this.list<CurriculumItem>('curriculum'));
    const questions = chooseMockQuestions(pool, input.questionCount);
    const { questionCount: _count, ...fields } = input; const time = now.toISOString();
    const unit = input.unitId ? this.requireEducation<DidacticUnit>('units', input.unitId) : null;
    const row: MockExamRecord = { ...fields, id: randomUUID(), unitTitle: unit?.title ?? '', bankVersion: BANK_VERSION, questions, answers: questions.map(question => ({ questionId: question.id, value: '', durationMs: 0, updatedAt: time })), attemptIds: [], currentQuestionId: questions[0].id, questionStartedAt: time, status: 'active', startedAt: time, dueAt: new Date(now.getTime() + input.minutes * 60000).toISOString(), completedAt: null, endReason: null };
    this.transaction(() => {
      const study = this.list<StudySession>('study_sessions').find(session => session.status === 'running');
      if (study) { this.replace('study_sessions', stopSession(study, 'suspended', now)); this.event('study.paused', study.subjectId, { sessionId: study.id, reason: 'mock_exam' }); }
      this.put('mock_exams', row); this.event('mock.started', row.subjectId, { examId: row.id, questions: questions.length, minutes: row.minutes, conceptIds: row.conceptIds });
    }); return publicMock(row);
  }
  mockExam(id: string) {
    this.tickMock(); const activeId = this.activeMockId();
    if (activeId && activeId !== id) throw new Error('El historial estará disponible al terminar el simulacro en marcha.');
    return publicMock(this.requireMock(id));
  }
  saveMockAnswer(input: { id: string; questionId: string; answer: string }, now = new Date()) {
    if (input.answer.length > 20000) throw new Error('La respuesta es demasiado larga.');
    const row = this.requireMock(input.id);
    if (row.status !== 'active') throw new Error('Este simulacro ya ha terminado.');
    if (now.toISOString() >= row.dueAt) { this.finishMockExam(input.id, now); throw new Error('El tiempo del simulacro ha terminado. Las respuestas anteriores se han conservado.'); }
    if (row.currentQuestionId !== input.questionId) throw new Error('Abre esta pregunta antes de guardar su respuesta.');
    const updatedAt = this.mockTime(row, now).toISOString();
    this.transaction(() => this.replace('mock_exams', { ...row, answers: row.answers.map(answer => answer.questionId === input.questionId ? { ...answer, value: input.answer, updatedAt } : answer) }));
  }
  private closeMockQuestion(row: MockExamRecord, now: Date): MockExamRecord {
    if (!row.currentQuestionId || !row.questionStartedAt) return row;
    const durationMs = Math.max(0, Math.min(now.getTime(), Date.parse(row.dueAt)) - Date.parse(row.questionStartedAt));
    return { ...row, answers: row.answers.map(answer => answer.questionId === row.currentQuestionId ? { ...answer, durationMs: answer.durationMs + durationMs } : answer), questionStartedAt: null };
  }
  private mockTime(row: MockExamRecord, now: Date) {
    return new Date(Math.min(Date.parse(row.dueAt), Math.max(now.getTime(), Date.parse(row.startedAt), Date.parse(row.questionStartedAt ?? row.startedAt), ...row.answers.map(answer => Date.parse(answer.updatedAt)))));
  }
  selectMockQuestion(input: { id: string; questionId: string }, now = new Date()) {
    let row = this.requireMock(input.id);
    if (row.status !== 'active') throw new Error('Este simulacro ya ha terminado.');
    if (now.toISOString() >= row.dueAt) return this.finishMockExam(row.id, now);
    if (!row.questions.some(question => question.id === input.questionId)) throw new Error('La pregunta no pertenece a este simulacro.');
    if (row.currentQuestionId === input.questionId) return publicMock(row);
    const time = this.mockTime(row, now);
    row = this.closeMockQuestion(row, time);
    row = { ...row, currentQuestionId: input.questionId, questionStartedAt: time.toISOString() };
    this.transaction(() => this.replace('mock_exams', row)); return publicMock(row);
  }
  finishMockExam(id: string, now = new Date()) {
    let row = this.requireMock(id); if (row.status === 'completed') return publicMock(row);
    if (row.status !== 'active') throw new Error('Este simulacro fue interrumpido.');
    const timeout = now.toISOString() >= row.dueAt;
    const time = this.mockTime(row, now).toISOString();
    row = this.closeMockQuestion(row, new Date(time));
    this.transaction(() => {
      row.attemptIds = row.questions.map(question => {
        const answer = row.answers.find(answer => answer.questionId === question.id)!;
        const answered = Boolean(answer.value.trim()); const correct = answered && matchesBankAnswer(answer.value, question.answerKey);
        return this.insertAttempt({ subjectId: row.subjectId, conceptId: question.conceptId, purpose: 'mock', source: 'verified', statement: question.statement, answer: answer.value, expected: question.answerKey, feedback: answered ? correct ? question.feedback : `La respuesta esperada es ${question.answerKey}. ${question.feedback}` : `Sin respuesta registrada. Puedes revisar ahora un ejemplo: ${question.feedback}`, outcome: answered ? correct ? 'correct' : 'incorrect' : 'ungraded', hints: 0, durationSeconds: Math.min(86400, Math.round(answer.durationMs / 1000)), classification: question.classification }, time).id;
      });
      row = { ...row, status: 'completed', currentQuestionId: null, questionStartedAt: null, completedAt: time, endReason: timeout ? 'timeout' : 'submitted' };
      this.replace('mock_exams', row); this.event('mock.completed', row.subjectId, { examId: id, attemptIds: row.attemptIds, endReason: row.endReason });
    }); return publicMock(row);
  }
  cancelMockExam(id: string, now = new Date()) {
    const current = this.requireMock(id); if (current.status === 'cancelled') return;
    if (current.status !== 'active') throw new Error('Este simulacro ya fue corregido.');
    const time = this.mockTime(current, now).toISOString();
    const row = this.closeMockQuestion(current, new Date(time));
    this.transaction(() => { this.replace('mock_exams', { ...row, status: 'cancelled', currentQuestionId: null, questionStartedAt: null, completedAt: time, endReason: 'cancelled' }); this.event('mock.cancelled', row.subjectId, { examId: id }); });
  }
  tickMock(now = new Date()) {
    const row = this.list<MockExamRecord>('mock_exams').find(exam => exam.status === 'active');
    if (row && now.toISOString() >= row.dueAt) this.finishMockExam(row.id, now);
  }
  addMessage(message: Omit<Message, 'id' | 'createdAt'>): Message {
    this.requireSubject(message.subjectId);
    return this.transaction(() => {
      const result: Message = { ...message, id: randomUUID(), createdAt: new Date().toISOString() };
      this.put('messages', result);
      return result;
    });
  }
  updateSettings(input: Partial<Snapshot['settings']>) {
    this.transaction(() => {
      const data = { ...this.snapshot().settings, ...input, id: 'profile' };
      this.db.run('UPDATE settings SET data = ? WHERE id = ?', [JSON.stringify(data), 'profile']);
    });
  }
  workContext(input: WorkInput) { return workContext(input, this.list<Attempt>('attempts'), this.list<RubricSubmission>('rubric_submissions'), this.list<PortfolioEntry>('portfolio')); }
  saveAnalysis(input: Omit<LearningAnalysis, 'id' | 'createdAt'>): LearningAnalysis {
    const work = this.workContext(input.source);
    const row = analysisRow.parse({ ...input, id: randomUUID(), createdAt: new Date(Math.max(Date.now(), Date.parse(work.createdAt))).toISOString() }); validateAnalysis(row, work);
    this.transaction(() => { this.put('learning_analyses', row); this.event('learning.work_analyzed', row.subjectId, { analysisId: row.id, engine: row.engine, source: row.source, observationCount: row.observations.length }); }); return row;
  }
  analyzeSteps(input: WorkInput) { return this.saveAnalysis(arithmeticAnalysis(this.workContext(input))); }
  recordObservation(value: unknown) {
    const input = observationInput.parse(value), work = this.workContext(input);
    const observation: LearningObservation = { id: randomUUID(), skill: input.skill, signal: input.signal, error: input.error, description: input.description, quotes: [input.quote], arithmetic: null };
    return this.saveAnalysis({ subjectId: work.subjectId, source: work.ref, engine: 'self', model: null, coverage: [{ start: 0, end: work.text.length }], observations: [observation], steps: [] });
  }
  private requireObservation(analysisId: string, observationId: string) {
    const analysis = this.requireEducation<LearningAnalysis>('learning_analyses', analysisId), observation = analysis.observations.find(o => o.id === observationId);
    if (!observation) throw new Error('No se encuentra esta observación.'); return { analysis, observation };
  }
  reviewObservation(value: unknown) {
    const input = observationReviewInput.parse(value), { analysis } = this.requireObservation(input.analysisId, input.observationId);
    const previous = this.list<ObservationReview>('observation_reviews').filter(r => r.observationId === input.observationId).at(-1);
    const followUp = input.followUpResponseId ? this.requireEducation<InterventionResponse>('intervention_responses', input.followUpResponseId) : undefined;
    if (followUp && this.requireEducation<InterventionRecord>('interventions', followUp.interventionId).observationId !== input.observationId) throw new Error('La comprobación posterior debe corresponder a esta observación.');
    const planTimes = this.list<InterventionRecord>('interventions').filter(i=>i.observationId===input.observationId).map(i=>Date.parse(i.createdAt)+1);
    const row: ObservationReview = { ...input, id: randomUUID(), subjectId: analysis.subjectId, supersedesId: previous?.id ?? null, createdAt: new Date(Math.max(Date.now(), Date.parse(previous?.createdAt ?? analysis.createdAt)+1, Date.parse(followUp?.createdAt ?? analysis.createdAt), ...planTimes)).toISOString() };
    this.transaction(() => { this.put('observation_reviews', row); this.event('learning.observation_reviewed', row.subjectId, { reviewId: row.id, observationId: row.observationId, decision: row.decision, followUpResponseId: row.followUpResponseId }); }); return row;
  }
  private removeAnalysis(id: string) {
    for (const plan of this.list<InterventionRecord>('interventions')) if (plan.analysisId === id) {
      this.removeReports(this.list<LearningReport>('learning_reports').filter(r => r.help.some(h => h.interventionId === plan.id)).map(r => r.id));
      for (const table of ['intervention_responses', 'intervention_reviews'] as const) for (const row of this.list<{ id: string; interventionId: string }>(table)) if (row.interventionId === plan.id) this.db.run(`DELETE FROM ${table} WHERE id = ?`, [row.id]);
      this.db.run('DELETE FROM interventions WHERE id = ?', [plan.id]);
    }
    for (const row of this.list<ObservationReview>('observation_reviews')) if (row.analysisId === id) this.db.run('DELETE FROM observation_reviews WHERE id = ?', [row.id]);
    this.db.run('DELETE FROM learning_analyses WHERE id = ?', [id]);
  }
  deleteAnalysis(id: string) { const row = this.requireEducation<LearningAnalysis>('learning_analyses', id); this.transaction(() => { this.removeAnalysis(id); this.event('learning.analysis_deleted', row.subjectId, { analysisId: id }); }); }
  startIntervention(value: unknown) {
    const input = interventionInput.parse(value), { analysis, observation } = this.requireObservation(input.analysisId, input.observationId);
    if (observation.signal !== 'difficulty' || this.list<ObservationReview>('observation_reviews').filter(r => r.observationId === observation.id).at(-1)?.decision !== 'accepted') throw new Error('Revisa y acepta primero la observación que quieres trabajar.');
    const work = this.workContext(analysis.source), concept = work.conceptIds[0] ? this.requireConcept(work.conceptIds[0]) : undefined;
    const plan = createIntervention(analysis, observation, work, input.minutes, concept);
    const accepted = this.list<ObservationReview>('observation_reviews').filter(r=>r.observationId===observation.id).at(-1)!;
    plan.createdAt = new Date(Math.max(Date.parse(plan.createdAt),Date.parse(accepted.createdAt)+1)).toISOString();
    plan.followUpOn = addDays(dayKey(new Date(plan.createdAt)),1);
    this.transaction(() => { this.put('interventions', plan); this.event('reinforcement.started', plan.subjectId, { interventionId: plan.id, observationId: observation.id }); }); return publicIntervention(plan);
  }
  answerIntervention(value: unknown) {
    const input = interventionAnswerInput.parse(value), plan = this.requireEducation<InterventionRecord>('interventions', input.interventionId), activity = plan.activities.find(a => a.id === input.activityId);
    if (!activity) throw new Error('La actividad no pertenece a este refuerzo.');
    const responses = this.list<InterventionResponse>('intervention_responses'); if (responses.some(r => r.activityId === activity.id)) throw new Error('Esta respuesta ya está guardada. Puedes iniciar otro refuerzo sin sobrescribirla.');
    if (activity.followUp && (dayKey() < plan.followUpOn || plan.activities.filter(a => !a.followUp).some(a => !responses.some(r => r.activityId === a.id)))) throw new Error('La comprobación posterior estará disponible después de completar la práctica y en otro día.');
    const row: InterventionResponse = { ...input, ...gradeIntervention(activity, input.answer), id: randomUUID(), subjectId: plan.subjectId, createdAt: new Date(Math.max(Date.now(), Date.parse(plan.createdAt), ...responses.filter(r => r.interventionId === plan.id).map(r => Date.parse(r.createdAt)))).toISOString() };
    this.transaction(() => { this.put('intervention_responses', row); this.event(activity.followUp ? 'reinforcement.checked' : 'reinforcement.practiced', plan.subjectId, { interventionId: plan.id, responseId: row.id, outcome: row.outcome, hints: row.hints }); }); return row;
  }
  reflectIntervention(value: unknown) {
    const input = interventionReviewInput.parse(value), plan = this.requireEducation<InterventionRecord>('interventions', input.interventionId);
    const row: InterventionReview = { ...input, id: randomUUID(), subjectId: plan.subjectId, createdAt: new Date(Math.max(Date.now(), Date.parse(plan.createdAt))).toISOString() };
    this.transaction(() => { this.put('intervention_reviews', row); this.event('reinforcement.reflected', row.subjectId, { interventionId: plan.id, reviewId: row.id }); }); return row;
  }
  private goalsData(): GoalsData {
    return { subjects: this.list('subjects'), concepts: this.list('concepts'), attempts: this.list('attempts'), events: this.list('events'), card_reviews: this.list('card_reviews'), study_sessions: this.list('study_sessions'), personal_goals: this.list('personal_goals'), goal_reviews: this.list('goal_reviews'), alert_reviews: this.list('alert_reviews') };
  }
  saveGoal(value: unknown) {
    const input = goalInput.parse(value), d = this.goalsData(); this.requireSubject(input.subjectId);
    if (input.dueOn && input.dueOn < input.startsOn || input.conceptIds.some(id => this.requireConcept(id).subjectId !== input.subjectId)) throw new Error('Comprueba las fechas y los conceptos de esta asignatura.');
    const prior = input.supersedesId ? d.personal_goals.find(g => g.id === input.supersedesId) : undefined;
    if (input.supersedesId && (!prior || prior.subjectId !== input.subjectId || d.personal_goals.some(g => g.supersedesId === prior.id))) throw new Error('Solo puedes actualizar la última versión de una meta de esta asignatura.');
    const row: PersonalGoal = { ...input, id: randomUUID(), revision: (prior?.revision ?? 0) + 1, createdAt: new Date(Math.max(Date.now(), Date.parse(prior?.createdAt ?? '2000-01-01T00:00:00Z'), ...d.goal_reviews.filter(r => r.goalId === prior?.id).map(r => Date.parse(r.createdAt)))).toISOString() };
    return this.transaction(() => { this.put('personal_goals', row); this.event('goal.created', row.subjectId, { goalId: row.id, supersedesId: row.supersedesId }); return row; });
  }
  reviewGoal(value: unknown) {
    const input = goalReviewInput.parse(value), d = this.goalsData(), goal = d.personal_goals.find(g => g.id === input.goalId);
    if (!goal || d.personal_goals.some(g => g.supersedesId === goal.id)) throw new Error('Selecciona la versión actual de esta meta.');
    validateGoalReview(goal, d.goal_reviews, input.action);
    const prior = d.goal_reviews.filter(r => r.goalId === goal.id).at(-1), time = new Date(Math.max(Date.now(), Date.parse(goal.createdAt), Date.parse(prior?.createdAt ?? goal.createdAt))).toISOString();
    if (input.evidenceIds.some(id => { const a = d.attempts.find(a => a.id === id); return !a || a.subjectId !== goal.subjectId || !a.conceptId || !goal.conceptIds.includes(a.conceptId) || a.createdAt > time; })) throw new Error('Selecciona ejercicios existentes de los conceptos de esta meta.');
    const row: GoalReview = { ...input, id: randomUUID(), subjectId: goal.subjectId, previousId: prior?.id ?? null, createdAt: time };
    return this.transaction(() => { this.put('goal_reviews', row); this.event('goal.reviewed', row.subjectId, { goalId: goal.id, reviewId: row.id, action: row.action }); return row; });
  }
  deleteGoal(id: string) {
    const selected = new Set([id]), rows = this.list<PersonalGoal>('personal_goals'); this.requireEducation<PersonalGoal>('personal_goals', id);
    let changed = true;
    while (changed) { changed = false; for (const row of rows) if (row.supersedesId && (selected.has(row.id) || selected.has(row.supersedesId))) { const size = selected.size; selected.add(row.id); selected.add(row.supersedesId); changed ||= selected.size !== size; } }
    this.transaction(() => { for (const review of this.list<GoalReview>('goal_reviews')) if (selected.has(review.goalId)) this.db.run('DELETE FROM goal_reviews WHERE id = ?', [review.id]); for (const goalId of selected) this.db.run('DELETE FROM personal_goals WHERE id = ?', [goalId]); this.event('goal.deleted', rows.find(g => g.id === id)!.subjectId, { goalId: id }); });
  }
  reviewAlert(value: unknown) {
    const input = alertReviewInput.parse(value), d = this.goalsData(), alert = learningAlerts(d).find(a => a.key === input.key);
    if (!alert || alert.reviewed) throw new Error('Este aviso ya cambió o tiene una reflexión guardada.');
    const row: AlertReview = { id: randomUUID(), subjectId: alert.subjectId, alertKey: alert.key, conceptId: alert.conceptId, kind: alert.kind, evidenceIds: alert.evidenceIds, eventIds: alert.eventIds, lastActivityAt: alert.lastActivityAt, reflection: input.reflection, createdAt: new Date().toISOString() };
    this.transaction(() => { this.put('alert_reviews', row); this.event('alert.reviewed', row.subjectId, { reviewId: row.id, alertKey: row.alertKey }); });
  }
  conceptTimeline(value: unknown) { return conceptTimeline(value, this.goalsData()); }
  private reportData(): ReportData {
    return { subjects: this.list('subjects'), concepts: this.list('concepts'), attempts: this.list('attempts'), events: this.list('events'), units: this.list('units'), curriculum: this.list('curriculum'), intervention_reviews: this.list('intervention_reviews'), learning_reports: this.list('learning_reports'), report_preferences: this.list('report_preferences') };
  }
  createLearningReport(value: ReportInput, now = new Date()) {
    const input = reportInput.parse(value), previous = input.supersedesId ? this.list<LearningReport>('learning_reports').find(r => r.id === input.supersedesId) : undefined;
    const time = new Date(Math.max(now.getTime(), Date.parse(previous?.createdAt ?? '2000-01-01T00:00:00.000Z')));
    const row = makeReport(input, this.reportData(), time);
    return this.transaction(() => { this.put('learning_reports', row); this.event('report.created', row.subjectId, { reportId: row.id, kind: row.kind, revision: row.revision, supersedesId: row.supersedesId }); return row; });
  }
  configureReports(value: unknown) {
    const input = z.object({ subjectId: z.uuid(), automaticWeekly: z.boolean() }).strict().parse(value); this.requireSubject(input.subjectId);
    const previous = this.list<ReportPreference>('report_preferences').find(p => p.subjectId === input.subjectId);
    const row: ReportPreference = { id: previous?.id ?? randomUUID(), ...input, lastWeek: previous?.lastWeek ?? null, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous?.updatedAt ?? '2000-01-01T00:00:00.000Z'))).toISOString() };
    this.transaction(() => { previous ? this.replace('report_preferences', row) : this.put('report_preferences', row); this.event('reports.configured', row.subjectId, { automaticWeekly: row.automaticWeekly }); });
  }
  maintainReports(now = new Date()) {
    if (this.hasActiveMock()) return 0;
    const d = this.reportData(), lastClosed = previousWeek(now), cutoff = new Date(`${lastClosed.endsOn}T23:59:59.999`).toISOString(); let count = 0;
    for (const subject of d.subjects) {
      const previous = d.report_preferences.find(p => p.subjectId === subject.id);
      if (previous?.automaticWeekly === false || previous?.lastWeek && previous.lastWeek >= lastClosed.startsOn || !d.concepts.some(c => c.subjectId === subject.id)) continue;
      const weeks = new Set<string>();
      for (const attempt of d.attempts) if (attempt.subjectId === subject.id && attempt.createdAt <= cutoff) {
        const date = new Date(attempt.createdAt), start = addDays(dayKey(date), -((date.getDay() + 6) % 7));
        if (!previous?.lastWeek || start > previous.lastWeek) weeks.add(start);
      }
      for (const activity of d.events) if (activity.subjectId === subject.id && reportActivity(activity) && activity.createdAt <= cutoff) {
        const date = new Date(activity.createdAt), start = addDays(dayKey(date), -((date.getDay() + 6) % 7));
        if (!previous?.lastWeek || start > previous.lastWeek) weeks.add(start);
      }
      if (!weeks.size) continue;
      const reports = [...weeks].sort().flatMap(startsOn => {
        const endsOn = addDays(startsOn, 6), existing = d.learning_reports.some(r => r.subjectId === subject.id && r.kind === 'weekly' && r.startsOn === startsOn && r.endsOn === endsOn);
        return existing ? [] : [makeReport({ subjectId: subject.id, kind: 'weekly', startsOn, endsOn }, d, now, 'automatic')];
      });
      const preference: ReportPreference = { id: previous?.id ?? randomUUID(), subjectId: subject.id, automaticWeekly: true, lastWeek: lastClosed.startsOn, updatedAt: now.toISOString() };
      this.transaction(() => {
        for (const report of reports) { this.put('learning_reports', report); this.event('report.created', subject.id, { reportId: report.id, kind: 'weekly', automatic: true }); }
        previous ? this.replace('report_preferences', preference) : this.put('report_preferences', preference);
      });
      count += reports.length;
    }
    return count;
  }
  private removeReports(ids: string[]) {
    const reports = this.list<LearningReport>('learning_reports'), selected = new Set(ids);
    // Deleting one version removes its complete series, so no dangling historical links remain.
    let changed = true;
    while (changed) { changed = false; for (const row of reports) if (selected.has(row.id) && row.supersedesId && !selected.has(row.supersedesId) || row.supersedesId && selected.has(row.supersedesId) && !selected.has(row.id)) { selected.add(row.id); if (row.supersedesId) selected.add(row.supersedesId); changed = true; } }
    for (const id of selected) this.db.run('DELETE FROM learning_reports WHERE id = ?', [id]);
  }
  deleteLearningReport(id: string) {
    const row = this.requireEducation<LearningReport>('learning_reports', id);
    this.transaction(() => { this.removeReports([id]); this.event('report.deleted', row.subjectId, { reportId: id }); });
  }
  learningReport(id: string) { return this.requireEducation<LearningReport>('learning_reports', id); }
  private connectionData():ConnectionData {
    return {subjects:this.list('subjects'),concepts:this.list('concepts'),curriculum:this.list('curriculum'),attempts:this.list('attempts'),rubric_submissions:this.list('rubric_submissions'),rubric_versions:this.list('rubric_versions'),portfolio:this.list('portfolio'),concept_relations:this.list('concept_relations'),relation_reviews:this.list('relation_reviews'),interdisciplinary_projects:this.list('interdisciplinary_projects'),project_versions:this.list('project_versions'),project_works:this.list('project_works'),project_activity_reviews:this.list('project_activity_reviews')};
  }
  createConceptRelation(value:unknown){
    const input=relationInput.parse(value),from=this.requireConcept(input.fromId);this.requireConcept(input.toId);if(input.fromId===input.toId)throw new Error('Elige dos conceptos distintos.');
    const duplicate=this.list<ConceptRelation>('concept_relations').some(r=>r.kind===input.kind&&(r.fromId===input.fromId&&r.toId===input.toId||r.kind!=='prerequisite'&&r.fromId===input.toId&&r.toId===input.fromId));if(duplicate)throw new Error('Esta conexión ya está registrada. Puedes revisar su decisión.');
    const row:ConceptRelation={...input,id:randomUUID(),subjectId:from.subjectId,createdAt:new Date().toISOString()};this.transaction(()=>{this.put('concept_relations',row);this.event('concept.relation_proposed',row.subjectId,{relationId:row.id});});return row;
  }
  reviewConceptRelation(value:unknown){
    const input=relationReviewInput.parse(value),relation=this.requireEducation<ConceptRelation>('concept_relations',input.id),d=this.connectionData(),previous=d.relation_reviews.filter(r=>r.relationId===relation.id).at(-1);
    const row:RelationReview={id:randomUUID(),subjectId:relation.subjectId,relationId:relation.id,decision:input.decision,reason:input.reason,supersedesId:previous?.id??null,createdAt:new Date(Math.max(Date.now(),Date.parse(previous?.createdAt??relation.createdAt)+1)).toISOString()};
    assertRelationGraph(d.concepts,activeRelations(d.concept_relations,[...d.relation_reviews,row]));this.transaction(()=>{this.put('relation_reviews',row);this.event('concept.relation_reviewed',row.subjectId,{relationId:relation.id,reviewId:row.id,decision:row.decision});});return row;
  }
  private removeRelation(id:string){for(const r of this.list<RelationReview>('relation_reviews'))if(r.relationId===id)this.db.run('DELETE FROM relation_reviews WHERE id = ?',[r.id]);this.db.run('DELETE FROM concept_relations WHERE id = ?',[id]);}
  deleteConceptRelation(id:string){const row=this.requireEducation<ConceptRelation>('concept_relations',id);this.transaction(()=>{this.removeRelation(id);this.event('concept.relation_deleted',row.subjectId,{relationId:id});});}
  saveInterdisciplinaryProject(value:unknown){
    const parsed=projectInput.extend({id:z.string().uuid().optional()}).parse(value),{id,...input}=parsed,d=this.connectionData();validateProject(input,d);
    const previous=id?this.requireEducation<InterdisciplinaryProject>('interdisciplinary_projects',id):undefined;const time=new Date(Math.max(Date.now(),Date.parse(previous?.updatedAt??'1970-01-01T00:00:00.000Z')+1)).toISOString();
    const row:InterdisciplinaryProject={...input,id:id??randomUUID(),subjectId:input.subjectIds[0],revision:(previous?.revision??0)+1,createdAt:previous?.createdAt??time,updatedAt:time};
    this.transaction(()=>{if(previous)this.replace('interdisciplinary_projects',row);else this.put('interdisciplinary_projects',row);this.archiveProject(row);this.event('project.updated',row.subjectId,{projectId:row.id,revision:row.revision});});return row;
  }
  private archiveProject(row:InterdisciplinaryProject){const{id:projectId,...fields}=row;this.put('project_versions',{...fields,id:randomUUID(),projectId});}
  private removeProject(id:string){for(const table of ['project_versions','project_works','project_activity_reviews'] as const)for(const row of this.list<{id:string;projectId:string}>(table))if(row.projectId===id)this.db.run(`DELETE FROM ${table} WHERE id = ?`,[row.id]);this.db.run('DELETE FROM interdisciplinary_projects WHERE id = ?',[id]);}
  deleteInterdisciplinaryProject(id:string){const row=this.requireEducation<InterdisciplinaryProject>('interdisciplinary_projects',id);this.transaction(()=>{this.removeProject(id);this.event('project.deleted',row.subjectId,{projectId:id});});}
  addProjectWork(value:unknown){
    const input=projectWorkInput.parse(value),project=this.requireEducation<InterdisciplinaryProject>('interdisciplinary_projects',input.projectId),activity=project.activities.find(a=>a.id===input.activityId);if(!activity)throw new Error('La actividad no pertenece al proyecto actual.');
    const source=projectSource(input.source,this.connectionData());if(!activity.subjectIds.includes(source.subjectId)||input.conceptIds.some(id=>!activity.conceptIds.includes(id)||this.requireConcept(id).subjectId!==source.subjectId))throw new Error('El trabajo debe pertenecer a una asignatura y contenido de la actividad.');
    if(this.list<ProjectWork>('project_works').some(w=>w.projectId===project.id&&w.projectRevision===project.revision&&w.activityId===activity.id&&(w.evidenceKey===source.evidenceKey||w.subjectId===source.subjectId&&w.statement===source.statement&&w.text===source.text)))throw new Error('Este trabajo o una copia del mismo ya está vinculado a la actividad.');
    const row=projectWorkRow.parse({...input,id:randomUUID(),subjectId:source.subjectId,projectRevision:project.revision,source:{...input.source,hash:contentHash(source.text)},evidenceKey:source.evidenceKey,statement:source.statement,text:source.text,originalCreatedAt:source.createdAt,createdAt:new Date(Math.max(Date.now(),Date.parse(project.updatedAt),Date.parse(source.createdAt))).toISOString()});
    this.transaction(()=>{this.put('project_works',row);this.event('project.work_added',row.subjectId,{projectId:project.id,workId:row.id});});return row;
  }
  reviewProjectActivity(value:unknown){
    const input=projectReviewInput.parse(value),project=this.requireEducation<InterdisciplinaryProject>('interdisciplinary_projects',input.projectId),activity=project.activities.find(a=>a.id===input.activityId);if(!activity)throw new Error('La actividad no pertenece al proyecto actual.');
    const works=input.workIds.map(id=>this.requireEducation<ProjectWork>('project_works',id));if(works.some(w=>w.projectId!==project.id||w.projectRevision!==project.revision||w.activityId!==activity.id))throw new Error('Las evidencias deben corresponder a esta versión y actividad.');if(input.completed&&activity.subjectIds.some(id=>!works.some(w=>w.subjectId===id)))throw new Error('Conserva una evidencia de cada asignatura participante antes de completar la actividad.');
    const previous=this.list<ProjectActivityReview>('project_activity_reviews').filter(r=>r.projectId===project.id&&r.projectRevision===project.revision&&r.activityId===activity.id).at(-1),row:ProjectActivityReview={...input,id:randomUUID(),subjectId:project.subjectId,projectRevision:project.revision,supersedesId:previous?.id??null,createdAt:new Date(Math.max(Date.now(),Date.parse(previous?.createdAt??project.updatedAt)+1,...works.map(w=>Date.parse(w.createdAt)))).toISOString()};
    this.transaction(()=>{this.put('project_activity_reviews',row);this.event(input.completed?'activity.completed':'project.activity_reopened',row.subjectId,{projectId:project.id,activityId:activity.id,reviewId:row.id,workIds:row.workIds});});return row;
  }
  private detachProjectSource(kind:ProjectWork['source']['kind'],id:string){for(const row of this.list<ProjectWork>('project_works'))if(row.source.kind===kind&&row.source.id===id)this.replace('project_works',{...row,source:{...row.source,id:null}});}
  requireLmsConnection(id: string): LmsConnection {
    const row = this.list<LmsConnection>('lms_connections').find(c => c.id === id);
    if (!row) throw new Error('No se encuentra esta conexión de Moodle.'); return row;
  }
  requireLmsItem(id: string): LmsItem {
    const row = this.list<LmsItem>('lms_items').find(c => c.id === id);
    if (!row) throw new Error('No se encuentra este recurso de Moodle.'); return row;
  }
  saveLmsConnection(value: LmsConnection): LmsConnection {
    const row = lmsConnectionRow.parse(value); this.requireSubject(row.subjectId);
    return this.transaction(() => { this.list<LmsConnection>('lms_connections').some(c => c.id === row.id) ? this.replace('lms_connections', row) : this.put('lms_connections', row); return row; });
  }
  recordLmsRun(value: LmsSyncRun) {
    const row = lmsRunRow.parse(value); const connection = this.requireLmsConnection(row.connectionId);
    if (row.subjectId !== connection.subjectId) throw new Error('La sincronización pertenece a otra asignatura.');
    this.transaction(() => { this.put('lms_runs', row); this.event('lms.sync_completed', row.subjectId, { runId: row.id, connectionId: row.connectionId, status: row.status, changes: row.changes.length }); }); return row;
  }
  applyMoodleBatch(connectionId: string, batch: MoodleBatch, input: { startedAt: string; trigger: LmsSyncRun['trigger'] }): LmsSyncRun {
    const connection = this.requireLmsConnection(connectionId);
    return this.transaction(() => {
      const time = new Date(Math.max(Date.now(), Date.parse(input.startedAt), ...this.list<LmsItem>('lms_items').filter(i => i.connectionId === connectionId).map(i => Date.parse(i.updatedAt)))).toISOString();
      const run: LmsSyncRun = { id: randomUUID(), subjectId: connection.subjectId, connectionId, ...input, completedAt: time, status: Object.values(batch.scopes).every(s => s === 'ok') ? 'success' : 'partial', scopes: batch.scopes, changes: [], unchanged: 0, warnings: batch.warnings, message: '' };
      const owned = this.list<LmsItem>('lms_items').filter(i => i.connectionId === connectionId); const seen = new Set<string>();
      const save = (item: LmsItem, previous?: LmsItem) => {
        const changed = !previous || item.active !== previous.active || lmsHash(item.data) !== lmsHash(previous.data);
        if (changed) {
          item.revision = (previous?.revision ?? 0) + 1; item.updatedAt = time;
          const { local: _local, id: itemId, ...fields } = item;
          this.put('lms_versions', { ...fields, id: randomUUID(), itemId });
          run.changes.push({ itemId, kind: !previous ? 'added' : !item.active ? 'withdrawn' : !previous.active ? 'restored' : 'updated', title: item.data.title, fromRevision: previous?.revision ?? null, toRevision: item.revision });
        } else run.unchanged++;
        const parsed = lmsItemRow.parse(item); previous ? this.replace('lms_items', parsed) : this.put('lms_items', parsed);
      };
      for (const row of batch.rows) {
        if (seen.has(row.remoteKey)) throw new Error('Moodle devolvió identificadores de recursos repetidos.'); seen.add(row.remoteKey);
        const previous = owned.find(i => i.remoteKey === row.remoteKey);
        const item: LmsItem = previous ? structuredClone(previous) : { id: randomUUID(), subjectId: connection.subjectId, connectionId, remoteKey: row.remoteKey, revision: 1, active: true, data: row.data, local: { taskId: null, materialIds: [], suppressed: false, resourceState: 'pending', resourceMessage: '', etag: null }, createdAt: time, updatedAt: time };
        item.data = structuredClone(row.data); item.active = true;
        if (item.data.kind === 'activity' && previous?.data.kind === 'activity') {
          if (item.data.submission === undefined && previous.data.submission !== undefined) item.data.submission = previous.data.submission;
          if (item.data.submissionFeedback === undefined && previous.data.submissionFeedback !== undefined) item.data.submissionFeedback = previous.data.submissionFeedback;
        }
        if (row.cache) item.local = { ...item.local, ...row.cache };
        if (!item.local.suppressed && item.data.kind === 'activity' && (item.data.module === 'assign' || (item.data.module === 'quiz' && item.data.dueAt))) {
          const existing = item.local.taskId ? this.list<StudyTask>('tasks').find(t => t.id === item.local.taskId) : undefined;
          const source = { connectionId, itemId: item.id, titleOverridden: false, dateOverridden: false, statusOverridden: false };
          const task: StudyTask = existing ? structuredClone(existing) : { id: randomUUID(), subjectId: item.subjectId, title: shortLmsTitle(item.data.title), notes: '', dueDate: null, conceptIds: [], curriculumIds: [], unitId: null, estimatedMinutes: 20, status: 'pending', completedAt: null, createdAt: time, lms: source };
          if (!task.lms!.titleOverridden) task.title = shortLmsTitle(item.data.title);
          if (!task.lms!.dateOverridden) task.dueDate = item.data.dueAt ? dayKey(new Date(item.data.dueAt)) : null;
          if (!task.lms!.statusOverridden && item.data.submission !== undefined) {
            const submitted = item.data.submission?.status === 'submitted'; task.status = submitted ? 'completed' : 'pending'; task.completedAt = submitted ? (task.completedAt ?? item.data.submission?.updatedAt ?? time) : null;
          }
          item.local.taskId = task.id; existing ? this.replace('tasks', task) : this.put('tasks', task);
        }
        if (!item.local.suppressed && row.material && item.data.kind === 'resource') {
          const textHash = createHash('sha256').update(row.material.text).digest('hex'); const old = previous?.data.kind === 'resource' ? previous.data.contentHash : null;
          const latest = this.list<Material>('materials').find(m => m.id === item.local.materialIds.at(-1));
          if (!latest || latest.hash !== textHash || old !== item.data.contentHash) {
            const material: Material = { ...row.material, name: shortLmsTitle(row.material.name), hash: textHash, id: randomUUID(), subjectId: item.subjectId, createdAt: time, version: Math.max(0, ...this.list<Material>('materials').filter(m => m.lms?.itemId === item.id).map(m => m.version)) + 1, lms: { connectionId, itemId: item.id } };
            this.put('materials', material); item.local.materialIds.push(material.id);
            this.event('material.added', item.subjectId, { materialId: material.id, hash: material.hash, version: material.version, lmsItemId: item.id });
          }
        }
        save(item, previous);
      }
      for (const previous of owned.filter(i => i.active && !seen.has(i.remoteKey))) {
        const scope = previous.data.kind === 'activity' ? 'activities' : previous.data.kind === 'grade' ? 'grades' : 'resources';
        if (batch.scopes[scope] === 'ok') save({ ...previous, active: false }, previous);
      }
      run.message = `${run.changes.filter(c => c.kind === 'added').length} añadidos · ${run.changes.filter(c => c.kind === 'updated').length} actualizados · ${run.changes.filter(c => c.kind === 'withdrawn').length} retirados.`;
      this.put('lms_runs', lmsRunRow.parse(run)); this.replace('lms_connections', { ...connection, lastSyncAt: time });
      this.event('lms.sync_completed', connection.subjectId, { runId: run.id, connectionId, status: run.status, changes: run.changes.length }); return run;
    });
  }
  clearLmsData(connectionId: string) {
    const connection = this.requireLmsConnection(connectionId);
    this.transaction(() => {
      for (const material of this.list<Material>('materials').filter(m => m.lms?.connectionId === connectionId)) this.removeMaterial(material.id);
      const tasks = new Set(this.list<StudyTask>('tasks').filter(t => t.lms?.connectionId === connectionId).map(t => t.id));
      for (const row of this.list<StudySession>('study_sessions')) if (row.taskId && tasks.has(row.taskId)) this.replace('study_sessions', { ...row, taskId: null });
      for (const id of tasks) this.db.run('DELETE FROM tasks WHERE id = ?', [id]);
      for (const table of ['lms_connections', 'lms_items', 'lms_versions', 'lms_runs'] as const) for (const row of this.list<{ id: string; connectionId?: string }>(table)) if (row.connectionId === connectionId || row.id === connectionId) this.db.run(`DELETE FROM ${table} WHERE id = ?`, [row.id]);
      this.event('lms.cache_deleted', connection.subjectId, { connectionId });
    });
  }
  exportData(): string {
    return JSON.stringify({ format: 'tutor-local', version: 12, exportedAt: new Date().toISOString(), tables: Object.fromEntries(TABLES.map(table => [table, this.list(table)])) }, null, 2);
  }
  importData(data: string) {
    const originalVersion = JSON.parse(data).version;
    const parsed = JSON.parse(validateBackup(data));
    if (parsed.format !== 'tutor-local' || parsed.version !== 12 || !parsed.tables) throw new Error('Esta copia no tiene un formato compatible.');
    // Strict validation happens before IPC reaches this method. Rebuild atomically rather than merge IDs.
    return this.transaction(() => {
      this.db.run('DELETE FROM subjects; DELETE FROM events; DELETE FROM settings;');
      for (const table of TABLES) {
        if (!Array.isArray(parsed.tables[table])) throw new Error('La copia está incompleta.');
        for (const row of parsed.tables[table]) this.put(table, row);
      }
      if (!this.list('settings').length) this.put('settings', { ...DEFAULT_SETTINGS, id: 'profile' });
      if (originalVersion < 3) this.backfillPortfolio();
      this.recoverSessions();
    });
  }
  erase() {
    this.transaction(() => {
      this.db.run('DELETE FROM subjects; DELETE FROM events; DELETE FROM settings;');
      this.put('settings', { ...DEFAULT_SETTINGS, id: 'profile' });
    });
  }
  createDemo(): Subject {
    const existing = this.list<Subject>('subjects').find(s => s.isDemo);
    if (existing) return existing;
    const subject = this.createSubject({ name: 'Redes locales', level: 'FP · Grado medio', teacher: '', goals: 'Comprender el sistema binario y calcular subredes IPv4 paso a paso.', color: 'sage' }, true);
    const powers = this.createConcept({ subjectId: subject.id, name: 'Potencias de 2', description: 'Relacionar las potencias de dos con el número de combinaciones posibles.', prerequisiteIds: [] });
    const binary = this.createConcept({ subjectId: subject.id, name: 'Sistema binario', description: 'Interpretar y convertir números binarios y decimales.', prerequisiteIds: [powers.id] });
    this.createConcept({ subjectId: subject.id, name: 'Subnetting', description: 'Calcular bloques de direcciones y hosts utilizables en subredes IPv4.', prerequisiteIds: [powers.id, binary.id] });
    this.addMaterial(subject.id, 'Guía de ejemplo · De los bits a las subredes', 'note', 'POTENCIAS DE 2\nUna potencia de 2 representa multiplicar varios factores iguales a 2. Las primeras son 2⁰ = 1, 2¹ = 2, 2² = 4, 2³ = 8, 2⁴ = 16, 2⁵ = 32, 2⁶ = 64, 2⁷ = 128 y 2⁸ = 256. Con n bits hay 2 elevado a n combinaciones.\n\nSISTEMA BINARIO\nEl sistema binario utiliza los dígitos 0 y 1. De derecha a izquierda, las posiciones tienen los valores 1, 2, 4, 8, 16, 32, 64 y 128. Para convertir 1010 a decimal, sumamos 8 y 2: el resultado es 10.\n\nSUBNETTING IPv4\nUna dirección IPv4 tiene 32 bits. El prefijo /n indica cuántos bits identifican la red. Los restantes identifican direcciones dentro del bloque. Una red /26 deja 6 bits, por lo que tiene 2⁶ = 64 direcciones totales. En una subred convencional se reservan la primera dirección para la red y la última para broadcast: quedan 62 hosts utilizables. Esta regla no se aplica de la misma manera a /31 y /32.\nPara dividir una /24 en cuatro subredes iguales hacen falta dos bits adicionales, porque 2² = 4. El nuevo prefijo será /26.');
    return subject;
  }
  close() { this.suspendSessions('closed'); this.db.close(); }
}
