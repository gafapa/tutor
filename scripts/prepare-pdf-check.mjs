import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), directory = resolve('.tools/pdf-check'), zip = join(directory, 'poppler-26.09.0.zip');
const url = 'https://github.com/oschwartz10612/poppler-windows/releases/download/v26.09.0-0/Release-26.09.0-0.zip';
const expected = '7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0';
await mkdir(directory, { recursive: true });
try { await access(zip); } catch {
  const response = await fetch(url); if (!response.ok) throw Error('No se pudo descargar Poppler para las comprobaciones.');
  const bytes = Buffer.from(await response.arrayBuffer()); if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('La descarga no coincide con el SHA-256 publicado.');
  await writeFile(zip, bytes);
}
if (createHash('sha256').update(await readFile(zip)).digest('hex') !== expected) throw Error('El archivo de Poppler ha cambiado.');
const child = spawn(require('7zip-bin').path7za, ['x', '-y', '-bd', zip, `-o${directory}`], { windowsHide: true, stdio: 'ignore' });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
if (code) throw Error('No se pudo preparar Poppler.');
await writeFile(join(directory, 'source.json'), JSON.stringify({ version: '26.09.0-0', url, sha256: expected, use: 'developer PDF verification only' }, null, 2));
console.log('Poppler preparado y verificado; no se incluye en el instalador del alumno.');
const pythonDirectory = join(directory, 'python'); await mkdir(pythonDirectory, { recursive: true });
for (const item of [
  { name: 'python-3.13.12.zip', url: 'https://www.python.org/ftp/python/3.13.12/python-3.13.12-embed-amd64.zip', sha256: '76f238f606250c87c6beac75dccd35ee99070a13490555936abb6cb64ecce3d0', destination: pythonDirectory },
  { name: 'pypdf-6.1.3.whl', url: 'https://files.pythonhosted.org/packages/fa/ed/494fd0cc1190a7c335e6958eeaee6f373a281869830255c2ed4785dac135/pypdf-6.1.3-py3-none-any.whl', sha256: 'eb049195e46f014fc155f566fa20e09d70d4646a9891164ac25fa0cbcfcdbcb5', destination: join(pythonDirectory, 'Lib') },
]) {
  const path = join(directory, item.name); let bytes;
  try { bytes = await readFile(path); } catch { const response = await fetch(item.url); if (!response.ok) throw Error('No se pudo descargar una dependencia de verificación PDF.'); bytes = Buffer.from(await response.arrayBuffer()); }
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error('La dependencia PDF no coincide con su SHA-256 publicado.');
  await writeFile(path, bytes); await mkdir(item.destination, { recursive: true });
  const process = spawn(require('7zip-bin').path7za, ['x', '-y', '-bd', path, `-o${item.destination}`], { windowsHide: true, stdio: 'ignore' });
  if (await new Promise((resolve, reject) => { process.once('error', reject); process.once('exit', resolve); })) throw Error('No se pudo extraer la dependencia PDF.');
}
await writeFile(join(pythonDirectory, 'python313._pth'), 'python313.zip\n.\nLib\n');
console.log('Python portable y pypdf preparados para comprobación; no se instalan globalmente.');
