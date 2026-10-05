import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import type { Snapshot } from '../shared/types';
import type { SearchHit, SemanticProgress, SemanticSearchInput, SemanticSearchResult } from '../shared/semantic';
import { Modal, Spinner, dateLabel, errorMessage } from './ui';
import { MaterialPreview } from './pages/Materials';
import { CaptureLink } from './ocr-ui';
import { outcomeName } from './pages/Practice';

const kindNames = { material: 'Material', attempt: 'Ejercicio', submission: 'Entrega', portfolio: 'Portfolio', reflection: 'Reflexión' };
export function SemanticSearchDialog({ subjectId, data, scope = 'all', onClose }: { subjectId: string; data: Snapshot; scope?: SemanticSearchInput['scope']; onClose(): void }) {
  const [input, setInput] = useState<SemanticSearchInput>({ subjectId, query: '', scope, conceptId: null, outcome: 'all', since: null, until: null, order: 'relevance', page: 1 });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState<SemanticProgress | null>(null), [result, setResult] = useState<SemanticSearchResult>(), [selected, setSelected] = useState<SearchHit>();
  const active = useRef(true), searching = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; if (searching.current) void window.tutor.cancelSemanticSearch().catch(() => {}); }; }, []);
  useEffect(() => {
    if (!busy) return; let disposed = false;
    const update = () => { void window.tutor.semanticProgress().then(value => { if (!disposed) setProgress(value); }).catch(() => {}); };
    update(); const timer = setInterval(update, 500); return () => { disposed = true; clearInterval(timer); };
  }, [busy]);
  async function search(page = 1) {
    setBusy(true); searching.current = true; setError(''); setProgress(null);
    try { const value = await window.tutor.semanticSearch({ ...input, page }); if (active.current) setResult(value); }
    catch (failure) { if (active.current) { setError(errorMessage(failure)); setResult(undefined); } }
    finally { searching.current = false; if (active.current) { setBusy(false); setProgress(null); } }
  }
  function change(value: Partial<SemanticSearchInput>) { setInput(current => ({ ...current, ...value, page: 1 })); setResult(undefined); setError(''); }
  function submit(event: FormEvent) { event.preventDefault(); void search(); }
  return <Modal title="Buscar por significado" onClose={onClose} wide>
    <p className="modal-intro">Describe lo que recuerdas, aunque no uses las mismas palabras. Las coincidencias son aproximadas: abre el original para comprobarlas. Todo se procesa en este ordenador.</p>
    <form className="form-stack semantic-search-form" onSubmit={submit}>
      <label>¿Qué quieres encontrar?<input autoFocus required minLength={2} maxLength={2000} value={input.query} disabled={busy} onChange={event => change({ query: event.target.value })} placeholder="Ej. Cómo representar una porción de pizza" /></label>
      <div className="semantic-filters">
        <label>Asignatura<select aria-label="Asignatura" disabled={busy} value={input.subjectId ?? ''} onChange={event => change({ subjectId: event.target.value || null, conceptId: null })}><option value="">Todas mis asignaturas</option>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        <label>Buscar en<select aria-label="Buscar en" disabled={busy} value={input.scope} onChange={event => change({ scope: event.target.value as SemanticSearchInput['scope'], outcome: 'all', conceptId: null })}><option value="all">Materiales e historial</option><option value="materials">Materiales actuales</option><option value="history">Historial y trabajos</option></select></label>
      </div>
      <details className="semantic-advanced"><summary>Filtrar por concepto, resultado y fechas</summary><div className="semantic-filters">
        <label>Concepto<select aria-label="Concepto" disabled={busy || input.scope === 'materials'} value={input.conceptId ?? ''} onChange={event => change({ conceptId: event.target.value || null })}><option value="">Todos los conceptos</option>{data.concepts.filter(c => !input.subjectId || c.subjectId === input.subjectId).map(concept => <option key={concept.id} value={concept.id}>{concept.name}{!input.subjectId ? ` · ${data.subjects.find(s => s.id === concept.subjectId)?.name}` : ''}</option>)}</select></label>
        <label>Resultado del ejercicio<select aria-label="Resultado del ejercicio" disabled={busy || input.scope === 'materials'} value={input.outcome} onChange={event => change({ outcome: event.target.value as SemanticSearchInput['outcome'] })}><option value="all">Cualquier resultado</option><option value="incorrect">Incorrecto</option><option value="partial">Parcial</option><option value="correct">Correcto</option><option value="ungraded">Sin corregir</option></select></label>
        <label>Desde<input type="date" disabled={busy} value={input.since ?? ''} onChange={event => change({ since: event.target.value || null })} /></label>
        <label>Hasta<input type="date" disabled={busy} value={input.until ?? ''} min={input.since ?? undefined} onChange={event => change({ until: event.target.value || null })} /></label>
        <label>Orden<select aria-label="Orden" disabled={busy} value={input.order} onChange={event => change({ order: event.target.value as SemanticSearchInput['order'] })}><option value="relevance">Más relacionados</option><option value="oldest">Más antiguos primero</option><option value="newest">Más recientes primero</option></select></label>
      </div></details>
      <div className="modal-actions">{busy ? <button type="button" className="button secondary" onClick={() => { void window.tutor.cancelSemanticSearch().catch(failure => setError(errorMessage(failure))); }}>Cancelar búsqueda</button> : <button className="button primary"><Search size={16} /> Buscar</button>}</div>
    </form>
    {busy && <div className="semantic-progress" role="status"><Spinner label={progress?.stage === 'indexing' ? `Preparando ${progress.current} de ${progress.total} fragmentos…` : progress?.stage === 'searching' ? 'Buscando coincidencias…' : 'Preparando búsqueda local…'} /><p>La primera búsqueda prepara los textos seleccionados. Las siguientes reutilizan el índice cifrado.</p></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {result && <section aria-label="Resultados de búsqueda" className="semantic-results"><p role="status">{result.total} {result.total === 1 ? 'registro relacionado' : 'registros relacionados'} · {result.searchedFragments} fragmentos consultados</p>
      {!result.hits.length && <p>No se han encontrado coincidencias con estos filtros. Prueba otra descripción o busca una palabra exacta en la biblioteca o el historial.</p>}
      {result.hits.map(hit => <article className="semantic-hit" key={hit.key}><div className="semantic-hit-meta"><span>{kindNames[hit.kind]} · {hit.subjectName}</span><span>{dateLabel(hit.createdAt)}</span></div><h3>{hit.title}</h3>{hit.outcome && <p><strong>{outcomeName(hit.outcome)}</strong> · {hit.origin === 'verified' ? 'Comprobado' : 'Autoevaluación'}</p>}<blockquote>{hit.text}</blockquote><div className="semantic-hit-footer"><span>{hit.kind === 'material' ? `Versión ${hit.version} · página ${hit.page}` : 'Registro original'} · {hit.match === 'text' ? 'Coincidencia de palabras' : hit.match === 'both' ? 'Palabras y significado' : 'Significado aproximado'}</span><button className="button secondary" onClick={() => setSelected(hit)}>Abrir original</button></div></article>)}
      {result.pages > 1 && <div className="semantic-pagination"><button className="button secondary" disabled={busy || result.page <= 1} onClick={() => { void search(result.page - 1); }}>Anterior</button><span>Página {result.page} de {result.pages}</span><button className="button secondary" disabled={busy || result.page >= result.pages} onClick={() => { void search(result.page + 1); }}>Siguiente</button></div>}
    </section>}
    {selected && <SearchOriginal hit={selected} data={data} onClose={() => setSelected(undefined)} />}
  </Modal>;
}

