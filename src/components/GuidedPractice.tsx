import { useEffect, useState, type FormEvent } from 'react';
import type { GuidedPracticeView } from '../../shared/pedagogy';
import { errorMessage, Spinner } from '../ui';

export default function GuidedPractice({ interventionId, activityId, refresh }: { interventionId: string; activityId: string; refresh(): Promise<void> }) {
  const [view, setView] = useState<GuidedPracticeView>(), [answer, setAnswer] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const input = { interventionId, activityId };
  useEffect(() => {
    let current = true;
    void window.tutor.guidedPractice({ interventionId, activityId }).then(result => { if (current) { setView(result); setError(''); } }).catch(failure => { if (current) setError(errorMessage(failure)); });
    return () => { current = false; };
  }, [interventionId, activityId]);
  async function act(hint: boolean) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = hint ? await window.tutor.requestGuidedHint(input) : await window.tutor.submitGuidedStep({ ...input, answer });
      setView(result); if (!hint) setAnswer(''); await refresh();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void act(false); }
  return <section className="form-stack" aria-label="Práctica guiada paso a paso">
    {error && <p role="alert">{error}</p>}
    {!view ? !error && <Spinner label="Recuperando tus pasos…" /> : <>
      {view.attempts.length > 0 && <details open><summary>Mis intentos y las ayudas utilizadas</summary><ol>{view.attempts.map((attempt, index) => <li key={index}><strong>Paso {attempt.stepIndex + 1}: {attempt.correct ? 'Comprobado' : 'Por revisar'}</strong><p className="pedagogy-original">{attempt.answer}</p><p>{attempt.hints} pistas antes de este intento.</p></li>)}</ol></details>}
      {view.completed ? <p role="status">Práctica terminada. Tus intentos y pistas se conservan; falta la comprobación en otro día.</p> : <form className="form-stack" onSubmit={submit}>
        <p className="subtle-note">Paso {view.stepIndex + 1} de {view.totalSteps}. Inténtalo antes de pedir una pista.</p>
        <p><strong>{view.prompt}</strong></p>
        <label>Mi intento de este paso<textarea aria-label="Mi intento de este paso" value={answer} onChange={event => setAnswer(event.target.value)} required maxLength={20000} rows={2} disabled={busy} /></label>
        {view.hints.map((hint, index) => <p className="hint" key={index}>Pista {index + 1}: {hint}</p>)}
        <div className="pedagogy-actions"><button className="button primary" disabled={busy || !answer.trim()}>Comprobar este paso</button><button type="button" className="text-button" disabled={busy || !view.canHint} onClick={() => { void act(true); }}>Pedir la siguiente pista</button></div>
      </form>}
    </>}
  </section>;
}
