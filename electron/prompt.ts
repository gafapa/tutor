import type { Citation } from '../shared/types.js';

export function tutorPrompt(instruction: string, sources: Citation[], history: { role: string; content: string }[], question: string) {
  const citations = sources.slice(0, 4).map(source => ({ ...source, text: source.text.slice(0, 700) }));
  const recent = history.slice(-4).map(message => ({ ...message, content: message.content.slice(0, 500) }));
  const system = () => `${instruction}\nFUENTES RECUPERADAS:\n${citations.map((source, index) => `[${index + 1}] ${source.name}, página ${source.page}\n<material>${source.text}</material>`).join('\n\n') || 'No hay fragmentos relevantes para esta pregunta.'}`;
  const length = () => system().length + question.length + recent.reduce((sum, message) => sum + message.content.length, 0);
  // Keep complete recent exchanges and source excerpts rather than slicing a finished prompt.
  while (length() > 6000 && recent.length) recent.splice(0, 2);
  while (length() > 6000 && citations.length) citations.pop();
  if (length() > 6000) throw new Error('La consulta contiene demasiado contexto. Prueba con una pregunta más breve.');
  return { citations, messages: [{ role: 'system', content: system() }, ...recent, { role: 'user', content: question }] };
}
