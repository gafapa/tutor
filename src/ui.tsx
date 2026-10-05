import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X, ShieldCheck, ArrowRight, LoaderCircle } from 'lucide-react';
import type { Mastery, Confidence, Snapshot, Subject, Attempt } from '../shared/types';

export type Page = 'home' | 'materials' | 'tutor' | 'practice' | 'progress' | 'settings' | 'plan' | 'diagnostic' | 'curriculum' | 'flashcards' | 'portfolio' | 'sessions' | 'mocks' | 'rubrics' | 'moodle' | 'pedagogy'|'connections' | 'reports' | 'goals';
export interface PageProps {
  data: Snapshot; subject: Subject | undefined;
  refresh(): Promise<void>; notify(message: string, error?: boolean): void;
  navigate(page: Page, conceptId?: string): void;
  practiceConceptId?: string;
  connectionProjectId?:string;
  onNewSubject(): void;
  onEditSubject(subject: Subject): void;
}
export const statuses: Record<Mastery, { name: string; className: string }> = {
  consolidated: { name: 'Consolidado', className: 'green' },
  progress: { name: 'En progreso', className: 'blue' },
  reinforce: { name: 'Necesita refuerzo', className: 'orange' },
  unseen: { name: 'Sin evidencias', className: 'neutral' }
};
export const confidenceNames: Record<Confidence, string> = { low: 'Baja', medium: 'Media', high: 'Alta' };
export function outcomeName(outcome: Attempt['outcome']) { return { correct: 'Correcto', incorrect: 'Por revisar', partial: 'Parcial', ungraded: 'Sin corregir' }[outcome]; }
export function Badge({ status }: { status: Mastery }) {
  return <span className={`badge ${statuses[status].className}`}><span />{statuses[status].name}</span>;
}
export function PrivacyChip() { return <span className="privacy-chip"><ShieldCheck size={14} /> Privado y local</span>; }
export function Spinner({ label = 'Un momento…' }: { label?: string }) { return <span className="spinner-label"><LoaderCircle size={18} className="spin" />{label}</span>; }
export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function SubjectRequired({ onNewSubject }: { onNewSubject(): void }) {
  return <Empty icon={<ArrowRight size={25} />} title="Empieza por una asignatura" action={<button className="button primary" onClick={onNewSubject}>Crear mi primera asignatura</button>}>Cada materia tendrá sus propios materiales, conversaciones y evidencias.</Empty>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose(): void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}
export function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').replace(/^Error: /, '');
}
export function dateLabel(value: string) { return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(value)); }
export function relativeDate(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  return days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : dateLabel(value);
}
