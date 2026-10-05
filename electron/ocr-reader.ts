import { createCanvas, loadImage, DOMMatrix, ImageData, Path2D, type Canvas } from '@napi-rs/canvas';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join, dirname } from 'node:path';
import { createWorker, OEM, PSM, type Worker as OcrWorker } from 'tesseract.js';
import { imageDimensions } from './image-header.js';
import { readLocalFile } from './local-file.js';
import { OCR_ASSETS, OCR_VERSION, MAX_CAPTURE_BYTES } from './ocr-config.js';
import type { Capture, OcrOptions, OcrProgress } from '../shared/ocr.js';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const shortName = (value: string) => { if (value.length <= 120) return value; let end = 119; if (/[\uD800-\uDBFF]/.test(value[end - 1])) end--; return value.slice(0, end) + '…'; };
function normalize(canvas: Canvas, rotation: OcrOptions['rotation']): Canvas {
  const swapped = rotation === 90 || rotation === 270, width = swapped ? canvas.height : canvas.width, height = swapped ? canvas.width : canvas.height;
  const scale = Math.min(1, 2400 / Math.max(width, height), Math.sqrt(4000000 / (width * height)));
  const output = createCanvas(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))), context = output.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, output.width, output.height); context.translate(output.width / 2, output.height / 2);
  context.rotate(rotation * Math.PI / 180); context.drawImage(canvas, -canvas.width * scale / 2, -canvas.height * scale / 2, canvas.width * scale, canvas.height * scale); return output;
}
export async function recognizeLocalDocument(path: string, options: OcrOptions, assetDirectory: string, progress: (value: Omit<OcrProgress, 'id' | 'subjectId'>) => void): Promise<Capture[]> {
  const bytes = await readLocalFile(path), sourceHash = hash(bytes), filename = shortName(basename(path)), models = [];
  for (const language of options.language.split('+')) {
    const asset = OCR_ASSETS.find(row => row.name === language + '.traineddata'); if (!asset) throw new Error('Idioma OCR no compatible.');
    const data = await readFile(join(assetDirectory, asset.name));
    if (data.length !== asset.bytes || hash(data) !== asset.sha256) throw new Error('Faltan recursos del reconocimiento local o están dañados. Reinstala la app para recuperarlos.');
    models.push({ code: language, data });
  }
  let worker: OcrWorker | undefined, pdf: import('pdfjs-dist/types/src/display/api.js').PDFDocumentProxy | undefined;
  let task: import('pdfjs-dist/types/src/display/api.js').PDFDocumentLoadingTask | undefined;
  let currentPage = 1, pageCount = 1;
  const output: Capture[] = [];
  try {
    const isPdf = bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    if (isPdf) {
      Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, useWorkerFetch: false, standardFontDataUrl: join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replaceAll('\\', '/') + '/' });
      pdf = await task.promise;
      if (pdf.numPages > 300) throw new Error('El PDF supera el límite de 300 páginas.');
      if (options.firstPage > pdf.numPages || options.lastPage > pdf.numPages) throw new Error(`El PDF contiene ${pdf.numPages} páginas. Ajusta el intervalo seleccionado.`);
      pageCount = options.lastPage - options.firstPage + 1;
    } else {
      if (options.firstPage !== 1 || options.lastPage !== 1) throw new Error('Una imagen tiene una sola página. Selecciona el intervalo 1–1.');
      imageDimensions(bytes);
    }
    progress({ name: filename, page: 1, total: pageCount, fraction: 0, stage: 'preparing' });
    worker = await createWorker(options.language, OEM.LSTM_ONLY, { workerPath: join(__dirname, 'ocr-tesseract-worker.js'), langPath: assetDirectory, cacheMethod: 'none', gzip: false, logger: value => {
      if (value.status === 'recognizing text') progress({ name: filename, page: currentPage, total: pageCount, fraction: Math.max(0, Math.min(1, value.progress)), stage: 'recognizing' });
    }, errorHandler: () => {} });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1', user_defined_dpi: '150' });
    for (let index = 0; index < pageCount; index++) {
      currentPage = index + 1; const sourcePage = isPdf ? options.firstPage + index : 1;
      progress({ name: filename, page: currentPage, total: pageCount, fraction: 0, stage: 'reading' });
      let canvas: Canvas;
      if (pdf) {
        const page = await pdf.getPage(sourcePage), original = page.getViewport({ scale: 1 });
        if (![original.width, original.height].every(value => Number.isFinite(value) && value > 0 && value <= 30000)) throw new Error('La página PDF contiene dimensiones no válidas.');
        const scale = Math.min(2, 2400 / Math.max(original.width, original.height), Math.sqrt(4000000 / (original.width * original.height)));
        const viewport = page.getViewport({ scale }); canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise; page.cleanup();
      } else {
        const image = await loadImage(bytes); if (image.width * image.height > 20000000 || Math.max(image.width, image.height) > 10000) throw new Error('La imagen supera el límite de dimensiones.');
        canvas = createCanvas(image.width, image.height); canvas.getContext('2d').drawImage(image, 0, 0);
      }
      const image = normalize(canvas, options.rotation); let imageBytes = image.encodeSync('jpeg', 88);
      if (imageBytes.length > MAX_CAPTURE_BYTES) imageBytes = image.encodeSync('jpeg', 65);
      if (imageBytes.length > MAX_CAPTURE_BYTES) throw new Error('La imagen preparada supera 2 MB. Recorta el área del ejercicio o usa una fotografía más pequeña.');
      const recognized = await worker.recognize(imageBytes, {}, { text: true, blocks: true });
      const text = recognized.data.text.replace(/[\u0000\f]/g, ' ').trim();
      if (text.length > 100000) throw new Error('La página contiene demasiado texto reconocido.');
      const words = (recognized.data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words))).map(word => ({ text: word.text.slice(0, 200), confidence: Math.max(0, Math.min(100, word.confidence)), box: { x0: Math.max(0, Math.floor(word.bbox.x0)), y0: Math.max(0, Math.floor(word.bbox.y0)), x1: Math.min(image.width, Math.ceil(word.bbox.x1)), y1: Math.min(image.height, Math.ceil(word.bbox.y1)) } }));
      if (words.length > 10000) throw new Error('La página contiene demasiados fragmentos reconocidos.');
      output.push({ id: randomUUID(), subjectId: options.subjectId, name: isPdf ? shortName(`${filename} · página ${sourcePage}`) : filename, sourceFormat: isPdf ? 'pdf' : 'image', sourcePage, sourceHash,
        image: { mime: 'image/jpeg', base64: imageBytes.toString('base64'), width: image.width, height: image.height, hash: hash(imageBytes) },
        recognition: { engine: 'tesseract-local', version: OCR_VERSION, language: options.language, modelHashes: models.map(model => OCR_ASSETS.find(row => row.name === model.code + '.traineddata')!.sha256), text, confidence: Math.max(0, Math.min(100, recognized.data.confidence)), words }, createdAt: new Date().toISOString() });
    }
    return output;
  } finally { await worker?.terminate(); await task?.destroy(); }
}
