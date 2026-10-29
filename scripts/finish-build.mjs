import { mkdir, writeFile, rm } from 'node:fs/promises';
await mkdir('build/electron', { recursive: true });
await writeFile('build/electron/package.json', '{"type":"commonjs"}\n');
await writeFile('build/shared/package.json', '{"type":"commonjs"}\n');

// Remove the obsolete generated worker when rebuilding an existing alpha checkout.
await rm('build/electron/ocr-tesseract-worker.js', { force: true });
