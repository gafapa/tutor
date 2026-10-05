import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookOpen, LayoutDashboard, Files, MessagesSquare, PencilLine, ChartNoAxesCombined, Settings, Plus, ShieldCheck, ArrowUpRight, Leaf, Check, AlertCircle, CalendarDays, Compass, Layers, GalleryVerticalEnd, FolderHeart, ClipboardCheck, GitCompareArrows } from 'lucide-react';
import type { Snapshot, Subject, SubjectInput } from '../shared/types';
import { Modal, PrivacyChip, Spinner, errorMessage, type Page, type PageProps } from './ui';
import Home from './pages/Home';
import Materials from './pages/Materials';
import Tutor from './pages/Tutor';
import Practice from './pages/Practice';
import Progress from './pages/Progress';
import Preferences from './pages/Preferences';
import Plan from './pages/Plan';
import Diagnostic from './pages/Diagnostic';
import Curriculum from './pages/Curriculum';
import Flashcards from './pages/Flashcards';
import Portfolio from './pages/Portfolio';
import Sessions, { clockLabel, useStudyClock } from './pages/Sessions';
import { sessionRemaining } from '../shared/study';
import type { StudySession } from '../shared/study';
import Mocks from './pages/Mocks';
import Rubrics from './pages/Rubrics';
import Moodle from './pages/Moodle';
import Pedagogy from './pages/Pedagogy';
import Connections from './pages/Connections';
import Reports from './pages/Reports';
import Goals from './pages/Goals';
import { dayKey } from '../shared/calendar';

const NAV = [
  { id: 'home', label: 'Mi espacio', icon: LayoutDashboard },
  { id: 'plan', label: 'Mi plan', icon: CalendarDays },
  { id: 'diagnostic', label: 'Punto de partida', icon: Compass },
  { id: 'curriculum', label: 'Unidades y currículo', icon: Layers },
  { id: 'materials', label: 'Materiales', icon: Files },
  { id: 'moodle', label: 'Mi Moodle', icon: BookOpen },
  { id: 'tutor', label: 'Mi tutor', icon: MessagesSquare },
  { id: 'practice', label: 'Practicar', icon: PencilLine },
  { id: 'sessions', label: 'Sesiones', icon: CalendarDays },
  { id: 'mocks', label: 'Simulacros', icon: Compass },
  { id: 'rubrics', label: 'Rúbricas', icon: ClipboardCheck },
  { id: 'flashcards', label: 'Mis tarjetas', icon: GalleryVerticalEnd },
  { id: 'portfolio', label: 'Portfolio', icon: FolderHeart },
  { id: 'progress', label: 'Mi aprendizaje', icon: ChartNoAxesCombined },
  { id: 'pedagogy', label: 'Cómo aprendo', icon: ClipboardCheck },
  {id:'connections',label:'Conectar materias',icon:GitCompareArrows},
  {id:'reports',label:'Mis informes',icon:Files},
  {id:'goals',label:'Mis metas',icon:Compass}
] as const;

