import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,access,readdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import {promisify} from 'node:util';
const directory=resolve('.tools/llama-vulkan'), archive=resolve('.tools/llama-vulkan.zip');
const sha256='549ec6227715128c2f978a97c0b7bfe933f1daff40ef62f8d1e1032139eccad2';
const url='https://github.com/ggml-org/llama.cpp/releases/download/b11319/llama-b11319-bin-win-vulkan-x64.zip';
await mkdir(directory,{recursive:true});
try{await access(archive);}catch{const response=await fetch(url);if(!response.ok)throw new Error('Vulkan runtime download failed.');await writeFile(archive,Buffer.from(await response.arrayBuffer()));}
if(createHash('sha256').update(await readFile(archive)).digest('hex')!==sha256)throw new Error('Vulkan archive checksum mismatch.');
const require=createRequire(import.meta.url);
await promisify(execFile)(require('7zip-bin').path7za,['x',archive,'-o'+directory,'-y'],{windowsHide:true});
if(!(await readdir(directory)).includes('llama-server.exe'))throw new Error('The Vulkan runtime was not fully extracted.');
for(const name of await readdir('.tools/llama-runtime'))if(/140.*\.dll$/i.test(name))await copyFile(join('.tools/llama-runtime',name),join(directory,name));
const files=[];for(const name of await readdir(directory))if(/\.(dll|exe)$/i.test(name)){const bytes=await readFile(join(directory,name));files.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(join(directory,'runtime-info.json'),JSON.stringify({release:'b11319',url,sha256,files},null,2));
await writeFile(join(directory,'LICENSE-llama.cpp.txt'),await readFile('.tools/llama-runtime/LICENSE-llama.cpp.txt'));
console.log('Pinned Vulkan runtime prepared.');
