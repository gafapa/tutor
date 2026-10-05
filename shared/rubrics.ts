export interface RubricLevel { id: string; title: string; }
export interface RubricCriterion {
  id: string; title: string; description: string; conceptIds: string[]; curriculumIds: string[];
  descriptors: { levelId: string; description: string }[];
}
export interface Rubric {
  id: string; subjectId: string; title: string; description: string;
  levels: RubricLevel[]; criteria: RubricCriterion[]; revision: number; createdAt: string; updatedAt: string;
}
export interface RubricVersion extends Omit<Rubric, 'id'> { id: string; rubricId: string; }
export type RubricInput = Omit<Rubric, 'id' | 'revision' | 'createdAt' | 'updatedAt'>;
export type SubmissionSource = { kind: 'attempt' | 'portfolio'; id: string };
export interface RubricSubmission {
  id: string; subjectId: string; rubricId: string; rubricRevision: number; title: string;
  kind: 'text' | 'project' | 'practice'; instructions: string; text: string; hash: string; source: SubmissionSource | null;
  materials: { id: string; name: string; version: number }[]; createdAt: string;
}
export interface RubricSubmissionInput {
  subjectId: string; rubricId: string; title: string; kind: RubricSubmission['kind']; instructions: string; text: string;
  source: SubmissionSource | null; materialIds: string[];
}
export interface RubricQuote { start: number; end: number; text: string; }
export type RubricWorkState = 'attempt' | 'no-attempt' | 'uncertain';
export interface RubricResult {
  criterionId: string; levelId: string | null; feedback: string; nextStep: string; quotes: RubricQuote[];
}
export interface RubricReview {
  id: string; subjectId: string; submissionId: string; origin: 'self' | 'local-ai';
  supersedesId: string | null; results: RubricResult[]; reflection: string; nextStep: string;
  model: { name: string; promptVersion: string; workState?: RubricWorkState; coverage: { start: number; end: number }[] } | null;
  createdAt: string;
}
export interface RubricReviewInput {
  submissionId: string; supersedesId: string | null; results: RubricResult[]; reflection: string; nextStep: string;
}
export interface RubricSnapshot {
  rubrics: Rubric[]; rubricVersions: RubricVersion[]; rubricSubmissions: RubricSubmission[]; rubricReviews: RubricReview[];
}
export interface RubricAPI {
  saveRubric(input: RubricInput & { id?: string }): Promise<Rubric>;
  deleteRubric(id: string): Promise<void>;
  createRubricSubmission(input: RubricSubmissionInput): Promise<RubricSubmission>;
  deleteRubricSubmission(id: string): Promise<void>;
  saveRubricReview(input: RubricReviewInput): Promise<RubricReview>;
  proposeRubricReview(submissionId: string): Promise<RubricReview>;
}