export default function App() {
  const [data, setData] = useState<Snapshot>();
  const [fatal, setFatal] = useState('');
  const [page, setPage] = useState<Page>('home');
  const [subjectId, setSubjectId] = useState('');
  const [practiceConceptId, setPracticeConceptId] = useState<string>();
  const[connectionProjectId,setConnectionProjectId]=useState<string>();
  const [newSubject, setNewSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject>();
  const [toast, setToast] = useState<{ message: string; error: boolean }>();
  const runningSession = data?.studySessions.find(s => s.status === 'running');
  const activeExam = data?.mockExams.find(exam => exam.status === 'active');
  useEffect(() => { if (activeExam) { setSubjectId(activeExam.subjectId); setPage('mocks'); setNewSubject(false); setEditingSubject(undefined); } }, [activeExam?.id]);
  const refresh = useCallback(async () => {
    const snapshot = await window.tutor.snapshot();
    setData(snapshot);
    setSubjectId(previous => snapshot.subjects.some(s => s.id === previous) ? previous : snapshot.subjects[0]?.id ?? '');
  }, []);
  useEffect(() => { void refresh().catch(error => setFatal(errorMessage(error))); }, [refresh]);
  useEffect(() => {
    if (!runningSession) return;
    const timer = setInterval(() => {
      void window.tutor.studySession(runningSession.id).then(row => {
        if (row.status !== 'running') { void refresh().catch(() => {}); return; }
        setData(previous => previous ? { ...previous, studySessions: previous.studySessions.map(session => session.id === row.id ? row : session) } : previous);
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [runningSession?.id, refresh]);
  useEffect(() => {
    let previousDay = dayKey();
    const update = () => { const today = dayKey(); if (today !== previousDay) { previousDay = today; void refresh().catch(() => {}); } };
    const timer = setInterval(update, 60000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (window.tutor) void window.tutor.modelStatus().then(model => setData(previous => previous ? { ...previous, model } : previous)).catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(undefined), toast.error ? 10000 : 4500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', Boolean(data?.settings.largeText));
    document.documentElement.classList.toggle('high-contrast', Boolean(data?.settings.highContrast));
  }, [data?.settings.largeText, data?.settings.highContrast]);
  const notify = (message: string, error = false) => setToast({ message, error });
  const navigate = (next: Page, conceptId?: string) => { if(conceptId){const owner=data?.concepts.find(c=>c.id===conceptId)?.subjectId;if(owner)setSubjectId(owner);} setPracticeConceptId(next==='connections'?undefined:conceptId);setConnectionProjectId(next==='connections'?conceptId:undefined); setPage(next); document.querySelector('.main-content')?.scrollTo(0, 0); };
  if (!data) return <div className="boot-screen"><div className="brand-mark"><BookOpen size={29} /></div><h1>Tutor Local</h1>{fatal ? <p role="alert">{fatal}</p> : <Spinner label="Abriendo tu espacio…" />}</div>;
  const subject = data.subjects.find(s => s.id === (activeExam?.subjectId ?? subjectId));
  const props: PageProps = { data, subject, refresh, notify, navigate, practiceConceptId,connectionProjectId, onNewSubject: () => setNewSubject(true), onEditSubject: setEditingSubject };
  const pages = { home: Home, materials: Materials, moodle: Moodle, pedagogy: Pedagogy,connections:Connections, reports:Reports, goals:Goals, tutor: Tutor, practice: Practice, progress: Progress, settings: Preferences, plan: Plan, diagnostic: Diagnostic, curriculum: Curriculum, flashcards: Flashcards, portfolio: Portfolio, sessions: Sessions, mocks: Mocks, rubrics: Rubrics };
  const Content = pages[activeExam ? 'mocks' : page];
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); if (!activeExam) navigate('home'); }}><span className="brand-mark"><BookOpen size={23} /></span><span>Tutor<span className="brand-local">LOCAL</span></span></a>
      <div className="sidebar-section-label">TU ESPACIO PERSONAL</div>
      <nav aria-label="Navegación principal">{NAV.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} disabled={Boolean(activeExam) && item.id !== 'mocks'} onClick={() => navigate(item.id)}><item.icon size={19} /><span>{item.label}</span>{page === item.id && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="subject-section"><div className="sidebar-section-label">MIS ASIGNATURAS<button className="icon-button" aria-label="Añadir asignatura" disabled={Boolean(activeExam)} onClick={() => setNewSubject(true)}><Plus size={16} /></button></div>
        <div className="subject-list">{data.subjects.map(item => <button key={item.id} disabled={Boolean(activeExam)} className={`subject-item ${item.id === subjectId ? 'selected' : ''}`} onClick={() => { setSubjectId(item.id); navigate('home'); }}><span className={`subject-dot ${item.color}`} /><span>{item.name}</span>{item.isDemo && <span className="example-marker" title="Asignatura de ejemplo">Ej.</span>}</button>)}{!data.subjects.length && <p className="sidebar-empty">Tu primera asignatura<br />empieza aquí.</p>}</div>
        <button className="add-subject" disabled={Boolean(activeExam)} onClick={() => setNewSubject(true)}><Plus size={16} /> Nueva asignatura</button>
      </div>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={20} /><div><strong>Tu aprendizaje es tuyo.</strong><span>Guardado en este ordenador.</span></div><Leaf className="local-leaf" size={60} /></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} disabled={Boolean(activeExam)} onClick={() => navigate('settings')}><Settings size={19} /> Ajustes</button><div className="profile"><span className="avatar">{data.settings.name.slice(0, 1).toUpperCase() || 'T'}</span><div><strong>{data.settings.name || 'Mi perfil'}</strong><span>Cuenta local · sin registro</span></div><button className="icon-button" aria-label="Editar mi perfil" disabled={Boolean(activeExam)} onClick={() => navigate('settings')}><ArrowUpRight size={17} /></button></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumbs">Mi espacio <span>/</span><span className="breadcrumb-current">{page === 'settings' ? 'Ajustes' : subject?.name ?? 'Inicio'}</span>{subject?.isDemo && page !== 'settings' && <span className="demo-chip">Ejemplo</span>}</div><div className="topbar-tools">{runningSession && <RunningSessionPill session={runningSession} onOpen={() => { setSubjectId(runningSession.subjectId); navigate('sessions'); }} />}<PrivacyChip /></div></header>
      <main className={`main-content page-${page}`} id="main-content"><Content key={`${page}:${subjectId}`} {...props} /></main>
    </div>
    {newSubject && <NewSubject onClose={() => setNewSubject(false)} onCreate={async input => {
      const created = await window.tutor.createSubject(input); await refresh(); setSubjectId(created.id); setNewSubject(false); navigate('home'); notify('Tu asignatura está lista. Añade los primeros materiales.');
    }} />}
    {editingSubject && <NewSubject subject={editingSubject} onClose={() => setEditingSubject(undefined)} onCreate={async input => {
      await window.tutor.updateSubject({ ...input, id: editingSubject.id }); await refresh(); setEditingSubject(undefined); notify('Configuración de asignatura guardada.');
    }} />}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <AlertCircle size={19} /> : <Check size={19} />}<span>{toast.message}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setToast(undefined)}><Plus className="rotate" size={17} /></button></div>}
  </div>;
}

function RunningSessionPill({ session, onOpen }: { session: StudySession; onOpen(): void }) {
  const now = useStudyClock();
  return <button className="study-running-pill" onClick={onOpen} aria-label="Abrir la sesión en marcha"><CalendarDays size={14} />{clockLabel(sessionRemaining(session, now))}<span> en sesión</span></button>;
}

function NewSubject({ subject, onClose, onCreate }: { subject?: Subject; onClose(): void; onCreate(input: SubjectInput): Promise<void> }) {
  const [color, setColor] = useState(subject?.color ?? 'sage');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try { await onCreate({ name: String(form.get('name')).trim(), course: String(form.get('course')), level: String(form.get('level')), teacher: String(form.get('teacher')), goals: String(form.get('goals')), color }); }
    catch (failure) { setError(errorMessage(failure)); setBusy(false); }
  }
  return <Modal title={subject ? 'Configurar asignatura' : 'Una nueva asignatura'} onClose={() => { if (!busy) onClose(); }}><p className="modal-intro">Dale un espacio propio a lo que quieres aprender.</p><form onSubmit={submit} className="form-stack">
    <label>Nombre de la asignatura<input autoFocus name="name" defaultValue={subject?.name} placeholder="Ej. Matemáticas, Historia, Redes locales…" required maxLength={120} /></label>
    <div className="form-row"><label>Curso<input name="course" defaultValue={subject?.course} placeholder="Ej. 3.º, 2026–2027" maxLength={120} /></label><label>Nivel académico<input name="level" defaultValue={subject?.level} placeholder="Ej. ESO, FP de grado medio" maxLength={120} /></label></div>
    <label>Profesor/a <span className="optional">opcional</span><input name="teacher" defaultValue={subject?.teacher} placeholder="Nombre del profesor" maxLength={120} /></label>
    <label>¿Qué te gustaría conseguir?<textarea name="goals" defaultValue={subject?.goals} placeholder="Entender mejor un tema, preparar una prueba, practicar…" rows={3} maxLength={2000} /></label>
    <fieldset className="color-options"><legend>Color de la asignatura</legend>{['sage', 'blue', 'amber', 'rose', 'violet'].map(item => <button type="button" key={item} aria-label={`Color ${item}`} aria-pressed={item === color} className={`color-choice ${item} ${item === color ? 'chosen' : ''}`} onClick={() => setColor(item)}>{item === color && <Check size={18} />}</button>)}</fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? <Spinner label="Guardando…" /> : subject ? 'Guardar configuración' : 'Crear asignatura'}</button></div>
  </form></Modal>;
}
