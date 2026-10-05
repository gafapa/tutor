import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const directory = resolve('.tools/llama-runtime');
const archive = resolve('.tools/llama-runtime.zip');
const release = 'b11319';
const expected = 'd546d6e246b6c0913e902513252f108d4b7e75bf9c5b7642c4116cee52f66a45';
const url = `https://github.com/ggml-org/llama.cpp/releases/download/${release}/llama-${release}-bin-win-cpu-x64.zip`;
await mkdir(directory, { recursive: true });
try { await access(archive); } catch {
  console.log('Descargando el motor local de llama.cpp (19 MB)…');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Descarga fallida: ${response.status}`);
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
}
if (createHash('sha256').update(await readFile(archive)).digest('hex') !== expected) throw new Error('El motor no supera la comprobación SHA-256.');
await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:TUTOR_RUNTIME_ARCHIVE -DestinationPath $env:TUTOR_RUNTIME_DIRECTORY -Force'], {
  windowsHide: true, env: { ...process.env, TUTOR_RUNTIME_ARCHIVE: archive, TUTOR_RUNTIME_DIRECTORY: directory }
});
await writeFile(resolve(directory, 'runtime-info.json'), JSON.stringify({ release, url, sha256: expected }, null, 2));
const license = await fetch('https://raw.githubusercontent.com/ggml-org/llama.cpp/b11319/LICENSE');
if (!license.ok) throw new Error('No se ha podido obtener la licencia de llama.cpp.');
await writeFile(resolve(directory, 'LICENSE-llama.cpp.txt'), await license.text());
console.log('Motor de IA preparado y verificado.');
