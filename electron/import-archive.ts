import yauzl from 'yauzl';
import { crc32 } from 'node:zlib';

const MAX_ENTRIES = 5000, MAX_ENTRY = 32 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024;

/** Read and check every entry, without ever extracting files to disk. */
export async function readOfficeArchive(buffer: Buffer): Promise<Map<string, Buffer>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, result) => error ? reject(error) : resolve(result!));
  });
  const files = new Map<string, Buffer>();
  try {
    if (zip.entryCount > MAX_ENTRIES) throw new Error('El documento contiene demasiados archivos internos (máximo 5000).');
    await new Promise<void>((resolve, reject) => {
      let total = 0, settled = false;
      const fail = (error: unknown) => { if (!settled) { settled = true; zip.close(); reject(error); } };
      zip.on('error', fail);
      zip.on('end', () => { if (!settled) { settled = true; resolve(); } });
      zip.on('entry', (entry: yauzl.Entry) => {
        if (settled) return;
        const name = entry.fileName;
        if (files.has(name) || /[\u0000-\u001f]/.test(name)) return fail(new Error('El documento contiene rutas internas repetidas o no válidas.'));
        if (entry.generalPurposeBitFlag & 1) return fail(new Error('Los documentos protegidos con contraseña no están admitidos.'));
        if (entry.uncompressedSize > MAX_ENTRY || total + entry.uncompressedSize > MAX_TOTAL) return fail(new Error('El documento supera el límite de contenido descomprimido (32 MB por parte, 100 MB en total).'));
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return fail(error ?? new Error('No se puede leer el documento.'));
          const chunks: Buffer[] = []; let size = 0, checksum = 0;
          const keep = /(?:\.xml|\.rels)$/i.test(name);
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length; total += chunk.length;
            if (size > MAX_ENTRY || total > MAX_TOTAL) { stream.destroy(); return fail(new Error('El contenido descomprimido supera los límites de lectura.')); }
            checksum = crc32(chunk, checksum);
            if (keep) chunks.push(chunk);
          });
          stream.on('end', () => {
            if (settled) return;
            if (size !== entry.uncompressedSize || checksum !== entry.crc32) return fail(new Error('El documento está dañado: una parte interna no coincide con su comprobación.'));
            files.set(name, keep ? Buffer.concat(chunks) : Buffer.alloc(0));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  } finally { zip.close(); }
  if (!files.has('[Content_Types].xml') || !files.has('_rels/.rels')) throw new Error('El archivo no es un documento Office válido.');
  return files;
}
