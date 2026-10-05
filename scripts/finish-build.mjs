import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('build/electron', { recursive: true });
await writeFile('build/electron/package.json', '{"type":"commonjs"}\n');
await writeFile('build/shared/package.json', '{"type":"commonjs"}\n');
