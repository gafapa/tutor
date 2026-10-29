import { useState } from 'react';
import type { PageProps } from '../ui';
import { errorMessage } from '../ui';

export default function MoodlePracticeStarter({ data, subject, refresh, onPrepared }: Pick<PageProps, 'data' | 'subject' | 'refresh'> & { onPrepared(portfolioId: string): void }) {
  const [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const items = data.lmsItems.filter(item => item.subjectId === subject?.id && item.data.kind === 'activity' && item.data.module === 'assign' && item.data.submission?.status === 'submitted' && !item.data.submission.group && item.data.submission.text.trim());
  if (!items.length) return null;
  async function prepare() {
    const item = items.find(item => item.id === selected); if (!item || busy) return;
    setBusy(true); setError('');
    try { const result = await window.tutor.prepareMoodlePractice({ itemId: item.id, revision: item.revision }); await refresh(); onPrepared(result.portfolioId); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <section className="pedagogy-panel form-stack">
    <h2>De mi entrega a mi siguiente práctica</h2>
    <p>Elige una entrega personal de Moodle. Conservaremos tu texto y los comentarios recibidos para identificar una dificultad y decidir qué practicar. Una nota no demuestra por sí sola qué te cuesta.</p>
    <label>Entrega de Moodle para revisar<select aria-label="Entrega de Moodle para revisar" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy}><option value="">Selecciona una entrega</option>{items.map(item => <option value={item.id} key={item.id}>{item.data.title}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}
    <button className="button secondary" disabled={busy || !selected} onClick={() => { void prepare(); }}>{busy ? 'Preparando mi revisión…' : 'Revisar esta entrega y preparar práctica'}</button>
    <p className="subtle-note">Todo se guarda en este equipo. No se envían respuestas ni cambios a Moodle.</p>
  </section>;
}
