import type { EducationAPI, EducationSnapshot } from './education.js';
import type { StudyAPI, StudySnapshot } from './study.js';
import type { AssessmentAPI, AssessmentSnapshot, ExerciseClassification } from './assessment.js';
import type { RubricAPI, RubricSnapshot } from './rubrics.js';
import type { LmsAPI, LmsSnapshot, LmsSource, LmsTaskSource } from './lms.js';
import type { PedagogyAPI, PedagogySnapshot } from './pedagogy.js';
import type {ConnectionAPI,ConnectionSnapshot} from './connections.js';
import type { ReportAPI, ReportSnapshot } from './reports.js';
import type { GoalsAPI, GoalsSnapshot } from './goals.js';
import type { OcrAPI, OcrSnapshot, CaptureSource } from './ocr.js';
import type { SemanticAPI } from './semantic.js';
export type Mastery = 'consolidated' | 'progress' | 'reinforce' | 'unseen';
export type Confidence = 'low' | 'medium' | 'high';
export type ChatMode = 'socratic' | 'explain' | 'practice';

export interface Subject {
  id: string; name: string; course: string; level: string; teacher: string; goals: string;
  color: string; createdAt: string; isDemo: boolean;
}
export interface Concept {
  id: string; subjectId: string; name: string; description: string;
  position: number; prerequisiteIds: string[];
}
export interface Material {
  id: string; subjectId: string; name: string; kind: string; text: string;
  pageCount: number; createdAt: string; hash: string; version: number;
  lms?: LmsSource; retrievalAvailable?: boolean;
  ocrSource?: CaptureSource;
}
export interface Attempt {
  id: string; subjectId: string; conceptId: string | null;
  statement: string; answer: string; expected: string; feedback: string;
  outcome: 'correct' | 'incorrect' | 'partial' | 'ungraded';
  source: 'verified' | 'self'; hints: number; durationSeconds: number;
  purpose?: 'practice' | 'diagnostic' | 'mock';
  classification?: ExerciseClassification;
  ocrSource?: CaptureSource;
  createdAt: string;
}
export interface Estimate {
  conceptId: string; status: Mastery; confidence: Confidence;
  reason: string; evidenceIds: string[];
}
export interface Citation { materialId: string; name: string; page: number; text: string; }
export interface Message {
  id: string; subjectId: string; role: 'user' | 'assistant';
  text: string; mode: ChatMode; citations: Citation[]; createdAt: string;
  retrieval?: 'hybrid' | 'textual'; evidenceIds?: string[];
}
export interface ModelStatus {
  state: 'missing' | 'downloading' | 'ready' | 'running' | 'error';
  progress: number; downloadedBytes: number; totalBytes: number;
  message: string; modelName: string; ramGB: number;
}
export type SelfRating = 'unsure' | 'learning' | 'confident';
export interface Diagnostic {
  id: string; subjectId: string; conceptIds: string[];
  selfRatings: { conceptId: string; rating: SelfRating }[];
  responses: { conceptId: string; exerciseId: string; attemptId: string }[];
  current: { conceptId: string; exerciseId: string } | null;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: string; completedAt: string | null; reflection: string;
}
export interface DiagnosticView { session: Diagnostic; exercise: Exercise | null; }
export interface StudyTask {
  id: string; subjectId: string; title: string; notes: string; dueDate: string | null;
  conceptIds: string[]; estimatedMinutes: number;
  status: 'pending' | 'completed'; createdAt: string; completedAt: string | null;
  unitId?: string | null; curriculumIds?: string[];
  lms?: LmsTaskSource;
}
export type TaskInput = Pick<StudyTask, 'subjectId' | 'title' | 'notes' | 'dueDate' | 'conceptIds' | 'estimatedMinutes' | 'unitId' | 'curriculumIds'>;
export interface Review {
  conceptId: string; nextDate: string; intervalDays: number;
  reason: string; evidenceIds: string[];
}
export interface PlanItem {
  id: string; subjectId: string; kind: 'task' | 'practice' | 'diagnostic' | 'session'|'project';
  targetId: string; title: string; minutes: number; reason: string; evidenceIds: string[];
}
export interface DailyPlan { subjectId: string; date: string; budgetMinutes: number; items: PlanItem[]; }
export interface Snapshot extends EducationSnapshot, StudySnapshot, AssessmentSnapshot, RubricSnapshot, LmsSnapshot, PedagogySnapshot,ConnectionSnapshot, ReportSnapshot, GoalsSnapshot, OcrSnapshot {
  subjects: Subject[]; concepts: Concept[]; materials: Material[];
  attempts: Attempt[]; estimates: Estimate[]; messages: Message[];
  diagnostics: Diagnostic[]; tasks: StudyTask[]; reviews: Review[]; plans: DailyPlan[];
  practiceConceptIds: string[];
  exerciseConceptNames: string[];
  settings: { name: string; dailyMinutes: number; largeText: boolean; highContrast: boolean };
  storagePath: string; model: ModelStatus;
}
export interface SubjectInput { name: string; course?: string; level: string; teacher: string; goals: string; color: string; }
export interface ConceptInput { subjectId: string; name: string; description: string; prerequisiteIds: string[]; }
export interface AttemptInput {
  subjectId: string; conceptId: string | null; statement: string; answer: string;
  feedback: string; outcome: Attempt['outcome']; hints: number; durationSeconds: number;
}
export interface Exercise {
  id: string; conceptId: string; statement: string; hint: string;
}
export interface ImportReport { imported: number; duplicates: number; errors: string[]; cancelled?: boolean; }
export interface ImportProgress { subjectId: string; current: number; total: number; name: string; }
export interface TutorAPI extends EducationAPI, StudyAPI, AssessmentAPI, RubricAPI, LmsAPI, PedagogyAPI,ConnectionAPI, ReportAPI, GoalsAPI, OcrAPI, SemanticAPI {
  snapshot(): Promise<Snapshot>;
  createSubject(input: SubjectInput): Promise<Subject>;
  updateSubject(input: SubjectInput & { id: string }): Promise<Subject>;
  createDemo(): Promise<Subject>;
  deleteSubject(id: string): Promise<void>;
  createConcept(input: ConceptInput): Promise<void>;
  importMaterials(subjectId: string): Promise<ImportReport>;
  materialImportProgress(subjectId: string): Promise<ImportProgress | null>;
  cancelMaterialImport(subjectId: string): Promise<void>;
  addNote(input: { subjectId: string; name: string; text: string }): Promise<void>;
  deleteMaterial(id: string): Promise<void>;
  saveAttempt(input: AttemptInput): Promise<Attempt>;
  nextExercise(conceptId: string): Promise<Exercise | null>;
  submitExercise(input: { exerciseId: string; conceptId: string; answer: string; hints: number; durationSeconds: number }): Promise<Attempt>;
  startDiagnostic(input: { subjectId: string; selfRatings: Diagnostic['selfRatings'] }): Promise<DiagnosticView>;
  diagnostic(id: string): Promise<DiagnosticView>;
  answerDiagnostic(input: { id: string; conceptId: string; exerciseId: string; answer: string; durationSeconds: number }): Promise<DiagnosticView>;
  reflectDiagnostic(input: { id: string; reflection: string }): Promise<void>;
  cancelDiagnostic(id: string): Promise<void>;
  createTask(input: TaskInput): Promise<StudyTask>;
  updateTask(input: TaskInput & { id: string }): Promise<void>;
  completeTask(input: { id: string; completed: boolean }): Promise<void>;
  deleteTask(id: string): Promise<void>;
  chat(input: { subjectId: string; text: string; mode: ChatMode }): Promise<Message>;
  cancelChat(): Promise<void>;
  downloadModel(): Promise<void>;
  cancelDownload(): Promise<void>;
  modelStatus(): Promise<ModelStatus>;
  updateSettings(input: Partial<Snapshot['settings']>): Promise<void>;
  exportData(input: { format: 'encrypted' | 'json'; password?: string }): Promise<boolean>;
  importData(input: { password?: string }): Promise<boolean>;
  eraseData(): Promise<void>;
}
