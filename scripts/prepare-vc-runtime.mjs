import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const sevenZip = require('7zip-bin').path7za;
const source = resolve('.tools/vc_redist.x64.exe');
const root = resolve('.tools/vc-runtime');
await mkdir(root, { recursive: true });
try { await access(source); } catch {
  const response = await fetch('https://aka.ms/vc14/vc_redist.x64.exe');
  if (!response.ok) throw new Error('No se ha podido obtener el runtime de Microsoft.');
  await writeFile(source, Buffer.from(await response.arrayBuffer()));
}
await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$taskSignature = Get-AuthenticodeSignature -LiteralPath $env:TUTOR_VC_SOURCE; if ($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation') { exit 1 }"], { windowsHide: true, env: { ...process.env, TUTOR_VC_SOURCE: source } });
const bytes = await readFile(source);
async function extractCabinets(bytes, parent, prefix) {
  let offset = 0; let count = 0;
  while ((offset = bytes.indexOf(Buffer.from('MSCF'), offset)) !== -1) {
    if (offset + 36 >= bytes.length) break;
    const size = bytes.readUInt32LE(offset + 8);
    if (size > 36 && offset + size <= bytes.length && bytes.readUInt32LE(offset + 4) === 0) {
      const cab = join(parent, `${prefix}-${offset}.cab`);
      const output = join(parent, `${prefix}-${offset}`);
      await writeFile(cab, bytes.subarray(offset, offset + size)); await mkdir(output, { recursive: true });
      await execute(sevenZip, ['x', cab, `-o${output}`, '-y'], { windowsHide: true }); count++;
    }
    offset++;
  }
  return count;
}
await extractCabinets(bytes, root, 'container');
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result;
}
// Burn's attached payload cabinet contains MSI and runtime cabinet files with short IDs.
for (const path of await files(root)) {
  if (path.endsWith('.cab')) continue;
  const data = await readFile(path);
  if (data.length > 300000) await extractCabinets(data, root, `payload-${basename(path)}`);
}
const extracted = await files(root);
const dlls = [];
for (const path of extracted.filter(path => /(?:msvcp140|vcruntime140|concrt140).*\.dll/i.test(basename(path)))) {
  const data = await readFile(path);
  const pe = data.length > 64 ? data.readUInt32LE(60) : -1;
  if (pe > 0 && pe + 6 < data.length && data.readUInt16LE(pe + 4) === 0x8664) dlls.push(path);
}
if (!dlls.length) {
  console.log(extracted.map(path => path.replace(root, '')).join('\n'));
  throw new Error('No se han localizado los archivos de runtime redistribuibles.');
}
const destination = resolve('.tools/llama-runtime');
await mkdir(destination, { recursive: true });
for (const path of dlls) {
  const original = basename(path).match(/(?:msvcp140|vcruntime140|concrt140)[a-z0-9_]*\.dll/i)?.[0];
  if (original) await copyFile(path, join(destination, original));
}
await writeFile(join(destination, 'microsoft-runtime-info.json'), JSON.stringify({ source: 'https://aka.ms/vc14/vc_redist.x64.exe', sha256: createHash('sha256').update(bytes).digest('hex'), files: dlls.map(path => basename(path)), documentation: 'https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files' }, null, 2));
console.log('Runtime de Microsoft verificado y preparado para distribución local.');
