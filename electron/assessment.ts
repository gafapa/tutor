import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MockExam, MockQuestion, MockExamInput, Difficulty, Reasoning, ExerciseClassification } from '../shared/assessment.js';
import type { Concept } from '../shared/types.js';
import type { CurriculumItem, DidacticUnit } from '../shared/education.js';
import { EXERCISES } from './learning.js';

export const BANK_VERSION = '2026.1';
const difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const id = z.uuid();
const ids = z.array(id).max(100).refine(values => new Set(values).size === values.length, 'Hay referencias repetidas.');
const timestamp = z.iso.datetime();
export const classificationSchema = z.object({ conceptIds: ids, prerequisiteIds: ids, difficulty, reasoning: z.enum(['calculation', 'procedure', 'interpretation', 'logic']), curriculum: z.array(z.object({ id, kind: z.enum(['competency', 'criterion', 'content', 'outcome']), code: z.string().max(50), title: z.string().max(120) })).max(100), source: z.literal('curated-bank'), bankVersion: z.literal(BANK_VERSION) });
export const mockInput = z.object({ subjectId: id, title: z.string().trim().min(1).max(120), unitId: id.nullable(), conceptIds: ids.min(1), maxDifficulty: difficulty, minutes: z.number().int().min(5).max(120), questionCount: z.number().int().min(1).max(30) });
export const mockExamRow = mockInput.omit({ questionCount: true }).extend({
  id, unitTitle: z.string().max(120), bankVersion: z.literal(BANK_VERSION),
  questions: z.array(z.object({ id, conceptId: id, conceptName: z.string().max(120), exerciseId: z.string().max(150), statement: z.string().min(1).max(10000), classification: classificationSchema, answerKey: z.string().min(1).max(10000), feedback: z.string().max(10000) })).min(1).max(30),
  answers: z.array(z.object({ questionId: id, value: z.string().max(20000), durationMs: z.number().int().min(0).max(7200000), updatedAt: timestamp })).min(1).max(30),
  attemptIds: ids, currentQuestionId: id.nullable(), questionStartedAt: timestamp.nullable(), status: z.enum(['active', 'completed', 'cancelled']), startedAt: timestamp, dueAt: timestamp, completedAt: timestamp.nullable(), endReason: z.enum(['submitted', 'timeout', 'cancelled']).nullable()
});
export type MockExamRecord = z.infer<typeof mockExamRow>;
type BankMetadata = { difficulty: Difficulty; reasoning: Reasoning };
const metadata: Record<string, BankMetadata[]> = Object.assign(Object.create(null), {
  'Fracciones': [{ difficulty: 2, reasoning: 'procedure' }, { difficulty: 1, reasoning: 'calculation' }, { difficulty: 2, reasoning: 'procedure' }, { difficulty: 1, reasoning: 'calculation' }],
  'Porcentajes': [{ difficulty: 1, reasoning: 'calculation' }, { difficulty: 2, reasoning: 'interpretation' }, { difficulty: 2, reasoning: 'interpretation' }, { difficulty: 1, reasoning: 'calculation' }],
  'Ecuaciones de primer grado': [{ difficulty: 1, reasoning: 'procedure' }, { difficulty: 2, reasoning: 'procedure' }, { difficulty: 3, reasoning: 'procedure' }, { difficulty: 2, reasoning: 'procedure' }],
  'Potencias de 2': [{ difficulty: 1, reasoning: 'calculation' }, { difficulty: 1, reasoning: 'calculation' }, { difficulty: 2, reasoning: 'logic' }, { difficulty: 2, reasoning: 'interpretation' }],
  'Sistema binario': [{ difficulty: 1, reasoning: 'procedure' }, { difficulty: 2, reasoning: 'procedure' }, { difficulty: 1, reasoning: 'calculation' }],
  'Subnetting': [{ difficulty: 1, reasoning: 'interpretation' }, { difficulty: 2, reasoning: 'procedure' }, { difficulty: 3, reasoning: 'logic' }]
});
export function exerciseCatalog(concepts: Concept[]) {
  return concepts.flatMap(concept => (EXERCISES[concept.name] ?? []).map((_, index) => ({ conceptId: concept.id, exerciseId: `${concept.name}:${index}`, ...metadata[concept.name][index] })));
}
export function classifyBank(concept: Concept, statement: string, curriculum: CurriculumItem[]): (ExerciseClassification & { bankVersion: typeof BANK_VERSION }) | undefined {
  const index = EXERCISES[concept.name]?.findIndex(question => question.statement === statement) ?? -1;
  if (index < 0) return;
  return { conceptIds: [concept.id], prerequisiteIds: [...concept.prerequisiteIds], ...metadata[concept.name][index], curriculum: curriculum.filter(row => row.subjectId === concept.subjectId && row.conceptIds.includes(concept.id)).slice(0, 100).map(row => ({ id: row.id, code: row.code, kind: row.kind, title: row.title })), source: 'curated-bank', bankVersion: BANK_VERSION };
}
export function mockPool(input: Pick<MockExamInput, 'subjectId' | 'unitId' | 'conceptIds' | 'maxDifficulty'>, concepts: Concept[], units: DidacticUnit[], curriculum: CurriculumItem[]) {
  const ownedUnits = units.filter(unit => unit.subjectId === input.subjectId);
  const chosenUnit = input.unitId ? ownedUnits.find(unit => unit.id === input.unitId) : null;
  if (input.unitId && !chosenUnit) throw new Error('No se encuentra la unidad del simulacro.');
  if (chosenUnit?.status === 'pending') throw new Error('Esta unidad aún está pendiente de impartir. Cambia su estado cuando corresponda.');
  const covered = new Set((chosenUnit ? [chosenUnit] : ownedUnits.filter(unit => unit.status !== 'pending')).flatMap(unit => unit.conceptIds));
  const selected = concepts.filter(concept => concept.subjectId === input.subjectId && input.conceptIds.includes(concept.id));
  if (selected.length !== input.conceptIds.length || selected.some(concept => !EXERCISES[concept.name])) throw new Error('Elige conceptos de esta asignatura que tengan preguntas comprobadas.');
  if (ownedUnits.length && selected.some(concept => !covered.has(concept.id))) throw new Error('El simulacro debe usar conceptos de unidades en curso o impartidas.');
  return selected.flatMap(concept => EXERCISES[concept.name].flatMap((question, index) => {
    const classification = classifyBank(concept, question.statement, curriculum)!;
    if (classification.difficulty > input.maxDifficulty) return [];
    return [{ id: randomUUID(), conceptId: concept.id, conceptName: concept.name, exerciseId: `${concept.name}:${index}`, statement: question.statement, classification, answerKey: question.answer, feedback: question.feedback }];
  }));
}
export function chooseMockQuestions(pool: MockExamRecord['questions'], count: number, seed = randomUUID()) {
  if (count > pool.length) throw new Error(`Hay ${pool.length} preguntas distintas para esta selección. Reduce la cantidad o amplía los conceptos y la dificultad.`);
  const score = (key: string) => createHash('sha256').update(`${seed}:${key}`).digest('hex');
  const grouped = new Map<string, MockExamRecord['questions']>();
  for (const question of pool) { const group = grouped.get(question.conceptId) ?? []; group.push(question); grouped.set(question.conceptId, group); }
  const groups = [...grouped.entries()].sort((a, b) => score(a[0]).localeCompare(score(b[0]))).map(([, questions]) => questions.sort((a, b) => score(a.exerciseId).localeCompare(score(b.exerciseId))));
  const chosen: MockExamRecord['questions'] = [];
  while (chosen.length < count) for (const group of groups) { const question = group.shift(); if (question) chosen.push(question); if (chosen.length === count) break; }
  return chosen;
}
export function publicMock(row: MockExamRecord): MockExam {
  return { ...row, questions: row.questions.map(({ answerKey: _answer, feedback: _feedback, ...question }) => question as MockQuestion) };
}
