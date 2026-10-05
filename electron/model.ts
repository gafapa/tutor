import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism, totalmem } from 'node:os';
import { createServer } from 'node:net';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ModelStatus } from '../shared/types.js';
import { MODEL } from './model-config.js';

async function freePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No se puede iniciar la IA local.'));
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

export async function fileHash(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export class LocalModel {
  private status: ModelStatus;
  private downloadController?: AbortController;
  private downloadTask?: Promise<void>;
  private startTask?: Promise<void>;
  private child?: ChildProcess;
  private endpoint = '';
  private apiKey = randomBytes(32).toString('hex');
  private verified = false;
  private chatController?: AbortController;
  private stopped = false;
  readonly modelPath: string;

  constructor(private modelDirectory: string, private runtimeDirectory: string) {
    this.modelPath = join(modelDirectory, MODEL.filename);
    const installed = existsSync(this.modelPath) && statSync(this.modelPath).size === MODEL.bytes;
    this.status = {
      state: installed ? 'ready' : 'missing', progress: installed ? 100 : 0,
      downloadedBytes: installed ? MODEL.bytes : 0, totalBytes: MODEL.bytes,
      message: installed ? 'El tutor está preparado para trabajar sin conexión.' : 'Activa la IA local para conversar con tus materiales.',
      modelName: MODEL.name, ramGB: Math.round(totalmem() / 1073741824)
    };
  }
  getStatus(): ModelStatus { return { ...this.status }; }
  async download(): Promise<void> {
    if (this.downloadTask) return this.downloadTask;
    if (this.status.state === 'ready' || this.status.state === 'running') return;
    this.downloadTask = this.performDownload();
    try { await this.downloadTask; } finally { this.downloadTask = undefined; }
  }
  private async performDownload() {
    mkdirSync(this.modelDirectory, { recursive: true });
    const partial = `${this.modelPath}.part`;
    this.downloadController = new AbortController();
    this.status = { ...this.status, state: 'downloading', progress: 0, downloadedBytes: 0, message: 'Descargando el modelo. Tus materiales permanecen en este ordenador.' };
    try {
      const response = await fetch(MODEL.url, { signal: this.downloadController.signal, redirect: 'follow' });
      if (!response.ok || !response.body) throw new Error('No se ha podido descargar el modelo. Comprueba la conexión y vuelve a intentarlo.');
      const hash = createHash('sha256');
      const tracker = new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
        hash.update(chunk);
        this.status.downloadedBytes += chunk.length;
        this.status.progress = Math.min(99, Math.round(this.status.downloadedBytes / MODEL.bytes * 100));
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body as never), tracker, createWriteStream(partial), { signal: this.downloadController.signal });
      this.status.message = 'Comprobando la integridad del modelo…';
      if (statSync(partial).size !== MODEL.bytes || hash.digest('hex') !== MODEL.sha256) throw new Error('La descarga está incompleta o no coincide con el modelo esperado. Vuelve a intentarlo.');
      renameSync(partial, this.modelPath);
      this.verified = true;
      this.status = { ...this.status, state: 'ready', progress: 100, message: 'La IA local está lista. Puedes desconectar Internet.' };
    } catch (error) {
      if (existsSync(partial)) unlinkSync(partial);
      if (this.downloadController.signal.aborted) {
        this.status = { ...this.status, state: 'missing', progress: 0, downloadedBytes: 0, message: 'Descarga cancelada. Puedes iniciarla cuando quieras.' };
        return;
      }
      this.status = { ...this.status, state: 'error', message: error instanceof Error ? error.message : 'No se ha podido descargar el modelo.' };
      throw new Error(this.status.message);
    } finally { this.downloadController = undefined; }
  }
  cancelDownload() { this.downloadController?.abort(); }
  cancelChat() { this.chatController?.abort(); }

  async ensureRunning() {
    if (this.stopped) throw new Error('La aplicación se está cerrando.');
    if (this.status.state === 'running' && this.child && this.child.exitCode === null) return;
    if (this.startTask) return this.startTask;
    if (!existsSync(this.modelPath)) throw new Error('Primero activa la IA local desde Ajustes.');
    this.startTask = this.startServer();
    try { await this.startTask; } finally { this.startTask = undefined; }
  }
  private async startServer() {
    try {
      this.status.message = 'Preparando el tutor en tu ordenador…';
      if (!this.verified) {
        if (await fileHash(this.modelPath) !== MODEL.sha256) throw new Error('El modelo local no supera la comprobación de integridad. Elimina el archivo del modelo y vuelve a descargarlo.');
        this.verified = true;
      }
      if (this.stopped) throw new Error('La aplicación se está cerrando.');
      const executable = join(this.runtimeDirectory, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
      if (!existsSync(executable)) throw new Error('Falta el motor de IA en esta instalación. Reinstala Tutor Local.');
      const port = await freePort();
      this.endpoint = `http://127.0.0.1:${port}`;
      const child = spawn(executable, ['--model', this.modelPath, '--host', '127.0.0.1', '--port', String(port), '--ctx-size', '8192', '--threads', String(Math.max(1, Math.min(6, availableParallelism() - 1))), '--n-gpu-layers', '0', '--api-key', this.apiKey, '--no-webui', '--offline', '--jinja', '--log-disable'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: this.runtimeDirectory });
      this.child = child;
      let failed = '';
      child.stdout?.on('data', () => {});
      child.stderr?.on('data', chunk => { failed = String(chunk).slice(-800); });
      child.on('error', () => { failed = 'No se ha podido ejecutar el motor de IA local.'; });
      child.on('exit', () => {
        if (this.child === child) {
          this.child = undefined;
          if (!this.stopped) this.status = { ...this.status, state: 'ready', message: 'El modelo está descargado. El tutor se iniciará con la próxima consulta.' };
        }
      });
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        if (this.stopped || child.exitCode !== null || child.killed || failed.includes('No se ha podido ejecutar')) throw new Error('El motor de IA no ha podido iniciarse en este equipo.');
        try {
          const health = await fetch(`${this.endpoint}/health`, { headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(1500) });
          if (health.ok) {
            this.status = { ...this.status, state: 'running', message: 'Tutor activo · procesamiento íntegramente local.' };
            return;
          }
        } catch { /* The server is still loading the model. */ }
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      throw new Error('El modelo está tardando demasiado en arrancar. Cierra otras aplicaciones y vuelve a intentarlo.');
    } catch (error) {
      this.child?.kill();
      this.child = undefined;
      this.status = { ...this.status, state: 'error', message: error instanceof Error ? error.message : 'No se puede iniciar el tutor local.' };
      throw error;
    }
  }
  async complete(messages: { role: string; content: string }[], options: { schema?: Record<string, unknown>; maxTokens?: number; status?: string } = {}): Promise<string> {
    if (this.chatController) throw new Error('Espera a que termine la consulta anterior.');
    const controller = new AbortController();
    this.chatController = controller;
    try {
      await this.ensureRunning();
      controller.signal.throwIfAborted();
      if (options.status) this.status.message = options.status;
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ messages, temperature: options.schema ? 0 : 0.3, max_tokens: options.maxTokens ?? 420, stream: false, ...(options.schema ? { response_format: { type: 'json_object', schema: options.schema } } : {}) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)])
      });
      if (!response.ok) throw new Error('El tutor local no ha podido completar la respuesta. Prueba con una pregunta más breve.');
      const data = await response.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
      if (options.schema && data.choices?.[0]?.finish_reason === 'length') throw new Error('La revisión automática no pudo terminar dentro del límite de respuesta. No se han guardado resultados incompletos.');
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('El tutor ha devuelto una respuesta vacía. Vuelve a intentarlo.');
      return text;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Consulta cancelada.');
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new Error('El tutor ha tardado demasiado en responder. Prueba con una consulta más breve.');
      throw error;
    } finally { this.chatController = undefined; if (this.status.state === 'running') this.status.message = 'Tutor activo · procesamiento íntegramente local.'; }
  }
  async shutdown() {
    this.stopped = true;
    this.cancelDownload();
    this.cancelChat();
    this.child?.kill();
    this.child = undefined;
    try { await this.downloadTask; } catch { /* A cancelled download is removed by performDownload. */ }
  }
}
