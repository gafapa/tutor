import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url), pkg = JSON.parse(await readFile('package.json', 'utf8'));
const { extractFile } = require('@electron/asar');
assert.equal(JSON.parse(extractFile('release/win-unpacked/resources/app.asar', 'package.json')).version, pkg.version);
for (const entry of await readdir('release/win-unpacked', { recursive: true })) {
  const parts = entry.replaceAll('\\', '/').toLowerCase().split('/'), filename = parts.at(-1);
  if (parts[0] === 'data' || filename.endsWith('.tutor') || ['vault-key.bin', 'portable-key.bin'].includes(filename)) throw new Error('Packaging refused: the unpacked program contains a learner profile or key. Preserve those files outside the distribution.');
}
const name = `Tutor-Local-${pkg.version}-Portable`, parent = resolve('.tools/portable-package', randomUUID()), folder = join(parent, name);
await mkdir(parent, { recursive: true }); await cp('release/win-unpacked', folder, { recursive: true, errorOnExist: true, force: false });
await writeFile(join(folder, 'tutor-portable.json'), JSON.stringify({ format: 'tutor-portable', version: 1 }) + '\n');
await writeFile(join(folder, 'README.txt'), `Tutor Local ${pkg.version} - Windows x64 portable\n\nExtract this entire folder to a writable local drive or USB drive. Open Tutor Local.exe. No installation, administrator account, Python, Node.js or Ollama is required. Do not run inside the ZIP preview.\n\nChoose a portable password (12 to 256 characters) at first launch. You will need it at every launch, including on another Windows computer. It is separate from your Moodle password. A forgotten password cannot be recovered.\n\nKeep the whole folder together, including tutor-portable.json and Data. Close the app before copying, moving, updating or unplugging the drive. Your encrypted history, Moodle credentials, local search index and downloaded models stay in Data. Keep independent encrypted backups. Windows may still retain normal operating-system traces.\n\nTo update: extract the newer release into a NEW folder, close both apps, then copy the complete Data folder from the old release into the new one. Preserve the original folder until the new release opens successfully. Never merge the new program files into an open app.\n\nTo migrate from an installed Tutor Local: export an encrypted backup from Settings, create a new portable space, then restore the backup in Settings. Reconnect Moodle; credentials are deliberately absent from backups. Do not copy vault-key.bin from the installed profile.\n\nMoodle access is read-only. OCR, semantic search and the AI engine are included. Optional Qwen tutoring requires a separate approximately 1.12 GB model download, stored in Data/models; inference then works offline.\n\nThis development build is unsigned. No release has been published by this packaging command.\n`);
const zip = resolve('release', `${name}.zip`);
const temporaryZip = resolve('release', `${name}-${randomUUID()}.zip`);
await new Promise((resolveResult, reject) => {
  const child = spawn(require('7zip-bin').path7za, ['a', '-tzip', '-mx=5', temporaryZip, name], { cwd: parent, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const errors = []; child.stderr.on('data', bytes => errors.push(bytes)); child.once('error', reject); child.once('exit', code => code ? reject(new Error(Buffer.concat(errors).toString('utf8') || `ZIP failed (${code}).`)) : resolveResult());
});
await rename(temporaryZip, zip);
const bytes = await readFile(zip), sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(zip + '.sha256', `${sha256}  ${name}.zip\n`);
console.log(`Portable ZIP prepared: ${name}.zip (${bytes.length} bytes), SHA-256 ${sha256}.`);
