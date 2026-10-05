import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Store } from '../electron/store';
import { EXERCISES } from '../electron/learning';
import { exerciseCatalog, mockPool, chooseMockQuestions } from '../electron/assessment';
import { validateBackup } from '../electron/validation';
import type { MockExamInput } from '../shared/assessment';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID()); await mkdir(directory, { recursive: true });
  const path = join(directory, 'history.tutor'); const key = randomBytes(32);
  const store = await Store.open(path, key, wasm); const subject = store.createDemo(); const concepts = store.snapshot().concepts;
  const input: MockExamInput = { subjectId: subject.id, title: 'Ensayo de redes', unitId: null, conceptIds: concepts.map(concept => concept.id), maxDifficulty: 3, minutes: 10, questionCount: 6 };
  return { store, subject, concepts, input, path, key };
}
test('la selección respeta unidades impartidas, dificultad máxima y variedad sin repetir preguntas', async () => {
  const { store, subject, concepts, input } = await fixture();
  try {
    const current = store.saveUnit({ subjectId: subject.id, title: 'Bits', objectives: '', startsOn: null, endsOn: null, status: 'taught', conceptIds: concepts.slice(0, 2).map(concept => concept.id), prerequisiteIds: [], curriculumIds: [], materialIds: [] });
    const pending = store.saveUnit({ ...current, id: undefined, title: 'Subredes', status: 'pending', conceptIds: [concepts[2].id] });
    assert.throws(() => store.startMockExam(input), /impartidas/);
    assert.throws(() => store.startMockExam({ ...input, unitId: pending.id, conceptIds: [concepts[2].id] }), /pendiente/);
    const config = { ...input, unitId: current.id, conceptIds: current.conceptIds, maxDifficulty: 1 as const, questionCount: 4 };
    const pool = mockPool(config, concepts, store.snapshot().units, []);
    assert.equal(pool.length, 4);
    const questions = chooseMockQuestions(pool, 4, 'semilla-estable');
    assert.equal(new Set(questions.map(question => question.exerciseId)).size, 4);
    assert.equal(new Set(questions.map(question => question.conceptId)).size, 2);
    assert.ok(questions.every(question => question.classification.difficulty === 1));
    assert.deepEqual(chooseMockQuestions(pool, 4, 'semilla-estable').map(question => question.exerciseId), questions.map(question => question.exerciseId));
    assert.throws(() => store.startMockExam({ ...config, questionCount: 5 }), /4 preguntas/);
    const exam = store.startMockExam(config);
    assert.equal(exam.questions.length, 4); assert.equal(exam.unitTitle, 'Bits');
    assert.equal(store.snapshot().attempts.length, 0);
    assert.equal(exerciseCatalog(concepts).length, 10);
    validateBackup(store.exportData()); store.cancelMockExam(exam.id);
  } finally { store.close(); }
});
test('un simulacro guarda y permite revisar respuestas; corrige solo al terminar y conserva una única evidencia por pregunta', async () => {
  const { store, input, subject } = await fixture();
  try {
    const startedAt = new Date(Date.now() - 60000); const exam = store.startMockExam({ ...input, questionCount: 3 }, startedAt);
    assert.ok(exam.questions.every(question => !('answerKey' in question) && !('feedback' in question)));
    const redacted = store.rendererSnapshot();
    for (const field of ['materials', 'messages', 'attempts', 'portfolio', 'flashcards', 'cardRevisions', 'studySessions', 'events'] as const) assert.equal(redacted[field].length, 0);
    const first = exam.questions[0]; const correct = EXERCISES[first.conceptName][Number(first.exerciseId.split(':').at(-1))].answer;
    store.saveMockAnswer({ id: exam.id, questionId: first.id, answer: correct }, new Date(startedAt.getTime() + 5000));
    store.selectMockQuestion({ id: exam.id, questionId: exam.questions[1].id }, new Date(startedAt.getTime() + 10000));
    store.saveMockAnswer({ id: exam.id, questionId: exam.questions[1].id, answer: '99999' }, new Date(startedAt.getTime() + 15000));
    assert.equal(store.snapshot().attempts.length, 0);
    assert.throws(() => store.saveMockAnswer({ id: exam.id, questionId: first.id, answer: '0' }), /Abre/);
    const result = store.finishMockExam(exam.id, new Date(startedAt.getTime() + 20000));
    assert.equal(result.status, 'completed'); assert.equal(result.endReason, 'submitted');
    assert.deepEqual(store.snapshot().attempts.map(attempt => attempt.outcome), ['correct', 'incorrect', 'ungraded']);
    assert.ok(store.snapshot().attempts.every(attempt => attempt.purpose === 'mock' && attempt.hints === 0));
    assert.equal(store.snapshot().portfolio.length, 1);
    assert.equal(store.snapshot().attempts[0].durationSeconds, 10); assert.equal(store.snapshot().attempts[1].durationSeconds, 10);
    assert.ok(store.snapshot().estimates.every(estimate => estimate.status !== 'consolidated'));
    assert.deepEqual(store.finishMockExam(exam.id).attemptIds, result.attemptIds);
    assert.equal(store.snapshot().attempts.length, 3);
    assert.throws(() => store.saveMockAnswer({ id: exam.id, questionId: first.id, answer: '0' }), /terminado/);
    validateBackup(store.exportData());
    store.deleteSubject(subject.id); assert.equal(store.snapshot().mockExams.length, 0);
  } finally { store.close(); }
});
test('el cierre conserva respuestas y el plazo continúa; al reabrir un simulacro vencido corrige los datos confirmados', async () => {
  const { store, input, path, key } = await fixture();
  const start = new Date(Date.now() - 590000); const exam = store.startMockExam({ ...input, questionCount: 2 }, start);
  const question = exam.questions[0];
  const expected = EXERCISES[question.conceptName][Number(question.exerciseId.split(':').at(-1))].answer;
  store.saveMockAnswer({ id: exam.id, questionId: question.id, answer: expected });
  store.close();
  const reopened = await Store.open(path, key, wasm);
  assert.equal(reopened.mockExam(exam.id).answers[0].value, expected);
  assert.equal(reopened.snapshot().mockExams[0].status, 'active');
  assert.equal(reopened.snapshot().attempts.length, 0);
  reopened.tickMock(new Date(Date.parse(exam.dueAt) + 100000));
  const corrected = reopened.snapshot().mockExams[0];
  assert.equal(corrected.endReason, 'timeout'); assert.equal(corrected.completedAt, exam.dueAt);
  assert.deepEqual(reopened.snapshot().attempts.map(attempt => attempt.outcome), ['correct', 'ungraded']);
  assert.equal(reopened.snapshot().attempts[0].createdAt, exam.dueAt);
  assert.equal(reopened.snapshot().attempts[0].durationSeconds, 600);
  validateBackup(reopened.exportData()); reopened.close();
});
test('la sesión se pausa al iniciar un simulacro; interrumpir conserva respuestas sin calificar ni inventar dificultades', async () => {
  const { store, input, concepts, subject } = await fixture();
  try {
    const session = store.startSession({ subjectId: subject.id, goal: 'Practicar las potencias', minutes: 10, conceptIds: [concepts[0].id], unitId: null, taskId: null, materialIds: [] });
    const exam = store.startMockExam({ ...input, questionCount: 1 });
    assert.equal(store.snapshot().studySessions[0].id, session.id); assert.equal(store.snapshot().studySessions[0].status, 'paused');
    assert.throws(() => store.startMockExam(input), /en marcha/);
    store.saveMockAnswer({ id: exam.id, questionId: exam.questions[0].id, answer: 'Un intento sin comprobar' });
    store.cancelMockExam(exam.id);
    assert.equal(store.snapshot().mockExams[0].answers[0].value, 'Un intento sin comprobar');
    assert.equal(store.snapshot().mockExams[0].status, 'cancelled');
    assert.equal(store.snapshot().attempts.length, 0); assert.ok(store.snapshot().estimates.every(estimate => estimate.status === 'unseen'));
    validateBackup(store.exportData());
  } finally { store.close(); }
});
test('las clasificaciones del banco conservan currículo, dificultad, razonamiento y prerrequisitos del momento del ejercicio', async () => {
  const { store, subject, concepts } = await fixture();
  try {
    const curriculum = store.saveCurriculum({ subjectId: subject.id, kind: 'competency', code: 'C1', title: 'Cuenta combinaciones posibles', description: '', conceptIds: [concepts[0].id], relatedIds: [] });
    const first = store.submitExercise({ conceptId: concepts[0].id, exerciseId: 'Potencias de 2:2', answer: '7', hints: 0, durationSeconds: 2 });
    assert.equal(first.classification?.difficulty, 2); assert.equal(first.classification?.reasoning, 'logic');
    assert.equal(first.classification?.curriculum[0].title, curriculum.title);
    store.saveCurriculum({ ...curriculum, title: 'Nuevo título docente' });
    const second = store.submitExercise({ conceptId: concepts[0].id, exerciseId: 'Potencias de 2:2', answer: '7', hints: 0, durationSeconds: 2 });
    assert.equal(second.classification?.curriculum[0].title, 'Nuevo título docente');
    assert.equal(store.snapshot().attempts[0].classification?.curriculum[0].title, curriculum.title);
    store.deleteCurriculum(curriculum.id); validateBackup(store.exportData());
    const self = store.saveAttempt({ subjectId: subject.id, conceptId: concepts[0].id, statement: 'Ejercicio libre', answer: 'Algo', feedback: '', outcome: 'ungraded', hints: 0, durationSeconds: 1 });
    assert.equal(self.classification, undefined);
  } finally { store.close(); }
});
test('las copias rechazan correcciones, claves, duraciones y estados de simulacro manipulados', async () => {
  const { store, input } = await fixture();
  try {
    const exam = store.startMockExam({ ...input, questionCount: 2 }, new Date(Date.now() - 1000));
    store.saveMockAnswer({ id: exam.id, questionId: exam.questions[0].id, answer: '99999' });
    store.finishMockExam(exam.id); const original = store.exportData();
    const reject = (change: (value: any) => void) => { const value = JSON.parse(original); change(value); assert.throws(() => store.importData(JSON.stringify(value))); assert.deepEqual(JSON.parse(store.exportData()).tables, JSON.parse(original).tables); };
    reject(value => { value.tables.mock_exams[0].questions[0].answerKey = '99999'; });
    reject(value => { value.tables.mock_exams[0].answers[0].value = 'Una nueva respuesta'; });
    reject(value => { const classification = value.tables.mock_exams[0].questions[0].classification; classification.difficulty = classification.difficulty === 3 ? 1 : 3; });
    reject(value => { value.tables.mock_exams[0].answers[0].durationMs = 7000000; });
    reject(value => { value.tables.mock_exams[0].attemptIds = []; });
    reject(value => { value.tables.mock_exams[0].dueAt = new Date(Date.now() + 7200000).toISOString(); });
    const snapshot = store.snapshot(); store.erase(); store.importData(original);
    assert.deepEqual(store.snapshot().mockExams, snapshot.mockExams); assert.deepEqual(store.snapshot().attempts, snapshot.attempts);
  } finally { store.close(); }
});
test('un retroceso del reloj no solapa tiempo de preguntas ni adelanta el final de una sesión', async () => {
  const { store, input, subject } = await fixture();
  try {
    const start = new Date(Date.now() - 60000);
    const exam = store.startMockExam({ ...input, questionCount: 2 }, start);
    const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);
    store.selectMockQuestion({ id: exam.id, questionId: exam.questions[1].id }, at(30));
    store.selectMockQuestion({ id: exam.id, questionId: exam.questions[0].id }, at(10));
    store.saveMockAnswer({ id: exam.id, questionId: exam.questions[0].id, answer: 'Respuesta' }, at(5));
    const result = store.finishMockExam(exam.id, at(20));
    assert.equal(result.completedAt, at(30).toISOString());
    assert.equal(result.answers.reduce((sum, answer) => sum + answer.durationMs, 0), 30000);
    validateBackup(store.exportData());
    const session = store.startSession({ subjectId: subject.id, goal: 'Repasar', minutes: 10, conceptIds: [], unitId: null, taskId: null, materialIds: [] }, start);
    store.finishSession(session.id, at(40)); store.cancelSession(session.id, at(20));
    assert.equal(store.snapshot().studySessions[0].completedAt, at(40).toISOString());
    validateBackup(store.exportData());
  } finally { store.close(); }
});
