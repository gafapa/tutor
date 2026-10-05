export type SessionStatus = 'running' | 'paused' | 'review' | 'completed' | 'cancelled';
export type StopReason = 'pause' | 'closed' | 'recovered' | 'suspended' | 'timeout' | 'finish';
export interface StudyInterval { startedAt: string; endedAt: string; reason: StopReason; }
export interface SessionReview { learned: string; difficulty: string; nextStep: string; selfRating: 'unsure' | 'learning' | 'confident'; }
export interface StudySession {
  id: string; subjectId: string; goal: string; minutes: 10 | 20 | 30; status: SessionStatus;
  conceptIds: string[]; unitId: string | null; unitTitle: string; taskId: string | null; taskTitle: string;
  materials: { id: string; name: string; version: number }[];
  intervals: StudyInterval[]; runningSince: string | null; checkpointAt: string | null;
  attemptIds: string[]; cardReviewIds: string[]; review: SessionReview | null;
  createdAt: string; stoppedAt: string | null; completedAt: string | null;
}
export interface SessionInput { subjectId: string; goal: string; minutes: StudySession['minutes']; conceptIds: string[]; unitId: string | null; taskId: string | null; materialIds: string[]; }
export interface StudySnapshot { studySessions: StudySession[]; }
export interface StudyAPI {
  studySession(id: string): Promise<StudySession>;
  startSession(input: SessionInput): Promise<StudySession>;
  pauseSession(id: string): Promise<void>;
  resumeSession(id: string): Promise<void>;
  finishSession(id: string): Promise<void>;
  completeSession(input: { id: string; review: SessionReview }): Promise<void>;
  cancelSession(id: string): Promise<void>;
}
export function sessionElapsed(session: StudySession, at = new Date()) {
  const closed = session.intervals.reduce((sum, span) => sum + Math.max(0, Date.parse(span.endedAt) - Date.parse(span.startedAt)), 0);
  const current = session.runningSince ? Math.max(0, at.getTime() - Date.parse(session.runningSince)) : 0;
  return Math.min(session.minutes * 60000, closed + current);
}
export function sessionRemaining(session: StudySession, at = new Date()) { return Math.max(0, session.minutes * 60000 - sessionElapsed(session, at)); }
