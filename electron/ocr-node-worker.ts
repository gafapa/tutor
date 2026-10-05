import { parentPort, workerData } from 'node:worker_threads';
import { denyOcrNetwork } from './ocr-network.js';
import { recognizeLocalDocument } from './ocr-reader.js';
import type { OcrOptions } from '../shared/ocr.js';

denyOcrNetwork();
const input = workerData as { path: string; options: OcrOptions; assets: string };
void recognizeLocalDocument(input.path, input.options, input.assets, progress => parentPort!.postMessage({ progress }))
  .then(captures => parentPort!.postMessage({ captures }))
  .catch(error => parentPort!.postMessage({ error: error instanceof Error ? error.message.slice(0, 300) : 'No se pudo leer este documento.' }));
