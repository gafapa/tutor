// Optional real-model qualification. Downloads remain outside the portable package.
import { LocalModel } from '../electron/model.ts';
import { modelDefinition } from '../electron/model-catalog.ts';
import { createCanvas } from '@napi-rs/canvas';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory = process.env.TUTOR_VISION_MODEL_DIR || join(tmpdir(), 'tutor-vision-model-test');
const model = new LocalModel(directory, resolve('.tools/llama-runtime'), modelDefinition('gemma4-e2b'));
try {
  console.log(`Downloading/verifying Gemma 4 E2B and its projector in ${directory}`);
  await model.download(); console.log('Model assets verified. Running native vision.');
  const canvas = createCanvas(640, 250), context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, 640, 250);
  context.fillStyle = 'black'; context.font = '60px Arial'; context.fillText('2 + 2 = 5', 80, 140);
  const output = await model.complete([{ role: 'user', content: 'Transcribe exactly the single equation printed in the image. Do not correct or solve it. Return only the equation.' }], { image: { mime: 'image/jpeg', base64: canvas.encodeSync('jpeg').toString('base64') }, maxTokens: 120 });
  assert.match(output, /2\s*\+\s*2\s*=\s*5/);
  const structured = await model.complete([{role:'user',content:'Extract the unit title from this document: Unidad 1: Fracciones. Return JSON with title only.'}], {schema:{type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false},maxTokens:120});
  assert.match(JSON.parse(structured).title, /fracciones/i);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/multimodal-native-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), model: 'gemma4-e2b', realNativeVision: true, syntheticPrintedImage: true, output, structuredText: JSON.parse(structured), handwritingQuality: 'not verified' }, null, 2));
  console.log('Native Gemma 4 image input verified:', output);
} finally { await model.shutdown(); }
