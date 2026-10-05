import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createOcrFixtures } from './ocr-fixtures.mjs';

const directory = resolve('.tools/ocr-visual-qa', randomUUID()), files = await createOcrFixtures(directory);
const env = { ...process.env, TUTOR_DATA_DIR: directory, TUTOR_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: resolve('release/win-unpacked/Tutor Local.exe'), env, timeout: 60000 });
const screenshots = [];
try {
  const window = await app.firstWindow(); await window.evaluate(() => window.tutor.createDemo()); await window.reload();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 800));
  await window.getByRole('button', { name: 'Materiales', exact: true }).click(); await window.getByRole('button', { name: 'Leer imagen o PDF escaneado', exact: true }).click();
  const shot = async name => { const path = `test-results/packaged-ocr-${name}-960.png`; const bytes = await window.screenshot({ path }); screenshots.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') }); };
  await shot('settings');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = () => new Promise(resolve => { globalThis.releaseOcrQaPicker = () => resolve({ canceled: false, filePaths: [path] }); }); }, files.png);
  await window.getByRole('button', { name: 'Seleccionar archivo y leer', exact: true }).click(); await window.getByRole('button', { name: 'Cancelar lectura', exact: true }).waitFor(); await shot('progress');
  await window.getByRole('button', { name: 'Cancelar lectura', exact: true }).click(); await window.getByRole('alert').filter({ hasText: 'Lectura cancelada' }).waitFor(); await app.evaluate(() => globalThis.releaseOcrQaPicker());
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, files.png);
  await window.getByRole('button', { name: 'Seleccionar archivo y leer', exact: true }).click(); const review = window.getByRole('dialog', { name: 'Revisar la captura', exact: true }); await review.waitFor({ timeout: 120000 });
  await review.getByRole('button', { name: 'Ampliar imagen', exact: true }).click(); assert.equal(await review.locator('.ocr-image-scroll').evaluate(node => node.scrollWidth > node.clientWidth), true); await shot('zoom');
  await review.getByRole('checkbox', { name: 'He comparado el texto', exact: false }).check(); await review.getByRole('button', { name: 'Guardar texto revisado', exact: true }).click(); await review.waitFor({ state: 'hidden' });
  const notice = window.getByRole('button', { name: 'Cerrar aviso', exact: true }); if (await notice.isVisible()) await notice.click();
  await window.getByRole('heading', { name: 'Imágenes revisadas', exact: true }).scrollIntoViewIfNeeded(); await shot('gallery');
  const data = await window.evaluate(() => window.tutor.snapshot()), material = data.materials.find(row => row.ocrSource); assert.equal(data.captures.length, 1);
  await window.getByRole('button', { name: /^Eliminar imagen de / }).click(); const deletion = window.getByRole('dialog', { name: 'Eliminar la imagen de la captura', exact: true }); await deletion.waitFor(); await shot('deletion');
  await deletion.getByRole('button', { name: 'Eliminar imagen y revisiones', exact: true }).click(); await deletion.waitFor({ state: 'hidden' });
  const after = await window.evaluate(() => window.tutor.snapshot()); assert.equal(after.captures.length, 0); assert.equal(after.captureReviews.length, 0); assert.equal(after.materials.find(row => row.id === material.id).ocrSource.removed, true);
  await mkdir('test-results', { recursive: true }); await writeFile('test-results/packaged-ocr-ui-qa.json', JSON.stringify({ checkedAt: new Date().toISOString(), screenshots, visualReview: 'pending', zoomWorks: true, deletionThroughUI: true }, null, 2)); console.log('OCR UI artifacts captured; visual inspection pending.');
} finally { await app.close().catch(() => {}); }
