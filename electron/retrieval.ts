import type { Citation, Material } from '../shared/types.js';

const STOP = new Set('a al algo como con cual cuando de del el en es esta este esto hay la las lo los me mi para por que qué se si sin sobre su te tengo tu un una unos y yo puedes explicar explica'.split(' '));
export function tokens(text: string): string[] {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1 && !STOP.has(t));
}

export function retrieve(materials: Material[], subjectId: string, query: string, limit = 4): Citation[] {
  const terms = [...new Set(tokens(query))];
  if (!terms.length) return [];
  const candidates: { citation: Citation; score: number }[] = [];
  const group = (m: Material) => m.lms ? `lms:${m.lms.itemId}` : `manual:${m.name}`;
  const current = materials.filter(m => m.subjectId === subjectId && m.retrievalAvailable !== false).filter(m => !materials.some(newer => newer.subjectId === subjectId && group(newer) === group(m) && newer.version > m.version));
  for (const material of current) {
    const pages = material.text.split('\f');
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const text = pages[pageIndex];
      for (let offset = 0; offset < text.length; offset += 800) {
        const fragment = text.slice(offset, offset + 1000);
        const words = tokens(fragment);
        const score = terms.reduce((total, term) => total + words.filter(word => word === term || (term.length >= 5 && word.startsWith(term))).length, 0);
        if (score > 0) candidates.push({ score, citation: { materialId: material.id, name: material.name, page: pageIndex + 1, text: fragment } });
      }
    }
  }
  const selected = new Set<string>();
  return candidates.sort((a, b) => b.score - a.score).filter(candidate => {
    const key = `${candidate.citation.materialId}:${candidate.citation.page}`;
    if (selected.has(key)) return false;
    selected.add(key); return true;
  }).slice(0, limit).map(c => c.citation);
}
