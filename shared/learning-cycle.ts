import type { Intervention, InterventionResponse } from './pedagogy.js';
import { addDays, dayKey } from './calendar.js';

export function independentCheckOn(plan: Pick<Intervention, 'id' | 'independent' | 'followUpOn' | 'activities'>, responses: InterventionResponse[]): string {
  const practiceDates = plan.independent ? responses.filter(response => response.interventionId === plan.id && plan.activities.some(activity => activity.id === response.activityId && !activity.followUp)).map(response => addDays(dayKey(new Date(response.createdAt)), 1)) : [];
  return [plan.followUpOn, ...practiceDates].sort().at(-1)!;
}

export function learningCycleMessage(plan: Intervention, responses: InterventionResponse[]): string {
  const own = responses.filter(response => response.interventionId === plan.id);
  const check = own.find(response => plan.activities.find(activity => activity.id === response.activityId)?.followUp);
  if (check) {
    if (check.outcome === 'ungraded') return 'La comprobación está guardada y necesita revisión. No se ha demostrado que la dificultad esté resuelta.';
    if (check.outcome === 'incorrect') return 'La comprobación todavía necesita refuerzo. Revisa qué falló y prueba otra estrategia.';
    return check.hints === 0 ? 'Has resuelto esta comprobación sin ayuda. Contrástala con la dificultad original; un resultado no demuestra consolidación.' : 'El resultado es correcto con ayuda. Falta comprobarlo sin pistas.';
  }
  const practiced = plan.activities.filter(activity => !activity.followUp && own.some(response => response.activityId === activity.id)).length;
  return practiced === 2 ? 'Práctica inicial terminada. Falta comprobarlo en otro día, sin consultar pistas ni respuestas anteriores.' : `Completa las dos prácticas, paso a paso. Llevas ${practiced} de 2.`;
}
