export type OcrLanguage = 'spa' | 'glg' | 'eng' | 'spa+eng';
export interface OcrOptions { subjectId: string; language: OcrLanguage; firstPage: number; lastPage: number; rotation: 0 | 90 | 180 | 270; }
export interface OcrWord { text: string; confidence: number; box: { x0: number; y0: number; x1: number; y1: number }; }
export interface Capture {
  id: string; subjectId: string; name: string; sourceFormat: 'image' | 'pdf'; sourcePage: number; sourceHash: string;
  image: { mime: 'image/jpeg'; base64: string; width: number; height: number; hash: string };
  recognition: { engine: 'tesseract-local'; version: string; language: OcrLanguage; modelHashes: string[]; text: string; confidence: number; words: OcrWord[] };
  createdAt: string;
}
export interface CaptureReview { id: string; subjectId: string; captureId: string; previousId: string | null; text: string; confirmed: true; createdAt: string; }
export interface CaptureSource { captureId: string; reviewId: string; sourceHash: string; sourcePage: number; removed?: true; }
export interface CaptureSummary { id: string; subjectId: string; name: string; sourceFormat: 'image' | 'pdf'; sourcePage: number; width: number; height: number; confidence: number; createdAt: string; }
export interface CaptureReviewSummary { id: string; subjectId: string; captureId: string; previousId: string | null; createdAt: string; }
export interface OcrDraft { draftId: string; capture: Capture; }
export interface OcrProgress { id: string; subjectId: string; name: string; page: number; total: number; fraction: number; stage: 'selection' | 'preparing' | 'reading' | 'recognizing'; }
export interface OcrReviewInput {
  text: string; confirmed: true; destination: 'material' | 'attempt'; name: string; statement: string; conceptId: string | null;
}
export interface OcrSnapshot { captures: CaptureSummary[]; captureReviews: CaptureReviewSummary[]; }
export interface OcrAPI {
  recognizeDocument(input: OcrOptions): Promise<OcrDraft[]>;
  ocrProgress(): Promise<OcrProgress | null>;
  cancelOcr(): Promise<void>;
  discardOcrDrafts(ids: string[]): Promise<void>;
  commitOcrDraft(input: OcrReviewInput & { draftId: string }): Promise<{ captureId: string; reviewId: string; duplicate: boolean }>;
  captureData(id: string): Promise<{ capture: Capture; reviews: CaptureReview[] }>;
  reviewCapture(input: OcrReviewInput & { captureId: string; previousId: string }): Promise<CaptureReview>;
  deleteCapture(id: string): Promise<void>;
}
