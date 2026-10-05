import { parentPort, workerData } from 'node:worker_threads';
import { extractMaterial, extractMaterialBuffer } from './importer.js';

void (async () => { try {
  const result = workerData.path ? await extractMaterial(workerData.path) : await extractMaterialBuffer(workerData.name, Buffer.from(workerData.bytes));
  parentPort!.postMessage({ result });
} catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : 'No se puede leer este material.' }); } })();
