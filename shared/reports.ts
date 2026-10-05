import type { Estimate } from './types.js';

export type ReportKind = 'weekly' | 'unit' | 'transition';
export interface ReportInput {
  subjectId: string;
  kind: ReportKind;
  startsOn: string;
  endsOn: string;
  unitId?: string | null;
  targetCourse?: string;
  conceptIds?: string[];
  helpIds?: string[];
  reflection?: string;
  supersedesId?: string | null;
}
export interface ReportConcept {
  conceptId: string;
  name: string;
  before: Estimate;
  after: Estimate;
  change: 'first-evidence' | 'improved' | 'regressed' | 'stable' | 'check-again';
  recommendation: { action: 'practice' | 'review' | 'check'; reason: string; evidenceIds: string[] };
  prerequisites: { id: string; name: string }[];
}
export interface LearningReport {
  id: string;
  subjectId: string;
  kind: ReportKind;
  title: string;
  subject: { name: string; course: string; level: string };
  unit: { id: string; title: string; curriculum: { id: string; code: string; title: string; kind: string }[] } | null;
  targetCourse: string;
  startsOn: string;
  endsOn: string;
  periodStartAt: string;
  asOf: string;
  timezone: string;
  concepts: ReportConcept[];
  attemptIds: string[];
  activityEventIds: string[];
  stats: { verified: number; personal: number; correctWithoutHints: number; activeDays: number; exerciseSeconds: number; otherActivities: number };
  help: { reviewId: string; interventionId: string; whatHelped: string; nextStep: string }[];
  reflection: string;
  origin: 'automatic' | 'manual';
  supersedesId: string | null;
  revision: number;
  engineVersion: 'reports-1';
  createdAt: string;
}
export interface ReportPreference {
  id: string;
  subjectId: string;
  automaticWeekly: boolean;
  lastWeek: string | null;
  updatedAt: string;
}
export interface ReportSnapshot {
  learningReports: LearningReport[];
  reportPreferences: ReportPreference[];
}
export interface ReportAPI {
  createLearningReport(input: ReportInput): Promise<LearningReport>;
  deleteLearningReport(id: string): Promise<void>;
  configureReports(input: { subjectId: string; automaticWeekly: boolean }): Promise<void>;
  exportLearningReport(input: { id: string; format: 'json' | 'csv' | 'pdf' }): Promise<boolean>;
}
