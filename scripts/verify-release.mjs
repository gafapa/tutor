import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, normalize, resolve } from 'node:path';
const require = createRequire(import.meta.url), pkg = JSON.parse(await readFile('package.json', 'utf8'));
const portableMode = !process.argv.includes('--installer');
const resumeIndex = process.argv.indexOf('--resume-log');
const resumeLog = resumeIndex >= 0 ? await readFile(process.argv[resumeIndex + 1], 'utf8') : undefined;
if (resumeLog && !resumeLog.includes(`> tutor-local@${pkg.version} test:release`)) throw new Error('Resume log belongs to another release.');
await mkdir('test-results', { recursive: true });
const run = async (name, executable, args) => {
  console.log(`Checking ${name}.`); const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); const chunks = [];
  child.stdout.on('data', c => { chunks.push(c); if (['ai-desktop', 'rubrics-ai', 'pedagogy-ai'].includes(name)) process.stdout.write(c); }); child.stderr.on('data', c => chunks.push(c));
  const code = await new Promise((r, reject) => { child.once('error', reject); child.once('exit', r); }); const output = Buffer.concat(chunks).toString('utf8');
  await writeFile(`test-results/release-${pkg.version}-${name}.log`, output); if (code) throw new Error(`${name} failed (${code}); inspect its verification log.`); console.log(`${name} passed.`); return output;
};
const { extractFile } = require('@electron/asar'); const archive = resolve('release/win-unpacked/resources/app.asar');
const archiveModifiedAt = (await stat(archive)).mtimeMs;
async function completedCheck(name) {
  if (!resumeLog?.split(/\r?\n/).includes(`${name} passed.`)) return undefined;
  const path = `test-results/release-${pkg.version}-${name}.log`;
  if ((await stat(path)).mtimeMs < archiveModifiedAt) return undefined;
  console.log(`Reusing completed ${name} check from this unchanged packaged build.`);
  return readFile(path, 'utf8');
}
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
let portableAssetCount = 0;
for (const name of ['portable.html', 'portable.css', 'portable.js']) {
  if (!extractFile(archive, `assets/${name}`).equals(await readFile(`assets/${name}`))) throw new Error(`Packaged unlock asset ${name} differs from source.`);
  portableAssetCount++;
}
const vulkan=JSON.parse(await readFile('.tools/llama-vulkan/runtime-info.json','utf8'));
for(const file of vulkan.files.filter(file=>file.name==='llama-server.exe'||file.name.endsWith('.dll'))){const bytes=await readFile(join('release/win-unpacked/resources/llama-vulkan',file.name));if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('Packaged Vulkan runtime does not match its pinned manifest.');}
const { SEMANTIC_MODEL } = require('../build/electron/semantic-config.js');
for (const asset of SEMANTIC_MODEL.files) { const bytes = await readFile(join('release/win-unpacked/resources/semantic-runtime', asset.name)); if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Packaged semantic asset differs from its manifest.'); }
const nativeDirectory = 'release/win-unpacked/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6';
const platforms = await readdir(nativeDirectory); if (platforms.join('|') !== 'win32' || (await readdir(join(nativeDirectory, 'win32'))).join('|') !== 'x64') throw new Error('Semantic package includes unexpected foreign platform binaries.');
for (const name of (await readdir('.tools/llama-runtime')).filter(name => /140.*\.dll$/i.test(name))) if (!(await readFile(join(nativeDirectory, 'win32/x64', name))).equals(await readFile(join('.tools/llama-runtime', name)))) throw new Error('Packaged semantic VC runtime differs from the verified local runtime.');
const unitLog = await completedCheck('domain') ?? await run('domain', process.execPath, ['--import', 'tsx', '--test', 'tests/*.test.ts']); const domainTests = Number(unitLog.match(/(?:tests|# tests)\s+(\d+)/)?.[1]); if (!domainTests) throw new Error('Could not confirm domain test count.');
const checks = ['student', 'orientation', 'desktop', 'materials', 'ocr', 'semantic', 'planning', 'education', 'study', 'assessment', 'rubrics', 'pedagogy', 'connections', 'reports', 'goals', 'moodle-desktop', 'moodle-courses', 'moodle-history', 'moodle-quiz', 'moodle-comparison', 'moodle-reflection', 'portfolio-tasks', 'guided-practice', 'ai-desktop', 'rubrics-ai', 'pedagogy-ai'];
for (const check of checks) if (await completedCheck(check) === undefined) await run(check, process.execPath, [`scripts/smoke-${check}.mjs`, '--packaged']);
if (await completedCheck('reports-pdf') === undefined) await run('reports-pdf', process.execPath, ['scripts/check-report-pdfs.mjs', '--packaged']);
let artifact;
if (portableMode) {
  await run('portable', process.execPath, ['scripts/smoke-portable.mjs']); checks.push('portable');
  const proof = JSON.parse(await readFile(`test-results/portable-${pkg.version}-verification.json`, 'utf8'));
  artifact = { portable: proof.portable, portableVerification: proof };
} else {
  const installer = `release/Tutor-Local-${pkg.version}-Instalador.exe`, bytes = await readFile(installer), sha256 = createHash('sha256').update(bytes).digest('hex');
  const integrity = await run('payload', require('7zip-bin').path7za, ['t', resolve(installer)]); if (!integrity.includes('Everything is Ok')) throw new Error('NSIS payload verification did not finish successfully.');
  await writeFile(installer + '.sha256', `${sha256}  Tutor-Local-${pkg.version}-Instalador.exe\n`);
  artifact = { installer: { path: installer, bytes: bytes.length, sha256, payloadIntegrity: '7-Zip passed' } };
}
const moodle = JSON.parse(await readFile('test-results/moodle-verification.json', 'utf8'));
const realMoodleDesktop = JSON.parse(await readFile('test-results/packaged-moodle-desktop-verification.json', 'utf8'));
await writeFile(`test-results/release-${pkg.version}-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), version: pkg.version, ...artifact, domainTests, packagedChecks: checks.length, checks, realMoodle: moodle, realMoodleDesktop, sourceModulesMatch: true, portableAssetCount, multimodalCaptureWorkflow: true, vulkanAssetsVerified: true, studentExperienceVerified:true, semanticAssetsVerified: true, semanticNativePlatform: 'win32/x64', semanticVcRuntimeBundled: true, compiledFileCount, rendererAssetsMatch: true, rendererAssetCount, pdfTextAndRenderVerified: true, pdfVisualReview: 'pending', fullRequirementCount: 80, remainingScope: 'active', cleanWindowsInstallerWizard: 'not verified', codeSigned: false }, null, 2));
console.log(`Release ${pkg.version} verified: ${domainTests} tests and ${checks.length} packaged workflows.`);
