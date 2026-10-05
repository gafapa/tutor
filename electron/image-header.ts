export function imageDimensions(bytes: Buffer): { width: number; height: number; format: 'png' | 'jpeg' | 'webp' } {
  let width = 0, height = 0, format: 'png' | 'jpeg' | 'webp';
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    format = 'png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    format = 'jpeg'; let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error('La cabecera JPEG no es válida.');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset); if (length < 2 || offset + length > bytes.length) throw new Error('La imagen JPEG está incompleta.');
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) { height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break; }
      offset += length;
    }
  } else if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    format = 'webp'; const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') { if (bytes[20] & 2) throw new Error('La imagen WebP es animada. Selecciona una imagen fija.'); width = bytes.readUIntLE(24, 3) + 1; height = bytes.readUIntLE(27, 3) + 1; }
    else if (kind === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
    else if (kind === 'VP8L' && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
  } else throw new Error('Selecciona una imagen PNG, JPEG o WebP. SVG, GIF animado y otros formatos todavía no están admitidos.');
  if (!width || !height || width > 10000 || height > 10000 || width * height > 20000000) throw new Error('La imagen supera los límites de 20 megapíxeles o 10.000 píxeles por lado, o no contiene dimensiones válidas.');
  return { width, height, format };
}
