import { open } from 'node:fs/promises';
export async function readLocalFile(path: string, maxBytes = 20 * 1024 * 1024): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const file = await handle.stat();
    if (!file.isFile()) throw new Error('Selecciona un archivo.');
    if (file.size > maxBytes) throw new Error(`El archivo supera el límite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
    const buffer = Buffer.alloc(file.size + 1); let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
      if (!bytesRead) break; count += bytesRead;
    }
    const after = await handle.stat();
    if (count !== file.size || after.size !== file.size || after.mtimeMs !== file.mtimeMs) throw new Error('El archivo cambió durante la lectura. Espera a que termine de guardarse y vuelve a añadirlo.');
    return buffer.subarray(0, count);
  } finally { await handle.close(); }
}
