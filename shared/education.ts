export type CurriculumKind = 'competency' | 'criterion' | 'content' | 'outcome';
export interface CurriculumItem {
  id: string; subjectId: string; kind: CurriculumKind; code: string; title: string; description: string;
  conceptIds: string[]; relatedIds: string[]; createdAt: string;
}
export type CurriculumInput = Omit<CurriculumItem, 'id' | 'createdAt'>;
export interface DidacticUnit {
  id: string; subjectId: string; title: string; objectives: string; position: number;
  startsOn: string | null; endsOn: string | null; status: 'pending' | 'current' | 'taught';
  prerequisiteIds: string[]; conceptIds: string[]; curriculumIds: string[]; materialIds: string[];
  createdAt: string;
}
export type UnitInput = Omit<DidacticUnit, 'id' | 'createdAt' | 'position'>;
export interface FlashcardSource {
  materialId: string; materialVersion: number; page: number; quote: string;
}
export interface Flashcard {
  id: string; subjectId: string; conceptId: string | null; front: string; back: string;
  origin: 'manual' | 'material' | 'attempt'; source: FlashcardSource | null;
  evidenceIds: string[]; approved: boolean; revision: number; createdAt: string;
}
export type FlashcardRevision = Omit<Flashcard, 'id' | 'approved'> & { id: string; cardId: string };
export type FlashcardInput = Pick<Flashcard, 'subjectId' | 'conceptId' | 'front' | 'back'>;
export type RecallRating = 'again' | 'hard' | 'good' | 'easy';
export interface CardReview {
  id: string; subjectId: string; cardId: string; revision: number; rating: RecallRating; createdAt: string;
}
export interface CardSchedule { cardId: string; dueDate: string; intervalDays: number; reviewCount: number; }
export interface PortfolioEntry {
  id: string; subjectId: string; title: string; kind: 'work' | 'project' | 'reflection' | 'attempt';
  content: string; reflection: string; conceptIds: string[]; evidenceIds: string[];
  automatic: boolean; createdAt: string;
}
export type PortfolioInput = Omit<PortfolioEntry, 'id' | 'createdAt' | 'automatic'>;
export interface EducationalEvent {
  id: string; subjectId?: string; type: string; createdAt: string; payload: Record<string, unknown>;
}
export interface EducationSnapshot {
  curriculum: CurriculumItem[]; units: DidacticUnit[]; flashcards: Flashcard[];
  cardReviews: CardReview[]; cardRevisions: FlashcardRevision[]; cardSchedules: CardSchedule[]; portfolio: PortfolioEntry[];
  events: EducationalEvent[];
}
export interface EducationAPI {
  saveCurriculum(input: CurriculumInput & { id?: string }): Promise<CurriculumItem>;
  deleteCurriculum(id: string): Promise<void>;
  saveUnit(input: UnitInput & { id?: string }): Promise<DidacticUnit>;
  reorderUnits(input: { subjectId: string; ids: string[] }): Promise<void>;
  deleteUnit(id: string): Promise<void>;
  createFlashcard(input: FlashcardInput): Promise<Flashcard>;
  generateFlashcards(input: { subjectId: string; materialId?: string; fromErrors?: boolean }): Promise<number>;
  approveFlashcard(input: { id: string; approved: boolean }): Promise<void>;
  editFlashcard(input: { id: string; front: string; back: string; conceptId: string | null }): Promise<void>;
  deleteFlashcard(id: string): Promise<void>;
  reviewFlashcard(input: { id: string; rating: RecallRating }): Promise<CardReview>;
  savePortfolio(input: PortfolioInput): Promise<PortfolioEntry>;
  deletePortfolio(id: string): Promise<void>;
}
