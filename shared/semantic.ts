import type { Attempt } from './types.js';

export type SearchKind = 'material' | 'attempt' | 'submission' | 'portfolio' | 'reflection';
export interface SemanticSearchInput {
  subjectId: string | null; query: string; scope: 'materials' | 'history' | 'all';
  conceptId: string | null; outcome: Attempt['outcome'] | 'all';
  since: string | null; until: string | null; order: 'relevance' | 'oldest' | 'newest'; page: number;
}
export interface SearchHit {
  key: string; subjectId: string; subjectName: string; kind: SearchKind; sourceId: string;
  title: string; field: string; page: number; version: number; createdAt: string;
  text: string; start: number; end: number; sourceHash: string;
  outcome: Attempt['outcome'] | null; origin: Attempt['source'] | null;
  conceptIds: string[]; match: 'text' | 'meaning' | 'both';
}
export interface SemanticSearchResult { hits: SearchHit[]; total: number; page: number; pages: number; searchedFragments: number; }
export interface SemanticProgress { subjectId: string | null; stage: 'preparing' | 'indexing' | 'searching'; current: number; total: number; }
export interface SemanticAPI {
  semanticSearch(input: SemanticSearchInput): Promise<SemanticSearchResult>;
  semanticProgress(): Promise<SemanticProgress | null>;
  cancelSemanticSearch(): Promise<void>;
}
