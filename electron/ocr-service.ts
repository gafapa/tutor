import { utilityProcess, session, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import type { Store } from './store.js';
import { ocrOptions, validateCapture } from './ocr-validation.js';
import type { Capture, OcrDraft, OcrOptions, OcrProgress } from '../shared/ocr.js';

type Job = { progress: OcrProgress; controller: AbortController; child?: UtilityProcess };
export class OcrService {
  private job?: Job;
  private drafts = new Map<string, { capture: Capture; expires: number }>();
  constructor(private store: Store, private assets: string) {}
  progress(): OcrProgress | null { return this.job ? { ...this.job.progress } : null; }
  cancel(subjectId?: string) {
    if (!subjectId || this.job?.progress.subjectId === subjectId) this.job?.controller.abort();
    for (const [id, row] of this.drafts) if (!subjectId || row.capture.subjectId === subjectId) this.drafts.delete(id);
  }
  discard(ids: string[]) { for (const id of z.array(z.uuid()).max(10).parse(ids)) this.drafts.delete(id); }
  private prune() { for (const [id, row] of this.drafts) if (row.expires < Date.now()) this.drafts.delete(id); }
  async recognize(value: OcrOptions, select: () => Promise<string | undefined>): Promise<OcrDraft[]> {
    const options = ocrOptions.parse(value); this.store.requireSubject(options.subjectId); this.prune();
    if (this.store.hasActiveMock()) throw new Error('La captura estará disponible al terminar el simulacro.');
    if (this.job) throw new Error('Termina o cancela la lectura actual antes de iniciar otra.');
    if (this.drafts.size) throw new Error('Revisa o descarta las capturas pendientes antes de iniciar otra lectura.');
    const job: Job = { controller: new AbortController(), progress: { id: randomUUID(), subjectId: options.subjectId, name: '', page: 0, total: 0, fraction: 0, stage: 'selection' } }; this.job = job;
    const check = () => { if (job.controller.signal.aborted) throw new Error('Lectura cancelada. No se ha guardado ninguna captura.'); this.store.requireSubject(options.subjectId); if (this.store.hasActiveMock()) throw new Error('El contexto ha cambiado. Vuelve a abrir la captura.'); };
    let abortSelection: (() => void) | undefined;
    try {
      const cancelled = new Promise<never>((_resolve, reject) => { abortSelection = () => reject(new Error('Lectura cancelada. No se ha guardado ninguna captura.')); job.controller.signal.addEventListener('abort', abortSelection, { once: true }); });
      const path = await Promise.race([select(), cancelled]); check();
      job.controller.signal.removeEventListener('abort', abortSelection!);
      if (!path) return [];
      job.progress.stage = 'preparing';
      const captures = await this.read(job, path, options); check();
      if (!captures.length || captures.length > 10) throw new Error('El reconocimiento no devolvió páginas válidas.');
      for (let index = 0; index < captures.length; index++) {
        const capture = captures[index]; validateCapture(capture);
        if (capture.subjectId !== options.subjectId || capture.recognition.language !== options.language || capture.sourcePage !== (capture.sourceFormat === 'pdf' ? options.firstPage + index : 1) || capture.sourceFormat === 'pdf' && captures.length !== options.lastPage - options.firstPage + 1) throw new Error('Las páginas reconocidas no corresponden a la selección.');
      }
      const drafts = captures.map(capture => ({ draftId: randomUUID(), capture }));
      for (const draft of drafts) this.drafts.set(draft.draftId, { capture: draft.capture, expires: Date.now() + 20 * 60 * 1000 });
      setTimeout(() => this.prune(), 20 * 60 * 1000 + 100).unref();
      return drafts;
    } finally {
      if (abortSelection) job.controller.signal.removeEventListener('abort', abortSelection);
      if (this.job === job) this.job = undefined;
    }
  }
  commit(draftId: string, value: Parameters<Store['commitCapture']>[1]) {
    this.prune(); const row = this.drafts.get(z.uuid().parse(draftId));
    if (!row) throw new Error('La captura temporal ha caducado o se ha descartado. Selecciona el archivo de nuevo.');
    const result = this.store.commitCapture(row.capture, value); this.drafts.delete(draftId); return result;
  }
  private read(job: Job, path: string, options: OcrOptions): Promise<Capture[]> {
    const partition = `ocr-${job.progress.id}`, isolated = session.fromPartition(partition);
    isolated.setPermissionCheckHandler(() => false);
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'SystemDrive'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
    const child = utilityProcess.fork(join(__dirname, 'ocr-process.js'), [], { serviceName: 'Lectura local de documentos', env, execArgv: ['--max-old-space-size=512'], stdio: 'ignore', partition }); job.child = child;
    return new Promise((resolve, reject) => {
      let result: Capture[] | undefined, failure: Error | undefined, done = false;
      const stop = (error?: Error) => { if (done) return; if (error) failure ??= error; child.kill(); };
      const abort = () => stop(new Error('Lectura cancelada. No se ha guardado ninguna captura.'));
      const timeout = setTimeout(() => stop(new Error('La lectura ha superado cinco minutos. Prueba con menos páginas o recorta el ejercicio.')), 300000);
      const finish = () => {
        if (done) return; done = true; clearTimeout(timeout); job.controller.signal.removeEventListener('abort', abort);
        if (job.controller.signal.aborted) failure = new Error('Lectura cancelada. No se ha guardado ninguna captura.');
        if (failure || !result) reject(failure ?? new Error('El lector local se ha detenido. Prueba con una imagen más pequeña.')); else resolve(result);
      };
      job.controller.signal.addEventListener('abort', abort, { once: true });
      child.once('spawn', () => { if (job.controller.signal.aborted || failure) child.kill(); else child.postMessage({ path, options, assets: this.assets }); });
      child.on('message', message => {
        if (done || failure || job.controller.signal.aborted) return;
        if (message.progress) job.progress = { ...job.progress, ...message.progress, id: job.progress.id, subjectId: options.subjectId };
        else if (Array.isArray(message.captures)) { result = message.captures; stop(); }
        else if (typeof message.error === 'string') {
          const text = message.error;
          const known = /^(El PDF |La página |La imagen |Una imagen |Selecciona una imagen |La cabecera JPEG |Faltan recursos |El documento |El archivo |La lectura |Idioma OCR )/.test(text) && !/[\\/][A-Za-z]:|[A-Za-z]:[\\/]/.test(text);
          stop(new Error(known ? text.slice(0, 300) : 'No se pudo reconocer este documento. Prueba con una imagen nítida, un PDF sin contraseña o menos páginas.'));
        }
      });
      child.once('exit', finish);
      if (job.controller.signal.aborted) abort();
    });
  }
}
