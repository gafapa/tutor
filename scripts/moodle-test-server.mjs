import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import net from 'node:net';
export async function startMoodle() {
  const root = resolve('.tools/moodle-test'), config = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8'));
  const phpRoot = join(root, 'php'); const env = { ...process.env, OPENSSL_CONF: join(phpRoot, 'extras/ssl/openssl.cnf') };
  const db = spawn(join(root, 'mariadb/mariadb-11.4.13-winx64/bin/mariadbd.exe'), [`--defaults-file=${join(root, 'database/my.ini')}`, '--bind-address=127.0.0.1', `--port=${config.dbPort}`, '--skip-log-bin'], { windowsHide: true, stdio: 'ignore' });
  const children = [db];
  const stop = async () => { for (const child of children.reverse()) { if (child.exitCode === null) { child.kill(); await new Promise(r => { const timer = setTimeout(r, 5000); child.once('exit', () => { clearTimeout(timer); r(); }); }); } } };
  const waitPort = async port => { for (let i = 0; i < 60; i++) { const ready = await new Promise(r => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); }); if (ready) return; await new Promise(r => setTimeout(r, 1000)); } throw new Error('Fixture server failed to start.'); };
  const action = async mode => { const child = spawn(join(phpRoot, 'php.exe'), [resolve('scripts/moodle-fixture.php'), mode], { windowsHide: true, env }); const chunks = []; child.stdout.on('data', c => chunks.push(c)); child.stderr.on('data', c => chunks.push(c)); const code = await new Promise((r, reject) => { child.once('error', reject); child.once('exit', r); }); if (code) { await writeFile(join(root, 'seed-error.log'), Buffer.concat(chunks)); throw new Error('Fixture action failed; inspect .tools/moodle-test/seed-error.log.'); } };
  try {
    await waitPort(config.dbPort); await action('seed');
    const web = spawn(join(phpRoot, 'php.exe'), ['-S', `127.0.0.1:${config.webPort}`, '-t', join(root, 'moodle')], { windowsHide: true, env, stdio: 'ignore' }); children.push(web); await waitPort(config.webPort);
    const seeded = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8'));
    return { config: seeded, siteUrl: `http://127.0.0.1:${config.webPort}`, action, stop, stopWeb: () => web.kill() };
  } catch (error) { await stop(); throw error; }
}
