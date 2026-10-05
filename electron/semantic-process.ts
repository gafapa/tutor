import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { denyOcrNetwork } from './ocr-network.js';

denyOcrNetwork();
const port = process.parentPort;
if (!port) throw new Error('La búsqueda debe ejecutarse en un proceso aislado.');
let worker: Worker | undefined;
port.on('message', event => {
  if (worker) worker.postMessage(event.data);
  else {
    worker = new Worker(join(__dirname, 'semantic-node-worker.js'), { workerData: event.data, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    worker.on('message', message => port.postMessage(message));
    worker.once('error', () => port.postMessage({ error: 'El buscador local se ha detenido. Inténtalo de nuevo.' }));
    worker.once('exit', code => { if (code) port.postMessage({ error: 'El buscador local se ha detenido. Inténtalo de nuevo.' }); });
  }
});
