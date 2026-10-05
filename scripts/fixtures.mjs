import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const require = createRequire(import.meta.url);

function pdfBytes(pages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  for (let i = 0; i < pages.length; i++) {
    const content = `BT /F1 14 Tf 60 740 Td (${pages[i].replace(/[()\\]/g, '')}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  let content = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(content)); content += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(content);
}
export async function createImportFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const pdf = join(directory, 'material.pdf');
  const docx = join(directory, 'material.docx');
  await writeFile(pdf, pdfBytes(['Fracciones: partes iguales de un todo.', 'Segunda pagina: suma de fracciones con el mismo denominador.']));
  const JSZip = require('jszip'); const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Apuntes DOCX: una fracción representa partes iguales.</w:t></w:r></w:p></w:body></w:document>');
  await writeFile(docx, await zip.generateAsync({ type: 'nodebuffer' }));
  return { pdf, docx };
}
export async function createExtendedImportFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const PptxGenJS = require('pptxgenjs'), deck = new PptxGenJS();
  deck.author = 'Pruebas de Tutor Local'; deck.title = 'Redes y fracciones'; deck.lang = 'es-ES';
  const first = deck.addSlide(); first.addText('Potencias de dos y subnetting', { x: 1, y: 1, w: 8, h: 1 });
  first.addText('Una red /27 tiene 32 direcciones.', { x: 1, y: 2, w: 8, h: 1 });
  first.addNotes('Pedir al alumno que explique por qué 2 elevado a 5 es 32.');
  const second = deck.addSlide(); second.addText('Tabla de prefijos', { x: 1, y: 0.5, w: 8, h: 1 });
  second.addTable([['Prefijo', 'Direcciones'], ['/26', '64'], ['/28', '16']], { x: 1, y: 2, w: 8, h: 2 });
  deck.addSlide(); // A truly blank slide must retain its source position.
  const pptx = join(directory, 'presentacion.pptx'), html = join(directory, 'pagina.html'), srt = join(directory, 'video.srt'), vtt = join(directory, 'video.vtt');
  await deck.writeFile({ fileName: pptx, compression: true });
  await writeFile(html, '<!doctype html><html lang="es"><head><title>Fracciones en la web</title><script>globalThis.importExecuted = true; fetch("https://external.invalid/tracking")</script><link rel="stylesheet" href="https://external.invalid/style.css"></head><body><nav>Menú privado</nav><main><h1>Sumar fracciones</h1><p>Una fracción representa partes iguales de un todo.</p><p hidden>Texto oculto privado</p><p>La suma de 1/4 y 1/4 es 1/2.</p><img src="https://external.invalid/image.jpg" alt="Cuatro partes iguales"><iframe src="https://external.invalid"></iframe><form>Campo secreto</form></main></body></html>');
  await writeFile(srt, '1\n00:00:01,000 --> 00:00:05,500\nUna red /27 tiene <b>32 direcciones</b>.\n\n2\n00:00:06,000 --> 00:00:10,000\nComprueba las potencias de dos.\n');
  await writeFile(vtt, 'WEBVTT\n\nNOTE comentario interno no importado\n\nSTYLE\n::cue {color:red}\n\nprimera explicación\n00:01.000 --> 00:05.500 align:start\n<v Profesora>Una fracción representa partes iguales.\n\n00:06.000 --> 00:10.000\n<00:06.100>Ahora <b>sumamos</b>.\n');
  return { pptx, html, srt, vtt };
}
