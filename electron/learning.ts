import type { Attempt, Concept, Estimate, Exercise } from '../shared/types.js';

export function estimate(conceptId: string, attempts: Attempt[],now=new Date()): Estimate {
  const current=now.toISOString();
  const evidence = attempts.filter(a => a.conceptId === conceptId && a.source === 'verified' && a.outcome !== 'ungraded'&&a.createdAt<=current)
    .reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const base: Estimate = { conceptId, status: 'unseen', confidence: 'low', evidenceIds: evidence.map(a => a.id), reason: 'Todavía no hay ejercicios comprobados de este concepto.' };
  if (!evidence.length) return base;
  const recent = evidence.slice(0, 3);
  const independent = evidence.filter(a => a.outcome === 'correct' && a.hints === 0);
  const days = new Set(independent.map(a => a.createdAt.slice(0, 10)));
  const differentQuestions = new Set(independent.map(a => a.statement));
  const failed = recent.filter(a => a.outcome === 'incorrect').length;
  if (failed >= 2) {
    return { ...base, status: 'reinforce', confidence: evidence.length >= 4 ? 'medium' : 'low', reason: `${failed} de los últimos ${recent.length} intentos comprobados muestran una dificultad. Conviene practicar el concepto y sus prerrequisitos.` };
  }
  if (independent.length >= 4 && days.size >= 3 && differentQuestions.size >= 3 && recent.every(a => a.outcome === 'correct' && a.hints === 0)) {
    const last = new Date(evidence[0].createdAt).getTime();
    if (now.getTime() - last > 30 * 86400000) return { ...base, status: 'progress', confidence: 'low', reason: 'Las evidencias anteriores eran consistentes, pero hace más de un mes que no lo compruebas. Un repaso permitirá actualizar la estimación.' };
    return { ...base, status: 'consolidated', confidence: days.size >= 5 && independent.length >= 6 ? 'high' : 'medium', reason: `${independent.length} aciertos sin pistas en ${days.size} días distintos y ${differentQuestions.size} preguntas diferentes, con los últimos intentos correctos.` };
  }
  return { ...base, status: 'progress', confidence: evidence.length >= 4 ? 'medium' : 'low', reason: independent.length ? 'Hay aciertos autónomos. Faltan comprobaciones con preguntas diferentes y en distintos días para considerar el concepto consolidado.' : 'Hay evidencias iniciales, pero aún falta resolver ejercicios correctamente sin pistas.' };
}

