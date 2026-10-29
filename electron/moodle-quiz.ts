import { z } from 'zod';
import type { LmsQuizAttempt } from '../shared/lms.js';
import { unixDate } from './lms-utils.js';

const positive = z.coerce.number().int().positive();
const attemptRow = z.object({ id: positive, quiz: positive, userid: positive, attempt: positive, preview: z.coerce.number().int().min(0).max(0).default(0), state: z.enum(['inprogress', 'overdue', 'finished', 'abandoned']), timestart: z.union([z.number(), z.string()]).optional(), timefinish: z.union([z.number(), z.string()]).optional() });
const deniedCodes = new Set(['noreview', 'noreviewattempt', 'attemptclosed', 'notyourattempt', 'accessexception', 'requireloginerror', 'invalidrecord']);
type Call = (name: string, input: Record<string, unknown>) => Promise<unknown>;

export async function collectQuizAttempts(input: { quizId: number; userId: number; call: Call; reviewAvailable: boolean; previous: LmsQuizAttempt[]; plain(html: string): string; warn(): void; signal: AbortSignal }): Promise<LmsQuizAttempt[]> {
  const listed = z.object({ attempts: z.array(attemptRow).max(100), warnings: z.array(z.unknown()).optional() }).parse(await input.call('mod_quiz_get_user_attempts', { quizid: input.quizId, userid: input.userId, status: 'all', includepreviews: 0 }));
  input.signal.throwIfAborted();
  if (listed.warnings?.length || listed.attempts.some(row => row.quiz !== input.quizId || row.userid !== input.userId) || new Set(listed.attempts.map(row => row.id)).size !== listed.attempts.length || new Set(listed.attempts.map(row => row.attempt)).size !== listed.attempts.length) throw new Error('El historial de cuestionarios es incompatible.');
  const results: LmsQuizAttempt[] = []; let totalText = 0;
  for (const listedAttempt of listed.attempts.sort((a, b) => a.attempt - b.attempt)) {
    input.signal.throwIfAborted();
    const entry: LmsQuizAttempt = { id: listedAttempt.id, number: listedAttempt.attempt, state: listedAttempt.state, startedAt: unixDate(listedAttempt.timestart), finishedAt: unixDate(listedAttempt.timefinish), reviewState: listedAttempt.state === 'finished' ? 'unavailable' : 'not-finished', reviewText: '', points: null };
    if (entry.state === 'finished' && input.reviewAvailable) {
      try {
        const review = z.object({ attempt: attemptRow.extend({ sumgrades: z.union([z.number(), z.string()]).nullable().optional() }), questions: z.array(z.object({ slot: positive, html: z.string().max(2000000).optional() })).max(300), additionaldata: z.array(z.object({ id: z.string(), content: z.string().max(2000000) })).max(100).optional(), warnings: z.array(z.unknown()).optional() }).parse(await input.call('mod_quiz_get_attempt_review', { attemptid: entry.id, page: -1 }));
        if (review.attempt.id !== entry.id || review.attempt.quiz !== input.quizId || review.attempt.userid !== input.userId || review.attempt.attempt !== entry.number || review.attempt.state !== 'finished' || review.warnings?.length || new Set(review.questions.map(question => question.slot)).size !== review.questions.length) throw new Error('La revisión no corresponde al intento.');
        const text = [...review.questions.map(question => `Pregunta ${question.slot}\n${input.plain(question.html ?? '')}`), ...(review.additionaldata ?? []).filter(row => row.id === 'feedback').map(row => `Comentarios\n${input.plain(row.content)}`)].join('\n\n');
        if (text.length > 2000000) throw new Error('La revisión supera el límite de texto.');
        // Moodle's scaled `grade` field is not a visibility signal. Use only the permission-filtered attempt marks.
        const visiblePoints = review.attempt.sumgrades;
        entry.points = visiblePoints !== null && visiblePoints !== undefined && String(visiblePoints).trim() !== '' && Number.isFinite(Number(visiblePoints)) ? Number(visiblePoints) : null;
        entry.reviewText = text; entry.reviewState = 'available';
      } catch (error) {
        input.signal.throwIfAborted();
        const code = error && typeof error === 'object' && 'moodleCode' in error ? String(error.moodleCode) : '';
        if (deniedCodes.has(code)) entry.reviewState = 'restricted';
        else {
          input.warn();
          const previous = input.previous.find(row => row.id === entry.id && row.number === entry.number && row.state === 'finished' && ['available', 'cached'].includes(row.reviewState));
          if (previous) { entry.reviewText = previous.reviewText; entry.points = previous.points; entry.reviewState = 'cached'; }
        }
      }
    } else if (entry.state === 'finished') input.warn();
    totalText += entry.reviewText.length;
    if (totalText > 2000000) throw new Error('El historial del cuestionario supera el límite de texto.');
    results.push(entry);
  }
  return results;
}
