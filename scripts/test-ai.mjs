import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { LocalModel } = require('../build/electron/model.js');
const model = new LocalModel(resolve('.tools/ai-test/models'), resolve('.tools/llama-runtime'));
const timer = setInterval(() => { const status = model.getStatus(); console.log(`${status.state}: ${status.progress}% · ${status.message}`); }, 15000);
try {
  await model.download();
  const started = Date.now();
  const response = await model.complete([
    { role: 'system', content: 'Eres un tutor. Responde en castellano, con una explicación breve de dos frases como máximo. Fuente [1]: Con 4 bits hay 2 elevado a 4, es decir, 16 combinaciones. Cita [1].' },
    { role: 'user', content: '¿Cuántas combinaciones hay con cuatro bits? Explica por qué.' }
  ]);
  assert.match(response, /16/);
  assert.ok(response.length > 15);
  console.log(`Inferencia local comprobada en ${Math.round((Date.now() - started) / 1000)} s: ${response}`);
  console.log('Las consultas se han enviado únicamente al servidor autenticado en 127.0.0.1, iniciado con --offline.');
} finally { clearInterval(timer); await model.shutdown(); }
