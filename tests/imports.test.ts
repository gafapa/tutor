import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { extractMaterial, extractMaterialBuffer } from '../electron/importer';
import { readOfficeArchive } from '../electron/import-archive';
import { xmlPart } from '../electron/import-presentation';
import { decodeText, htmlMaterial, subtitleMaterial } from '../electron/import-text';
import { Store } from '../electron/store';
import { retrieve } from '../electron/retrieval';
import { encodeBackup, decodeBackup } from '../electron/backup';

const directory = resolve('.tools/import-test', randomUUID());
const fixtures = import('../scripts/fixtures.mjs').then(module => module.createExtendedImportFixtures(directory));
async function deckZip() { return JSZip.loadAsync(await readFile((await fixtures).pptx)); }
const bytes = (zip: JSZip) => zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

test('PPTX generado con una biblioteca de presentaciones conserva texto, tablas, notas y posiciones vacías', async () => {
  const material = await extractMaterial((await fixtures).pptx);
  assert.equal(material.kind, 'pptx'); assert.equal(material.pageCount, 3);
  const pages = material.text.split('\f'); assert.equal(pages.length, 3);
  assert.match(pages[0], /Una red \/27 tiene 32 direcciones/); assert.match(pages[0], /Notas del profesor:\nPedir al alumno/);
  assert.match(pages[1], /Prefijo\tDirecciones/); assert.match(pages[1], /\/26\t64/); assert.equal(pages[2], '');
});
test('PPTX usa el orden declarado, aunque no coincida con el número de archivo', async () => {
  const zip = await deckZip(), name = 'ppt/presentation.xml', xml = await zip.file(name)!.async('string');
  const slides = xml.match(/<p:sldId\b[^>]+\/>/g)!; assert.equal(slides.length, 3);
  zip.file(name, xml.replace(slides.join(''), [slides[1], slides[0], slides[2]].join('')));
  const material = await extractMaterialBuffer('reordenada.pptx', await bytes(zip));
  assert.match(material.text.split('\f')[0], /Tabla de prefijos/); assert.match(material.text.split('\f')[1], /Una red \/27/);
});
test('PPTX reconoce espacios de nombres strict y prefijos distintos', async () => {
  const zip = await deckZip();
  for (const name of Object.keys(zip.files).filter(n => /\.(xml|rels)$/.test(n))) {
    let xml = await zip.file(name)!.async('string');
    xml = xml.replaceAll('http://schemas.openxmlformats.org/presentationml/2006/main', 'http://purl.oclc.org/ooxml/presentationml/main').replaceAll('http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main').replaceAll('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships').replace(/(<\/?|xmlns:)p:/g, '$1pres:').replaceAll('xmlns:p=', 'xmlns:pres=');
    zip.file(name, xml);
  }
  const material = await extractMaterialBuffer('strict.pptx', await bytes(zip)); assert.match(material.text, /32 direcciones/); assert.match(material.text, /Pedir al alumno/);
});
test('PPTX rechaza diapositivas y notas ausentes o externas', async () => {
  const zip = await deckZip(); zip.remove('ppt/slides/slide1.xml');
  await assert.rejects(() => bytes(zip).then(b => extractMaterialBuffer('incompleta.pptx', b)), /Falta una parte/);
  const other = await deckZip(), name = 'ppt/_rels/presentation.xml.rels', xml = await other.file(name)!.async('string');
  other.file(name, xml.replace('Target="slides/slide1.xml"', 'Target="https://external.invalid/slide.xml" TargetMode="External"'));
  await assert.rejects(() => bytes(other).then(b => extractMaterialBuffer('externa.pptx', b)), /externo/);
});
test('Office rechaza contenido comprimido excesivo, rutas repetidas y comprobaciones dañadas', async () => {
  const zip = new JSZip(); zip.file('[Content_Types].xml', '<Types/>'); zip.file('_rels/.rels', '<Relationships/>'); zip.file('a.xml', '<a/>'); zip.file('b.xml', '<b/>');
  const normal = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  await assert.doesNotReject(() => readOfficeArchive(normal));
  const damaged = Buffer.from(normal); damaged[damaged.indexOf(Buffer.from('<a/>')) + 1] = 98;
  await assert.rejects(() => readOfficeArchive(damaged), /dañado/);
  const duplicate = Buffer.from(normal.toString('latin1').replaceAll('b.xml', 'a.xml'), 'latin1');
  await assert.rejects(() => readOfficeArchive(duplicate), /repetidas/);
  const bomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); bomb.writeUInt32LE(33 * 1024 * 1024, central + 24);
  await assert.rejects(() => readOfficeArchive(bomb), /descomprimido/);
  const falseSize = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const falseCentral = falseSize.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); falseSize.writeUInt32LE(1, falseCentral + 24);
  await assert.rejects(() => readOfficeArchive(falseSize), /byte|size|dañado/);
});
test('XML malformado, DTD y estructuras muy profundas se rechazan', () => {
  assert.throws(() => xmlPart(Buffer.from('<a><b></a>')));
  assert.throws(() => xmlPart(Buffer.from('<!DOCTYPE a SYSTEM "file:///private"><a/>')), /externas/);
  assert.throws(() => xmlPart(Buffer.from('<a>'.repeat(131) + '</a>'.repeat(131))), /compleja/);
});
test('HTML extrae texto y tablas sin scripts, navegación, formularios ni elementos ocultos', () => {
  const text = htmlMaterial('<html><head><title>Lección &amp; repaso</title><script>secreto</script></head><body><nav>menú</nav><main><h1>Fracciones</h1><p hidden>oculto</p><div aria-hidden="true"><b>oculto2</b></div><p style="display:none">oculto3</p><p>2<sup>3</sup> = 8</p><table><tr><th>Prefijo</th><th>Total</th></tr><tr><td>/27</td><td>32</td></tr></table><img src="https://external.invalid" alt="Partes iguales"><iframe>externo</iframe><form>contraseña</form></main></body></html>');
  assert.match(text, /Lección & repaso/); assert.match(text, /2\^\(3\) = 8/); assert.match(text, /Prefijo\tTotal/); assert.match(text, /Imagen: Partes iguales/);
  assert.doesNotMatch(text, /secreto|menú|oculto|externo|contraseña|https:/);
});
test('se conserva texto UTF-8 y UTF-16 con BOM y se rechaza codificación dañada', async () => {
  const text = 'Fracción, cálculo y enseñanza en galego: acción.';
  assert.equal(decodeText(Buffer.from(text)), text);
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]); assert.equal(decodeText(le), text);
  const be = Buffer.from(text, 'utf16le').swap16(); assert.equal(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), text);
  await assert.rejects(() => extractMaterialBuffer('roto.txt', Buffer.from([0xc3, 0x28])), /codificación/);
});
test('SRT y WebVTT conservan tiempos y voz, con metadatos y marcas fuera del contenido', async () => {
  const paths = await fixtures, srt = await extractMaterial(paths.srt), vtt = await extractMaterial(paths.vtt);
  assert.match(srt.text, /\[00:00:01\.000 → 00:00:05\.500\]/); assert.match(srt.text, /32 direcciones/);
  assert.match(vtt.text, /Profesora: Una fracción/); assert.doesNotMatch(vtt.text, /WEBVTT|comentario interno|STYLE|color:red|align:start|00:06\.100|<b>/);
});
test('transcripciones extensas se agrupan con citas de sección y tiempos intactos', () => {
  const raw = 'WEBVTT\n\n' + Array.from({ length: 121 }, (_, index) => `${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000 --> ${String(Math.floor((index + 1) / 60)).padStart(2, '0')}:${String((index + 1) % 60).padStart(2, '0')}.000\nConcepto ${index === 120 ? 'subnetting' : 'básico'}`).join('\n\n');
  const parsed = subtitleMaterial(raw, 'vtt'); assert.equal(parsed.pageCount, 3);
  const citations = retrieve([{ ...parsed, id: randomUUID(), subjectId: 's', name: 'Vídeo', kind: 'vtt', createdAt: '', hash: '', version: 1 }], 's', 'subnetting');
  assert.equal(citations[0].page, 3); assert.match(citations[0].text, /02:00\.000 → 02:01\.000/);
});
test('subtítulos con tiempos malformados, inversión, índices incorrectos o sin cabecera se rechazan', () => {
  assert.throws(() => subtitleMaterial('00:01.000 --> 00:02.000\nHola', 'vtt'), /WEBVTT/);
  for (const time of ['00:00:61,000 --> 00:01:10,000', '00:00:02,000 --> 00:00:01,000', '00:00:02,000 --> 00:00:02,000']) assert.throws(() => subtitleMaterial(`1\n${time}\nHola`, 'srt'));
  assert.throws(() => subtitleMaterial('texto\n00:00:01,000 --> 00:00:02,000\nHola', 'srt'), /índice/);
});
test('lectura limita bytes y texto, rechaza vacío y conserva extensión en nombres largos', async () => {
  await assert.rejects(() => extractMaterialBuffer('grande.txt', Buffer.alloc(20 * 1024 * 1024 + 1)), /20 MB/);
  await assert.rejects(() => extractMaterialBuffer('mucho.txt', Buffer.from('a'.repeat(2000001))), /demasiado texto/);
  await assert.rejects(() => extractMaterialBuffer('vacío.html', Buffer.from('<script>oculto</script>')), /No se ha encontrado texto/);
  const material = await extractMaterialBuffer('á'.repeat(150) + '.html', Buffer.from('<p>Contenido</p>')); assert.ok(material.name.length <= 120); assert.ok(material.name.endsWith('.html'));
});
test('los nuevos materiales mantienen versiones, copias cifradas y aislamiento sin crear notas ni dominio', async () => {
  await mkdir(directory, { recursive: true }); const key = randomBytes(32), path = join(directory, 'historial.tutor');
  const store = await Store.open(path, key, resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  try {
    const subject = store.createDemo(), other = store.createSubject({ name: 'Otra materia', level: '', teacher: '', goals: '', color: 'blue' });
    for (const kind of ['pptx', 'html', 'srt', 'vtt']) assert.equal(store.addMaterial(subject.id, kind, kind, `Contenido ${kind}`), true);
    assert.equal(store.addMaterial(subject.id, 'presentacion.pptx', 'pptx', 'Tabla primera versión'), true);
    assert.equal(store.addMaterial(subject.id, 'presentacion.pptx', 'pptx', 'Tabla segunda versión'), true);
    assert.equal(store.addMaterial(subject.id, 'duplicado', 'html', 'Contenido html'), false);
    assert.equal(retrieve(store.snapshot().materials, other.id, 'Contenido').length, 0);
    const current = retrieve(store.snapshot().materials.filter(m => m.name === 'presentacion.pptx'), subject.id, 'Tabla versión');
    assert.equal(current.length, 1); assert.match(current[0].text, /segunda/); assert.doesNotMatch(current[0].text, /primera/);
    const snapshot = store.snapshot(); assert.equal(snapshot.attempts.length, 0); assert.ok(snapshot.estimates.every(e => e.status === 'unseen'));
    const copy = decodeBackup(encodeBackup(store.exportData(), 'copia privada segura'), 'copia privada segura'); store.importData(copy);
    assert.equal(JSON.parse(store.exportData()).version, 12);
    const legacy = JSON.parse(store.exportData()); legacy.version = 10; legacy.tables.materials = legacy.tables.materials.filter((m: { kind: string }) => m.kind === 'note'); store.importData(JSON.stringify(legacy));
    assert.equal(JSON.parse(store.exportData()).version, 12); assert.equal(store.snapshot().attempts.length, 0);
    assert.throws(() => store.addMaterial(subject.id, 'Inválido', 'exe', 'contenido'));
  } finally { store.close(); }
  assert.equal((await readFile(path)).includes(Buffer.from('Contenido html')), false);
});
