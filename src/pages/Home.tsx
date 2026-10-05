import { ArrowRight, BookOpen, Files, Sparkles, ShieldCheck, Target, Sprout, PencilLine, Plus, Layers, Clock3, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Habit } from './Goals';
import { Badge, PageTitle, errorMessage, type PageProps } from '../ui';

export default function Home(props: PageProps) {
  const { data, subject, navigate, onNewSubject, onEditSubject, refresh, notify } = props;
  const [busy, setBusy] = useState(false);
  const concepts = data.concepts.filter(c => c.subjectId === subject?.id);
  const materials = data.materials.filter(m => m.subjectId === subject?.id);
  const attempts = data.attempts.filter(a => a.subjectId === subject?.id);
  const estimates = data.estimates.filter(e => concepts.some(c => c.id === e.conceptId));
  const ranked = [...estimates].sort((a, b) => ['reinforce', 'unseen', 'progress', 'consolidated'].indexOf(a.status) - ['reinforce', 'unseen', 'progress', 'consolidated'].indexOf(b.status));
  const recommendation = ranked[0];
  const concept = concepts.find(c => c.id === recommendation?.conceptId);
  const consolidated = estimates.filter(e => e.status === 'consolidated').length;
  const personalGoal = data.personalGoals.find(g => g.subjectId === subject?.id && !data.personalGoals.some(n => n.supersedesId === g.id) && data.goalProgress.find(p => p.goalId === g.id)?.status === 'active');
  const personalProgress = data.goalProgress.find(g => g.goalId === personalGoal?.id);
  const recent = data.recentChanges.filter(r => concepts.some(c => c.id === r.conceptId) && r.change !== 'stable');
  const changeLabels = { 'first-evidence': 'Primeras evidencias', improved: 'Mejora con intentos nuevos', regressed: 'Dificultad en intentos nuevos', 'check-again': 'Conviene comprobar el recuerdo', stable: 'Estado mantenido' };
  const pendingAlerts = data.learningAlerts.filter(a => a.subjectId === subject?.id && !a.reviewed);
  const plan = data.plans.find(p => p.subjectId === subject?.id);
  const greeting = data.settings.name ? `Hola, ${data.settings.name}.` : 'Este es tu espacio.';
  const date = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  async function demo() {
    setBusy(true);
    try { await window.tutor.createDemo(); await refresh(); notify('Ejemplo preparado con apuntes y ejercicios de redes. El progreso empieza desde cero.'); }
    catch (error) { notify(errorMessage(error), true); }
    finally { setBusy(false); }
  }
  if (!data.subjects.length) return <>
    <PageTitle eyebrow={date} title={greeting} description="Un lugar para entender, practicar y avanzar a tu ritmo." />
    <section className="welcome-hero"><div className="hero-content"><span className="hero-kicker"><Sprout size={17} /> CADA PEQUEÑO PASO CUENTA</span><h2>Aprender empieza<br />con una buena pregunta.</h2><p>Crea una asignatura, añade tus apuntes y construye un camino de aprendizaje que tenga sentido para ti.</p><div className="hero-actions"><button className="button primary" onClick={onNewSubject}><Plus size={18} /> Crear mi primera asignatura</button><button className="text-button" onClick={demo} disabled={busy}>Explorar un ejemplo <ArrowRight size={17} /></button></div></div><LearningIllustration /></section>
    <div className="section-heading"><h2>Un espacio que crece contigo</h2><span>A tu ritmo. En tu ordenador.</span></div>
    <div className="feature-grid"><Feature icon={<BookOpen />} color="sage" title="Cada materia, su espacio">Organiza los materiales y los conceptos de cada asignatura.</Feature><Feature icon={<Target />} color="amber" title="Practicar para comprender">Conserva tus intentos, las pistas y lo que aprendiste de cada ejercicio.</Feature><Feature icon={<ShieldCheck />} color="blue" title="Tu privacidad, desde el inicio">Tu historial se guarda cifrado. La tutoría usa un modelo local.</Feature></div>
    <div className="getting-started"><span className="step-number">01</span><div><strong>Empieza con una sola asignatura</strong><p>Un tema, unos apuntes y un objetivo concreto son suficientes.</p></div><button className="icon-button" aria-label="Crear una asignatura" onClick={onNewSubject}><ArrowRight size={22} /></button></div>
  </>;
  return <>
    <PageTitle eyebrow={date} title={greeting} description="Cada intento te ayuda a descubrir qué necesitas aprender." action={<button className="button secondary" onClick={onNewSubject}><Plus size={17} /> Nueva asignatura</button>} />
    <div className="stats-grid"><Stat icon={<BookOpen />} value={data.subjects.length} label="Asignaturas" detail="Cada una con su propio espacio" /><Stat icon={<Files />} value={materials.length} label="Materiales" detail={subject?.name ?? 'Tu biblioteca'} /><Stat icon={<PencilLine />} value={attempts.length} label="Ejercicios registrados" detail="Intentos que cuentan tu historia" /><Stat icon={<Sprout />} value={`${consolidated}/${concepts.length}`} label="Conceptos consolidados" detail="Con evidencias de tus ejercicios" /></div>
    <div className="home-columns"><section className="study-card"><div className="section-heading"><span className="eyebrow"><Sparkles size={15} /> TU SIGUIENTE PASO</span><span className="time-chip"><Clock3 size={14} /> {data.settings.dailyMinutes} min</span></div><h2>{!materials.length ? 'Dale al tutor tus primeros apuntes.' : concept ? `Un poco de ${concept.name.toLowerCase()}.` : 'Pon nombre a lo que quieres aprender.'}</h2><p>{!materials.length ? 'Añade los materiales de esta asignatura para tenerlos a mano y usarlos en tus consultas.' : recommendation?.reason ?? 'Añade los conceptos de esta unidad. Así podrás vincular los ejercicios y observar tu progreso.'}</p><div className="study-footer"><button className="button primary" onClick={() => navigate(!materials.length ? 'materials' : concept ? 'practice' : 'progress', concept?.id)}>{!materials.length ? 'Añadir materiales' : concept ? 'Empezar a practicar' : 'Organizar conceptos'}<ArrowRight size={17} /></button><span>Asignatura: {subject?.name}</span></div></section>
    <section className="goal-card"><span className={`subject-tile ${subject?.color ?? 'sage'}`}><Target size={22} /></span><span className="eyebrow">MI OBJETIVO</span><h3>{subject?.name}</h3><p>{subject?.goals || 'Puedes avanzar poco a poco: comprender un concepto y comprobarlo con un ejercicio.'}</p><span className="goal-level">{[subject?.course, subject?.level, subject?.teacher].filter(Boolean).join(' · ') || 'Tu propio ritmo'}</span>{subject && <button className="text-button" onClick={() => onEditSubject(subject)} aria-label="Editar configuración de asignatura">Editar configuración <PencilLine size={14} /></button>}</section></div>
    <div className="section-heading"><h2>Cómo va tu aprendizaje</h2><button className="text-button" onClick={() => navigate('progress')}>Ver mi aprendizaje <ArrowRight size={15} /></button></div>
    <section className="concept-overview">{concepts.length ? concepts.slice(0, 4).map(item => { const current = estimates.find(e => e.conceptId === item.id)!; return <button className="concept-row" key={item.id} onClick={() => navigate('progress')}><span className={`concept-glyph ${current.status === 'reinforce' ? 'amber' : 'sage'}`}><Layers size={18} /></span><div><strong>{item.name}</strong><span>{current.evidenceIds.length ? `${current.evidenceIds.length} evidencias comprobadas` : 'Empieza con un primer intento'}</span></div><Badge status={current.status} /><ChevronRight size={17} /></button>; }) : <div className="inline-empty"><Layers size={25} /><div><strong>Todo aprendizaje empieza con un mapa.</strong><p>Añade los conceptos de esta asignatura para ver cómo evolucionan.</p></div><button className="button secondary" onClick={() => navigate('progress')}>Añadir conceptos</button></div>}</section>
    <section className="home-recent"><div className="section-heading"><h2>Qué cambió en los últimos 30 días</h2><button className="text-button" onClick={() => navigate('progress')}>Consultar por fechas <ArrowRight size={15} /></button></div>{recent.length ? <><div className="home-recent-changes">{recent.slice(0,3).map(r => <button key={r.conceptId} onClick={() => navigate('progress', r.conceptId)}><strong>{concepts.find(c => c.id === r.conceptId)?.name}</strong><span>{changeLabels[r.change]}</span><span><Badge status={r.before.status} /><ArrowRight size={14}/><Badge status={r.after.status}/></span></button>)}</div>{recent.length > 3 && <p>{recent.length} conceptos con cambios registrados. Consulta sus fechas y evidencias en Mi aprendizaje.</p>}</> : <p>No hay cambios de estado apoyados en nuevos intentos durante este periodo. Esto no demuestra que no hayas aprendido; revisa las evidencias disponibles.</p>}</section>
    <div className="home-tracking"><Habit compact habit={data.learningHabits.find(h => h.subjectId === subject?.id)} /><section className="home-goal-preview"><span className="eyebrow">MI META PERSONAL</span><h3>{personalGoal?.title ?? 'Elige tu siguiente objetivo'}</h3><p>{personalProgress?.reason ?? 'Mejorar un bloque, preparar una prueba o profundizar. Define cómo comprobarás que has avanzado.'}</p>{pendingAlerts.length > 0 && <p>{pendingAlerts.length} avisos apoyados en tu historial por revisar. {pendingAlerts[0].title}.</p>}<div className="goal-actions"><button className="button secondary" onClick={() => navigate('goals')}>Ver mis metas y avisos <ArrowRight size={16} /></button><button className="text-button" onClick={() => navigate('progress')}>Ver la evolución</button></div></section></div>
    <section className="home-plan-preview"><span className="feature-icon sage"><Clock3 size={22} /></span><div><h2>Tu plan de hoy</h2><p>{plan?.items.length ? `${plan.items.length} pasos · ${plan.items.reduce((total, item) => total + item.minutes, 0)} minutos. Empieza por: ${plan.items[0].title.toLowerCase()}.` : 'Añade una tarea o comprueba un concepto para organizar el siguiente paso.'}</p></div><button className="button secondary" onClick={() => navigate('plan')}>Ver mi plan <ArrowRight size={16} /></button></section>
    <div className="privacy-footer"><ShieldCheck size={17} /><p>Tu historial permanece en este ordenador. Tú decides cuándo exportarlo.</p><span>TUTOR LOCAL · 0.13</span></div>
  </>;
}
function Feature({ icon, color, title, children }: { icon: React.ReactNode; color: string; title: string; children: React.ReactNode }) {
  return <article className="feature-card"><span className={`feature-icon ${color}`}>{icon}</span><h3>{title}</h3><p>{children}</p></article>;
}
function Stat({ icon, value, label, detail }: { icon: React.ReactNode; value: string | number; label: string; detail: string }) {
  return <article className="stat-card"><div><span className="stat-icon">{icon}</span><strong>{value}</strong></div><h3>{label}</h3><p>{detail}</p></article>;
}
function LearningIllustration() {
  return <div className="learning-illustration" aria-hidden="true"><div className="illustration-orbit orbit-one" /><div className="illustration-orbit orbit-two" /><span className="illustration-spark spark-one">✧</span><span className="illustration-spark spark-two">✧</span><div className="illustration-note note-back"><div /><div /><div /></div><div className="illustration-note note-front"><span className="note-icon"><Sprout size={31} /></span><div className="note-line long" /><div className="note-line" /><div className="note-progress"><span /><span /><span /><span /></div><span className="note-caption">Un paso más.</span></div><span className="floating-chip chip-question">¿Y si lo intentamos?</span><span className="floating-chip chip-check"><ShieldCheck size={15} /> Solo para ti</span></div>;
}
