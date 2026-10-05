import { SEMANTIC_MODEL } from './semantic-config.js';

export function normalizeVector(vector: number[]): number[] {
  if (vector.length !== SEMANTIC_MODEL.dimensions || vector.some(value => !Number.isFinite(value))) throw new Error('El lector semántico devolvió un vector no válido.');
  const norm = Math.hypot(...vector); if (!norm) throw new Error('El lector semántico devolvió un vector vacío.'); return vector.map(value => value / norm);
}
export function vectorCode(vector: number[]): string {
  const normalized = normalizeVector(vector), bytes = Buffer.alloc(normalized.length * 4); normalized.forEach((value, index) => bytes.writeFloatLE(value, index * 4)); return bytes.toString('base64');
}
export function readVector(code: string): number[] {
  const bytes = Buffer.from(code, 'base64'); if (bytes.length !== SEMANTIC_MODEL.dimensions * 4 || bytes.toString('base64') !== code) throw new Error('El índice de búsqueda contiene un vector no válido.');
  const vector = Array.from({ length: SEMANTIC_MODEL.dimensions }, (_, index) => bytes.readFloatLE(index * 4));
  if (vector.some(value => !Number.isFinite(value)) || Math.abs(Math.hypot(...vector) - 1) > 0.002) throw new Error('El índice de búsqueda contiene un vector no normalizado.'); return vector;
}
export function cosine(first: number[], second: number[]): number { if (first.length !== second.length) throw new Error('Los vectores no tienen la misma dimensión.'); return first.reduce((sum, value, index) => sum + value * second[index], 0); }
