import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { z } from 'zod';
import type { LmsActivityData, LmsGradeData, LmsItem, LmsItemData, LmsLocalLinks, LmsScopes } from '../shared/lms.js';
import { cleanLmsUrl, moodlePlainText, normalizeMoodleUrl, unixDate } from './lms-utils.js';
import { extractMaterialBufferLocal } from './import-service.js';
import { MATERIAL_EXTENSIONS } from '../shared/materials.js';

export interface MoodleCredential { siteUrl: string; userId: number; token: string; }
export interface MoodleRow { remoteKey: string; data: LmsItemData; material?: { name: string; kind: string; text: string; pageCount: number }; cache?: Pick<LmsLocalLinks, 'resourceState' | 'resourceMessage' | 'etag'>; }
export interface MoodleBatch { rows: MoodleRow[]; scopes: LmsScopes; warnings: string[]; }
const READ_FUNCTIONS = new Set(['core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents', 'mod_assign_get_assignments', 'mod_assign_get_submission_status', 'gradereport_user_get_grade_items', 'mod_page_get_pages_by_courses']);
const pos = z.coerce.number().int().positive(), str = z.string().max(2000000), name = z.string().max(1000);
const siteSchema = z.object({ userid: pos, sitename: name, siteurl: z.string(), functions: z.array(z.object({ name: z.string() })).max(5000), downloadfiles: z.coerce.number().optional() });
const coursesSchema = z.array(z.object({ id: pos, fullname: name, shortname: name })).max(2000);
const modulesSchema = z.array(z.object({ id: pos, modules: z.array(z.object({ id: pos, name, modname: z.string().max(80), instance: z.coerce.number().optional(), url: z.string().optional(), description: str.optional(), uservisible: z.coerce.boolean().optional(), dates: z.array(z.object({ dataid: z.string(), timestamp: z.coerce.number() }).passthrough()).optional(), contents: z.array(z.object({ type: z.string(), filename: name, filepath: z.string().max(2000).optional(), fileurl: z.string().optional(), filesize: z.coerce.number().nonnegative().optional(), timemodified: z.coerce.number().optional() })).max(2000).optional() })).max(5000) })).max(1000);
function fields(value: unknown, key: string): unknown { return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined; }
function arr(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : []; }
function numberOrNull(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function editorText(plugins: unknown, names: string[]) { return arr(plugins).flatMap(plugin => arr(plugin.editorfields)).filter(e => names.includes(String(e.name))).map(e => String(e.text ?? '')).join('\n'); }
export class MoodleClient {
  private functions = new Set<string>();
  private canDownload = false;
  constructor(readonly credential: MoodleCredential, private signal: AbortSignal) {
    credential.siteUrl = normalizeMoodleUrl(credential.siteUrl);
    if (!credential.token || credential.token.length > 2048 || /[\s\u0000-\u001f]/.test(credential.token)) throw new Error('El token de Moodle no es válido.');
  }
  private redact(value: string) { return value.split(this.credential.token).join('[credencial omitida]'); }
  private plain(value: unknown) { return this.redact(moodlePlainText(str.parse(value ?? ''))); }
  private url(value: string) { return cleanLmsUrl(this.redact(value), this.credential.siteUrl); }
  private async response(url: string, body: URLSearchParams, limit: number, headers?: Record<string, string>) {
    const response = await fetch(url, { method: 'POST', body, headers, redirect: 'manual', signal: AbortSignal.any([this.signal, AbortSignal.timeout(60000)]) });
    if (response.status === 304) return { response, bytes: Buffer.alloc(0) };
    if (!response.ok) { await response.body?.cancel(); throw new Error('Moodle no pudo completar la solicitud. Comprueba la conexión y los permisos del servicio.'); }
    const size = Number(response.headers.get('content-length'));
    if (size > limit) { await response.body?.cancel(); throw new Error('El recurso de Moodle supera el límite de descarga.'); }
    const reader = response.body?.getReader(); if (!reader) throw new Error('Moodle devolvió una respuesta vacía.');
    let total = 0; const chunks: Buffer[] = [];
    try { while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > limit) throw new Error('El recurso de Moodle supera el límite de descarga.'); chunks.push(Buffer.from(value)); } }
    finally { await reader.cancel().catch(() => {}); }
    return { response, bytes: Buffer.concat(chunks) };
  }
  private async call(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!READ_FUNCTIONS.has(fn)) throw new Error('Esta operación no está permitida por el conector.');
    if (fn !== 'core_webservice_get_site_info' && !this.functions.has(fn)) throw new Error('El servicio de Moodle no permite consultar estos datos.');
    const body = new URLSearchParams({ wstoken: this.credential.token, wsfunction: fn, moodlewsrestformat: 'json' });
    const append = (key: string, value: unknown) => { if (Array.isArray(value)) value.forEach((v, i) => append(`${key}[${i}]`, v)); else body.set(key, String(value)); };
    for (const [key, value] of Object.entries(args)) append(key, value);
    const { bytes } = await this.response(this.credential.siteUrl + '/webservice/rest/server.php', body, 30 * 1024 * 1024);
    let result: unknown; try { result = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('La dirección no responde como un servicio REST de Moodle.'); }
    if (fields(result, 'exception')) {
      const code = fields(result, 'errorcode');
      if (['invalidtoken', 'accessexception', 'invalidrecord', 'requireloginerror'].includes(String(code))) throw new Error('Moodle ha rechazado el acceso. Revisa el token, la matrícula y los permisos del servicio.');
      throw new Error('Moodle no permite completar esta consulta. El historial anterior se conserva.');
    }
    return result;
  }
  async identify() {
    const site = siteSchema.parse(await this.call('core_webservice_get_site_info'));
    if (normalizeMoodleUrl(site.siteurl) !== this.credential.siteUrl) throw new Error('La dirección indicada no coincide con la dirección del sitio Moodle.');
    if (this.credential.userId && this.credential.userId !== site.userid) throw new Error('El token pertenece a otro usuario de Moodle.');
    this.credential.userId = site.userid; this.functions = new Set(site.functions.map(f => f.name)); this.canDownload = site.downloadfiles === 1;
    return { name: this.plain(site.sitename), canReadGrades: this.functions.has('gradereport_user_get_grade_items'), canReadSubmissions: this.functions.has('mod_assign_get_submission_status') };
  }
  async courses() { return coursesSchema.parse(await this.call('core_enrol_get_users_courses', { userid: this.credential.userId })).map(c => ({ id: c.id, name: this.plain(c.fullname), shortName: this.plain(c.shortname) })); }
  static async login(siteUrl: string, username: string, password: string, signal: AbortSignal): Promise<string> {
    const response = await fetch(normalizeMoodleUrl(siteUrl) + '/login/token.php', { method: 'POST', body: new URLSearchParams({ username, password, service: 'moodle_mobile_app' }), redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    if (!response.ok || Number(response.headers.get('content-length')) > 100000) { await response.body?.cancel(); throw new Error('Moodle no permite iniciar esta sesión. Puedes utilizar un token de servicio.'); }
    const reader = response.body?.getReader(); let text = ''; if (!reader) throw new Error('Moodle no respondió al inicio de sesión.');
    try { while (true) { const { value, done } = await reader.read(); if (done) break; text += Buffer.from(value).toString('utf8'); if (text.length > 100000) throw new Error('La respuesta de Moodle no es válida.'); } } finally { await reader.cancel().catch(() => {}); }
    let result: unknown; try { result = JSON.parse(text); } catch { throw new Error('Moodle no permite iniciar esta sesión. Puedes utilizar un token de servicio.'); }
    const token = fields(result, 'token'); if (typeof token !== 'string' || !token) throw new Error('Moodle ha rechazado el inicio de sesión. Comprueba tus datos o utiliza un token habilitado por el centro.'); return token;
  }
  async collect(courseId: number, previous: LmsItem[]): Promise<MoodleBatch> {
    await this.identify();
    if (!(await this.courses()).some(c => c.id === courseId)) throw new Error('Este usuario ya no tiene acceso al curso de Moodle.');
    const sections = modulesSchema.parse(await this.call('core_course_get_contents', { courseid: courseId }));
    const modules = sections.flatMap(s => s.modules).filter(m => m.uservisible !== false);
    const batch: MoodleBatch = { rows: [], scopes: { activities: 'ok', resources: 'ok', submissions: 'ok', grades: 'ok' }, warnings: [] };
    const warn = (scope: keyof LmsScopes, message: string, state: 'partial' | 'unavailable' = 'partial') => { batch.scopes[scope] = state; if (!batch.warnings.includes(message)) batch.warnings.push(message); };
    let assignments: Record<string, unknown>[] = [];
    try { const result = await this.call('mod_assign_get_assignments', { courseids: [courseId] }); assignments = arr(fields(result, 'courses')).flatMap(c => arr(c.assignments)); if (arr(fields(result, 'warnings')).length) warn('activities', 'Moodle no devolvió todas las tareas.'); }
    catch { this.signal.throwIfAborted(); warn('activities', 'No se pudieron consultar las fechas e instrucciones completas de las tareas.'); }
    const assignmentMap = new Map(assignments.map(a => [Number(a.cmid), a]));
    for (const module of modules.filter(m => !['resource', 'page', 'folder', 'url', 'label'].includes(m.modname))) {
      const assignment = assignmentMap.get(module.id);
      const data: LmsActivityData = { kind: 'activity', moduleId: module.id, assignmentId: module.modname === 'assign' && assignment ? pos.parse(assignment.id) : null, module: module.modname, title: this.plain(module.name), url: this.url(module.url ?? ''), instructions: this.plain(assignment?.intro ?? module.description ?? ''), dueAt: unixDate(assignment?.duedate ?? module.dates?.find(d => /duedate|timeclose/.test(d.dataid))?.timestamp) };
      if (data.assignmentId) {
        try {
          const status = await this.call('mod_assign_get_submission_status', { assignid: data.assignmentId, userid: this.credential.userId });
          const last = fields(status, 'lastattempt'); const submission = fields(last, 'teamsubmission') ?? fields(last, 'submission');
          if (submission) data.submission = { status: name.parse(fields(submission, 'status')), text: this.plain(editorText(fields(submission, 'plugins'), ['onlinetext'])), group: Boolean(fields(last, 'teamsubmission')), attempt: z.coerce.number().int().min(0).parse(fields(submission, 'attemptnumber') ?? 0), createdAt: unixDate(fields(submission, 'timecreated')), updatedAt: unixDate(fields(submission, 'timemodified')) }; else data.submission = null;
          data.submissionFeedback = this.plain(editorText(fields(fields(status, 'feedback'), 'plugins'), ['comments', 'feedback']));
          const extension = unixDate(fields(last, 'extensionduedate')); if (extension && (!data.dueAt || extension > data.dueAt)) data.dueAt = extension;
        } catch { this.signal.throwIfAborted(); warn('submissions', 'No se pudieron consultar algunas entregas o comentarios. Se conserva la última información disponible.'); }
      }
      batch.rows.push({ remoteKey: `activity:${module.id}`, data });
    }
    if (!this.functions.has('mod_assign_get_submission_status')) warn('submissions', 'El servicio no permite consultar entregas.', 'unavailable');
    let pages: Record<string, unknown>[] = [];
    if (modules.some(m => m.modname === 'page')) try { const response = await this.call('mod_page_get_pages_by_courses', { courseids: [courseId] }); pages = arr(fields(response, 'pages')); if (arr(fields(response, 'warnings')).length) warn('resources', 'Algunas páginas no están disponibles.'); } catch { this.signal.throwIfAborted(); warn('resources', 'No se pudo recuperar el contenido de algunas páginas.'); }
    let downloaded = 0;
    for (const module of modules) {
      if (module.modname === 'page') {
        const page = pages.find(p => Number(p.coursemodule) === module.id); const text = page ? this.plain(page.content) : '';
        batch.rows.push({ remoteKey: `page:${module.id}`, data: { kind: 'resource', moduleId: module.id, title: this.plain(module.name), filename: this.plain(module.name), url: this.url(module.url ?? ''), source: 'page', format: 'note', size: 0, modifiedAt: unixDate(page?.timemodified), contentHash: text ? createHash('sha256').update(text).digest('hex') : null }, ...(text ? { material: { name: this.plain(module.name), kind: 'note', text, pageCount: 1 } } : {}), cache: { resourceState: text ? 'ready' : 'unavailable', resourceMessage: text ? '' : 'Contenido de la página no disponible.', etag: null } });
      }
      for (const file of module.contents ?? []) {
        if (module.modname === 'page' && file.filename === 'index.html') continue;
        if (file.type !== 'file' || !file.fileurl) continue;
        const remoteKey = `file:${module.id}:${file.filepath ?? '/'}:${file.filename}`;
        const old = previous.find(item => item.remoteKey === remoteKey); const format = extname(file.filename).slice(1).toLowerCase();
        const row: MoodleRow = { remoteKey, data: { kind: 'resource', moduleId: module.id, title: this.plain(module.name), filename: this.plain(file.filename), url: this.url(file.fileurl), source: 'file', format, size: file.filesize ?? 0, modifiedAt: unixDate(file.timemodified), contentHash: null }, cache: { resourceState: 'pending', resourceMessage: '', etag: null } };
        batch.rows.push(row);
        if (old?.local.suppressed) { row.cache = old.local; continue; }
        if (!MATERIAL_EXTENSIONS.includes(format)) { row.cache!.resourceState = 'unsupported'; row.cache!.resourceMessage = 'Formato conservado como referencia. Su lectura todavía no está incluida.'; continue; }
        try {
          if (!this.canDownload) throw new Error('El servicio de Moodle no permite descargar archivos.');
          if (row.data.kind !== 'resource') throw new Error('Recurso incompatible.');
          if (row.data.size > 20 * 1024 * 1024 || downloaded + row.data.size > 100 * 1024 * 1024) throw new Error('Se ha alcanzado el límite de descarga de esta sincronización.');
          const url = new URL(file.fileurl); const base = new URL(this.credential.siteUrl);
          if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/')) throw new Error('El archivo está en otro servidor. No se le enviarán las credenciales.');
          url.search = ''; url.searchParams.set('forcedownload', '1'); url.hash = '';
          if (!url.pathname.includes('/webservice/pluginfile.php/')) url.pathname = url.pathname.replace(/\/pluginfile\.php\//, '/webservice/pluginfile.php/');
          if (!url.pathname.includes('/webservice/pluginfile.php/')) throw new Error('La ruta del archivo no es un servicio de descarga permitido.');
          const { bytes, response } = await this.response(url.href, new URLSearchParams({ token: this.credential.token }), Math.min(20 * 1024 * 1024, 100 * 1024 * 1024 - downloaded), old?.local.etag ? { 'If-None-Match': old.local.etag } : undefined);
          downloaded += bytes.length;
          if (response.status === 304) { if (!old || old.data.kind !== 'resource' || !old.local.materialIds.length) throw new Error('La copia del archivo ya no está disponible.'); row.data.contentHash = old.data.contentHash; row.cache = { resourceState: 'ready', resourceMessage: '', etag: old.local.etag }; continue; }
          row.data.contentHash = createHash('sha256').update(bytes).digest('hex');
          row.material = await extractMaterialBufferLocal(file.filename, bytes, this.signal); row.material.text = this.redact(row.material.text);
          row.cache = { resourceState: 'ready', resourceMessage: '', etag: response.headers.get('etag')?.slice(0, 1000) ?? null };
        } catch (error) { this.signal.throwIfAborted(); row.cache = { resourceState: old?.local.materialIds.length ? 'cached' : 'unavailable', resourceMessage: error instanceof Error && !/fetch|network|ECONN|ENOTFOUND/i.test(error.message) ? error.message.slice(0, 300) : 'No se pudo descargar el archivo. Comprueba la conexión.', etag: old?.local.etag ?? null }; warn('resources', 'Algunos archivos no se pudieron actualizar.'); }
      }
      if (module.modname === 'url') batch.rows.push({ remoteKey: `link:${module.id}`, data: { kind: 'resource', moduleId: module.id, title: this.plain(module.name), filename: '', url: this.url(module.url ?? ''), source: 'link', format: 'url', size: 0, modifiedAt: null, contentHash: null }, cache: { resourceState: 'unsupported', resourceMessage: 'Abre el enlace en Moodle para consultar este recurso.', etag: null } });
    }
    try {
      const grades = await this.call('gradereport_user_get_grade_items', { courseid: courseId, userid: this.credential.userId });
      if (arr(fields(grades, 'warnings')).length) warn('grades', 'Moodle no devolvió todas las notas.');
      for (const report of arr(fields(grades, 'usergrades'))) {
        if (Number(report.userid) !== this.credential.userId) throw new Error('Moodle devolvió un informe de otro usuario.');
        for (const grade of arr(report.gradeitems)) {
          const hidden = Boolean(grade.gradeishidden || grade.gradehiddenbydate);
          const data: LmsGradeData = { kind: 'grade', gradeItemId: pos.parse(grade.id), moduleId: grade.cmid ? pos.parse(grade.cmid) : null, title: this.plain(grade.itemname), module: String(grade.itemmodule ?? '').slice(0, 80), raw: hidden ? null : numberOrNull(grade.graderaw), min: numberOrNull(grade.grademin), max: numberOrNull(grade.grademax), formatted: hidden ? '' : this.plain(grade.gradeformatted), feedback: hidden ? '' : this.plain(grade.feedback), gradedAt: hidden ? null : unixDate(grade.gradedategraded), hidden };
          batch.rows.push({ remoteKey: `grade:${data.gradeItemId}`, data });
        }
      }
    } catch { this.signal.throwIfAborted(); warn('grades', 'No se pudieron consultar las notas. Se conserva la última información disponible.', 'unavailable'); }
    return batch;
  }
}
