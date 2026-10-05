import { utilityProcess, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { EmbeddingClient } from './semantic-search.js';
import { readVector } from './semantic-vectors.js';

export function openSemanticClient(assets: string, signal: AbortSignal): Promise<EmbeddingClient> {
  const partition = `semantic-${randomUUID()}`, isolated = session.fromPartition(partition);
  isolated.setPermissionCheckHandler(() => false);
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'SystemDrive'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
  const child = utilityProcess.fork(join(__dirname, 'semantic-process.js'), [], { serviceName: 'Búsqueda local de aprendizaje', env, execArgv: ['--max-old-space-size=768'], stdio: 'ignore', partition });
  let stopped = false, sequence = 0, exitResolve: () => void, failure: Error | undefined;
  const exited = new Promise<void>(resolve => { exitResolve = resolve; });
  let pending: { id: number; resolve: (vector: string) => void; reject: (error: Error) => void } | undefined;
  let readyResolve: (client: EmbeddingClient) => void, readyReject: (error: Error) => void;
  const ready = new Promise<EmbeddingClient>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let timer: ReturnType<typeof setTimeout>;
  const stop = (error?: Error) => {
    if (error) { failure ??= error; pending?.reject(error); pending = undefined; readyReject(error); }
    if (stopped) return; stopped = true; clearTimeout(timer); child.kill();
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => stop(new Error('La búsqueda ha tardado demasiado. Acota los filtros o vuelve a intentarlo.')), 120000); };
  const abort = () => stop(new Error('Búsqueda cancelada.')); signal.addEventListener('abort', abort, { once: true }); arm();
  const client: EmbeddingClient = {
    embed(text, mode) {
      if (stopped || signal.aborted) return Promise.reject(failure ?? new Error('Búsqueda cancelada.'));
      if (pending) return Promise.reject(new Error('Hay otro fragmento en curso.'));
      return new Promise((resolve, reject) => { pending = { id: ++sequence, resolve, reject }; arm(); child.postMessage({ id: sequence, text, mode }); });
    },
    async close() { stop(); await exited; }
  };
  child.once('spawn', () => { if (signal.aborted || stopped) { child.kill(); stop(new Error('Búsqueda cancelada.')); } else child.postMessage({ assets }); });
  child.on('message', message => {
    if (stopped || signal.aborted) return;
    if (message.ready === true) { clearTimeout(timer); readyResolve(client); }
    else if (typeof message.error === 'string') stop(new Error(/^No se pudo abrir el modelo/.test(message.error) ? 'No se pudo abrir el modelo de búsqueda local. Reinstala la app si el problema persiste.' : 'El buscador local se ha detenido. Inténtalo de nuevo.'));
    else if (pending && message.id === pending.id && typeof message.vector === 'string') {
      try { readVector(message.vector); const p = pending; pending = undefined; clearTimeout(timer); p.resolve(message.vector); }
      catch { stop(new Error('El modelo local ha devuelto un resultado no válido.')); }
    }
  });
  child.once('exit', () => { signal.removeEventListener('abort', abort); clearTimeout(timer); if (!stopped) stop(new Error('El buscador local se ha detenido. Inténtalo de nuevo.')); exitResolve(); });
  if (signal.aborted) abort();
  return ready.catch(async error => { await exited; throw error; });
}
