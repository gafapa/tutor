import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../electron/learning';
import type { Attempt } from '../shared/types';
import { randomUUID } from 'node:crypto';
import { conceptSummary, makeReport, validateReports, type ReportData } from '../electron/reports';

function evidence(dates: Date[]): Attempt[] {
  return dates.map((date, index) => ({ id: `attempt-${index}`, subjectId: 'subject', conceptId: 'concept', statement: `Question ${index}`, answer: '1', expected: '1', feedback: '', outcome: 'correct', source: 'verified', hints: 0, durationSeconds: 10, createdAt: date.toISOString() }));
}

test('report validation preserves legacy UTC estimates and the timezone of new reports', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'Europe/Madrid';
  try {
    const subject = { id: randomUUID(), name: 'Mathematics', course: '', level: '', teacher: '', goals: '', color: 'sage' as const, isDemo: false, createdAt: '2026-10-01T12:00:00Z' };
    const concept = { id: randomUUID(), subjectId: subject.id, name: 'Potencias de 2', description: '', prerequisiteIds: [], position: 0 };
    const attempts = evidence([new Date(2026, 9, 26, 0, 30), new Date(2026, 9, 26, 23, 30), new Date(2026, 9, 27, 0, 30), new Date(2026, 9, 27, 23, 30)])
      .map(row => ({ ...row, id: randomUUID(), subjectId: subject.id, conceptId: concept.id }));
    const data: ReportData = { subjects: [subject], concepts: [concept], attempts, events: [], units: [], curriculum: [], intervention_reviews: [], learning_reports: [], report_preferences: [] };
    const current = makeReport({ subjectId: subject.id, kind: 'weekly', startsOn: '2026-10-26', endsOn: '2026-11-01' }, data, new Date(2026, 10, 2, 12));
    assert.equal(current.engineVersion, 'reports-2');
    assert.equal(current.concepts[0].after.status, 'progress');
    const legacy = structuredClone(current);
    legacy.id = randomUUID(); legacy.engineVersion = 'reports-1';
    legacy.concepts = [conceptSummary(concept, estimate(concept.id, attempts, new Date(Date.parse(current.periodStartAt) - 1), 'UTC'), estimate(concept.id, attempts, new Date(current.asOf), 'UTC'))];
    assert.equal(legacy.concepts[0].after.status, 'consolidated');
    data.learning_reports = [legacy, current];
    assert.doesNotThrow(() => validateReports(data));
    process.env.TZ = 'America/Los_Angeles';
    assert.doesNotThrow(() => validateReports(data));
    const invalid = structuredClone(data);
    invalid.learning_reports[1].concepts[0].after = legacy.concepts[0].after;
    assert.throws(() => validateReports(invalid), /estimación/);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

for (const timezone of ['Europe/Madrid', 'America/Los_Angeles']) {
  test(`mastery uses local calendar days around midnight in ${timezone}`, () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = timezone;
    try {
      const twoDays = evidence([new Date(2026, 9, 26, 0, 30), new Date(2026, 9, 26, 23, 30), new Date(2026, 9, 27, 0, 30), new Date(2026, 9, 27, 23, 30)]);
      assert.equal(new Set(twoDays.map(row => row.createdAt.slice(0, 10))).size, 3);
      assert.equal(estimate('concept', twoDays, new Date(2026, 9, 29, 12)).status, 'progress');
      const threeDays = evidence(timezone === 'Europe/Madrid'
        ? [new Date(2026, 9, 26, 23, 30), new Date(2026, 9, 27, 0, 30), new Date(2026, 9, 27, 21), new Date(2026, 9, 28, 0, 30)]
        : [new Date(2026, 9, 26, 23, 30), new Date(2026, 9, 27, 0, 30), new Date(2026, 9, 27, 12), new Date(2026, 9, 28, 0, 30)]);
      assert.equal(new Set(threeDays.map(row => row.createdAt.slice(0, 10))).size, 2);
      const state = estimate('concept', threeDays, new Date(2026, 9, 29, 12));
      assert.equal(state.status, 'consolidated');
      assert.match(state.reason, /3 días distintos/);
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
}
