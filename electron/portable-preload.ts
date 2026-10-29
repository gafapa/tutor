import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('portable', {
  status: () => ipcRenderer.invoke('tutor:portable-status'),
  unlock: (input: { password: string; confirmation?: string }) => ipcRenderer.invoke('tutor:portable-unlock', input)
});
