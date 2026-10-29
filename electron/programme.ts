import { z } from 'zod';
import type { ProgrammeRow } from '../shared/setup.js';
export const programmeRow = z.object({ kind:z.enum(['unit','competency','criterion','content','outcome']),code:z.string().max(50),title:z.string().trim().min(1).max(120),description:z.string().max(3000),page:z.number().int().min(1).max(300),quote:z.string().trim().min(5).max(400) }).strict();
export const programmeRows = z.array(programmeRow).min(1).max(500);
export function validateProgrammeRows(rows: unknown, text: string): ProgrammeRow[] {
  const pages=text.split('\f');const parsed=programmeRows.parse(rows);
  for(const row of parsed) if(!pages[row.page-1]?.includes(row.quote))throw new Error(`La referencia de «${row.title}» no existe en la página ${row.page}. Revisa la extracción.`);
  return parsed;
}
export function programmeChunks(text:string) {
  const chunks:{page:number;text:string}[]=[];
  for(const [index,page]of text.split('\f').entries())for(let start=0;start<page.length;start+=3500)if(page.slice(start,start+3800).trim())chunks.push({page:index+1,text:page.slice(start,start+3800)});
  if(!chunks.length)throw new Error('El PDF no contiene texto. Usa un modelo multimodal y revisa la transcripción del documento.');
  if(chunks.length>120)throw new Error('Divide la programación en documentos más pequeños (máximo 120 fragmentos por importación). No se ha enviado contenido a la IA.');
  return chunks;
}
export const programmeSchema={type:'object',properties:{rows:{type:'array',items:{type:'object',properties:{kind:{type:'string',enum:['unit','competency','criterion','content','outcome']},code:{type:'string'},title:{type:'string'},description:{type:'string'},page:{type:'integer'},quote:{type:'string'}},required:['kind','code','title','description','page','quote'],additionalProperties:false}}},required:['rows'],additionalProperties:false};
