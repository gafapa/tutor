import { useEffect, useState, type FormEvent } from 'react';
import { PencilLine, Plus, Lightbulb, ArrowRight, CheckCircle2, RotateCcw, Clock3, Play, Pause, BookOpen, ListChecks } from 'lucide-react';
import type { Attempt, Exercise } from '../../shared/types';
import { Empty, Modal, PageTitle, Spinner, SubjectRequired, errorMessage, relativeDate, type PageProps } from '../ui';
import { SessionTimerCard } from './Sessions';
import { ExerciseTags } from '../learning-ui';
import { OcrCaptureDialog, CaptureLink } from '../ocr-ui';
import { outcomeName } from '../ui';

export default function Practice(props: PageProps) {
  const { data, subject, refresh, notify, navigate, onNewSubject, practiceConceptId } = props;
  const concepts = data.concepts.filter(c => c.subjectId === subject?.id);
  const [conceptId, setConceptId] = useState('');
  const [exercise, setExercise] = useState<Exercise | null>();
  const [answer, setAnswer] = useState('');
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<Attempt>();
  const [started, setStarted] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState(false);
  const [capture, setCapture] = useState(false);
  useEffect(() => { setConceptId(concepts.find(c => c.id === practiceConceptId)?.id ?? concepts.find(c => data.practiceConceptIds.includes(c.id))?.id ?? concepts[0]?.id ?? ''); setResult(undefined); setExercise(undefined); }, [subject?.id, concepts.length, practiceConceptId]);
  async function next(id = conceptId) {
    if (!id) { setExercise(null); return; }
    setBusy(true);
    try { setExercise(await window.tutor.nextExercise(id)); setAnswer(''); setHints(0); setResult(undefined); setStarted(Date.now()); }
    catch (error) { notify(errorMessage(error), true); } finally { setBusy(false); }
  }
  useEffect(() => { void next(conceptId); }, [conceptId]);
  if (!subject) return <SubjectRequired onNewSubject={onNewSubject} />;
  const attempts = data.attempts.filter(a => a.subjectId === subject.id).slice(-4).reverse();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!exercise || !answer.trim() || busy || result) return;
    setBusy(true);
    try { setResult(await window.tutor.submitExercise({ exerciseId: exercise.id, conceptId: exercise.conceptId, answer, hints, durationSeconds: Math.min(86400, Math.max(1, Math.floor((Date.now() - started) / 1000))) })); await refresh(); }
    catch (error) { notify(errorMessage(error), true); } finally { setBusy(false); }
  }
  return <><PageTitle eyebrow={subject.name} title="Aprender también es intentarlo." description="Un ejercicio, una pista y un paso más cerca de comprender." action={<button className="button secondary" onClick={() => setRecord(true)}><Plus size={17} /> Registrar un ejercicio</button>} />
    <div className="material-ocr-action"><button className="button secondary" onClick={() => setCapture(true)}>Capturar mi resolución</button></div>
    <div className="practice-layout"><section className="practice-panel"><div className="practice-panel-heading"><span className="eyebrow"><PencilLine size={16} /> PRÁCTICA GUIADA</span>{concepts.length > 0 && <select aria-label="Concepto a practicar" value={conceptId} onChange={event => setConceptId(event.target.value)} disabled={busy}>{concepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
      {exercise === undefined && concepts.length > 0 ? <div className="practice-loading"><Spinner label="Preparando ejercicio…" /></div> : exercise ? <div className="exercise"><span className="exercise-step">TU RETO DE HOY</span><h2>{exercise.statement}</h2><p className="exercise-instruction">Inténtalo primero. Puedes pedir una pista si la necesitas.</p><form onSubmit={submit}><label>Tu respuesta<input aria-label="Respuesta al ejercicio" value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Escribe el resultado…" disabled={Boolean(result) || busy} required maxLength={20000} /></label>{hints > 0 && <div className="hint"><Lightbulb size={18} /><p>{exercise.hint}</p></div>}{!result && <div className="exercise-actions"><button type="button" className="text-button" onClick={() => setHints(1)} disabled={hints > 0 || busy}><Lightbulb size={16} />{hints ? 'Pista utilizada' : 'Necesito una pista'}</button><button className="button primary" disabled={busy || !answer.trim()}>{busy ? <Spinner label="Comprobando…" /> : <>Comprobar respuesta <ArrowRight size={16} /></>}</button></div>}</form>
      {result && <div className={`exercise-result ${result.outcome === 'correct' ? 'correct' : 'incorrect'}`}><span>{result.outcome === 'correct' ? <CheckCircle2 size={23} /> : <RotateCcw size={23} />}</span><div><h3>{result.outcome === 'correct' ? 'Un paso más. Bien resuelto.' : 'Aquí hay una oportunidad de aprender.'}</h3><p>{result.feedback}</p><small>{result.hints ? 'Resuelto con una pista. La ayuda queda registrada.' : 'Intento sin pistas. La evidencia queda registrada.'}</small><ExerciseTags classification={result.classification} concepts={data.concepts} /><button className="button secondary" onClick={() => { void next(); }}>Probar otro ejercicio <ArrowRight size={15} /></button></div></div>}</div> : <Empty icon={<BookOpen size={28} />} title={concepts.length ? 'Practica con tus propios ejercicios' : 'Dibuja primero el mapa de esta unidad'} action={<div className="empty-actions"><button className="button primary" onClick={() => concepts.length ? setRecord(true) : navigate('progress')}>{concepts.length ? 'Registrar un ejercicio' : 'Añadir conceptos'}</button>{concepts.length > 0 && <button className="button secondary" onClick={() => navigate('tutor')}>Pedir práctica al tutor</button>}</div>}>{concepts.length ? 'El banco incluye fracciones, porcentajes, ecuaciones de primer grado, potencias de 2, sistema binario y subnetting. Para otros conceptos, puedes registrar tus intentos o pedir un ejercicio al tutor local.' : 'Añade los conceptos que estás estudiando y vincula tus intentos a cada uno.'}</Empty>}
    </section><aside><SessionTimerCard {...props} conceptId={conceptId} /><div className="context-tip"><h3>El intento también cuenta.</h3><p>Conservar un error te permite ver después qué cambió en tu forma de resolverlo.</p></div></aside></div>
    <div className="section-heading"><h2>Mis últimos intentos</h2><button className="text-button" onClick={() => navigate('progress')}>Ver historial <ArrowRight size={15} /></button></div><div className="recent-attempts">{attempts.length ? attempts.map(attempt => <div className="attempt-row" key={attempt.id}><span className={`attempt-icon ${attempt.outcome === 'correct' ? 'sage' : 'amber'}`}><ListChecks size={19} /></span><div><strong>{attempt.statement}</strong><CaptureLink source={attempt.ocrSource} /><span>{attempt.source === 'verified' ? 'Corrección comprobada' : 'Autoevaluación'} · {attempt.hints} pistas · {relativeDate(attempt.createdAt)}</span></div><span className={`outcome ${attempt.outcome}`}>{outcomeName(attempt.outcome)}</span></div>) : <p className="inline-placeholder">Tu primer intento será el principio de este historial.</p>}</div>
    {capture && <OcrCaptureDialog subjectId={subject.id} data={data} refresh={refresh} notify={notify} destination="attempt" onClose={() => setCapture(false)} />}
    {record && <RecordAttempt {...props} onClose={() => setRecord(false)} />}
  </>;
}

export { outcomeName } from '../ui';
function RecordAttempt({ data, subject, refresh, notify, onClose }: PageProps & { onClose(): void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      await window.tutor.saveAttempt({ subjectId: subject!.id, conceptId: String(form.get('concept')) || null, statement: String(form.get('statement')), answer: String(form.get('answer')), feedback: String(form.get('feedback')), outcome: String(form.get('outcome')) as Attempt['outcome'], hints: Number(form.get('hints')), durationSeconds: Number(form.get('minutes')) * 60 });
      await refresh(); onClose(); notify('Intento guardado como autoevaluación.');
    } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <Modal title="Registrar un ejercicio" onClose={() => { if (!busy) onClose(); }}><p className="modal-intro">Guarda lo que intentaste y lo que aprendiste. Esta valoración quedará identificada como autoevaluación.</p><form className="form-stack" onSubmit={submit}><label>Concepto<select name="concept"><option value="">Sin vincular a un concepto</option>{data.concepts.filter(c => c.subjectId === subject!.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Enunciado<textarea name="statement" rows={2} required maxLength={10000} /></label><label>Tu respuesta<textarea name="answer" rows={3} maxLength={20000} /></label><div className="form-row"><label>Tu valoración<select name="outcome"><option value="ungraded">Todavía sin corregir</option><option value="correct">Correcto</option><option value="partial">Parcialmente correcto</option><option value="incorrect">Necesita revisión</option></select></label><label>Pistas utilizadas<input name="hints" type="number" defaultValue={0} min={0} max={50} required /></label><label>Tiempo (minutos)<input name="minutes" type="number" defaultValue={5} min={0} max={1440} step={1} required /></label></div><label>¿Qué has aprendido o qué te costó?<textarea name="feedback" rows={3} maxLength={10000} placeholder="Una reflexión, la corrección del profesor o el paso que quieres revisar…" /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy}>Guardar intento</button></div></form></Modal>;
}
