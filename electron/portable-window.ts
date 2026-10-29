import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { openPortableKey, portableKeyExists } from './portable-key.js';

export async function unlockPortable(directory: string, appPath: string): Promise<{ key: Buffer; window: BrowserWindow } | undefined> {
  const existing = portableKeyExists(directory), file = join(appPath, 'assets/portable.html');
  const window = new BrowserWindow({ width: 660, height: 710, minWidth: 540, minHeight: 650, show: false, title: 'Tutor Local · Portable', backgroundColor: '#f7f8f4', autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'portable-preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false, offscreen: Boolean(process.env.TUTOR_SMOKE) } });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const authorize = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender.id !== window.webContents.id || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pathToFileURL(file).href) throw new Error('Origen no autorizado.');
  };
  return new Promise((resolveResult, reject) => {
    let settled = false, busy = false;
    const cleanup = () => { ipcMain.removeHandler('tutor:portable-status'); ipcMain.removeHandler('tutor:portable-unlock'); };
    ipcMain.handle('tutor:portable-status', event => { authorize(event); return { existing }; });
    ipcMain.handle('tutor:portable-unlock', (event, value: unknown) => {
      authorize(event);
      if (busy || settled) return { ok: false, error: 'Espera a que termine la apertura.' };
      busy = true;
      try {
        const input = z.object({ password: z.string().min(12).max(256), confirmation: z.string().max(256).optional() }).strict().parse(value);
        const key = openPortableKey(directory, input.password, input.confirmation);
        settled = true; cleanup(); resolveResult({ key, window }); return { ok: true };
      } catch (error) { return { ok: false, error: error instanceof z.ZodError ? 'Usa una contraseña de entre 12 y 256 caracteres.' : error instanceof Error ? error.message : 'No se puede abrir la carpeta portable.' }; }
      finally { busy = false; }
    });
    window.on('closed', () => { cleanup(); if (!settled) { settled = true; resolveResult(undefined); } });
    window.once('ready-to-show', () => window.show());
    void window.loadFile(file).catch(error => { cleanup(); settled = true; window.destroy(); reject(error); });
  });
}