export function SearchOriginal({ hit, data, onClose }: { hit: SearchHit; data: Snapshot; onClose(): void }) {
  const material = hit.kind === 'material' ? data.materials.find(m => m.id === hit.sourceId && m.subjectId === hit.subjectId && m.version === hit.version) : undefined;
  const attempt = hit.kind === 'attempt' ? data.attempts.find(a => a.id === hit.sourceId && a.subjectId === hit.subjectId) : undefined;
  const submission = hit.kind === 'submission' ? data.rubricSubmissions.find(s => s.id === hit.sourceId && s.subjectId === hit.subjectId) : undefined;
  const entry = hit.kind === 'portfolio' ? data.portfolio.find(p => p.id === hit.sourceId && p.subjectId === hit.subjectId) : undefined;
  const session = hit.kind === 'reflection' ? data.studySessions.find(s => s.id === hit.sourceId && s.subjectId === hit.subjectId) : undefined;
  const diagnostic = hit.kind === 'reflection' ? data.diagnostics.find(s => s.id === hit.sourceId && s.subjectId === hit.subjectId) : undefined;
  const sections = attempt ? [['Enunciado', attempt.statement], ['Tu respuesta', attempt.answer], ['Corrección o reflexión', attempt.feedback]] : submission ? [['Instrucciones', submission.instructions], ['Entrega', submission.text]] : entry ? [['Contenido', entry.content], ['Reflexión', entry.reflection]] : session?.review ? [['Qué aprendí', session.review.learned], ['Dificultad', session.review.difficulty], ['Siguiente paso', session.review.nextStep]] : diagnostic ? [['Reflexión inicial', diagnostic.reflection]] : [];
  const sourceText = material ? material.text.split('\f')[hit.page - 1] : attempt ? attempt[hit.field as 'statement' | 'answer' | 'feedback'] : submission ? submission[hit.field as 'text' | 'instructions'] : entry ? entry[hit.field as 'content' | 'reflection'] : session?.review ? session.review[hit.field as 'learned' | 'difficulty' | 'nextStep'] : diagnostic?.reflection;
  if (typeof sourceText !== 'string' || sourceText.slice(hit.start, hit.end) !== hit.text) return <Modal title="Registro no disponible" onClose={onClose}><p>El registro se ha eliminado o ha cambiado. Actualiza los datos y vuelve a buscar.</p></Modal>;
  if (material) return <MaterialPreview material={material} onClose={onClose} />;
  return <Modal title={hit.title} onClose={onClose} wide><p className="modal-intro">{hit.subjectName} · {dateLabel(hit.createdAt)} · {kindNames[hit.kind]}{attempt ? ` · ${outcomeName(attempt.outcome)} · ${attempt.source === 'verified' ? 'Comprobado' : 'Autoevaluación'}` : ''}</p>{sections.map(([title, text]) => <section className="semantic-original-section" key={title}><h3>{title}</h3><p>{text || 'Sin texto registrado.'}</p></section>)}{attempt && <CaptureLink source={attempt.ocrSource} />}</Modal>;
}
