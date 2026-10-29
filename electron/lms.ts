import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LmsConnection, LmsDiscovery, LmsSyncRun } from '../shared/lms.js';
import { credentialFingerprint, normalizeMoodleUrl, shortLmsTitle } from './lms-utils.js';
import { MoodleClient, type MoodleCredential } from './moodle.js';
import { LmsCredentials } from './lms-credentials.js';
import { Store } from './store.js';
const autoMinutes = z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]);
export const moodleDiscoveryInput = z.object({ siteUrl: z.string().min(1).max(2000), token: z.string().max(2048).optional(), username: z.string().max(200).optional(), password: z.string().max(1000).optional() }).strict();
export const moodleConnectInput = z.object({ subjectId: z.uuid(), discoveryId: z.uuid(), courseId: z.number().int().positive(), autoMinutes }).strict();
export const moodleCoursesInput = z.object({ discoveryId: z.uuid(), autoMinutes, courses: z.array(z.object({ courseId: z.number().int().positive(), subjectId: z.uuid().optional(), subjectName: z.string().trim().min(1).max(120).optional() }).strict().refine(row => !(row.subjectId && row.subjectName), 'Elige una asignatura existente o crea una nueva.')).min(1).max(30) }).strict();
export const moodleConfigurationInput = z.object({ connectionId: z.uuid(), autoMinutes, enabled: z.boolean() }).strict();
export class Lms {
  private discoveries = new Map<string, { public: LmsDiscovery; credential: MoodleCredential }>();
  private discoveriesRunning = new Set<AbortController>();
  private jobs = new Map<string, AbortController>();
  private generation = 0;
  private timer: ReturnType<typeof setInterval>;
  private lastAutomatic = new Map<string, number>();
  constructor(private store: Store, private credentials: LmsCredentials) {
    credentials.prune(store.snapshot().lmsConnections.map(c => c.id));
    this.timer = setInterval(() => { this.automatic(); }, 60000); this.timer.unref();
  }
  async discover(value: unknown): Promise<LmsDiscovery> {
    const input = moodleDiscoveryInput.parse(value), siteUrl = normalizeMoodleUrl(input.siteUrl), controller = new AbortController(); this.discoveriesRunning.add(controller);
    const generation = this.generation;
    try {
      const token = input.token?.trim() || (input.username && input.password ? await MoodleClient.login(siteUrl, input.username.trim(), input.password, controller.signal) : '');
      if (!token) throw new Error('Introduce un token o tus datos de acceso de Moodle.');
      const credential = { siteUrl, userId: 0, token }; const client = new MoodleClient(credential, controller.signal);
      const site = await client.identify(), courses = await client.courses();
      controller.signal.throwIfAborted(); if (generation !== this.generation) throw new Error('La conexión se ha cancelado.');
      const publicData: LmsDiscovery = { id: randomUUID(), siteUrl, siteName: site.name, expiresAt: new Date(Date.now() + 10 * 60000).toISOString(), courses, canReadGrades: site.canReadGrades, canReadSubmissions: site.canReadSubmissions };
      for (const [id, row] of this.discoveries) if (Date.parse(row.public.expiresAt) < Date.now()) this.discoveries.delete(id);
      this.discoveries.set(publicData.id, { public: publicData, credential }); return publicData;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('La conexión se ha cancelado.');
      if (error instanceof Error && error.message.startsWith('Moodle')) throw error;
      throw new Error('No se pudo conectar a Moodle. Revisa la dirección, la conexión y el acceso al servicio REST.');
    } finally { this.discoveriesRunning.delete(controller); }
  }
  connect(value: unknown): LmsConnection {
    const input = moodleConnectInput.parse(value); this.store.requireSubject(input.subjectId);
    const discovery = this.discoveries.get(input.discoveryId);
    if (!discovery || Date.parse(discovery.public.expiresAt) < Date.now()) throw new Error('La selección ha caducado. Vuelve a consultar tus cursos.');
    const course = discovery.public.courses.find(c => c.id === input.courseId); if (!course) throw new Error('Selecciona un curso al que tengas acceso.');
    const previous = this.store.snapshot().lmsConnections.find(c => c.subjectId === input.subjectId && c.siteUrl === discovery.public.siteUrl && c.courseId === course.id);
    const salt = previous?.accountSalt ?? randomUUID(); const fingerprint = credentialFingerprint(discovery.public.siteUrl, discovery.credential.userId, salt);
    if (previous && previous.accountFingerprint !== fingerprint) throw new Error('Este curso está vinculado a otro usuario. Borra antes sus datos importados para evitar mezclar historiales.');
    const connection: LmsConnection = { id: previous?.id ?? randomUUID(), subjectId: input.subjectId, provider: 'moodle', siteUrl: discovery.public.siteUrl, siteName: discovery.public.siteName, courseId: course.id, courseName: course.name, accountSalt: salt, accountFingerprint: fingerprint, enabled: true, autoMinutes: input.autoMinutes, createdAt: previous?.createdAt ?? new Date().toISOString(), lastSyncAt: previous?.lastSyncAt ?? null };
    this.credentials.set(connection.id, discovery.credential);
    try { this.store.saveLmsConnection(connection); } catch (error) { if (!previous) this.credentials.remove(connection.id); throw error; }
    this.discoveries.delete(input.discoveryId); return { ...connection, hasCredentials: true };
  }
  connections() { return this.store.rendererSnapshot().lmsConnections.map(c => ({ ...c, hasCredentials: Boolean(this.credentials.get(c.id)), syncing: this.jobs.has(c.id) })); }
  connectCourses(value: unknown): LmsConnection[] {
    if (this.store.hasActiveMock()) throw new Error('La conexión estará disponible al terminar el simulacro.');
    const input = moodleCoursesInput.parse(value), discovery = this.discoveries.get(input.discoveryId);
    if (!discovery || Date.parse(discovery.public.expiresAt) < Date.now()) throw new Error('La selección ha caducado. Vuelve a consultar tus cursos.');
    if (new Set(input.courses.map(course => course.courseId)).size !== input.courses.length) throw new Error('Selecciona cada curso una sola vez.');
    const snapshot = this.store.snapshot(), subjects: {id: string; name: string}[] = [], targets = new Set<string>();
    const connections = input.courses.map(selection => {
      const course = discovery.public.courses.find(row => row.id === selection.courseId);
      if (!course) throw new Error('Uno de los cursos no está disponible en esta selección.');
      const existing = snapshot.lmsConnections.filter(row => row.siteUrl === discovery.public.siteUrl && row.courseId === course.id);
      if (existing.some(row => row.subjectId !== selection.subjectId)) throw new Error('Un curso ya tiene una asignatura local. Selecciona esa asignatura para reconectarlo.');
      const subjectId = selection.subjectId ?? randomUUID();
      if (targets.has(subjectId)) throw new Error('Cada curso debe tener una asignatura diferente.');
      targets.add(subjectId);
      if (selection.subjectId) {
        this.store.requireSubject(subjectId);
        if (snapshot.lmsConnections.some(row => row.subjectId === subjectId && (row.siteUrl !== discovery.public.siteUrl || row.courseId !== course.id))) throw new Error('Esta asignatura ya corresponde a otro curso. Elige otra o crea una nueva.');
      } else subjects.push({ id: subjectId, name: selection.subjectName ?? shortLmsTitle(course.name) });
      const previous = existing.find(row => row.subjectId === subjectId);
      if (previous && this.jobs.has(previous.id)) throw new Error('Espera a que termine la actualización del curso antes de reconectarlo.');
      const salt = previous?.accountSalt ?? randomUUID(), fingerprint = credentialFingerprint(discovery.public.siteUrl, discovery.credential.userId, salt);
      if (previous && previous.accountFingerprint !== fingerprint) throw new Error('Este curso está vinculado a otro usuario. No se pueden mezclar sus historiales.');
      return { id: previous?.id ?? randomUUID(), subjectId, provider: 'moodle' as const, siteUrl: discovery.public.siteUrl, siteName: discovery.public.siteName, courseId: course.id, courseName: course.name, accountSalt: salt, accountFingerprint: fingerprint, enabled: true, autoMinutes: input.autoMinutes, createdAt: previous?.createdAt ?? new Date().toISOString(), lastSyncAt: previous?.lastSyncAt ?? null };
    });
    const before = connections.map(connection => ({ connectionId: connection.id, value: this.credentials.get(connection.id) }));
    this.credentials.updateMany(connections.map(connection => ({ connectionId: connection.id, value: discovery.credential })));
    try { this.store.saveMoodleSetup(subjects, connections); }
    catch (error) {
      try { this.credentials.updateMany(before); }
      catch { throw new Error('No se guardaron las asignaturas. No se pudo restaurar el acceso anterior a Moodle; vuelve a conectar los cursos afectados.'); }
      throw error;
    }
    this.discoveries.delete(input.discoveryId);
    for (const connection of connections) this.lastAutomatic.set(connection.id, Date.now());
    return connections.map(connection => ({ ...connection, hasCredentials: true }));
  }
  forgetDiscovery(id: string) { this.discoveries.delete(id); }
  async sync(connectionId: string, trigger: LmsSyncRun['trigger'] = 'manual'): Promise<LmsSyncRun> {
    const connection = this.store.requireLmsConnection(connectionId); if (this.jobs.has(connectionId)) throw new Error('Este curso ya se está sincronizando.');
    if (this.store.hasActiveMock()) throw new Error('La sincronización estará disponible al terminar el simulacro.');
    const credential = this.credentials.get(connectionId); if (!credential) throw new Error('Vuelve a conectar este curso. Las copias del historial no incluyen credenciales.');
    if (credentialFingerprint(connection.siteUrl, credential.userId, connection.accountSalt) !== connection.accountFingerprint) throw new Error('Las credenciales no corresponden al historial de este usuario.');
    const controller = new AbortController(), generation = this.generation, startedAt = new Date().toISOString(); this.jobs.set(connectionId, controller);
    const deadline = setTimeout(() => controller.abort(), 5 * 60000); deadline.unref();
    try {
      const batch = await new MoodleClient(credential, controller.signal).collect(connection.courseId, this.store.snapshot().lmsItems.filter(i => i.connectionId === connectionId));
      controller.signal.throwIfAborted(); if (generation !== this.generation || this.store.hasActiveMock()) throw new Error('La sincronización se ha cancelado.');
      return this.store.applyMoodleBatch(connectionId, batch, { startedAt, trigger });
    } catch {
      if (generation !== this.generation || this.store.hasActiveMock() || !this.store.snapshot().lmsConnections.some(c => c.id === connectionId)) throw new Error('La sincronización se ha cancelado.');
      return this.store.recordLmsRun({ id: randomUUID(), subjectId: connection.subjectId, connectionId, trigger, startedAt, completedAt: new Date(Math.max(Date.now(), Date.parse(startedAt))).toISOString(), status: controller.signal.aborted ? 'cancelled' : 'failed', scopes: { activities: 'unavailable', resources: 'unavailable', submissions: 'unavailable', grades: 'unavailable' }, changes: [], unchanged: 0, warnings: [], message: controller.signal.aborted ? 'Sincronización cancelada. Se conserva la última copia disponible.' : 'No se pudo sincronizar. Comprueba la conexión, las credenciales y los permisos de Moodle. Se conserva la última copia disponible.' });
    } finally { clearTimeout(deadline); if (this.jobs.get(connectionId) === controller) this.jobs.delete(connectionId); }
  }
  cancel(id: string) { this.jobs.get(id)?.abort(); }
  cancelAll() { this.generation++; for (const job of this.jobs.values()) job.abort(); for (const job of this.discoveriesRunning) job.abort(); this.discoveries.clear(); }
  configure(value: unknown) { const input = moodleConfigurationInput.parse(value), connection = this.store.requireLmsConnection(input.connectionId); if (!input.enabled) this.cancel(connection.id); this.store.saveLmsConnection({ ...connection, autoMinutes: input.autoMinutes, enabled: input.enabled }); }
  disconnect(id: string) { const connection = this.store.requireLmsConnection(id); this.cancel(id); this.credentials.remove(id); this.store.saveLmsConnection({ ...connection, enabled: false, autoMinutes: 0 }); }
  clear(id: string) { this.cancel(id); this.credentials.remove(id); this.store.clearLmsData(id); }
  forgetDeleted() { this.credentials.prune(this.store.snapshot().lmsConnections.map(c => c.id)); }
  restored() { this.cancelAll(); this.credentials.clear(); }
  private automatic() {
    for (const [id, row] of this.discoveries) if (Date.parse(row.public.expiresAt) < Date.now()) this.discoveries.delete(id);
    if (this.store.hasActiveMock()) return;
    for (const connection of this.store.snapshot().lmsConnections) {
      if (!connection.enabled || !connection.autoMinutes || !this.credentials.get(connection.id) || this.jobs.has(connection.id)) continue;
      const last = Math.max(this.lastAutomatic.get(connection.id) ?? 0, Date.parse(connection.lastSyncAt ?? '') || 0);
      if (Date.now() - last < connection.autoMinutes * 60000) continue;
      this.lastAutomatic.set(connection.id, Date.now()); void this.sync(connection.id, 'automatic').catch(() => {});
    }
  }
  close() { clearInterval(this.timer); this.cancelAll(); }
}
