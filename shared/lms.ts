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
}
export interface LmsActivityData {
  kind: 'activity'; moduleId: number; assignmentId: number | null; module: string;
  title: string; url: string; instructions: string; dueAt: string | null;
  submission?: LmsSubmission | null; submissionFeedback?: string;
}
export interface LmsResourceData {
  kind: 'resource'; moduleId: number; title: string; filename: string; url: string;
  source: 'file' | 'page' | 'link'; format: string; size: number;
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
export interface LmsAPI {
  discoverMoodle(input: { siteUrl: string; token?: string; username?: string; password?: string }): Promise<LmsDiscovery>;
  connectMoodle(input: { subjectId: string; discoveryId: string; courseId: number; autoMinutes: LmsConnection['autoMinutes'] }): Promise<LmsConnection>;
  syncMoodle(connectionId: string): Promise<LmsSyncRun>;
  cancelMoodleSync(connectionId: string): Promise<void>;
  configureMoodle(input: { connectionId: string; autoMinutes: LmsConnection['autoMinutes']; enabled: boolean }): Promise<void>;
  disconnectMoodle(connectionId: string): Promise<void>;
  clearMoodleData(connectionId: string): Promise<void>;
  openLmsSource(itemId: string): Promise<void>;
}
