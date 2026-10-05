import { z } from 'zod';
import type { StudySession, StopReason } from '../shared/study.js';
import { sessionElapsed } from '../shared/study.js';

const id = z.uuid();
const ids = z.array(id).max(100).refine(values => new Set(values).size === values.length, 'Hay referencias repetidas.');
const timestamp = z.iso.datetime();
export const sessionInput = z.object({ subjectId: id, goal: z.string().trim().min(1).max(500), minutes: z.union([z.literal(10), z.literal(20), z.literal(30)]), conceptIds: ids, unitId: id.nullable(), taskId: id.nullable(), materialIds: ids });
export const sessionReview = z.object({ learned: z.string().trim().min(1).max(4000), difficulty: z.string().trim().max(4000), nextStep: z.string().trim().min(1).max(2000), selfRating: z.enum(['unsure', 'learning', 'confident']) });
export const studySessionRow = sessionInput.omit({ materialIds: true }).extend({
  id, status: z.enum(['running', 'paused', 'review', 'completed', 'cancelled']), unitTitle: z.string().max(120), taskTitle: z.string().max(120),
  materials: z.array(z.object({ id, name: z.string().max(120), version: z.number().int().positive() })).max(100),
  intervals: z.array(z.object({ startedAt: timestamp, endedAt: timestamp, reason: z.enum(['pause', 'closed', 'recovered', 'suspended', 'timeout', 'finish']) })).max(10000),
  runningSince: timestamp.nullable(), checkpointAt: timestamp.nullable(), attemptIds: z.array(id).max(10000), cardReviewIds: z.array(id).max(10000), review: sessionReview.nullable(),
  createdAt: timestamp, stoppedAt: timestamp.nullable(), completedAt: timestamp.nullable()
});

export function stopSession(row: StudySession, reason: StopReason, at = new Date()): StudySession {
  if (row.status !== 'running' || !row.runningSince) return row;
  const start = Date.parse(row.runningSince);
  const used = sessionElapsed({ ...row, runningSince: null }, at);
  const end = Math.min(start + row.minutes * 60000 - used, Math.max(start, at.getTime()));
  const timeout = used + end - start >= row.minutes * 60000;
  return { ...row, intervals: [...row.intervals, { startedAt: row.runningSince, endedAt: new Date(end).toISOString(), reason: timeout ? 'timeout' : reason }], runningSince: null, checkpointAt: null, status: timeout ? 'review' : 'paused', stoppedAt: timeout ? new Date(end).toISOString() : null };
}
