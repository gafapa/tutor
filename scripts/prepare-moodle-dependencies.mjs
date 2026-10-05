import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('La fixture Moodle necesita Windows de 64 bits.');
const require = createRequire(import.meta.url), execute = promisify(execFile);
const root = resolve('.tools/moodle-test'), sevenZip = require('7zip-bin').path7za;
const revision = '1990fc9201b23e0b0c8fdc44d537840a85d73503';
await mkdir(root, { recursive: true });

// Solo se cachean archivos públicos; configuración, contraseñas y bases de datos quedan fuera.
for (const item of [
  { name: 'php.zip', directory: 'php', url: 'https://windows.php.net/downloads/releases/php-8.3.35-nts-Win32-vs16-x64.zip', sha256: '25a8e2ac9ff30f1d768d1447c09a600617fa6e6082729f6e95f008b59c91fe45' },
  { name: 'mariadb.zip', directory: 'mariadb', url: 'https://archive.mariadb.org/mariadb-11.4.13/winx64-packages/mariadb-11.4.13-winx64.zip', sha256: 'd62986d433eeebfde218560b276103831604a61e929e87f1a17f5aebd80257e2' },
]) {
  const archive = join(root, item.name); let bytes;
  try { bytes = await readFile(archive); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log(`Descargando dependencia de pruebas: ${item.name}.`);
    const response = await fetch(item.url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`No se pudo descargar ${item.name}: HTTP ${response.status}.`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`SHA-256 incorrecto para ${item.name}.`);
  await writeFile(archive, bytes); const destination = join(root, item.directory); await mkdir(destination, { recursive: true });
  await execute(sevenZip, ['x', '-y', '-bd', archive, `-o${destination}`], { windowsHide: true });
}

const moodle = join(root, 'moodle'); await mkdir(moodle, { recursive: true });
const git = (...args) => execute('git', args, { cwd: moodle, windowsHide: true, timeout: 240000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
let hasGit = true;
try { await access(join(moodle, '.git')); } catch (error) { if (error.code !== 'ENOENT') throw error; hasGit = false; }
if (!hasGit) {
  if ((await readdir(moodle)).length) throw new Error('La carpeta de Moodle ya contiene archivos sin un repositorio verificable.');
  await git('init');
  await git('remote', 'add', 'origin', 'https://github.com/moodle/moodle.git');
  await git('fetch', '--depth=1', 'origin', revision);
  await git('checkout', '--detach', 'FETCH_HEAD');
}
const actual = (await git('rev-parse', 'HEAD')).stdout.trim();
if (actual !== revision) throw new Error('La revisión de Moodle no coincide con la fixture comprobada.');
console.log('PHP, MariaDB y Moodle preparados y verificados para las pruebas.');
