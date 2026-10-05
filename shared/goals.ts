import type { Estimate } from './types.js';

export type GoalKind = 'improve' | 'exam' | 'recover' | 'advance';
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'abandoned';
export interface PersonalGoal {
  id: string; subjectId: string; kind: GoalKind; title: string; description: string;
  conceptIds: string[]; targetDays: number; startsOn: string; dueOn: string | null;
  supersedesId: string | null; revision: number; createdAt: string;
}
export type GoalInput = Omit<PersonalGoal, 'id' | 'revision' | 'createdAt'>;
export interface GoalReview {
  id: string; subjectId: string; goalId: string; previousId: string | null;
  action: 'progress' | 'paused' | 'resumed' | 'achieved' | 'abandoned';
  reflection: string; evidenceIds: string[]; createdAt: string;
}
export interface GoalProgress {
  goalId: string; status: GoalStatus; practiceDays: number; targetMet: boolean;
  evidenceIds: string[]; estimates: Estimate[]; overdue: boolean; reason: string;
}
export type AlertKind = 'regression' | 'persistent' | 'unconsolidated' | 'inactivity' | 'review';
export interface LearningAlert {
  key: string; subjectId: string; conceptId: string | null; kind: AlertKind;
  title: string; reason: string; evidenceIds: string[]; eventIds: string[];
  lastActivityAt: string | null; reviewed: boolean;
}
export interface AlertReview {
  id: string; subjectId: string; alertKey: string; conceptId: string | null; kind: AlertKind;
  evidenceIds: string[]; eventIds: string[]; lastActivityAt: string | null;
  reflection: string; createdAt: string;
}
export interface LearningHabit {
  subjectId: string; timezone: string; currentStreak: number; longestStreak: number;
  totalDays: number; recentDays: { date: string; active: boolean }[];
}
export interface TimelinePoint { at: string; date: string; estimate: Estimate; newEvidenceIds: string[]; }
export interface ConceptTimeline {
  conceptId: string; startsOn: string; endsOn: string; timezone: string; generatedAt: string;
  points: TimelinePoint[];
}
export interface RecentChange { conceptId: string; before: Estimate; after: Estimate; change: 'first-evidence' | 'improved' | 'regressed' | 'stable' | 'check-again'; startsOn: string; endsOn: string; }
export interface GoalsSnapshot {
  personalGoals: PersonalGoal[]; goalReviews: GoalReview[]; goalProgress: GoalProgress[];
  learningAlerts: LearningAlert[]; alertReviews: AlertReview[]; learningHabits: LearningHabit[];
  recentChanges: RecentChange[];
}
export interface GoalsAPI {
  saveGoal(input: GoalInput): Promise<PersonalGoal>;
  reviewGoal(input: { goalId: string; action: GoalReview['action']; reflection: string; evidenceIds: string[] }): Promise<GoalReview>;
  deleteGoal(id: string): Promise<void>;
  reviewAlert(input: { key: string; reflection: string }): Promise<void>;
  conceptTimeline(input: { conceptId: string; startsOn: string; endsOn: string }): Promise<ConceptTimeline>;
}
