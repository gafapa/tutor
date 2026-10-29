import { z } from 'zod';
import { arithmeticGuide, sameArithmeticValue, isNumericResult } from './arithmetic.js';
import { matchesBankAnswer } from './learning.js';
import type { GuidedPracticeView } from '../shared/pedagogy.js';

export const guidanceTurnRow = z.object({ activityId: z.uuid(), kind: z.enum(['answer', 'hint']), answer: z.string().max(20000), createdAt: z.iso.datetime() }).strict();
export type GuidanceTurn = z.infer<typeof guidanceTurnRow>;
type Activity = { id: string; kind: string; expression: string | null; statement: string; expected: string; hint: string; followUp: boolean };
export function replayGuidance(activity: Activity, turns: GuidanceTurn[]) {
  if (activity.followUp || activity.kind === 'open') throw new Error('Esta actividad no admite práctica guiada.');
  const steps = activity.kind === 'arithmetic' ? arithmeticGuide(activity.expression!) : [{ expression: activity.statement, expected: activity.expected, hints: ['Separa los datos y lo que pide la actividad. Explica primero qué estrategia usarás.', activity.hint] }];
  let index = 0, hintLevel = 0, attempted = false, totalHints = 0;
  const attempts: GuidedPracticeView['attempts'] = [];
  for (const turn of turns) {
    if (index >= steps.length) throw new Error('La práctica ya está terminada.');
    if (turn.kind === 'hint') {
      if (!attempted || hintLevel >= 2 || turn.answer !== '') throw new Error('Intenta el paso antes de pedir otra pista.');
      if (totalHints >= 50) throw new Error('Esta actividad ha alcanzado el límite de 50 pistas. Puedes iniciar un refuerzo nuevo.');
      hintLevel++; totalHints++;
    } else {
      if (!turn.answer.trim()) throw new Error('Escribe tu intento.');
      const correct = activity.kind === 'arithmetic' ? isNumericResult(turn.answer) && sameArithmeticValue(turn.answer, steps[index].expected) : matchesBankAnswer(turn.answer, steps[index].expected);
      attempts.push({ answer: turn.answer, correct, stepIndex: index, hints: hintLevel }); attempted = true;
      if (correct) { index++; hintLevel = 0; attempted = false; }
    }
  }
  const completed = index === steps.length;
  const view: GuidedPracticeView = { stepIndex: index, totalSteps: steps.length, prompt: completed ? 'Práctica terminada.' : activity.kind === 'arithmetic' ? `Calcula este paso: ${steps[index].expression}` : steps[index].expression, hints: completed ? [] : steps[index].hints.slice(0, hintLevel), canHint: !completed && attempted && hintLevel < 2, attempts, completed };
  return { view, totalHints, finalAnswer: completed ? attempts.at(-1)!.answer : undefined };
}
