import { useMemo, useState, type FormEvent } from 'react';
import type { LmsActivityData } from '../../shared/lms';
import { compareMoodleText, moodleComparisonAttempts, type MoodleComparisonAttempt, type MoodleTextComparison } from '../../shared/moodle-comparison';
import { Spinner, errorMessage } from '../ui';

const states: Record<string, string> = { new: 'Sin enviar', draft: 'Borrador', submitted: 'Enviada', reopened: 'Reabierta', finished: 'Finalizado' };
const date = (value: string | null) => value ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';
function Original({ attempt, feedback }: { attempt: MoodleComparisonAttempt; feedback: boolean }) {
  const text = feedback ? attempt.feedback : attempt.text;
  if (text.length > 50000) return <label>{feedback ? 'Comentarios completos' : 'Respuesta completa'} · Intento {attempt.number}<textarea readOnly value={text} rows={12} /></label>;
  return <p className="lms-original">{text || (feedback ? 'Sin comentarios recuperados.' : 'Sin texto recuperado. Consulta los archivos en el detalle del intento.')}</p>;
}
function Changes({ result }: { result: MoodleTextComparison }) {
  if (result.limited) return <p role="status">Este texto supera las 500 líneas o los 50.000 caracteres por intento. Consulta los textos completos; no se han recortado ni comparado parcialmente.</p>;
  if (!result.added && !result.removed) return <p>El texto coincide en los dos intentos.</p>;
  return <><p>Líneas retiradas del primer intento: {result.removed} · Líneas añadidas en el segundo: {result.added}.</p><div className="lms-text-changes" aria-label="Cambios de texto">{result.rows.map((row, index) => <p key={index} className={`lms-change-${row.kind}`}><span className="lms-change-label">{row.kind === 'removed' ? 'Antes' : row.kind === 'added' ? 'Después' : 'Igual'}</span><span>{row.text || ' '}</span></p>)}</div></>;
}

