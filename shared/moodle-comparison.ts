import type { LmsActivityData } from './lms.js';

export interface MoodleComparisonAttempt {
  id: string; number: number; status: string; text: string; feedback: string; updatedAt: string | null;
  group: boolean | null; cached: boolean; points: number | null;
  files: { filename: string; filepath: string; size: number }[];
}
export interface MoodleTextChange { kind: 'same' | 'removed' | 'added'; text: string; }
export type MoodleTextComparison = { limited: true } | { limited: false; rows: MoodleTextChange[]; added: number; removed: number };
export const MOODLE_COMPARISON_CHARACTERS = 50000;
export const MOODLE_COMPARISON_LINES = 500;

export function moodleComparisonAttempts(activity: LmsActivityData): MoodleComparisonAttempt[] {
  if (activity.module === 'quiz') return (activity.quizAttempts ?? [])
    .filter(attempt => attempt.state === 'finished' && ['available', 'cached'].includes(attempt.reviewState) && attempt.reviewText.trim())
    .map(attempt => ({ id: `quiz:${attempt.id}`, number: attempt.number, status: attempt.state, text: attempt.reviewText, feedback: '', updatedAt: attempt.finishedAt, group: null, cached: attempt.reviewState === 'cached', points: attempt.points, files: [] }))
    .sort((left, right) => left.number - right.number);
  if (activity.module !== 'assign' || !activity.submission) return [];
  return [...(activity.previousSubmissions ?? []), { submission: activity.submission, feedback: activity.submissionFeedback ?? '' }]
    .map(({ submission, feedback }) => ({ id: `assign:${submission.attempt}`, number: submission.attempt + 1, status: submission.status, text: submission.text, feedback, updatedAt: submission.updatedAt, group: submission.group, cached: false, points: null, files: (submission.files ?? []).map(({ filename, filepath, size }) => ({ filename, filepath, size })) }))
    .sort((left, right) => left.number - right.number);
}

// Exact line comparison with a bounded LCS matrix. Source records are never altered or truncated.
export function compareMoodleText(before: string, after: string): MoodleTextComparison {
  if (before.length > MOODLE_COMPARISON_CHARACTERS || after.length > MOODLE_COMPARISON_CHARACTERS) return { limited: true };
  const lines = (value: string) => value ? value.replace(/\r\n?/g, '\n').split('\n') : [];
  const left = lines(before), right = lines(after);
  if (left.length > MOODLE_COMPARISON_LINES || right.length > MOODLE_COMPARISON_LINES) return { limited: true };
  const width = right.length + 1, matrix = new Uint16Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) matrix[i * width + j] = left[i] === right[j] ? 1 + matrix[(i + 1) * width + j + 1] : Math.max(matrix[(i + 1) * width + j], matrix[i * width + j + 1]);
  const rows: MoodleTextChange[] = []; let i = 0, j = 0, added = 0, removed = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { rows.push({ kind: 'same', text: left[i++] }); j++; }
    else if (i < left.length && (j === right.length || matrix[(i + 1) * width + j] >= matrix[i * width + j + 1])) { rows.push({ kind: 'removed', text: left[i++] }); removed++; }
    else { rows.push({ kind: 'added', text: right[j++] }); added++; }
  }
  return { limited: false, rows, added, removed };
}
