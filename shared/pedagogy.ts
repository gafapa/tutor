export const SKILLS = ['reading', 'graphs', 'problem-solving', 'writing', 'calculation', 'logic'] as const;
export type LearningSkill = typeof SKILLS[number];
export type ErrorKind = 'conceptual' | 'procedure' | 'calculation' | 'reading' | 'writing';
export interface WorkRef { kind: 'attempt' | 'submission' | 'portfolio'; id: string; hash: string; }
export interface WorkInput { kind: WorkRef['kind']; id: string; }
export interface WorkContext { ref: WorkRef; subjectId: string; question: string; text: string; conceptIds: string[]; evidenceKey: string; createdAt: string; evidenceDay?: string | null; }
export interface WorkQuote { start: number; end: number; text: string; }
export interface ArithmeticStep extends WorkQuote { expression: string; value: string; claimed: string; correct: boolean; line: number; }
export interface LearningObservation {
  id: string; signal: 'difficulty' | 'strength'; skill: LearningSkill; error: ErrorKind | null;
  quotes: WorkQuote[]; description: string; arithmetic: ArithmeticStep | null;
}
export interface LearningAnalysis {
  id: string; subjectId: string; source: WorkRef; engine: 'arithmetic' | 'local-ai' | 'self';
  model: { name: string; promptVersion: string } | null;
  coverage: { start: number; end: number }[]; observations: LearningObservation[];
  steps: ArithmeticStep[]; createdAt: string;
}
export interface ObservationReview {
  id: string; subjectId: string; analysisId: string; observationId: string;
  decision: 'accepted' | 'rejected' | 'forgotten'; reason: string;
  supersedesId: string | null; followUpResponseId: string | null; createdAt: string;
}
export interface SkillProfile {
  skill: LearningSkill; state: 'unseen' | 'to-check' | 'supported-hypothesis' | 'mixed' | 'positive';
  confidence: 'low' | 'medium'; analysisIds: string[]; observationIds: string[];
  subjectIds: string[]; workCount: number; dayCount: number; reason: string;
}
export interface PracticeActivity {
  id: string; kind: 'arithmetic' | 'bank' | 'open'; statement: string;
  hint: string; expression: string | null; conceptId: string | null;
  followUp: boolean;
}
export interface Intervention {
  id: string; subjectId: string; analysisId: string; observationId: string;
  skill: LearningSkill; help: string; explanation: string; minutes: 10 | 20 | 30;
  activities: PracticeActivity[]; followUpOn: string; createdAt: string;
  guided?: boolean;
  independent?: true;
}
export interface GuidedPracticeView {
  stepIndex: number; totalSteps: number; prompt: string; hints: string[]; canHint: boolean;
  attempts: { answer: string; correct: boolean; stepIndex: number; hints: number }[];
  completed: boolean;
}
export interface InterventionResponse {
  id: string; subjectId: string; interventionId: string; activityId: string;
  answer: string; expected: string; feedback: string;
  outcome: 'correct' | 'incorrect' | 'ungraded'; hints: number;
  durationSeconds: number; createdAt: string;
}
export interface InterventionReview {
  id: string; subjectId: string; interventionId: string; whatHelped: string;
  reflection: string; nextStep: string; createdAt: string;
}
export interface PedagogySnapshot {
  learningAnalyses: LearningAnalysis[]; observationReviews: ObservationReview[];
  skillProfiles: SkillProfile[]; interventions: Intervention[];
  interventionResponses: InterventionResponse[]; interventionReviews: InterventionReview[];
}
export interface PedagogyAPI {
  prepareMoodlePractice(input: { itemId: string; revision: number }): Promise<{ portfolioId: string; analysisId: string }>;
  guidedPractice(input: { interventionId: string; activityId: string }): Promise<GuidedPracticeView>;
  submitGuidedStep(input: { interventionId: string; activityId: string; answer: string }): Promise<GuidedPracticeView>;
  requestGuidedHint(input: { interventionId: string; activityId: string }): Promise<GuidedPracticeView>;
  analyzeSteps(input: WorkInput): Promise<LearningAnalysis>;
  analyzeWorkLocally(input: WorkInput): Promise<LearningAnalysis>;
  recordObservation(input: WorkInput & { skill: LearningSkill; signal: LearningObservation['signal']; error: ErrorKind | null; quote: WorkQuote; description: string }): Promise<LearningAnalysis>;
  reviewObservation(input: { analysisId: string; observationId: string; decision: ObservationReview['decision']; reason: string; followUpResponseId?: string | null }): Promise<ObservationReview>;
  deleteAnalysis(id: string): Promise<void>;
  startIntervention(input: { analysisId: string; observationId: string; minutes: Intervention['minutes']; guided?: boolean }): Promise<Intervention>;
  answerIntervention(input: { interventionId: string; activityId: string; answer: string; hints: number; durationSeconds: number }): Promise<InterventionResponse>;
  reflectIntervention(input: { interventionId: string; whatHelped: string; reflection: string; nextStep: string }): Promise<InterventionReview>;
}
