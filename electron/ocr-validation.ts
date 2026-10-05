import { z } from 'zod';
import { createHash } from 'node:crypto';
import { imageDimensions } from './image-header.js';
import { MAX_CAPTURE_BYTES, MAX_CAPTURE_STORAGE, OCR_ASSETS, OCR_VERSION } from './ocr-config.js';
import type { Capture, CaptureReview } from '../shared/ocr.js';
import type { Attempt, Material } from '../shared/types.js';

const id = z.uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/), stamp = z.iso.datetime();
export const ocrOptions = z.object({ subjectId: id, language: z.enum(['spa', 'glg', 'eng', 'spa+eng']), firstPage: z.number().int().min(1).max(300), lastPage: z.number().int().min(1).max(300), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) }).strict().refine(value => value.lastPage >= value.firstPage && value.lastPage - value.firstPage < 10, 'Selecciona entre 1 y 10 páginas consecutivas.');
export const captureSource = z.object({ captureId: id, reviewId: id, sourceHash: hash, sourcePage: z.number().int().min(1).max(300), removed: z.literal(true).optional() }).strict();
export const captureRow = z.object({ id, subjectId: id, name: z.string().trim().min(1).max(120), sourceFormat: z.enum(['image', 'pdf']), sourcePage: z.number().int().min(1).max(300), sourceHash: hash,
  image: z.object({ mime: z.literal('image/jpeg'), base64: z.string().min(1).max(Math.ceil(MAX_CAPTURE_BYTES / 3) * 4), width: z.number().int().min(1).max(2400), height: z.number().int().min(1).max(2400), hash }).strict(),
  recognition: z.object({ engine: z.literal('tesseract-local'), version: z.literal(OCR_VERSION), language: z.enum(['spa', 'glg', 'eng', 'spa+eng']), modelHashes: z.array(hash).min(1).max(2), text: z.string().max(100000), confidence: z.number().min(0).max(100), words: z.array(z.object({ text: z.string().max(200), confidence: z.number().min(0).max(100), box: z.object({ x0: z.number().int().nonnegative(), y0: z.number().int().nonnegative(), x1: z.number().int().positive(), y1: z.number().int().positive() }).strict() }).strict()).max(10000) }).strict(), createdAt: stamp }).strict();
export const captureReviewRow = z.object({ id, subjectId: id, captureId: id, previousId: id.nullable(), text: z.string().trim().min(1).max(100000), confirmed: z.literal(true), createdAt: stamp }).strict();
export const ocrReviewInput = z.object({ text: z.string().trim().min(1).max(100000), confirmed: z.literal(true), destination: z.enum(['material', 'attempt']), name: z.string().trim().min(1).max(120), statement: z.string().max(10000), conceptId: id.nullable() }).strict().refine(value => value.destination !== 'attempt' || (Boolean(value.statement.trim()) && value.text.length <= 20000), 'Para registrar una resolución, escribe el enunciado y limita la respuesta a 20.000 caracteres.');
export function validateCapture(capture: Capture) {
  captureRow.parse(capture);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(capture.image.base64)) throw new Error('La imagen de la captura no es válida.');
  const bytes = Buffer.from(capture.image.base64, 'base64');
  if (bytes.length > MAX_CAPTURE_BYTES || bytes.toString('base64') !== capture.image.base64 || createHash('sha256').update(bytes).digest('hex') !== capture.image.hash) throw new Error('La imagen de la captura no coincide con su comprobación.');
  const dimensions = imageDimensions(bytes);
  if (dimensions.format !== 'jpeg' || dimensions.width !== capture.image.width || dimensions.height !== capture.image.height || dimensions.width * dimensions.height > 4000000 || capture.sourceFormat === 'image' && capture.sourcePage !== 1) throw new Error('Las dimensiones o la página de la captura no coinciden.');
  for (const word of capture.recognition.words) if (word.box.x1 <= word.box.x0 || word.box.y1 <= word.box.y0 || word.box.x1 > dimensions.width || word.box.y1 > dimensions.height) throw new Error('La captura contiene posiciones de texto no válidas.');
  const expected = capture.recognition.language.split('+').map(language => OCR_ASSETS.find(asset => asset.name === language + '.traineddata')!.sha256);
  if (JSON.stringify(expected) !== JSON.stringify(capture.recognition.modelHashes)) throw new Error('Los modelos del reconocimiento no coinciden con el idioma indicado.');
}
export function validateCaptureTables(tables: { captures: Capture[]; capture_reviews: CaptureReview[]; materials: Material[]; attempts: Attempt[] }) {
  const captures = new Map(tables.captures.map(row => [row.id, row])), reviews = new Map(tables.capture_reviews.map(row => [row.id, row]));
  let bytes = 0; for (const capture of captures.values()) { validateCapture(capture); bytes += Buffer.from(capture.image.base64, 'base64').length; }
  if (bytes > MAX_CAPTURE_STORAGE) throw new Error('Las imágenes guardadas superan el límite local de 24 MB.');
  const branches = new Set<string>();
  for (const review of tables.capture_reviews) {
    const capture = captures.get(review.captureId), previous = review.previousId ? reviews.get(review.previousId) : null;
    if (!capture || capture.subjectId !== review.subjectId || capture.createdAt > review.createdAt) throw new Error('La revisión no corresponde a su captura.');
    if (review.previousId && (!previous || previous.captureId !== review.captureId || previous.subjectId !== review.subjectId || previous.createdAt > review.createdAt)) throw new Error('La revisión anterior de la captura no es válida.');
    const branch = `${review.captureId}:${review.previousId ?? 'first'}`; if (branches.has(branch)) throw new Error('Las revisiones de una captura no pueden formar ramas.'); branches.add(branch);
    const seen = new Set([review.id]); let parent = previous;
    while (parent) { if (seen.has(parent.id)) throw new Error('Las revisiones de la captura forman un ciclo.'); seen.add(parent.id); parent = parent.previousId ? reviews.get(parent.previousId) : null; }
  }
  for (const capture of captures.values()) if (!tables.capture_reviews.some(review => review.captureId === capture.id && !review.previousId)) throw new Error('La captura no tiene una primera revisión confirmada.');
  for (const row of [...tables.materials, ...tables.attempts]) {
    const source = row.ocrSource; if (!source) continue;
    if ('answer' in row && (row.source !== 'self' || row.outcome !== 'ungraded')) throw new Error('Una captura revisada debe permanecer como trabajo sin corregir.');
    if (source.removed) { if (captures.has(source.captureId) || reviews.has(source.reviewId)) throw new Error('Una imagen eliminada sigue presente en la copia.'); continue; }
    const capture = captures.get(source.captureId), review = reviews.get(source.reviewId);
    if (!capture || !review || review.captureId !== capture.id || capture.subjectId !== row.subjectId || review.subjectId !== row.subjectId || review.createdAt > row.createdAt || source.sourceHash !== capture.sourceHash || source.sourcePage !== capture.sourcePage) throw new Error('El trabajo no corresponde a su captura revisada.');
    const text = 'answer' in row ? row.answer : row.text;
    if (text !== review.text || 'answer' in row && (row.source !== 'self' || row.outcome !== 'ungraded')) throw new Error('El texto reconocido no puede crear una corrección o una evidencia de dominio.');
  }
}
