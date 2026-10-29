import type { PortfolioEntry } from './education.js';
export type LmsProvider = 'moodle';
export type LmsScope = 'activities' | 'resources' | 'submissions' | 'grades';
export type LmsScopeState = 'ok' | 'partial' | 'unavailable';
export type LmsScopes = Record<LmsScope, LmsScopeState>;
export interface LmsConnection {
  id: string; subjectId: string; provider: LmsProvider; siteUrl: string; siteName: string;
  courseId: number; courseName: string; accountSalt: string; accountFingerprint: string;
  enabled: boolean; autoMinutes: 0 | 15 | 30 | 60; createdAt: string;
  lastSyncAt: string | null; hasCredentials?: boolean; syncing?: boolean;
}
export interface LmsSubmission {
  status: string; text: string; group: boolean;
  attempt: number; createdAt: string | null; updatedAt: string | null;
  files?: LmsSubmissionFile[];
}
export interface LmsSubmissionFile {
  filename: string; filepath: string; size: number; url: string; modifiedAt: string | null;
  remoteKey?: string;
}
export interface LmsOriginalFile { hash: string; filename: string; size: number; base64?: string; }
export interface LmsQuizAttempt {
  id: number; number: number; state: 'inprogress' | 'overdue' | 'finished' | 'abandoned';
  startedAt: string | null; finishedAt: string | null;
  reviewState: 'available' | 'cached' | 'restricted' | 'unavailable' | 'not-finished';
  reviewText: string; points: number | null;
}
export interface MoodleComparisonCopyInput {
  itemId: string; revision: number; firstAttemptId: string; secondAttemptId: string;
  whatChanged: string; whatChecked: string; nextStep: string;
}
export interface LmsActivityData {
  kind: 'activity'; moduleId: number; assignmentId: number | null; module: string;
  title: string; url: string; instructions: string; dueAt: string | null;
  submission?: LmsSubmission | null; submissionFeedback?: string;
  quizId?: number; quizAttempts?: LmsQuizAttempt[];
  previousSubmissions?: { submission: LmsSubmission; feedback: string }[];
}
export interface LmsResourceData {
  kind: 'resource'; moduleId: number | null; title: string; filename: string; url: string;
  source: 'file' | 'page' | 'link' | 'section' | 'submission'; format: string; size: number;
  modifiedAt: string | null; contentHash: string | null;
}
export interface LmsGradeData {
  kind: 'grade'; gradeItemId: number; moduleId: number | null; title: string;
  module: string; raw: number | null; min: number | null; max: number | null;
  formatted: string; feedback: string; gradedAt: string | null; hidden: boolean;
}
export type LmsItemData = LmsActivityData | LmsResourceData | LmsGradeData;
export interface LmsLocalLinks {
  taskId: string | null; materialIds: string[]; suppressed: boolean;
  resourceState: 'ready' | 'cached' | 'pending' | 'unsupported' | 'unavailable';
  resourceMessage: string; etag: string | null;
  originals?: LmsOriginalFile[];
}
export interface LmsItem {
  id: string; subjectId: string; connectionId: string; remoteKey: string;
  revision: number; active: boolean; data: LmsItemData; local: LmsLocalLinks;
  createdAt: string; updatedAt: string;
}
export interface LmsItemVersion extends Omit<LmsItem, 'id' | 'local'> { id: string; itemId: string; }
export interface LmsChange {
  itemId: string; kind: 'added' | 'updated' | 'withdrawn' | 'restored';
  title: string; fromRevision: number | null; toRevision: number;
}
export interface LmsSyncRun {
  id: string; subjectId: string; connectionId: string; trigger: 'manual' | 'automatic';
  status: 'success' | 'partial' | 'failed' | 'cancelled'; scopes: LmsScopes;
  startedAt: string; completedAt: string; changes: LmsChange[];
  unchanged: number; warnings: string[]; message: string;
}
export interface LmsSource { connectionId: string; itemId: string; }
export interface LmsTaskSource extends LmsSource { titleOverridden: boolean; dateOverridden: boolean; statusOverridden: boolean; }
export interface LmsDiscovery {
  id: string; siteName: string; siteUrl: string; expiresAt: string;
  courses: { id: number; name: string; shortName: string }[];
  canReadGrades: boolean; canReadSubmissions: boolean;
}
export interface LmsSnapshot { lmsConnections: LmsConnection[]; lmsItems: LmsItem[]; lmsVersions: LmsItemVersion[]; lmsRuns: LmsSyncRun[]; }
export interface LmsCourseSelection { courseId: number; subjectId?: string; subjectName?: string; }
export interface LmsCourseSetup { discoveryId: string; courses: LmsCourseSelection[]; autoMinutes: LmsConnection['autoMinutes']; }
export interface LmsAPI {
  discoverMoodle(input: { siteUrl: string; token?: string; username?: string; password?: string }): Promise<LmsDiscovery>;
  connectMoodle(input: { subjectId: string; discoveryId: string; courseId: number; autoMinutes: LmsConnection['autoMinutes'] }): Promise<LmsConnection>;
  connectMoodleCourses(input: LmsCourseSetup): Promise<LmsConnection[]>;
  forgetMoodleDiscovery(discoveryId: string): Promise<void>;
  syncMoodle(connectionId: string): Promise<LmsSyncRun>;
  cancelMoodleSync(connectionId: string): Promise<void>;
  configureMoodle(input: { connectionId: string; autoMinutes: LmsConnection['autoMinutes']; enabled: boolean }): Promise<void>;
  disconnectMoodle(connectionId: string): Promise<void>;
  clearMoodleData(connectionId: string): Promise<void>;
  openLmsSource(itemId: string): Promise<void>;
  copyMoodleSubmission(input: { itemId: string; revision: number; reflection: string; attempt?: number }): Promise<PortfolioEntry>;
  copyMoodleQuizReview(input: { itemId: string; revision: number; attemptId: number; reflection: string }): Promise<PortfolioEntry>;
  copyMoodleComparison(input: MoodleComparisonCopyInput): Promise<PortfolioEntry>;
  previewMoodleFile(input: { itemId: string; hash: string }): Promise<{ filename: string; text: string; pageCount: number }>;
  exportMoodleFile(input: { itemId: string; hash: string }): Promise<boolean>;
}
