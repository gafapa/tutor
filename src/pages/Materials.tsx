import { useEffect, useState, type FormEvent } from 'react';
import { Files, FileText, Plus, Upload, Search, Trash2, Eye, ShieldCheck, NotebookPen } from 'lucide-react';
import type { ImportProgress, ImportReport, Material } from '../../shared/types';
import { OcrCaptureDialog, CaptureLink, CaptureLibrary } from '../ocr-ui';
import { SemanticSearchDialog } from '../semantic-ui';
import { materialPartLabel } from '../../shared/materials';
import { Empty, Modal, PageTitle, Spinner, SubjectRequired, dateLabel, errorMessage, type PageProps } from '../ui';

export default function Materials({ data, subject, refresh, notify, onNewSubject }: PageProps) {
  const [busy, setBusy] = useState(false);
  const [semanticOpen, setSemanticOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportReport>();
  const [query, setQuery] = useState('');
  const [note, setNote] = useState(false);
  const [preview, setPreview] = useState<Material>();
  const [deleting, setDeleting] = useState<Material>();
  const [noteError, setNoteError] = useState('');
  useEffect(() => {
    if (!importing || !subject) return;
    let disposed = false;
    const update = () => { void window.tutor.materialImportProgress(subject.id).then(value => { if (!disposed) setProgress(value); }).catch(() => {}); };
    update(); const timer = setInterval(update, 500);
    return () => { disposed = true; clearInterval(timer); };
  }, [importing, subject?.id]);
  if (!subject) return <SubjectRequired onNewSubject={onNewSubject} />;
  const materials = data.materials.filter(m => m.subjectId === subject.id && `${m.name} ${m.text}`.toLowerCase().includes(query.toLowerCase()));
  async function importFiles() {
    setBusy(true); setImporting(true); setImportResult(undefined);
    try {
      const report = await window.tutor.importMaterials(subject!.id); setImportResult(report); await refresh();
      if (report.cancelled) notify(`Importación cancelada. Se conservan los ${report.imported} materiales ya añadidos.`);
      else if (report.errors.length) notify(`${report.imported} materiales añadidos. Consulta los ${report.errors.length} avisos de importación.`, true);
      else if (report.imported || report.duplicates) notify(`${report.imported} materiales añadidos${report.duplicates ? ` · ${report.duplicates} ya estaban guardados` : ''}.`);
    } catch (error) { notify(errorMessage(error), true); }
    finally { setBusy(false); setImporting(false); setProgress(null); }
  }
  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setNoteError('');
    try { await window.tutor.addNote({ subjectId: subject!.id, name: String(form.get('name')), text: String(form.get('text')) }); await refresh(); setNote(false); notify('Apuntes guardados en esta asignatura.'); }
    catch (error) { setNoteError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <><PageTitle eyebrow={subject.name} title="Tus materiales, a mano." description="Los apuntes que dan contexto a lo que estás aprendiendo." action={<button className="button primary" onClick={importFiles} disabled={busy}>{busy ? <Spinner label="Leyendo…" /> : <><Upload size={17} /> Añadir archivos</>}</button>} />
    <section className="import-banner"><span className="import-banner-icon"><Files size={30} /></span><div><h2>Un espacio para los apuntes de esta asignatura</h2><p>PDF con texto, DOCX, PPTX, TXT, Markdown, HTML y subtítulos SRT/VTT · Hasta 20 MB por archivo y 30 archivos por importación.</p></div><button className="button secondary" disabled={busy} onClick={() => setNote(true)}><NotebookPen size={17} /> Escribir apuntes</button></section>
    <div className="material-ocr-action"><button className="button secondary" disabled={busy} onClick={() => setSemanticOpen(true)}><Search size={17} /> Buscar por significado</button><button className="button secondary" disabled={busy} onClick={() => setOcrOpen(true)}>Leer imagen o PDF escaneado</button></div>
    {importing && <div className="materials-import-progress" role="status"><Spinner label={progress?.total ? `Leyendo ${progress.current} de ${progress.total}: ${progress.name}` : 'Selecciona tus materiales…'} /><button className="button secondary" onClick={async () => { try { await window.tutor.cancelMaterialImport(subject.id); } catch (error) { notify(errorMessage(error), true); } }}>Cancelar importación</button></div>}
    {importResult && (importResult.errors.length > 0 || importResult.cancelled) && <section className="materials-import-result" aria-label="Resultado de la importación"><p>{importResult.cancelled ? 'Importación cancelada. ' : ''}{importResult.imported} materiales añadidos · {importResult.duplicates} duplicados omitidos.</p>{importResult.errors.length > 0 && <details open><summary>Avisos de importación ({importResult.errors.length})</summary><ul>{importResult.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}</section>}
    <div className="section-heading"><h2>Biblioteca <span className="count-chip">{data.materials.filter(m => m.subjectId === subject.id).length}</span></h2><label className="search-field"><Search size={17} /><input aria-label="Buscar materiales" placeholder="Buscar en mis materiales…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    {materials.length ? <div className="material-grid">{materials.map(material => <article className="material-card" key={material.id}><div className="material-card-top"><span className={`file-icon ${material.kind === 'pdf' ? 'rose' : material.kind === 'note' ? 'sage' : 'blue'}`}><FileText size={24} /></span><span className="file-format">{material.kind === 'note' ? 'APUNTES' : material.kind.toUpperCase()}</span><button className="icon-button danger-hover" aria-label={`Eliminar ${material.name}`} onClick={() => setDeleting(material)}><Trash2 size={16} /></button></div><h3>{material.name}</h3><p className="material-excerpt">{material.text.replace(/\f/g, ' · ').slice(0, 180)}</p><div className="material-meta"><span>{material.pageCount > 1 ? `${material.pageCount} ${material.kind === 'pptx' ? 'diapositivas' : ['srt', 'vtt'].includes(material.kind) ? 'secciones' : 'páginas'}` : `${material.text.split(/\s+/).length} palabras`}</span><span>v{material.version} · {dateLabel(material.createdAt)}</span></div><button className="material-open" onClick={() => setPreview(material)}><Eye size={16} /> Leer material <span>→</span></button></article>)}</div> : <Empty icon={<Files size={28} />} title={query ? 'No hay coincidencias' : 'Aquí empieza tu biblioteca'} action={!query && <button className="button primary" onClick={importFiles} disabled={busy}><Plus size={17} /> Añadir mis primeros apuntes</button>}>{query ? 'Prueba con el nombre de un archivo o una palabra del contenido.' : 'Añade los materiales del profesor o escribe tus propios apuntes. Se guardarán en este ordenador.'}</Empty>}
    <p className="subtle-note"><ShieldCheck size={15} /> La lectura se realiza en este ordenador. Para importar una web, guárdala como HTML desde el navegador: no se cargan imágenes, scripts ni enlaces externos.</p>
    <p className="subtle-note">PPTX conserva diapositivas, tablas y notas; no interpreta gráficos ni imágenes. SRT/VTT conserva el texto y los tiempos: la transcripción automática de audio o vídeo todavía está pendiente. Los archivos originales permanecen en su ubicación.</p>
    <CaptureLibrary subjectId={subject.id} data={data} refresh={refresh} notify={notify} />
    {semanticOpen && <SemanticSearchDialog subjectId={subject.id} data={data} scope="materials" onClose={() => setSemanticOpen(false)} />}
    {ocrOpen && <OcrCaptureDialog subjectId={subject.id} data={data} refresh={refresh} notify={notify} onClose={() => setOcrOpen(false)} />}
    {note && <Modal title="Añadir apuntes" onClose={() => { if (!busy) setNote(false); }}><form className="form-stack" onSubmit={saveNote}><label>Título<input name="name" placeholder="Ej. Unidad 1 · Conceptos principales" required maxLength={120} autoFocus /></label><label>Contenido<textarea name="text" placeholder="Pega los apuntes del profesor o escribe tu resumen…" rows={12} required maxLength={2000000} /></label>{noteError && <p className="form-error" role="alert">{noteError}</p>}<div className="modal-actions"><button className="button secondary" type="button" onClick={() => setNote(false)} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy}>Guardar apuntes</button></div></form></Modal>}
    {preview && <MaterialPreview material={preview} onClose={() => setPreview(undefined)} />}
    {deleting && <Modal title="Eliminar este material" onClose={() => setDeleting(undefined)}><p className="modal-intro">Se eliminará «{deleting.name}» de esta asignatura. Se retirarán sus enlaces en unidades y las tarjetas derivadas, incluidas sus versiones y repasos. Las conversaciones anteriores conservarán sus respuestas.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleting(undefined)}>Cancelar</button><button className="button danger" onClick={async () => { try { await window.tutor.deleteMaterial(deleting.id); await refresh(); setDeleting(undefined); notify('Material eliminado.'); } catch (error) { notify(errorMessage(error), true); } }}>Eliminar material</button></div></Modal>}
  </>;
}
export function MaterialPreview({ material, onClose }: { material: Material; onClose(): void }) {
  return <Modal title={material.name} onClose={onClose} wide><CaptureLink source={material.ocrSource} /><div className="document-preview">{material.text.split('\f').map((page, index) => <section key={index}>{(material.pageCount > 1 || material.kind === 'pptx') && <span className="document-page-label">{materialPartLabel(material.kind, index)}</span>}<div>{page || 'Sin texto extraíble en esta sección.'}</div></section>)}</div></Modal>;
}
