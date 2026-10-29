import { useState, type FormEvent } from 'react';
import type { PortfolioEntry } from '../../shared/education';
import { dayKey } from '../../shared/calendar';
import { Spinner, errorMessage } from '../ui';

export default function PortfolioTaskCreator({ entry, onCreated, onSaving }: { entry: PortfolioEntry; onCreated(): Promise<void>; onSaving(value: boolean): void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); onSaving(true); setError('');
    try { await window.tutor.createPortfolioTask({ portfolioId: entry.id, title: String(form.get('title')), notes: String(form.get('notes')), dueDate: String(form.get('date')) || null, estimatedMinutes: Number(form.get('minutes')) }); await onCreated(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); onSaving(false); }
  }
  return <section className="lms-portfolio-copy" aria-label="Tarea personal desde el portfolio">
    <button type="button" className="button secondary" disabled={busy} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Ocultar propuesta de tarea' : 'Crear tarea desde este trabajo'}</button>
    {open && <form className="form-stack" onSubmit={submit}><h3>Del trabajo a tu siguiente práctica</h3><p>Elige una acción concreta. Se guardará en tu plan local junto con una copia de este trabajo y de su reflexión.</p>
      <label>Título de mi siguiente tarea<input aria-label="Título de mi siguiente tarea" name="title" required maxLength={120} disabled={busy} defaultValue="Practicar a partir de este trabajo" /></label>
      <label>Qué voy a practicar<textarea aria-label="Qué voy a practicar" name="notes" required rows={3} maxLength={4000} disabled={busy} /></label>
      <div className="form-row"><label>Fecha prevista para practicar<input aria-label="Fecha prevista para practicar" name="date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={dayKey()} disabled={busy} /></label><label>Minutos previstos<input aria-label="Minutos previstos" name="minutes" type="number" min={5} max={120} step={1} defaultValue={20} required disabled={busy} /></label></div>
      <p className="subtle-note">Es una tarea personal. No se crea nada en Moodle ni se modifica la entrega original. Terminarla no demuestra dominio.</p>{error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={busy}>{busy ? <Spinner label="Añadiendo tarea…" /> : 'Añadir esta práctica a mi plan'}</button>
    </form>}
  </section>;
}
