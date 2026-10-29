import { totalmem, freemem, cpus } from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import type { LearningSetup, AIConfiguration, AIProvider } from '../shared/setup.js';
import { LocalModel } from './model.js';
import { MODEL_CATALOG, modelDefinition, recommendedModel, modelAssets } from './model-catalog.js';
import { CodexAccount, runClaude } from './account-ai.js';

export class AIService {
  private local: LocalModel;
  private controller?: AbortController;
  private authController?: AbortController;
  private codex?: CodexAccount;
  private graphics: string[] = [];
  private graphicsMemoryGB: number | null = null;
  constructor(private directory: string, private runtime: string, private settings: () => LearningSetup) {
    this.local = this.createLocal();
    if (process.platform === 'win32') execFile('nvidia-smi.exe',['--query-gpu=memory.total','--format=csv,noheader,nounits'],{windowsHide:true,timeout:5000},(error,out)=>{if(!error){const memory=Number(out.trim().split(/\r?\n/)[0]);if(Number.isFinite(memory)&&memory>0)this.graphicsMemoryGB=Math.round(memory/1024);}});
    if (process.platform === 'win32') execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'],{windowsHide:true,timeout:10000},(_error,out)=>{this.graphics=out.trim().split(/\r?\n/).filter(Boolean);});
  }
  private createLocal() { return new LocalModel(join(this.directory,'models'),this.runtime,modelDefinition(this.settings().localModelId??recommendedModel(Math.round(totalmem()/1073741824)).id)); }
  configuration(): AIConfiguration {
    const ramGB=Math.round(totalmem()/1073741824),selected=this.settings().localModelId ?? recommendedModel(ramGB).id;
    return {hardware:{ramGB,availableGB:Math.round(freemem()/1073741824),cpu:cpus()[0]?.model??'Desconocido',cores:cpus().length,graphics:this.graphics,graphicsMemoryGB:this.graphicsMemoryGB,acceleration:'CPU. La GPU se detecta como información; este motor no activa aceleración gráfica.'},models:MODEL_CATALOG.map(m=>({...m,recommended:m.id===recommendedModel(ramGB).id,bytes:modelAssets(m).reduce((total,asset)=>total+asset.bytes,0),installed:modelAssets(m).every(asset=>existsSync(join(this.directory,'models',asset.filename))&&statSync(join(this.directory,'models',asset.filename)).size===asset.bytes)})),selected,provider:this.settings().aiProvider??'local'};
  }
  getStatus() { const status=this.local.getStatus(),provider=this.settings().aiProvider??'local'; if(provider==='local')return status;return {...status,state: this.settings().cloudConsent?'ready' as const:'missing' as const,modelName:provider==='codex'?'Codex · cuenta ChatGPT':'Claude · cuenta personal',message:'Procesamiento externo con tu cuenta. Comprueba la sesión en Ajustes.'}; }
  async reconfigure() { if(this.controller)throw new Error('Espera a que termine la consulta.');this.authController?.abort();await this.local.shutdown();this.codex?.stop();this.codex=undefined;this.local=this.createLocal(); }
  download(){return this.local.download();} cancelDownload(){this.local.cancelDownload();}
  cancelChat(){this.controller?.abort();this.local.cancelChat();}
  private executable(provider:'codex'|'claude') { const path=provider==='codex'?this.settings().codexExecutable:this.settings().claudeExecutable;if(!path||!existsSync(path))throw new Error('Selecciona el ejecutable oficial desde Ajustes.');return path; }
  private codexClient(){return this.codex??=new CodexAccount(this.executable('codex'),join(this.directory,'accounts'));}
  async login(provider:'codex'|'claude') { if(provider==='codex')return this.codexClient().login();if(this.authController)throw new Error('Ya hay un acceso en curso.');const controller=new AbortController();this.authController=controller;try{await runClaude(this.executable('claude'),join(this.directory,'accounts'),['auth','login'],'',controller.signal);return '';}finally{this.authController=undefined;} }
  async logout(provider:'codex'|'claude') { if(provider==='codex')await this.codexClient().logout();else await runClaude(this.executable('claude'),join(this.directory,'accounts'),['auth','logout'],''); }
  async accountStatus(provider:'codex'|'claude'){if(provider==='codex')return this.codexClient().status();const result=JSON.parse(await runClaude(this.executable('claude'),join(this.directory,'accounts'),['auth','status','--json'],''));return result.loggedIn?'Cuenta de Claude conectada.':'Inicia sesión con tu cuenta de Claude.';}
  async complete(messages:{role:string;content:string}[],options:{schema?:Record<string,unknown>;maxTokens?:number;status?:string;image?:{mime:string;base64:string}}={}) {
    const provider:AIProvider=this.settings().aiProvider??'local';if(provider==='local')return this.local.complete(messages,options);
    if(!this.settings().cloudConsent)throw new Error('Autoriza el contexto externo en Ajustes para usar esta cuenta.');
    if(this.controller)throw new Error('Espera a que termine la consulta anterior.');
    const controller=new AbortController();this.controller=controller;
    try {
      const prompt=messages.map(m=>`${m.role}: ${m.content}`).join('\n\n')+(options.schema?'\nReturn only valid JSON matching this schema: '+JSON.stringify(options.schema):'');
      if(provider==='codex')return await this.codexClient().complete(prompt,controller.signal,options.schema,options.image);
      const authentication=JSON.parse(await runClaude(this.executable('claude'),join(this.directory,'accounts'),['auth','status','--json'],'',controller.signal));
      if(!authentication.loggedIn||!['claude.ai','oauth_token'].includes(authentication.authMethod))throw new Error('Inicia sesión con tu cuenta de Claude desde Ajustes.');
      const imageInput=options.image?JSON.stringify({type:'user',message:{role:'user',content:[{type:'image',source:{type:'base64',media_type:options.image.mime,data:options.image.base64}},{type:'text',text:prompt}]}})+'\n':prompt;
      const raw=await runClaude(this.executable('claude'),join(this.directory,'accounts'),['-p','--output-format',options.image?'stream-json':'json',...(options.image?['--input-format','stream-json','--verbose']:[]),'--tools','','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--no-session-persistence'],imageInput,controller.signal);
      const data=options.image?raw.trim().split(/\r?\n/).map(line=>JSON.parse(line)).filter(row=>row.type==='result').at(-1):JSON.parse(raw);if(!data||data.is_error||typeof data.result!=='string'||!data.result.trim())throw new Error('Claude no completó la respuesta.');return data.result;
    }finally{this.controller=undefined;}
  }
  assertVision() { if ((this.settings().aiProvider??'local')==='local' && !modelDefinition(this.settings().localModelId??recommendedModel(Math.round(totalmem()/1073741824)).id).vision) throw new Error('El modelo elegido solo admite texto. Selecciona y descarga Gemma 4 en Ajustes para leer imágenes.'); if ((this.settings().aiProvider??'local')!=='local' && !this.settings().cloudConsent) throw new Error('Autoriza el envío de imágenes al proveedor en Ajustes.'); }
  visionMetadata() { const provider=this.settings().aiProvider??'local'; const definition=modelDefinition(this.settings().localModelId??recommendedModel(Math.round(totalmem()/1073741824)).id); return { provider, model:provider==='local'?definition.name:provider, modelHashes:provider==='local'?modelAssets(definition).map(asset=>asset.sha256):[] }; }
  async shutdown(){this.cancelChat();this.authController?.abort();this.codex?.stop();await this.local.shutdown();}
}
