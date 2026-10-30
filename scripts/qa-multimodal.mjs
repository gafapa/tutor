// Optional real-model qualification. Downloads remain outside the portable package.
import { LocalModel } from '../electron/model.ts';
import { modelDefinition } from '../electron/model-catalog.ts';
import { createCanvas } from '@napi-rs/canvas';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const directory = process.env.TUTOR_VISION_MODEL_DIR || join(tmpdir(), 'tutor-vision-model-test');
const modelId=process.argv.find(value=>value.startsWith('--model='))?.slice(8)??'gemma4-e2b';
const gpu=process.argv.includes('--gpu');
const devices=gpu?execFileSync(resolve('.tools/llama-vulkan/llama-server.exe'),['--list-devices'],{windowsHide:true,encoding:'utf8'}):'';
const gpuDevice=[...devices.matchAll(/^\s*(Vulkan\d+):\s*(.+)$/gm)].find(row=>/NVIDIA|Radeon|Arc/i.test(row[2]))?.[1];
if(gpu&&!gpuDevice)throw new Error('No dedicated Vulkan device was detected.');
const model = new LocalModel(directory, resolve('.tools/llama-runtime'), modelDefinition(modelId),gpuDevice?{runtimeDirectory:resolve('.tools/llama-vulkan'),device:gpuDevice}:undefined);
try {
  console.log(`Downloading/verifying ${modelId} and its projector in ${directory}`);
  await model.download(); console.log('Model assets verified. Running native vision.');
  const canvas = createCanvas(640, 250), context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, 640, 250);
  context.fillStyle = 'black'; context.font = '60px Arial'; context.fillText('2 + 2 = 5', 80, 140);
  const output = await model.complete([{ role: 'user', content: 'Transcribe exactly the single equation printed in the image. Do not correct or solve it. Return only the equation.' }], { image: { mime: 'image/jpeg', base64: canvas.encodeSync('jpeg').toString('base64') }, maxTokens: 120 });
  assert.match(output, /2\s*\+\s*2\s*=\s*5/);
  const structured = await model.complete([{role:'user',content:'Extract the unit title from this document: Unidad 1: Fracciones. Return JSON with title only.'}], {schema:{type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false},maxTokens:120});
  assert.match(JSON.parse(structured).title, /fracciones/i);
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/multimodal-${modelId}-${gpu?'gpu':'cpu'}-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), model: modelId, backend:model.getStatus().backend, realNativeVision: true, syntheticPrintedImage: true, output, structuredText: JSON.parse(structured), handwritingQuality: 'not verified' }, null, 2));
  if(gpu)assert.equal(model.getStatus().backend,'gpu');
  console.log('Native Gemma 4 image input verified:', output,model.getStatus().message);
} finally { await model.shutdown(); }
