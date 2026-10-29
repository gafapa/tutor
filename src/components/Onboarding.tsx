import { useState } from 'react';
import type { PageProps } from '../ui';
import Moodle from '../pages/Moodle';
import AIChooser from './AIChooser';
import ProgrammeImport from './ProgrammeImport';
export default function Onboarding(props:PageProps){
  const [step,setStep]=useState(props.data.lmsConnections.length?1:0),[subjectId,setSubjectId]=useState(props.data.subjects[0]?.id??''),[busy,setBusy]=useState(false);
  const subject=props.data.subjects.find(s=>s.id===subjectId)??props.subject;
  async function finish(){setBusy(true);try{await window.tutor.updateSettings({onboardingCompleted:true});await props.refresh();props.navigate('home');}catch(error){props.notify(String(error),true);}finally{setBusy(false);}}
  return <div className="onboarding"><header><h1>Tu aprendizaje empieza en tu aula</h1><p>Conecta Moodle y construye tu apoyo a partir de lo que estás trabajando en el centro. Podrás añadir materiales y actividades propias.</p><ol className="setup-steps">{['Conectar Moodle','Elegir IA','Añadir programación'].map((name,index)=><li key={name} aria-current={step===index?'step':undefined}>{name}</li>)}</ol></header>
    {step===0?<Moodle {...props}/>:step===1?<AIChooser {...props}/>:<><label>Asignatura<select aria-label="Asignatura de la programación" value={subject?.id??''} onChange={e=>setSubjectId(e.target.value)}>{props.data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{subject?<ProgrammeImport key={subject.id} {...props} subject={subject}/>:<p>Conecta tus cursos de Moodle para añadir sus programaciones. También puedes hacerlo después.</p>}</>}
    <footer className="setup-actions">{step>0&&<button className="button secondary" disabled={busy} onClick={()=>setStep(step-1)}>Anterior</button>}{step<2?<button className="button primary" onClick={()=>setStep(step+1)}>{step===0&& !props.data.lmsConnections.length?'Conectar Moodle más adelante':step===1?'Continuar con la programación':'Continuar con la IA'}</button>:<button className="button primary" disabled={busy} onClick={()=>void finish()}>Abrir mi espacio</button>}<p>La app solo lee Moodle. Las programaciones y la IA se pueden configurar después.</p></footer>
  </div>;
}
