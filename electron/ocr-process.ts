import { denyOcrNetwork } from './ocr-network.js';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
denyOcrNetwork();
const port = process.parentPort;
if (!port) throw new Error('El lector OCR debe ejecutarse en un proceso aislado.');
port.once('message', event => {
  // PDF.js uses its Node factories in a Node worker. The enclosing utility
  // process owns this worker and the OCR worker, so cancellation kills both.
  const worker = new Worker(join(__dirname, 'ocr-node-worker.js'), { workerData: event.data, resourceLimits: { maxOldGenerationSizeMb: 384 } });
  worker.on('message', message => port.postMessage(message));
  worker.once('error', () => port.postMessage({ error: 'El lector local se ha detenido. Prueba con una imagen más pequeña.' }));
  worker.once('exit', code => { if (code) port.postMessage({ error: 'El lector local se ha detenido. Prueba con una imagen más pequeña.' }); });
});