export const EXERCISES: Record<string, { statement: string; answer: string; hint: string; feedback: string }[]> = Object.assign(Object.create(null), {
  'Fracciones': [
    { statement: 'Calcula 1/2 + 1/4. Escribe el resultado como fracción simplificada, por ejemplo 3/5.', answer: '3/4', hint: 'Busca un denominador común. Un medio equivale a dos cuartos.', feedback: '1/2 = 2/4. Entonces 2/4 + 1/4 = 3/4.' },
    { statement: 'Simplifica la fracción 6/8. Escribe el resultado como fracción irreducible.', answer: '3/4', hint: 'Divide el numerador y el denominador por el mismo divisor común.', feedback: 'El máximo divisor común de 6 y 8 es 2. Al dividir ambos por 2 obtenemos 3/4.' },
    { statement: 'Calcula 2/3 × 3/5. Escribe una fracción irreducible.', answer: '2/5', hint: 'Multiplica los numeradores entre sí y los denominadores entre sí; después simplifica.', feedback: '(2 × 3)/(3 × 5) = 6/15 = 2/5.' },
    { statement: 'Calcula 3/4 − 1/2. Escribe una fracción irreducible.', answer: '1/4', hint: 'Escribe ambas fracciones con denominador 4.', feedback: '3/4 − 2/4 = 1/4.' }
  ],
  'Porcentajes': [
    { statement: '¿Cuánto es el 20 % de 150? Escribe solo el valor numérico.', answer: '30', hint: 'Calcula 150 × 20/100.', feedback: '150 × 0,20 = 30.' },
    { statement: 'Un artículo de 80 euros tiene un descuento del 25 %. ¿Cuánto cuesta después del descuento? Escribe solo el precio.', answer: '60', hint: 'Calcula primero el descuento y réstalo al precio original.', feedback: 'El descuento es 80 × 0,25 = 20 euros. El precio final es 80 − 20 = 60 euros.' },
    { statement: 'En un grupo de 40 personas, 10 han terminado una tarea. ¿Qué porcentaje representan? Escribe solo el número, sin el símbolo %.', answer: '25', hint: 'Divide la parte por el total y multiplica por 100.', feedback: '(10/40) × 100 = 25 %.' },
    { statement: 'Una cantidad de 200 aumenta un 15 %. ¿Cuál es la nueva cantidad?', answer: '230', hint: 'El 15 % de 200 se suma a la cantidad inicial.', feedback: '200 × 0,15 = 30; 200 + 30 = 230.' }
  ],
  'Ecuaciones de primer grado': [
    { statement: 'Resuelve 3x + 5 = 20. Escribe solo el valor de x.', answer: '5', hint: 'Resta 5 a ambos miembros y después divide ambos por 3.', feedback: '3x = 20 − 5 = 15. Por tanto x = 15/3 = 5.' },
    { statement: 'Resuelve 2(x − 3) = 10. Escribe solo el valor de x.', answer: '8', hint: 'Divide ambos miembros por 2 y después despeja x.', feedback: 'x − 3 = 5; x = 5 + 3 = 8.' },
    { statement: 'Resuelve 5x − 4 = 2x + 11. Escribe solo el valor de x.', answer: '5', hint: 'Agrupa los términos con x en un miembro y los números en el otro.', feedback: '5x − 2x = 11 + 4; 3x = 15; x = 5.' },
    { statement: 'Resuelve x/4 + 2 = 5. Escribe solo el valor de x.', answer: '12', hint: 'Resta 2 en ambos miembros y después multiplica por 4.', feedback: 'x/4 = 3; x = 3 × 4 = 12.' }
  ],
  'Potencias de 2': [
    { statement: '¿Cuánto es 2 elevado a 5? Escribe el resultado numérico.', answer: '32', hint: 'Empieza en 1 y multiplica por 2 cinco veces.', feedback: '2⁵ = 2 × 2 × 2 × 2 × 2 = 32.' },
    { statement: 'Una secuencia comienza en 1 y se duplica seis veces. ¿Qué valor alcanza?', answer: '64', hint: 'Cada duplicación equivale a multiplicar por 2. Cuenta las seis multiplicaciones.', feedback: 'Seis duplicaciones: 1 → 2 → 4 → 8 → 16 → 32 → 64.' },
    { statement: '¿Qué exponente necesitas para que 2 elevado a ese número sea 128?', answer: '7', hint: 'Recorre las potencias: 2¹ = 2, 2² = 4, 2³ = 8…', feedback: '2⁷ = 128. El exponente es 7.' },
    { statement: '¿Cuántas combinaciones diferentes permiten 4 bits?', answer: '16', hint: 'Cada bit tiene dos valores posibles. Multiplica cuatro factores de 2.', feedback: 'Cuatro bits permiten 2⁴ = 16 combinaciones.' }
  ],
  'Sistema binario': [
    { statement: 'Convierte el número binario 1010 a decimal.', answer: '10', hint: 'Las posiciones de derecha a izquierda valen 1, 2, 4 y 8.', feedback: '1010₂ = 1×8 + 0×4 + 1×2 + 0×1 = 10.' },
    { statement: 'Convierte 13 a binario, usando cuatro bits.', answer: '1101', hint: 'Descompón 13 como suma de 8, 4, 2 y 1.', feedback: '13 = 8 + 4 + 1. Por eso se escribe 1101₂.' },
    { statement: 'Convierte el número binario 1111 a decimal.', answer: '15', hint: 'Suma el valor de las cuatro posiciones activadas.', feedback: '1111₂ = 8 + 4 + 2 + 1 = 15.' }
  ],
  'Subnetting': [
    { statement: 'Una red IPv4 /26 deja 6 bits para hosts. ¿Cuántas direcciones totales tiene el bloque?', answer: '64', hint: 'Calcula 2 elevado al número de bits para hosts. Se piden direcciones totales, no hosts utilizables.', feedback: '2⁶ = 64 direcciones totales en el bloque /26.' },
    { statement: 'En una subred IPv4 /27 convencional, ¿cuántos hosts utilizables hay? Excluye la dirección de red y la de broadcast.', answer: '30', hint: 'Quedan 32 − 27 = 5 bits. Calcula 2⁵ y resta dos direcciones.', feedback: '2⁵ − 2 = 32 − 2 = 30 hosts utilizables.' },
    { statement: 'Una red /24 se divide en cuatro subredes iguales. ¿Cuál es el nuevo prefijo? Escribe solo el número.', answer: '26', hint: 'Para obtener cuatro combinaciones se necesitan dos bits adicionales.', feedback: 'Se toman 2 bits porque 2² = 4. El nuevo prefijo es /26.' }
  ]
});

export function getExercise(concept: Concept, previousCount: number): Exercise | null {
  const bank = EXERCISES[concept.name];
  if (!bank) return null;
  const index = previousCount % bank.length;
  return { id: `${concept.name}:${index}`, conceptId: concept.id, statement: bank[index].statement, hint: bank[index].hint };
}

export function gradeExercise(concept: Concept, exerciseId: string, answer: string) {
  const index = Number(exerciseId.split(':').at(-1));
  const bank = EXERCISES[concept.name];
  if (!bank || !Number.isInteger(index) || index < 0 || index >= bank.length || exerciseId !== `${concept.name}:${index}`) {
    throw new Error('El ejercicio no pertenece a este concepto.');
  }
  const exercise = bank[index];
  return { ...exercise, correct: matchesBankAnswer(answer, exercise.answer) };
}
export function matchesBankAnswer(answer: string, expected: string) { return answer.trim().replace(/^\//, '').replace(/\s+/g, '') === expected; }
