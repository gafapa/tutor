import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
const root = resolve('.tools/moodle-test'), phpRoot = join(root, 'php'), dbRoot = join(root, 'mariadb/mariadb-11.4.13-winx64');
const php = join(phpRoot, 'php.exe'), moodle = join(root, 'moodle'), data = join(root, 'database');
async function port() { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const value = server.address().port; await new Promise(r => server.close(r)); return value; }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function run(executable, args, log, options = {}) {
  const child = spawn(executable, args, { cwd: root, windowsHide: true, ...options });
  const chunks = []; child.stdout?.on('data', c => chunks.push(c)); child.stderr?.on('data', c => chunks.push(c));
  const code = await new Promise((r, reject) => { child.once('error', reject); child.once('exit', r); });
  await writeFile(join(root, log), Buffer.concat(chunks));
  if (code !== 0) throw new Error(`Fixture preparation failed (${code}); inspect ${log}.`);
}
await mkdir(root, { recursive: true });
const configFile = join(root, 'fixture.json');
let config = await exists(configFile) ? JSON.parse(await readFile(configFile, 'utf8')) : { dbPort: await port(), webPort: await port(), dbPassword: randomBytes(18).toString('hex'), adminPassword: 'Fixture!' + randomBytes(12).toString('hex') };
await writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
await writeFile(join(phpRoot, 'php.ini'), `extension_dir="${join(phpRoot, 'ext').replaceAll('\\', '/')}"\nmemory_limit=512M\nmax_input_vars=5000\nmax_execution_time=0\ndate.timezone=UTC\ndisplay_errors=Off\nlog_errors=On\nerror_log="${join(root, 'php-error.log').replaceAll('\\', '/')}"\n${['curl','fileinfo','gd','intl','mbstring','mysqli','openssl','sodium','zip'].map(e => 'extension=' + e).join('\n')}\n`);
await run(php, ['-m'], 'php-modules.log');
if (!(await exists(join(data, 'mysql')))) {
  console.log('Initializing isolated MariaDB data.');
  await run(join(dbRoot, 'bin/mariadb-install-db.exe'), [`--datadir=${data}`, `--port=${config.dbPort}`, `--password=${config.dbPassword}`, '--silent'], 'database-install.log');
}
const db = spawn(join(dbRoot, 'bin/mariadbd.exe'), [`--defaults-file=${join(data, 'my.ini')}`, '--bind-address=127.0.0.1', `--port=${config.dbPort}`, '--skip-log-bin'], { cwd: root, windowsHide: true, stdio: 'ignore' });
try {
  for (let i = 0; i < 60; i++) {
    const ready = await new Promise(r => { const s = net.connect(config.dbPort, '127.0.0.1', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
    if (ready) break; if (i === 59) throw new Error('MariaDB did not start.'); await new Promise(r => setTimeout(r, 1000));
  }
  if (!(await exists(join(moodle, 'config.php')))) {
    console.log('Installing real Moodle 4.5 on the isolated database.');
    const mysql = spawn(join(dbRoot, 'bin/mariadb.exe'), ['--host=127.0.0.1', `--port=${config.dbPort}`, '--user=root'], { windowsHide: true, env: { ...process.env, MYSQL_PWD: config.dbPassword }, stdio: ['pipe', 'pipe', 'pipe'] });
    mysql.stdin.end('CREATE DATABASE IF NOT EXISTS moodlefixture CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    const code = await new Promise((r, reject) => { mysql.once('error', reject); mysql.once('exit', r); }); if (code) throw new Error('Could not create fixture database.');
    await run(php, [join(moodle, 'admin/cli/install.php'), '--non-interactive', '--agree-license', '--lang=en', `--wwwroot=http://127.0.0.1:${config.webPort}`, `--dataroot=${join(root, 'moodledata')}`, '--dbtype=mariadb', '--dbhost=127.0.0.1', `--dbport=${config.dbPort}`, '--dbname=moodlefixture', '--dbuser=root', `--dbpass=${config.dbPassword}`, '--fullname=Tutor Local Test', '--shortname=Fixture', '--adminuser=fixtureadmin', `--adminpass=${config.adminPassword}`, '--adminemail=fixture@example.invalid'], 'moodle-install.log');
    console.log('Moodle installation completed.');
  } else console.log('Existing isolated Moodle configuration found.');
  console.log('Fixture dependencies ready; no Windows services were installed.');
} finally { db.kill(); }
