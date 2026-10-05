import { z } from 'zod';
import { cleanLmsUrl, normalizeMoodleUrl } from './lms-utils.js';
import type { LmsConnection, LmsItem, LmsItemVersion, LmsSyncRun } from '../shared/lms.js';
import type { Material, StudyTask } from '../shared/types.js';
const id = z.uuid(), stamp = z.iso.datetime(), hash = z.string().regex(/^[a-f0-9]{64}$/), pos = z.number().int().positive(), text = z.string().max(2000000), title = z.string().max(1000);
const publicUrl = z.string().max(4000).refine(value => !value || cleanLmsUrl(value, 'https://invalid.example') === value, 'La URL contiene datos de acceso o no es válida.');
export const lmsSourceRow = z.object({ connectionId: id, itemId: id }).strict();
export const lmsTaskSourceRow = lmsSourceRow.extend({ titleOverridden: z.boolean(), dateOverridden: z.boolean(), statusOverridden: z.boolean() });
export const lmsConnectionRow = z.object({ id, subjectId: id, provider: z.literal('moodle'), siteUrl: z.string().max(2000).refine(v => { try { return normalizeMoodleUrl(v) === v; } catch { return false; } }), siteName: title, courseId: pos, courseName: title, accountSalt: id, accountFingerprint: hash, enabled: z.boolean(), autoMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]), createdAt: stamp, lastSyncAt: stamp.nullable() }).strict();
const activity = z.object({ kind: z.literal('activity'), moduleId: pos, assignmentId: pos.nullable(), module: z.string().max(80), title, url: publicUrl, instructions: text, dueAt: stamp.nullable(), submission: z.object({ status: title, text, group: z.boolean(), attempt: z.number().int().nonnegative(), createdAt: stamp.nullable(), updatedAt: stamp.nullable() }).nullable().optional(), submissionFeedback: text.optional() }).strict();
const resource = z.object({ kind: z.literal('resource'), moduleId: pos, title, filename: title, url: publicUrl, source: z.enum(['file', 'page', 'link']), format: z.string().max(80), size: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER), modifiedAt: stamp.nullable(), contentHash: hash.nullable() }).strict();
const grade = z.object({ kind: z.literal('grade'), gradeItemId: pos, moduleId: pos.nullable(), title, module: z.string().max(80), raw: z.number().nullable(), min: z.number().nullable(), max: z.number().nullable(), formatted: text, feedback: text, gradedAt: stamp.nullable(), hidden: z.boolean() }).strict().refine(g => !g.hidden || (g.raw === null && !g.formatted && !g.feedback && g.gradedAt === null), 'La copia contiene una nota oculta.');
const data = z.discriminatedUnion('kind', [activity, resource, grade]);
const core = { id, subjectId: id, connectionId: id, remoteKey: z.string().min(1).max(4000), revision: pos, active: z.boolean(), data, createdAt: stamp, updatedAt: stamp };
export const lmsItemRow = z.object({ ...core, local: z.object({ taskId: id.nullable(), materialIds: z.array(id).max(2000), suppressed: z.boolean(), resourceState: z.enum(['ready', 'cached', 'pending', 'unsupported', 'unavailable']), resourceMessage: z.string().max(1000), etag: z.string().max(1000).nullable() }).strict() }).strict();
export const lmsVersionRow = z.object({ ...core, itemId: id }).strict();
export const lmsScopesRow = z.object({ activities: z.enum(['ok', 'partial', 'unavailable']), resources: z.enum(['ok', 'partial', 'unavailable']), submissions: z.enum(['ok', 'partial', 'unavailable']), grades: z.enum(['ok', 'partial', 'unavailable']) }).strict();
export const lmsRunRow = z.object({ id, subjectId: id, connectionId: id, trigger: z.enum(['manual', 'automatic']), status: z.enum(['success', 'partial', 'failed', 'cancelled']), scopes: lmsScopesRow, startedAt: stamp, completedAt: stamp, changes: z.array(z.object({ itemId: id, kind: z.enum(['added', 'updated', 'withdrawn', 'restored']), title, fromRevision: pos.nullable(), toRevision: pos }).strict()).max(50000), unchanged: z.number().int().nonnegative(), warnings: z.array(z.string().max(1000)).max(100), message: z.string().max(1000) }).strict();
export function validateLmsTables(tables: { lms_connections: LmsConnection[]; lms_items: LmsItem[]; lms_versions: LmsItemVersion[]; lms_runs: LmsSyncRun[]; materials: Material[]; tasks: StudyTask[] }) {
  const connections = new Map(tables.lms_connections.map(c => [c.id, c])), items = new Map(tables.lms_items.map(i => [i.id, i]));
  const materials = new Map(tables.materials.map(m => [m.id, m])), tasks = new Map(tables.tasks.map(t => [t.id, t]));
  const keys = new Set<string>();
  const compatible = (row: { connectionId: string; subjectId: string }) => { if (connections.get(row.connectionId)?.subjectId !== row.subjectId) throw new Error('La copia contiene una referencia Moodle de otra asignatura.'); };
  for (const item of tables.lms_items) {
    compatible(item); const key = item.connectionId + ':' + item.remoteKey; if (keys.has(key)) throw new Error('La copia contiene un recurso Moodle duplicado.'); keys.add(key);
    if (item.updatedAt < item.createdAt || new Set(item.local.materialIds).size !== item.local.materialIds.length) throw new Error('El historial Moodle no es válido.');
    if (item.local.taskId && (item.data.kind !== 'activity' || tasks.get(item.local.taskId)?.lms?.itemId !== item.id || tasks.get(item.local.taskId)?.subjectId !== item.subjectId)) throw new Error('La copia contiene una tarea Moodle incompatible.');
    for (const id of item.local.materialIds) { const m = materials.get(id); if (item.data.kind !== 'resource' || m?.subjectId !== item.subjectId || m.lms?.itemId !== item.id || m.lms.connectionId !== item.connectionId) throw new Error('La copia contiene un material Moodle incompatible.'); }
    const versions = tables.lms_versions.filter(v => v.itemId === item.id).sort((a, b) => a.revision - b.revision);
    if (versions.length !== item.revision || versions.some((v, i) => v.revision !== i + 1 || v.connectionId !== item.connectionId || v.subjectId !== item.subjectId || v.remoteKey !== item.remoteKey || v.createdAt !== item.createdAt || v.updatedAt < v.createdAt || (i > 0 && v.updatedAt < versions[i - 1].updatedAt))) throw new Error('La copia contiene versiones Moodle incompatibles.');
    const latest = versions.at(-1)!; if (latest.active !== item.active || latest.updatedAt !== item.updatedAt || JSON.stringify(latest.data) !== JSON.stringify(item.data)) throw new Error('El recurso Moodle no coincide con su última versión.');
  }
  for (const row of tables.lms_versions) if (!items.has(row.itemId)) throw new Error('La copia contiene una versión Moodle sin recurso.');
  for (const row of [...tables.materials, ...tables.tasks]) if (row.lms) { const item = items.get(row.lms.itemId); if (item?.subjectId !== row.subjectId || item.connectionId !== row.lms.connectionId) throw new Error('La copia contiene un vínculo Moodle incompatible.'); if ('pageCount' in row ? !item.local.materialIds.includes(row.id) : item.local.taskId !== row.id) throw new Error('La copia contiene un vínculo Moodle sin referencia.'); }
  for (const run of tables.lms_runs) {
    compatible(run); if (run.completedAt < run.startedAt) throw new Error('La sincronización tiene fechas incompatibles.');
    for (const change of run.changes) { const item = items.get(change.itemId); if (item?.connectionId !== run.connectionId || !tables.lms_versions.some(v => v.itemId === change.itemId && v.revision === change.toRevision) || (change.fromRevision !== null && change.toRevision !== change.fromRevision + 1) || (change.kind === 'added' && (change.fromRevision !== null || change.toRevision !== 1))) throw new Error('La copia contiene un cambio Moodle incompatible.'); }
  }
}
