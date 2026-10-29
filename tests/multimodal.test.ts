import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LocalModel } from '../electron/model';
import { modelAssets, MODEL_CATALOG } from '../electron/model-catalog';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('vision models pin a separate projector and text models reject image input', async () => {
  for (const model of MODEL_CATALOG.filter(model => model.vision)) {
    assert.equal(modelAssets(model).length, 2);
    assert.ok(model.projector!.filename.startsWith('mmproj-'));
    assert.match(model.projector!.sha256, /^[a-f0-9]{64}$/);
    assert.match(model.projector!.url, /\/resolve\/[a-f0-9]{40}\//);
  }
  const local = new LocalModel(resolve('.tools/multimodal-tests', randomUUID()), resolve('.tools/llama-runtime'));
  try { await assert.rejects(() => local.complete([{role:'user',content:'Read'}], {image:{mime:'image/jpeg',base64:'AA=='}}), /solo admite texto/); }
  finally { await local.shutdown(); }
});

test('a vision download verifies both assets, retains a valid main file after projector failure and retries safely', async () => {
  const directory = resolve('.tools/multimodal-tests', randomUUID()); await mkdir(directory, {recursive:true});
  const main = Buffer.from('synthetic main weights'), projector = Buffer.from('synthetic projector');
  const asset = (filename: string, bytes: Buffer) => ({filename,bytes:bytes.length,sha256:hash(bytes),url:'https://fixture.invalid/'+filename});
  const definition = {...asset('model.gguf',main),name:'Vision fixture',vision:true,projector:asset('mmproj.gguf',projector)};
  const originalFetch=globalThis.fetch; let valid=false, mainRequests=0;
  globalThis.fetch=async input=>{const isMain=String(input).endsWith('model.gguf');if(isMain)mainRequests++;return new Response(isMain?main:valid?projector:Buffer.from('bad'));};
  let model=new LocalModel(directory,directory,definition);
  try {
    assert.equal(model.getStatus().state,'missing');
    assert.equal(model.getStatus().totalBytes,main.length+projector.length);
    await assert.rejects(()=>model.download(),/incompleta/);
    assert.deepEqual(await readFile(join(directory,'model.gguf')),main);
    await assert.rejects(access(join(directory,'mmproj.gguf.part')));
    valid=true;await model.download();assert.equal(mainRequests,1);
    assert.equal(model.getStatus().state,'ready');assert.equal(model.getStatus().downloadedBytes,main.length+projector.length);
    await model.shutdown();
    await writeFile(join(directory,'mmproj.gguf'),Buffer.alloc(projector.length));
    model=new LocalModel(directory,directory,definition);
    await assert.rejects(()=>model.ensureRunning(),/integridad/);
  } finally {globalThis.fetch=originalFetch;await model.shutdown();}
});
