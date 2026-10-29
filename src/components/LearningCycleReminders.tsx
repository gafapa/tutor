import { dayKey } from '../../shared/calendar';
import { independentCheckOn } from '../../shared/learning-cycle';
import type { PageProps } from '../ui';

export default function LearningCycleReminders({ data, subject, navigate }: Pick<PageProps, 'data' | 'subject' | 'navigate'>) {
  const pending = data.interventions.filter(plan => plan.subjectId === subject?.id && plan.independent && !data.interventionResponses.some(response => response.interventionId === plan.id && plan.activities.some(activity => activity.id === response.activityId && activity.followUp))).sort((a, b) => a.followUpOn.localeCompare(b.followUpOn));
  if (!pending.length) return null;
  return <section className="pedagogy-panel form-stack" aria-label="Mis comprobaciones de aprendizaje pendientes">
    <h2>Comprobar lo que he aprendido</h2>
    <p>{pending.length} refuerzos pendientes. La comprobación se abre en otro día, después de completar las dos prácticas.</p>
    {pending.slice(0, 3).map(plan => {
      const practiced = data.interventionResponses.filter(response => response.interventionId === plan.id && plan.activities.some(activity => activity.id === response.activityId && !activity.followUp)).length;
      const checkOn = independentCheckOn(plan, data.interventionResponses), ready = practiced === 2 && dayKey() >= checkOn;
      return <div className="pedagogy-heading" key={plan.id}><p>{practiced < 2 ? `Práctica: ${practiced} de 2 terminadas.` : ready ? 'Comprobación disponible sin pistas.' : `Comprobación desde ${checkOn}.`}</p><button className="text-button" onClick={() => navigate('pedagogy', plan.id)}>{practiced < 2 ? 'Continuar mi práctica' : 'Consultar mi comprobación'}</button></div>;
    })}
    {pending.length > 3 && <button className="text-button" onClick={() => navigate('pedagogy')}>Ver los {pending.length} refuerzos en Cómo aprendo</button>}
  </section>;
}
