import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Sparkles, Send, ShieldCheck, MessageCircle, ListOrdered, PencilLine, BookOpen, ArrowRight, Square, Quote } from 'lucide-react';
import { CaptureLink } from '../ocr-ui';
import { outcomeName } from './Practice';
import type { ChatMode } from '../../shared/types';
import { Modal, dateLabel, PageTitle, Spinner, SubjectRequired, errorMessage, type PageProps } from '../ui';

const MODES: { id: ChatMode; label: string; description: string; icon: typeof MessageCircle }[] = [
  { id: 'socratic', label: 'Preguntas y pistas', description: 'Un paso cada vez', icon: MessageCircle },
  { id: 'explain', label: 'Paso a paso', description: 'Otra forma de entenderlo', icon: ListOrdered },
  { id: 'practice', label: 'Practicar', description: 'Un nuevo reto', icon: PencilLine }
];

export default function Tutor({ data, subject, refresh, notify, navigate, onNewSubject }: PageProps) {
  const [mode, setMode] = useState<ChatMode>('socratic');
  const [draft, setDraft] = useState('');
  const [evidenceId, setEvidenceId] = useState<string>();
  const [pending, setPending] = useState<{ text: string; subjectId: string }>();
  const end = useRef<HTMLDivElement>(null);
  const busy = Boolean(pending);
  const ready = ['ready', 'running'].includes(data.model.state);
  const messages = data.messages.filter(message => message.subjectId === subject?.id);
  const concepts = data.concepts.filter(c => c.subjectId === subject?.id);
  const materials = data.materials.filter(m => m.subjectId === subject?.id);
  const selectedEvidence = data.attempts.find(a => a.id === evidenceId && a.subjectId === subject?.id);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, busy]);
  useEffect(() => { setDraft(''); }, [subject?.id]);
  if (!subject) return <SubjectRequired onNewSubject={onNewSubject} />;
  async function send(event: FormEvent) {
    event.preventDefault(); const text = draft.trim(); if (!text || busy || !ready) return;
    const currentSubject = subject!.id;
    setDraft(''); setPending({ text, subjectId: currentSubject });
    try { await window.tutor.chat({ subjectId: currentSubject, text, mode }); await refresh(); }
    catch (error) { notify(errorMessage(error), true); setDraft(text); }
    finally { setPending(undefined); }
  }
  const suggestions = concepts.length ? [`Ayúdame a entender ${concepts[0].name.toLowerCase()}.`, `Ponme un ejemplo de ${concepts.at(-1)!.name.toLowerCase()}.`, '¿Qué debería repasar primero según mis ejercicios?'] : ['Ayúdame a comprender el tema de estos apuntes.', 'Explícamelo con un ejemplo sencillo.', 'Hazme una pregunta para comprobar qué entiendo.'];
  return <><PageTitle eyebrow={subject.name} title="Vamos a entenderlo juntos." description="Pregunta, busca otra explicación o intenta un nuevo paso." />
    <div className="tutor-layout"><section className="chat-panel"><div className="mode-selector" aria-label="Modo de tutoría">{MODES.map(item => <button key={item.id} aria-pressed={mode === item.id} disabled={busy} className={mode === item.id ? 'selected' : ''} onClick={() => setMode(item.id)}><item.icon size={16} />{item.label}</button>)}</div>
      <div className="chat-history" aria-live="polite">
        {!messages.length && !busy && <div className="chat-welcome"><span className="tutor-orb"><Sparkles size={31} /></span><h2>¿Qué te gustaría entender hoy?</h2><p>{MODES.find(m => m.id === mode)!.description}. Usa tus palabras; podemos empezar por lo que te resulte más difícil.</p><div className="prompt-suggestions">{suggestions.map(text => <button key={text} onClick={() => setDraft(text)}>{text}<ArrowRight size={15} /></button>)}</div></div>}
        {messages.map(message => <article className={`chat-message ${message.role}`} key={message.id}><span className="message-avatar">{message.role === 'assistant' ? <Sparkles size={17} /> : data.settings.name.slice(0, 1).toUpperCase() || 'T'}</span><div className="message-content"><div className="message-author">{message.role === 'assistant' ? 'Tu tutor' : 'Tú'}<span>{MODES.find(m => m.id === message.mode)?.label}</span></div><div className="message-text">{message.text}</div>{message.retrieval && <p className="subtle-note">{message.retrieval === 'hybrid' ? 'Contexto recuperado por palabras y significado, en este ordenador.' : 'Búsqueda por palabras: el modelo de significado no estaba disponible.'}{message.evidenceIds?.length ? ` · ${message.evidenceIds.length} ejercicios relacionados.` : ''}</p>}{Boolean(message.evidenceIds?.length) && <details className="message-sources"><summary>Ejercicios relacionados · {message.evidenceIds!.length}</summary>{message.evidenceIds!.map(id => { const attempt = data.attempts.find(a => a.id === id && a.subjectId === subject.id); return attempt ? <button className="button secondary" key={id} onClick={() => setEvidenceId(id)}>{dateLabel(attempt.createdAt)} · {attempt.statement.slice(0, 100)}</button> : <p key={id}>Ejercicio eliminado.</p>; })}</details>}{message.citations.length > 0 && <details className="message-sources"><summary><BookOpen size={14} /> Materiales recuperados · {message.citations.length}</summary>{message.citations.map((citation, index) => <div className="citation" key={`${citation.materialId}-${index}`}><strong>[{index + 1}] {citation.name}<span> · página {citation.page}</span></strong><p><Quote size={13} />{citation.text}</p></div>)}</details>}</div></article>)}
        {pending?.subjectId === subject.id && <><article className="chat-message user"><span className="message-avatar">T</span><div className="message-content"><div className="message-author">Tú</div><div className="message-text">{pending.text}</div></div></article><article className="chat-message assistant"><span className="message-avatar"><Sparkles size={17} /></span><div className="message-content"><Spinner label="Pensando en tu ordenador…" /><p className="thinking-note">La primera respuesta puede tardar mientras se prepara el modelo.</p></div></article></>}
        <div ref={end} />
      </div>
      {!ready && <div className="chat-setup"><Sparkles size={20} /><div><strong>{data.model.state === 'downloading' ? 'Estamos preparando tu tutor local' : 'Activa tu tutor local'}</strong><span>{data.model.state === 'downloading' ? `Descarga del modelo: ${data.model.progress}%` : 'Descarga el modelo una vez y conversa sin conexión.'}</span></div><button className="button secondary" onClick={() => navigate('settings')}>{data.model.state === 'downloading' ? 'Ver descarga' : 'Preparar tutor'}<ArrowRight size={15} /></button></div>}
      <form className="chat-composer" onSubmit={send}><textarea aria-label="Tu pregunta al tutor" placeholder={ready ? 'Escribe tu duda. Un pequeño paso es un buen comienzo…' : 'Puedes escribir tu pregunta y activar después el tutor…'} value={draft} onChange={event => setDraft(event.target.value)} rows={2} maxLength={2000} disabled={busy} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />{busy ? <button type="button" className="send-button stop" aria-label="Cancelar consulta" onClick={() => { void window.tutor.cancelChat(); }}><Square size={17} /></button> : <button className="send-button" aria-label="Enviar pregunta" disabled={!ready || !draft.trim()}><Send size={19} /></button>}</form>
      <div className="chat-footer"><ShieldCheck size={13} /> Procesamiento local · {data.model.modelName}<span>Enter para enviar · Mayús + Enter para otra línea</span></div>
    </section><aside className="tutor-context"><div className="context-card"><span className="eyebrow">EL CONTEXTO DE ESTA ASIGNATURA</span><h3>{subject.name}</h3><p>{subject.goals || 'Entender los conceptos y comprobarlos con tus propios intentos.'}</p><div className="context-count"><BookOpen size={17} /><strong>{materials.length}</strong> materiales disponibles</div><button className="text-button" onClick={() => navigate('materials')}>Ver mis materiales <ArrowRight size={15} /></button></div><div className="context-tip"><span className="feature-icon amber"><MessageCircle size={21} /></span><h3>Una duda concreta ayuda.</h3><p>Cuéntale al tutor qué has intentado y en qué paso te has quedado. Le darás un buen punto de partida.</p></div><div className="context-privacy"><ShieldCheck size={18} /><p>Tus preguntas y las fuentes recuperadas se procesan en este equipo.</p></div></aside></div>
    {selectedEvidence && <Modal title="Ejercicio relacionado con la consulta" onClose={() => setEvidenceId(undefined)} wide><p className="modal-intro">{dateLabel(selectedEvidence.createdAt)} · {outcomeName(selectedEvidence.outcome)} · {selectedEvidence.source === 'verified' ? 'Comprobado' : 'Autoevaluación'}</p><h3>{selectedEvidence.statement}</h3><section className="semantic-original-section"><h3>Tu respuesta</h3><p>{selectedEvidence.answer || 'Sin respuesta registrada.'}</p><h3>Corrección o reflexión</h3><p>{selectedEvidence.feedback || 'Sin corrección registrada.'}</p></section><CaptureLink source={selectedEvidence.ocrSource} /></Modal>}
  </>;
}
