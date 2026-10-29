import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PortfolioEntry } from '../shared/education.js';

export function portfolioTaskHash(source: Pick<PortfolioEntry, 'title' | 'content' | 'reflection' | 'createdAt'>): string {
  return createHash('sha256').update(JSON.stringify([source.title, source.content, source.reflection, source.createdAt])).digest('hex');
}
export const portfolioTaskSourceRow = z.object({
  entryId: z.uuid().nullable(), title: z.string().min(1).max(120), content: z.string().min(1).max(50000),
  reflection: z.string().max(10000), createdAt: z.iso.datetime(), hash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict().refine(source => portfolioTaskHash(source) === source.hash, 'La copia de origen de la tarea no coincide con su huella.');
