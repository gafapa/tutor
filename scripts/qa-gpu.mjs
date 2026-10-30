import {AIService} from '../electron/ai-service.ts';
import {LocalModel} from '../electron/model.ts';
import {modelDefinition} from '../electron/model-catalog.ts';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const ai=new AIService(resolve('.tools/ai-test'),resolve('.tools/llama-runtime'),()=>({localModelId:'qwen-1.5b',aiProvider:'local',acceleration:'auto'}));
try{
  const answer=await ai.complete([{role:'user',content:'Return only the number: 2 + 2 = ?'}],{maxTokens:20});assert.match(answer,/4/);assert.equal(ai.getStatus().backend,'gpu');
  await writeFile('test-results/gpu-auto-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),backend:ai.getStatus().backend,answer,hardware:ai.configuration().hardware},null,2));
  console.log('Automatic Vulkan selection and real inference verified.');
}finally{await ai.shutdown();}
const fallback=new LocalModel(resolve('.tools/ai-test/models'),resolve('.tools/llama-runtime'),modelDefinition('qwen-1.5b'),{runtimeDirectory:resolve('.tools/llama-vulkan'),device:'Vulkan999'});
try{
  const answer=await fallback.complete([{role:'user',content:'Return only the number: 2 + 2 = ?'}],{maxTokens:20});assert.match(answer,/4/);assert.equal(fallback.getStatus().backend,'cpu');
  await writeFile('test-results/gpu-fallback-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),requestedDevice:'invalid synthetic device',actualBackend:fallback.getStatus().backend,answer},null,2));console.log('Failed GPU startup recovered through CPU and completed real inference.');
}finally{await fallback.shutdown();}
