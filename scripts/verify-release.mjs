import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, normalize, resolve } from 'node:path';
const require = createRequire(import.meta.url), pkg = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('test-results', { recursive: true });
const run = async (name, executable, args) => {
  console.log(`Checking ${name}.`); const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); const chunks = [];
  child.stdout.on('data', c => { chunks.push(c); if (['ai-desktop', 'rubrics-ai', 'pedagogy-ai'].includes(name)) process.stdout.write(c); }); child.stderr.on('data', c => chunks.push(c));
  const code = await new Promise((r, reject) => { child.once('error', reject); child.once('exit', r); }); const output = Buffer.concat(chunks).toString('utf8');
  await writeFile(`test-results/release-${pkg.version}-${name}.log`, output); if (code) throw new Error(`${name} failed (${code}); inspect its verification log.`); console.log(`${name} passed.`); return output;
};
const { extractFile } = require('@electron/asar'); const archive = resolve('release/win-unpacked/resources/app.asar');
const archivedPackage = JSON.parse(extractFile(archive, 'package.json').toString('utf8')); if (archivedPackage.version !== pkg.version) throw new Error('Packaged version does not match current source.');
let compiledFileCount = 0;
async function verifyCompiled(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await verifyCompiled(path);
    else if (entry.isFile() && /\.(js|json)$/.test(entry.name)) {
      if (!extractFile(archive, normalize(path)).equals(await readFile(path))) throw new Error(`Packaged compiled file ${path} differs from the verified build.`);
      compiledFileCount++;
    }
  }
}
await verifyCompiled('build');
let rendererAssetCount = 0;
async function verifyRenderer(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await verifyRenderer(path);
    else if (entry.isFile()) {
      if (!extractFile(archive, normalize(path)).equals(await readFile(path))) throw new Error(`Packaged renderer asset ${path} differs from the verified build.`);
      rendererAssetCount++;
    }
  }
}
await verifyRenderer('dist');
const { OCR_ASSETS } = require('../build/electron/ocr-config.js');
for (const asset of OCR_ASSETS) { const bytes = await readFile(join('release/win-unpacked/resources/ocr-runtime', asset.name)); if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Packaged OCR asset differs from its manifest.'); }
const { SEMANTIC_MODEL } = require('../build/electron/semantic-config.js');
for (const asset of SEMANTIC_MODEL.files) { const bytes = await readFile(join('release/win-unpacked/resources/semantic-runtime', asset.name)); if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Packaged semantic asset differs from its manifest.'); }
const nativeDirectory = 'release/win-unpacked/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6';
const platforms = await readdir(nativeDirectory); if (platforms.join('|') !== 'win32' || (await readdir(join(nativeDirectory, 'win32'))).join('|') !== 'x64') throw new Error('Semantic package includes unexpected foreign platform binaries.');
for (const name of (await readdir('.tools/llama-runtime')).filter(name => /140.*\.dll$/i.test(name))) if (!(await readFile(join(nativeDirectory, 'win32/x64', name))).equals(await readFile(join('.tools/llama-runtime', name)))) throw new Error('Packaged semantic VC runtime differs from the verified local runtime.');
const unitLog = await run('domain', process.execPath, ['--import', 'tsx', '--test', 'tests/*.test.ts']); const domainTests = Number(unitLog.match(/(?:tests|# tests)\s+(\d+)/)?.[1]); if (!domainTests) throw new Error('Could not confirm domain test count.');
const checks = ['desktop', 'materials', 'ocr', 'semantic', 'planning', 'education', 'study', 'assessment', 'rubrics', 'pedagogy', 'connections', 'reports', 'goals', 'moodle-desktop', 'ai-desktop', 'rubrics-ai', 'pedagogy-ai'];
for (const check of checks) await run(check, process.execPath, [`scripts/smoke-${check}.mjs`, '--packaged']);
await run('reports-pdf', process.execPath, ['scripts/check-report-pdfs.mjs', '--packaged']);
const installer = `release/Tutor-Local-${pkg.version}-Instalador.exe`; const bytes = await readFile(installer), sha256 = createHash('sha256').update(bytes).digest('hex');
const integrity = await run('payload', require('7zip-bin').path7za, ['t', resolve(installer)]); if (!integrity.includes('Everything is Ok')) throw new Error('NSIS payload verification did not finish successfully.');
await writeFile(installer + '.sha256', `${sha256}  Tutor-Local-${pkg.version}-Instalador.exe\n`);
const moodle = JSON.parse(await readFile('test-results/moodle-verification.json', 'utf8'));
const realMoodleDesktop = JSON.parse(await readFile('test-results/packaged-moodle-desktop-verification.json', 'utf8'));
await writeFile(`test-results/release-${pkg.version}-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), version: pkg.version, installer: { path: installer, bytes: bytes.length, sha256, payloadIntegrity: '7-Zip passed' }, domainTests, packagedChecks: checks.length, checks, realMoodle: moodle, realMoodleDesktop, sourceModulesMatch: true, ocrAssetsVerified: true, semanticAssetsVerified: true, semanticNativePlatform: 'win32/x64', semanticVcRuntimeBundled: true, compiledFileCount, rendererAssetsMatch: true, rendererAssetCount, pdfTextAndRenderVerified: true, pdfVisualReview: 'pending', fullRequirementCount: 80, remainingScope: 'active', cleanWindowsInstallerWizard: 'not verified', codeSigned: false }, null, 2));
console.log(`Release ${pkg.version} verified: ${domainTests} tests and ${checks.length} packaged workflows.`);
