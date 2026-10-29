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
await writeFile(join(folder, 'README.txt'), `Tutor Local ${pkg.version} - Windows x64 portable alpha\n\nExtract the complete folder to a writable drive and open Tutor Local.exe. No workspace password or installation is required. Moodle is the starting point; the connector only reads data.\n\nEducational history is stored as readable SQLite in Data/learning.sqlite. Credentials are protected separately for the Windows user/computer; reconnect Moodle after moving to another account or PC. Optional encrypted backups remain available.\n\nKeep Data and tutor-portable.json with the executable. Close the application before moving, updating or unplugging the drive. This alpha starts a new workspace instead of migrating earlier encrypted profiles. Existing files are preserved.\n\nChoose local AI models according to detected hardware, or explicitly authorize context processing with your own Claude/Codex account using the official native executable. Account tools require separate installation and sign-in. No API key is requested. Local model downloads are optional and checksum verified.\n\nThis development build is unsigned and has not been published by this command.\n`);
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
