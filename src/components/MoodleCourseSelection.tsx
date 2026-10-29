import { useState, type FormEvent } from 'react';
import type { LmsConnection, LmsCourseSelection, LmsDiscovery } from '../../shared/lms';
import type { Subject } from '../../shared/types';
import { Spinner } from '../ui';

interface Props {
  discovery: LmsDiscovery;
  subjects: Subject[];
  connections: LmsConnection[];
  busy: boolean;
  onConnect(courses: LmsCourseSelection[], autoMinutes: LmsConnection['autoMinutes']): Promise<void>;
}

export default function MoodleCourseSelection({ discovery, subjects, connections, busy, onConnect }: Props) {
  const [selected, setSelected] = useState<Record<number, { subjectId: string; name: string }>>({});
  const [search, setSearch] = useState(''), [limit, setLimit] = useState(50);
  const entries = Object.entries(selected);
  const targets = entries.map(([, row]) => row.subjectId).filter(Boolean);
  const repeatedTarget = new Set(targets).size !== targets.length;
  const filtered = discovery.courses.filter(course => `${course.name} ${course.shortName}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  function toggle(course: LmsDiscovery['courses'][number]) {
    setSelected(previous => {
      const next = { ...previous };
      if (next[course.id]) delete next[course.id];
      else if (Object.keys(next).length < 30) {
        const connection = connections.find(row => row.siteUrl === discovery.siteUrl && row.courseId === course.id);
        next[course.id] = { subjectId: connection?.subjectId ?? '', name: course.name.slice(0, 120).replace(/[\uD800-\uDBFF]$/, '') };
      }
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entries.length || repeatedTarget || busy) return;
    const form = new FormData(event.currentTarget);
    await onConnect(entries.map(([id, row]) => ({ courseId: Number(id), ...(row.subjectId ? { subjectId: row.subjectId } : { subjectName: row.name.trim() }) })), Number(form.get('interval')) as LmsConnection['autoMinutes']);
  }
  return <form className="form-stack" onSubmit={submit}>
    <p>{discovery.siteName}. Cada curso tendrá su propia asignatura local.</p>
    <fieldset className="lms-course-selection" disabled={busy}>
      <legend>Elige hasta 30 cursos</legend>
      <label>Buscar un curso<input type="search" value={search} onChange={event => { setSearch(event.target.value); setLimit(50); }} /></label>
      <p role="status" aria-live="polite">{entries.length} seleccionados · {filtered.length} cursos coinciden con la búsqueda.</p>
      <div className="lms-course-choices">{filtered.slice(0, limit).map(course => {
        const choice = selected[course.id];
        const linked = connections.filter(row => row.siteUrl === discovery.siteUrl && row.courseId === course.id);
        return <div className="lms-course-choice" key={course.id}>
          <label className="lms-course-check"><input type="checkbox" checked={Boolean(choice)} disabled={!choice && entries.length >= 30} onChange={() => toggle(course)} /><span>{course.name}<small>{course.shortName}</small></span></label>
          {choice && <div className="lms-course-target">
            <label>Asignatura para {course.shortName}<select value={choice.subjectId} onChange={event => setSelected(previous => ({ ...previous, [course.id]: { ...previous[course.id], subjectId: event.target.value } }))}>
              {!linked.length && <option value="">Crear una asignatura nueva</option>}
              {subjects.filter(subject => linked.length ? linked.some(row => row.subjectId === subject.id) : !connections.some(row => row.subjectId === subject.id)).map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select></label>
            {!choice.subjectId && <label>Nombre de la nueva asignatura<input value={choice.name} required maxLength={120} onChange={event => setSelected(previous => ({ ...previous, [course.id]: { ...previous[course.id], name: event.target.value } }))} /></label>}
            {linked.length > 0 && <p className="subtle-note">Se recuperará el acceso conservando la copia y su historial.</p>}
          </div>}
        </div>;
      })}</div>
      {!filtered.length && <p>No hay cursos con ese nombre. Los cursos seleccionados se mantienen al buscar.</p>}
      {filtered.length > limit && <button className="button secondary" type="button" onClick={() => setLimit(previous => previous + 50)}>Mostrar más cursos</button>}
      {entries.some(([id]) => !filtered.slice(0, limit).some(course => course.id === Number(id))) && <details><summary>Revisar todos los cursos seleccionados</summary><ul>{entries.map(([id, choice]) => <li key={id}>{discovery.courses.find(course => course.id === Number(id))?.name} → {choice.subjectId ? subjects.find(subject => subject.id === choice.subjectId)?.name : choice.name} <button type="button" className="text-button" onClick={() => toggle(discovery.courses.find(course => course.id === Number(id))!)}>Quitar de la selección</button></li>)}</ul></details>}
      {repeatedTarget && <p role="alert">Has elegido la misma asignatura para varios cursos. Asigna una diferente a cada curso.</p>}
      <label>¿Cuándo actualizar?<select name="interval" defaultValue={0}><option value={0}>Solo cuando yo lo pida</option><option value={15}>Cada 15 minutos con la app abierta</option><option value={30}>Cada 30 minutos con la app abierta</option><option value={60}>Cada hora con la app abierta</option></select></label>
    </fieldset>
    <p className="subtle-note">Primero se guardan las conexiones y después se descarga cada curso por separado. Podrás reintentar una actualización si falla. La contraseña no se guarda y los tokens quedan cifrados en este ordenador.</p>
    <button className="button primary" disabled={busy || !entries.length || repeatedTarget || entries.some(([, row]) => !row.subjectId && !row.name.trim())}>{busy ? <Spinner label="Conectando cursos…" /> : `Conectar ${entries.length === 1 ? '1 curso' : `${entries.length} cursos`}`}</button>
  </form>;
}
