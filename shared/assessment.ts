export type Difficulty = 1 | 2 | 3;
export type Reasoning = 'calculation' | 'procedure' | 'interpretation' | 'logic';
export interface ExerciseClassification {
  conceptIds: string[]; prerequisiteIds: string[]; difficulty: Difficulty; reasoning: Reasoning;
  curriculum: { id: string; kind: 'competency' | 'criterion' | 'content' | 'outcome'; code: string; title: string }[];
  source: 'curated-bank'; bankVersion: string;
}
export interface MockQuestion {
  id: string; conceptId: string; conceptName: string; exerciseId: string; statement: string;
  classification: ExerciseClassification;
}
export interface MockAnswer { questionId: string; value: string; durationMs: number; updatedAt: string; }
export interface MockExam {
  id: string; subjectId: string; title: string; unitId: string | null; unitTitle: string;
  conceptIds: string[]; maxDifficulty: Difficulty; minutes: number; bankVersion: string;
  questions: MockQuestion[]; answers: MockAnswer[]; attemptIds: string[];
  currentQuestionId: string | null; questionStartedAt: string | null;
  status: 'active' | 'completed' | 'cancelled'; startedAt: string; dueAt: string; completedAt: string | null;
  endReason: 'submitted' | 'timeout' | 'cancelled' | null;
}
export interface MockExamInput { subjectId: string; title: string; unitId: string | null; conceptIds: string[]; maxDifficulty: Difficulty; minutes: number; questionCount: number; }
export interface AssessmentSnapshot { mockExams: MockExam[]; exerciseCatalog: { conceptId: string; exerciseId: string; difficulty: Difficulty; reasoning: Reasoning }[]; }
export interface AssessmentAPI {
  startMockExam(input: MockExamInput): Promise<MockExam>;
  mockExam(id: string): Promise<MockExam>;
  saveMockAnswer(input: { id: string; questionId: string; answer: string }): Promise<void>;
  selectMockQuestion(input: { id: string; questionId: string }): Promise<MockExam>;
  finishMockExam(id: string): Promise<MockExam>;
  cancelMockExam(id: string): Promise<void>;
}
