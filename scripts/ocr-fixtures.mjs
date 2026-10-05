import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';

function sheet(title, text) {
  const canvas = createCanvas(1600, 1000), ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1600, 1000); ctx.fillStyle = 'black'; ctx.font = 'bold 58px Arial'; ctx.fillText(title, 90, 120); ctx.font = '48px Arial';
  text.split('\n').forEach((line, index) => ctx.fillText(line, 90, 230 + index * 90)); return canvas;
}
function chunk(type, bytes) { const name = Buffer.from(type), length = Buffer.alloc(4), check = Buffer.alloc(4); length.writeUInt32BE(bytes.length); check.writeUInt32BE(crc32(Buffer.concat([name, bytes]))); return Buffer.concat([length, name, bytes, check]); }
function scannedPdf(canvases) {
  const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from(`<< /Type /Pages /Count ${canvases.length} /Kids [${canvases.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`)];
  const stream = (dict, bytes) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${bytes.length} >>\nstream\n`), bytes, Buffer.from('\nendstream')]);
  canvases.forEach((canvas, index) => { const page = 3 + index * 3; objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 500] /Resources << /XObject << /Scan ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`)); objects.push(stream(`/Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, canvas.encodeSync('jpeg', 95))); objects.push(stream('', Buffer.from('q 800 0 0 500 0 0 cm /Scan Do Q'))); });
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0]; let offset = chunks[0].length;
  objects.forEach((object, index) => { const bytes = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]); offsets.push(offset); chunks.push(bytes); offset += bytes.length; });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`)); return Buffer.concat(chunks);
}
export async function createOcrFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const original = sheet('Ejercicio de calculo', '2 + 2 = 5\n5 x 3 = 15\nComprueba el primer paso.'), png = original.encodeSync('png');
  const files = { png: join(directory, 'calculo.png'), jpeg: join(directory, 'calculo.jpg'), webp: join(directory, 'calculo.webp'), glg: join(directory, 'galego.png'), eng: join(directory, 'english.png'), rotated: join(directory, 'girado.png'), blank: join(directory, 'vacio.png'), pdf: join(directory, 'escaneado.pdf') };
  await writeFile(files.png, Buffer.concat([png.subarray(0, 33), chunk('tEXt', Buffer.from('Description\0fixture-metadata-not-stored')), png.subarray(33)]));
  await writeFile(files.jpeg, original.encodeSync('jpeg', 95)); await writeFile(files.webp, original.encodeSync('webp', 95));
  await writeFile(files.glg, sheet('A aprendizaxe', 'A rede ten trinta e duas combinacions.\nO alumnado revisa os seus exercicios.').encodeSync('png'));
  await writeFile(files.eng, sheet('Study exercise', 'The student checks each step.\n2 + 2 = 5').encodeSync('png'));
  const rotated = createCanvas(1000, 1600), ctx = rotated.getContext('2d'); ctx.translate(1000, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(original, 0, 0); await writeFile(files.rotated, rotated.encodeSync('png'));
  const blank = createCanvas(800, 600), blankCtx = blank.getContext('2d'); blankCtx.fillStyle = 'white'; blankCtx.fillRect(0, 0, 800, 600); await writeFile(files.blank, blank.encodeSync('png'));
  await writeFile(files.pdf, scannedPdf(['UNO', 'DOS', 'TRES'].map(page => sheet('PAGINA ' + page, '2 + 2 = 5\n5 x 3 = 15'))));
  return files;
}