type ReflectionDraft = { whatChanged: string; whatChecked: string; nextStep: string };
const emptyDraft: ReflectionDraft = { whatChanged: '', whatChecked: '', nextStep: '' };
const reflectionFields = [{ key: 'whatChanged', label: 'Qué he cambiado entre estos intentos' }, { key: 'whatChecked', label: 'Qué he comprobado por mí mismo' }, { key: 'nextStep', label: 'Qué practicaré después' }] as const;
export default function MoodleAttemptComparison({ activity, itemId, revision, disabled = false, onSaved, onSaving }: { activity: LmsActivityData; itemId: string; revision: number; disabled?: boolean; onSaved(): Promise<void>; onSaving(value: boolean): void }) {
  const attempts = useMemo(() => moodleComparisonAttempts(activity), [activity]);
  const [open, setOpen] = useState(false), [first, setFirst] = useState(attempts.at(-2)?.id ?? ''), [second, setSecond] = useState(attempts.at(-1)?.id ?? ''), [changes, setChanges] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ReflectionDraft>>({}), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const pair = `${first}|${second}`, draft = drafts[pair] ?? emptyDraft;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || disabled || first === second) return;
    setSaving(true); onSaving(true); setError('');
    try { await window.tutor.copyMoodleComparison({ itemId, revision, firstAttemptId: first, secondAttemptId: second, ...draft }); await onSaved(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setSaving(false); onSaving(false); }
  }
  const left = attempts.find(attempt => attempt.id === first), right = attempts.find(attempt => attempt.id === second);
  const comparison = useMemo(() => open && changes && left && right && left.id !== right.id ? { text: compareMoodleText(left.text, right.text), feedback: compareMoodleText(left.feedback, right.feedback) } : null, [open, changes, left, right]);
  if (attempts.length < 2) return null;
  const originals = (feedback: boolean) => <div className="lms-comparison-columns"><section aria-label={`Primer intento: ${feedback ? 'comentarios' : 'respuesta'}`}><h5>Intento {left!.number}</h5><Original attempt={left!} feedback={feedback} /></section><section aria-label={`Segundo intento: ${feedback ? 'comentarios' : 'respuesta'}`}><h5>Intento {right!.number}</h5><Original attempt={right!} feedback={feedback} /></section></div>;
  return <section className="lms-attempt-comparison" aria-label="Comparación de intentos">
    <button type="button" className="button secondary" disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Cerrar comparación' : 'Comparar intentos'}</button>
    {open && <div className="form-stack"><h3>Qué cambió entre tus intentos</h3><p>Comparas dos intentos de esta actividad en la versión local seleccionada. Los cambios de texto no indican por sí solos una mejora ni modifican tu dominio o tu plan.</p>
      <div className="lms-comparison-columns">{([{ value: first, change: setFirst, name: 'Primer intento', attempt: left }, { value: second, change: setSecond, name: 'Segundo intento', attempt: right }]).map(({ value, change, name, attempt }) => <div key={name}><label>{name}<select aria-label={name} value={value} disabled={disabled || saving} onChange={event => { change(event.target.value); setError(''); }}>{attempts.map(row => <option key={row.id} value={row.id}>Intento {row.number}</option>)}</select></label>{attempt && <><p>{states[attempt.status] ?? attempt.status} · {date(attempt.updatedAt)}{attempt.group === null ? '' : attempt.group ? ' · Entrega de grupo' : ' · Entrega personal'}</p>{attempt.cached && <p>Revisión descargada anteriormente; no se pudo actualizar.</p>}{activity.module === 'quiz' && <p>{attempt.points === null ? 'Sin puntuación publicada.' : `Puntos del intento: ${new Intl.NumberFormat('es').format(attempt.points)}`}</p>}{attempt.files.length > 0 && <><p>Archivos adjuntos · Se comparan sus referencias, no su contenido.</p><ul>{attempt.files.map((file, index) => <li key={index}>{file.filepath === '/' ? '' : file.filepath}{file.filename} · {file.size} bytes</li>)}</ul></>}</>}</div>)}</div>
      {left && right && left.id !== right.id ? <><button type="button" className="text-button" disabled={disabled || saving} onClick={() => setChanges(value => !value)}>{changes ? 'Ver textos completos' : 'Ver cambios de texto'}</button><h4>{activity.module === 'quiz' ? 'Revisiones de Moodle' : 'Tus respuestas'}</h4>{changes && comparison ? <Changes result={comparison.text} /> : originals(false)}{activity.module === 'assign' && <><h4>Comentarios recuperados</h4>{changes && comparison ? <Changes result={comparison.feedback} /> : originals(true)}</>}<form className="lms-portfolio-copy" aria-label="Reflexión sobre la comparación" onSubmit={save}><h4>Conservar y reflexionar</h4><p>Guarda ambos intentos con sus comentarios y estas tres reflexiones. La copia será independiente de Moodle; los archivos quedarán como referencias.</p>{reflectionFields.map(field => <label key={field.key}>{field.label}<textarea aria-label={field.label} value={draft[field.key]} disabled={disabled || saving} required maxLength={3000} rows={3} onChange={event => { const value = event.target.value; setDrafts(previous => ({ ...previous, [pair]: { ...(previous[pair] ?? emptyDraft), [field.key]: value } })); setError(''); }} /></label>)}<p className="subtle-note">Tu reflexión se conserva al guardarla. No se actualizan notas, tareas ni estimaciones de dominio.</p>{error && <p role="alert">{error}</p>}<button type="submit" className="button primary" disabled={disabled || saving || reflectionFields.some(field => !draft[field.key].trim())}>{saving ? <Spinner label="Guardando comparación…" /> : 'Guardar comparación y reflexión'}</button></form></> : <p role="status">Elige dos intentos distintos para compararlos.</p>}
    </div>}
  </section>;
}
