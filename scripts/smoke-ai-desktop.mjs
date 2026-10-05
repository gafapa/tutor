import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, link, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { MODEL } = require('../build/electron/model-config.js');
const packaged = process.argv.includes('--packaged');
const directory = resolve('.tools/ai-desktop-test', randomUUID());
await mkdir(join(directory, 'models'), { recursive: true });
await link(resolve('.tools/ai-test/models', MODEL.filename), join(directory, 'models', MODEL.filename));
const env = { ...process.env, TUTOR_DATA_DIR: directory, TUTOR_SMOKE: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: packaged ? resolve('release/win-unpacked/Tutor Local.exe') : require('electron'), args: packaged ? [] : ['.'], env, timeout: 60000 });
let progressTimer;
try {
  const window = await app.firstWindow();
  await window.getByRole('heading', { name: 'Aprender empieza' }).waitFor();
  await window.getByRole('button', { name: 'Explorar un ejemplo' }).click();
  await window.getByRole('heading', { name: 'Un poco de potencias de 2.' }).waitFor();
  await app.evaluate(({ session }) => session.defaultSession.enableNetworkEmulation({ offline: true }));
  await window.getByRole('button', { name: 'Mi tutor', exact: true }).click();
  await window.getByRole('button', { name: 'Paso a paso', exact: true }).click();
  await window.getByLabel('Tu pregunta al tutor').fill('¿Cuántas combinaciones permiten cuatro bits? Explica el cálculo brevemente.');
  await window.getByRole('button', { name: 'Enviar pregunta' }).click();
  progressTimer = setInterval(() => { void window.evaluate(() => window.tutor.modelStatus()).then(status => console.log(`Motor local: ${status.state} · ${status.message}`)).catch(() => {}); }, 15000);
  // First use includes checksum verification, server loading and inference.
  await Promise.race([
    window.locator('.chat-message.assistant .message-text').waitFor({ timeout: 420000 }),
    window.locator('.toast.error').waitFor({ timeout: 420000 }).then(async () => { throw new Error(await window.locator('.toast.error').innerText()); })
  ]);
  const response = await window.locator('.chat-message.assistant .message-text').innerText();
  assert.match(response, /16/);
  const snapshot = await window.evaluate(() => window.tutor.snapshot());
  assert.equal(snapshot.messages.length, 2);
  assert.ok(snapshot.messages[1].citations.length > 0);
  assert.equal(snapshot.messages[1].retrieval, 'hybrid');
  assert.ok(snapshot.messages[1].citations.every(citation => snapshot.materials.find(material => material.id === citation.materialId)?.subjectId === snapshot.subjects[0].id));
  await window.screenshot({ path: `test-results/${packaged ? 'packaged-' : ''}tutor-local.png` });
  await writeFile(`test-results/${packaged ? 'packaged-' : ''}ai-verification.json`, JSON.stringify({ testedAt: new Date().toISOString(), packaged, mode: 'offline-renderer-and-llama', response, citations: snapshot.messages[1].citations.length }, null, 2));
  console.log(`Tutor ${packaged ? 'empaquetado' : 'de desarrollo'} verificado con un modelo real, fuentes de la asignatura y red del navegador desconectada.`);
} finally { clearInterval(progressTimer); await app.close(); }
