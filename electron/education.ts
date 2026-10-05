import { dayKey, addDays } from '../shared/calendar.js';
import type { Attempt, Concept, Material } from '../shared/types.js';
import type { CardReview, CardSchedule, Flashcard, FlashcardSource } from '../shared/education.js';

export function scheduleCard(card: Flashcard, reviews: CardReview[], now = new Date()): CardSchedule {
  const evidence = reviews.filter(r => r.cardId === card.id && r.revision === card.revision && r.createdAt <= now.toISOString()).reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!evidence.length) return { cardId: card.id, dueDate: dayKey(now), intervalDays: 0, reviewCount: 0 };
  const last = evidence[0];
  if (last.rating === 'again') return { cardId: card.id, dueDate: dayKey(new Date(last.createdAt)), intervalDays: 0, reviewCount: evidence.length };
  const days = new Set<string>();
  for (const review of evidence) {
    if (review.rating === 'again' || review.rating === 'hard') break;
    days.add(dayKey(new Date(review.createdAt)));
  }
  const intervals = [1, 3, 7, 14, 30];
  const index = Math.min(intervals.length - 1, Math.max(0, days.size - 1));
  // Repeated ratings on one day cannot inflate the interval. This is self-recall, not mastery evidence.
  const intervalDays = last.rating === 'hard' ? 1 : intervals[index];
  return { cardId: card.id, dueDate: addDays(dayKey(new Date(last.createdAt)), intervalDays), intervalDays, reviewCount: evidence.length };
}

export interface CardDraft { front: string; back: string; conceptId: string | null; source: FlashcardSource | null; evidenceIds: string[]; origin: Flashcard['origin']; }
export function automaticPortfolioContent(attempt: Attempt) {
  return `${attempt.statement}\n\nMi respuesta: ${attempt.answer}\n\nCorrección: ${attempt.feedback}`;
}
export function materialCardDrafts(material: Material, concepts: Concept[], limit = 20): CardDraft[] {
  const drafts: CardDraft[] = [];
  for (const [pageIndex, page] of material.text.split('\f').entries()) {
    for (const paragraph of page.split(/\n\s*\n/)) {
      const quote = paragraph.trim().slice(0, 1000).trim();
      if (quote.length < 40) continue;
      const lines = quote.split('\n').filter(Boolean);
      const heading = lines.length > 1 && lines[0].length <= 100 ? lines[0].replace(/^#+\s*/, '') : `${material.name} · fragmento ${drafts.length + 1}`;
      const normalized = quote.toLocaleLowerCase('es');
      const concept = concepts.find(c => c.subjectId === material.subjectId && normalized.includes(c.name.toLocaleLowerCase('es')));
      drafts.push({ front: `Explica sin mirar: ${heading}`, back: quote, conceptId: concept?.id ?? null, origin: 'material', evidenceIds: [], source: { materialId: material.id, materialVersion: material.version, page: pageIndex + 1, quote } });
      if (drafts.length >= limit) return drafts;
    }
  }
  return drafts;
}
export function errorCardDrafts(subjectId: string, attempts: Attempt[], limit = 20): CardDraft[] {
  const unique = new Set<string>();
  return attempts.filter(a => a.subjectId === subjectId && a.source === 'verified' && a.outcome === 'incorrect' && a.expected).slice().reverse().filter(a => {
    const key = `${a.conceptId}:${a.statement}`;
    if (unique.has(key)) return false;
    unique.add(key); return true;
  }).slice(0, limit).map(a => ({ front: a.statement, back: `Respuesta: ${a.expected}\n\n${a.feedback}`, conceptId: a.conceptId, origin: 'attempt', source: null, evidenceIds: [a.id] }));
}

export function assertAcyclic(rows: { id: string; prerequisiteIds: string[] }[]) {
  const indegree = new Map(rows.map(row => [row.id, row.prerequisiteIds.length]));
  const children = new Map<string, string[]>();
  for (const row of rows) for (const parent of row.prerequisiteIds) {
    if (!indegree.has(parent)) throw new Error('Hay un prerrequisito inexistente.');
    const targets = children.get(parent) ?? []; targets.push(row.id); children.set(parent, targets);
  }
  const queue = rows.filter(row => indegree.get(row.id) === 0).map(row => row.id);
  for (let index = 0; index < queue.length; index++) for (const child of children.get(queue[index]) ?? []) {
    const count = indegree.get(child)! - 1; indegree.set(child, count); if (!count) queue.push(child);
  }
  if (queue.length !== rows.length) throw new Error('Los prerrequisitos forman un ciclo.');
}
