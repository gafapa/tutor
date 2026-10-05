import { parentPort, workerData } from 'node:worker_threads';
import { denyOcrNetwork } from './ocr-network.js';
import { SemanticEngine } from './semantic-engine.js';

denyOcrNetwork();
void SemanticEngine.open(workerData.assets).then(engine => {
  let busy = false;
  parentPort!.on('message', async ({ id, text, mode }) => {
    if (busy || !Number.isSafeInteger(id) || typeof text !== 'string' || text.length > 2200 || !['query', 'passage'].includes(mode)) { parentPort!.postMessage({ error: 'El buscador recibió una solicitud no válida.' }); return; }
    busy = true;
    try { const { vector } = await engine.embed(text, mode); parentPort!.postMessage({ id, vector }); }
    catch { parentPort!.postMessage({ error: 'No se pudo interpretar el texto con el modelo local. Inténtalo de nuevo.' }); }
    finally { busy = false; }
  });
  parentPort!.postMessage({ ready: true });
}).catch(() => parentPort!.postMessage({ error: 'No se pudo abrir el modelo de búsqueda local. Reinstala la app si el problema persiste.' }));
