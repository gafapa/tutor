import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const children = [];
const run = (file, args, env = process.env) => {
  const child = spawn(file, args, { stdio: 'inherit', windowsHide: true, env });
  children.push(child);
  return child;
};
const compile = run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'electron/tsconfig.json']);
await new Promise((resolve, reject) => compile.on('exit', code => code === 0 ? resolve() : reject(new Error('No se puede compilar la aplicación.'))));
await import('./finish-build.mjs');
run(process.execPath, ['node_modules/vite/bin/vite.js']);
for (let tries = 0; tries < 60; tries++) {
  try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {}
  await new Promise(resolve => setTimeout(resolve, 300));
}
const app = run(require('electron'), ['.'], { ...process.env, TUTOR_DEV_URL: 'http://127.0.0.1:5173' });
const cleanup = () => children.forEach(child => { if (child.exitCode === null) child.kill(); });
app.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
