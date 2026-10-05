import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const packaged = process.argv.includes('--packaged'), prefix = packaged ? 'packaged-' : '';
const verificationPath = `test-results/${prefix}reports-verification.json`, verification = JSON.parse(await readFile(verificationPath, 'utf8'));
const run = async (executable, args) => { const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }), chunks = []; child.stdout.on('data', c => chunks.push(c)); child.stderr.on('data', c => chunks.push(c)); const code = await new Promise((r, reject) => { child.once('error', reject); child.once('exit', r); }); if (code) throw Error(Buffer.concat(chunks).toString('utf8')); return Buffer.concat(chunks).toString('utf8'); };
const python = resolve('.tools/pdf-check/python/python.exe'), poppler = resolve('.tools/pdf-check/poppler-26.09.0/Library/bin/pdftoppm.exe');
const result = await run(python, ['scripts/check-report-pdfs.py', verificationPath]); console.log(result.trim());
const textChecks = JSON.parse(await readFile(`test-results/${prefix}reports-pdf-text-verification.json`, 'utf8'));
for (const [kind, path] of Object.entries(verification.pdfOutputs)) {
  if (!['weekly', 'unit', 'transition'].includes(kind)) throw Error('Tipo de informe desconocido.');
  const pngPrefix = join(resolve('tmp/pdfs'), `${prefix}${kind}-page`);
  const staleImages = (await readdir('tmp/pdfs')).filter(n => n.startsWith(`${prefix}${kind}-page-`) && n.endsWith('.png'));
  for (const name of staleImages) await unlink(join(resolve('tmp/pdfs'), name));
  await run(poppler, ['-r', '95', '-png', path, pngPrefix]);
  const images = (await readdir('tmp/pdfs')).filter(n => n.startsWith(`${prefix}${kind}-page-`) && n.endsWith('.png'));
  if (images.length !== textChecks[kind].pages) throw Error('No se han renderizado todas las páginas del PDF.');
  textChecks[kind].renderedImages = images.map(n => resolve('tmp/pdfs', n));
}
await writeFile(`test-results/${prefix}reports-pdf-render-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), checks: textChecks, visualReview: 'pending' }, null, 2));
console.log('Todas las páginas renderizadas para inspección visual.');
