import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type { ExtractedMaterial } from './importer.js';
const running = new Set<Worker>();

function extract(data: { path: string } | { name: string; bytes: Buffer }, signal?: AbortSignal): Promise<ExtractedMaterial> {
  signal?.throwIfAborted();
  if (running.size >= 2) return Promise.reject(new Error('Hay otras lecturas de materiales en curso. Espera a que terminen.'));
  const worker = new Worker(join(__dirname, 'import-worker.js'), { workerData: data, resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 } });
  running.add(worker);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: ExtractedMaterial) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      // The slot is released after termination, so cancellation cannot spawn unbounded workers.
      void worker.terminate().finally(() => running.delete(worker));
      if (error) reject(error); else resolve(result!);
    };
    const cancel = () => finish(new Error('Lectura cancelada.'));
    const timer = setTimeout(() => finish(new Error('La lectura ha superado 60 segundos. Prueba con un material más pequeño o guarda una nueva copia.')), 60000);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    worker.once('message', (message: { result?: ExtractedMaterial; error?: string }) => finish(message.error ? new Error(message.error) : undefined, message.result));
    worker.once('error', () => finish(new Error('No se pudo leer el material dentro de los límites de memoria. Guarda otra copia o divide el archivo.')));
    worker.once('exit', () => { running.delete(worker); if (!settled) finish(new Error('La lectura del material se interrumpió.')); });
  });
}
export const extractMaterialLocal = (path: string, signal?: AbortSignal) => extract({ path }, signal);
export const extractMaterialBufferLocal = (name: string, bytes: Buffer, signal?: AbortSignal) => extract({ name, bytes }, signal);
