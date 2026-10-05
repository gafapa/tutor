import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Compass, Info, Lightbulb, Pause, Save, X } from 'lucide-react';
import type { DiagnosticView, SelfRating } from '../../shared/types';
import { Empty, Modal, PageTitle, Spinner, SubjectRequired, dateLabel, errorMessage, type PageProps } from '../ui';

const ratingNames: Record<SelfRating, string> = { unsure: 'Tengo dudas', learning: 'Estoy aprendiendo', confident: 'Me siento seguro/a' };

export default function Diagnostic(props: PageProps) {
  const { data, subject, refresh, notify, navigate, onNewSubject } = props;
  const concepts = data.concepts.filter(c => c.subjectId === subject?.id);
  const supported = concepts.filter(c => data.practiceConceptIds.includes(c.id));
  const sessions = data.diagnostics.filter(d => d.subjectId === subject?.id).slice().reverse();
  const active = sessions.find(s => s.status === 'active');
  const [selectedId, setSelectedId] = useState(active?.id ?? sessions.find(s => s.status === 'completed')?.id ?? '');
  const [view, setView] = useState<DiagnosticView>();
  const [ratings, setRatings] = useState<Record<string, SelfRating>>({});
  const [answer, setAnswer] = useState('');
  const [reflection, setReflection] = useState('');
  const [started, setStarted] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancel, setCancel] = useState(false);
  useEffect(() => {
    let disposed = false;
    if (!selectedId) { setView(undefined); return; }
    setLoading(true);
    void window.tutor.diagnostic(selectedId).then(result => { if (!disposed) { setView(result); setReflection(result.session.reflection); setAnswer(''); setStarted(Date.now()); } })
      .catch(failure => { if (!disposed) setError(errorMessage(failure)); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [selectedId]);
  if (!subject) return <SubjectRequired onNewSubject={onNewSubject} />;
  async function start(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await window.tutor.startDiagnostic({ subjectId: subject!.id, selfRatings: supported.map(c => ({ conceptId: c.id, rating: ratings[c.id] })) });
      await refresh(); setView(result); setSelectedId(result.session.id); setAnswer(''); setStarted(Date.now());
    } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!view?.exercise || !answer.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const result = await window.tutor.answerDiagnostic({ id: view.session.id, conceptId: view.exercise.conceptId, exerciseId: view.exercise.id, answer, durationSeconds: Math.min(86400, Math.max(1, Math.floor((Date.now() - started) / 1000))) });
      await refresh(); setView(result); setAnswer(''); setStarted(Date.now());
      if (result.session.status === 'completed') { setReflection(result.session.reflection); notify('Recorrido terminado. Revisa las evidencias y decide tu siguiente paso.'); }
    } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function saveReflection(event: FormEvent) {
    event.preventDefault(); if (!view) return; setBusy(true); setError('');
    try { await window.tutor.reflectDiagnostic({ id: view.session.id, reflection }); await refresh(); notify('Reflexión guardada en tu historial local.'); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  const session = view?.session;
  return <><PageTitle eyebrow={subject.name} title="¿Desde dónde empezamos?" description="Comprueba lo que recuerdas y compara tus sensaciones con tus intentos." />
    {sessions.length > 0 && <div className="diagnostic-history"><label>Recorridos guardados<select aria-label="Recorrido guardado" disabled={busy} value={selectedId} onChange={event => { setSelectedId(event.target.value); setError(''); }}><option value="">Preparar un nuevo recorrido</option>{sessions.map(s => <option key={s.id} value={s.id}>{dateLabel(s.startedAt)} · {s.status === 'active' ? 'En curso' : s.status === 'completed' ? 'Terminado' : 'Interrumpido'} · {s.responses.length} respuestas</option>)}</select></label></div>}
    {error && <p className="form-error diagnostic-error" role="alert">{error}</p>}
    {loading ? <div className="practice-loading"><Spinner label="Recuperando tu recorrido…" /></div> : !session ? supported.length ? <div className="diagnostic-layout"><section className="diagnostic-card"><span className="eyebrow"><Compass size={16} /> ANTES DE EMPEZAR</span><h2>¿Cómo te ves en cada bloque?</h2><p className="diagnostic-description">Tu percepción se guarda por separado. Son hasta dos preguntas por concepto, sin pistas. Si aparece un error, el recorrido puede volver a un prerrequisito.</p>
      {active ? <div className="diagnostic-resume"><p>Tienes un recorrido en curso. Tus respuestas anteriores están guardadas.</p><button className="button primary" onClick={() => setSelectedId(active.id)}>Retomar recorrido <ArrowRight size={16} /></button></div> : <form className="form-stack" onSubmit={start}>{supported.map(c => <label key={c.id}>{c.name}<select required aria-label={`Cómo me veo en ${c.name}`} value={ratings[c.id] ?? ''} onChange={event => setRatings(previous => ({ ...previous, [c.id]: event.target.value as SelfRating }))}><option value="" disabled>Elige tu percepción</option>{Object.entries(ratingNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>)}<p className="subtle-note"><Info size={15} /> {supported.length * 2} preguntas como máximo. La corrección se muestra al terminar.</p><button className="button primary" disabled={busy || supported.length > 12}>{busy ? <Spinner label="Preparando…" /> : <>Comenzar evaluación inicial <ArrowRight size={16} /></>}</button>{supported.length > 12 && <p className="form-error">Esta versión admite hasta 12 conceptos con preguntas comprobadas por asignatura.</p>}</form>}
      {concepts.length > supported.length && <p className="diagnostic-excluded">Fuera de este recorrido, por falta de preguntas comprobadas: {concepts.filter(c => !data.practiceConceptIds.includes(c.id)).map(c => c.name).join(', ')}. Puedes registrar ejercicios de esos conceptos en Practicar.</p>}
    </section><aside className="context-tip"><Lightbulb size={22} /><h3>Un punto de partida.</h3><p>Dos preguntas aportan indicios. Para comprobar que un aprendizaje se mantiene hacen falta más ejercicios y distintos días.</p><p>Puedes salir y retomar las preguntas pendientes. Cada respuesta enviada se conserva cifrada.</p></aside></div> : <Empty icon={<Compass size={28} />} title="Necesitamos preguntas para tus conceptos" action={<button className="button primary" onClick={() => navigate('progress')}>Organizar conceptos <ArrowRight size={16} /></button>}>El banco incluye fracciones, porcentajes, ecuaciones de primer grado, potencias de 2, sistema binario y subnetting. Los demás conceptos pueden trabajarse con tus ejercicios y el tutor.</Empty>
    : session.status === 'active' && view?.exercise ? <section className="diagnostic-card diagnostic-question"><div className="diagnostic-question-heading"><span className="eyebrow">{concepts.find(c => c.id === view.exercise!.conceptId)?.name}</span><span>{session.responses.length + 1} / {session.conceptIds.length * 2}</span></div><progress aria-label="Progreso de la evaluación inicial" value={session.responses.length} max={session.conceptIds.length * 2} /><h2>{view.exercise.statement}</h2><p className="diagnostic-description">Responde con lo que recuerdas. La corrección llegará al final del recorrido.</p><form className="form-stack" onSubmit={submit}><label>Tu respuesta<input key={`${view.exercise.conceptId}:${view.exercise.id}`} autoFocus aria-label="Respuesta de evaluación inicial" required value={answer} disabled={busy} onChange={event => setAnswer(event.target.value)} maxLength={20000} placeholder="Escribe el resultado…" /></label><div className="diagnostic-question-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => navigate('plan')}><Pause size={16} /> Pausar y salir</button><button className="button primary" disabled={busy || !answer.trim()}>{busy ? <Spinner label="Guardando…" /> : <>Guardar y continuar <ArrowRight size={16} /></>}</button></div></form><div className="diagnostic-save-note"><span><Save size={14} /> {session.responses.length} respuestas guardadas en este ordenador</span><button className="text-button" onClick={() => setCancel(true)} disabled={busy}>Terminar sin completar</button></div></section>
    : <><section className="diagnostic-summary-heading"><span className="feature-icon sage"><Compass size={26} /></span><div><h2>{session.status === 'completed' ? 'Este es tu punto de partida.' : 'Recorrido interrumpido.'}</h2><p>{session.responses.length} intentos conservados · {dateLabel(session.startedAt)} · Confianza inicial baja</p></div><button className="button secondary" onClick={() => navigate('plan')}>Ver mi plan <ArrowRight size={16} /></button></section><div className="diagnostic-results">{session.conceptIds.map(id => {
      const concept = concepts.find(c => c.id === id);
      const evidence = session.responses.filter(r => r.conceptId === id).flatMap(r => { const attempt = data.attempts.find(a => a.id === r.attemptId); return attempt ? [attempt] : []; });
      const correct = evidence.filter(a => a.outcome === 'correct').length;
      const rating = session.selfRatings.find(r => r.conceptId === id)?.rating;
      return <article className="diagnostic-result-card" key={id}><div className="diagnostic-result-heading"><h3>{concept?.name}</h3><span className={`badge ${!evidence.length ? 'neutral' : correct === evidence.length ? 'blue' : 'orange'}`}>{!evidence.length ? 'Sin comprobar' : correct === evidence.length ? 'Primeros aciertos' : 'Conviene revisar'}</span></div><p className="diagnostic-perception">Antes: {rating ? ratingNames[rating] : 'Sin percepción registrada'} · Ahora: {correct} de {evidence.length} respuestas correctas</p><p>{!evidence.length ? 'No hay respuestas para estimar este bloque.' : correct === evidence.length ? 'Has resuelto estas preguntas sin pistas. Comprueba otros ejercicios y vuelve otro día para saber si se mantiene.' : rating === 'confident' ? 'Te sentías seguro/a y ha aparecido una dificultad en estos intentos. Revisa el procedimiento y compruébalo con otra pregunta.' : 'Hay pasos que conviene volver a practicar. Estos intentos son una evidencia inicial, con alcance limitado.'}</p><details><summary>Revisar los intentos ({evidence.length})</summary>{evidence.map(attempt => <div className="diagnostic-evidence" key={attempt.id}><strong>{attempt.statement}</strong><p>Tu respuesta: {attempt.answer} · {attempt.outcome === 'correct' ? 'Correcta' : 'Por revisar'}</p><p>{attempt.feedback}</p><span>Evidencia {attempt.id.slice(0, 8)}</span></div>)}</details><button className="text-button" onClick={() => navigate('practice', id)}>Practicar este bloque <ArrowRight size={15} /></button></article>;
    })}</div>{session.status === 'completed' && <section className="diagnostic-card reflection-card"><h2>¿Qué te llevas de este recorrido?</h2><p className="diagnostic-description">¿Dónde apareció la dificultad? ¿Qué estrategia probarías la próxima vez?</p><form className="form-stack" onSubmit={saveReflection}><label>Mi reflexión<textarea rows={3} value={reflection} onChange={event => setReflection(event.target.value)} maxLength={4000} placeholder="Me he dado cuenta de que…" /></label><button className="button secondary" disabled={busy}><Save size={16} /> Guardar reflexión</button></form></section>}<p className="subtle-note"><Info size={15} /> Estas evidencias también aparecen en Mi aprendizaje. Tu percepción y tu reflexión se conservan separadas de la corrección.</p></>}
    {cancel && session && <Modal title="¿Interrumpir este recorrido?" onClose={() => { if (!busy) setCancel(false); }}><p className="modal-intro">Se conservarán tus respuestas. Para continuar con las preguntas tendrás que iniciar un nuevo recorrido.</p><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setCancel(false)}>Seguir con las preguntas</button><button className="button danger-text" disabled={busy} onClick={async () => { setBusy(true); try { await window.tutor.cancelDiagnostic(session.id); await refresh(); setView(await window.tutor.diagnostic(session.id)); setCancel(false); } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); } }}><X size={16} /> Interrumpir recorrido</button></div></Modal>}
  </>;
}
