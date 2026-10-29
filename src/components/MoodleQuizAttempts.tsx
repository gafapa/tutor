import { useState } from 'react';
import type { LmsQuizAttempt } from '../../shared/lms';
import { Spinner, errorMessage } from '../ui';

const states = { finished: 'Finalizado', inprogress: 'En curso', overdue: 'Fuera de plazo', abandoned: 'Abandonado' };
const date = (value: string | null) => value ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';

export default function MoodleQuizAttempts({ itemId, revision, attempts, onCopied }: { itemId: string; revision: number; attempts?: LmsQuizAttempt[]; onCopied(): Promise<void> }) {
  const [selected, setSelected] = useState(String(attempts?.at(-1)?.id ?? ''));
  const [reflection, setReflection] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const attempt = attempts?.find(row => String(row.id) === selected);
  async function copy() {
    if (!attempt || busy) return;
    setBusy(true); setError('');
    try { await window.tutor.copyMoodleQuizReview({ itemId, revision, attemptId: attempt.id, reflection }); await onCopied(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <section className="form-stack" aria-label="Historial del cuestionario">
    <h3>Tus intentos del cuestionario</h3>
    <p className="subtle-note">Cada versión local conserva los permisos y el contenido disponibles al descargarla. Tu plan usa el intento más reciente de la última actualización.</p>
    {!attempts ? <p>Este servicio no ha permitido recuperar tus intentos. Puedes revisar los permisos y volver a actualizar el curso.</p> : !attempts.length ? <p>No hay intentos guardados de este cuestionario.</p> : <>
      <label>Intento del cuestionario<select aria-label="Intento del cuestionario" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setError(''); }}>{attempts.slice().reverse().map(row => <option key={row.id} value={row.id}>Intento {row.number} · {states[row.state]}</option>)}</select></label>
      {attempt && <><p>{states[attempt.state]} · Inicio: {date(attempt.startedAt)} · Final: {date(attempt.finishedAt)}</p>
        {attempt.reviewState === 'not-finished' ? <p>La app no recupera preguntas ni respuestas de intentos en curso o abandonados. Puedes continuar el cuestionario en Moodle.</p> : attempt.reviewState === 'restricted' ? <p>El centro no permite revisar este intento en este momento.</p> : attempt.reviewState === 'unavailable' ? <p>No se ha podido recuperar esta revisión. Puedes volver a actualizar el curso.</p> : <>
          {attempt.reviewState === 'cached' && <p role="status">No se ha podido actualizar la revisión. Estás consultando la copia descargada anteriormente.</p>}
          <p>{attempt.points === null ? 'No hay puntuación publicada en esta revisión.' : `Puntos publicados: ${new Intl.NumberFormat('es', { maximumFractionDigits: 4 }).format(attempt.points)}`}</p>
          <h4>Revisión recuperada de Moodle</h4><p className="lms-original" aria-label="Revisión del cuestionario">{attempt.reviewText || 'La revisión no contiene texto recuperable.'}</p>
          {attempt.reviewText.trim() && <><label>Mi reflexión sobre este intento<textarea value={reflection} disabled={busy} maxLength={10000} rows={3} onChange={event => setReflection(event.target.value)} /></label><p className="subtle-note">La copia conserva lo que Moodle permitió consultar. Guardarla no cambia tu dominio estimado.</p><button className="button primary" disabled={busy} onClick={() => { void copy(); }}>{busy ? <Spinner label="Guardando revisión…" /> : 'Guardar revisión en mi portfolio'}</button></>}
        </>}
      </>}
    </>}{error && <p role="alert">{error}</p>}
  </section>;
}
