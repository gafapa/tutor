import type { ExerciseClassification, Difficulty, Reasoning } from '../shared/assessment';
import type { Concept } from '../shared/types';
export const difficultyNames: Record<Difficulty, string> = { 1: 'Básica', 2: 'Intermedia', 3: 'Avanzada' };
export const reasoningNames: Record<Reasoning, string> = { calculation: 'Cálculo', procedure: 'Procedimiento', interpretation: 'Interpretación', logic: 'Razonamiento lógico' };
const curriculumKinds = { competency: 'Competencia', criterion: 'Criterio', content: 'Contenido', outcome: 'Resultado de aprendizaje' };
export function ExerciseTags({ classification, concepts }: { classification?: ExerciseClassification; concepts: Concept[] }) {
  if (!classification) return null;
  return <div className="exercise-classification"><div className="education-tags"><span className="prerequisite-chip">Dificultad del banco: {difficultyNames[classification.difficulty]}</span><span className="prerequisite-chip">{reasoningNames[classification.reasoning]}</span></div><details><summary>Contenido, currículo y prerrequisitos</summary><p>Contenidos: {classification.conceptIds.map(id => concepts.find(concept => concept.id === id)?.name ?? 'Concepto vinculado').join(', ')}</p><p>Prerrequisitos: {classification.prerequisiteIds.length ? classification.prerequisiteIds.map(id => concepts.find(concept => concept.id === id)?.name ?? 'Concepto vinculado').join(', ') : 'Sin prerrequisitos vinculados'}</p>{classification.curriculum.length > 0 && <><p>Currículo vinculado al realizar el ejercicio:</p>{classification.curriculum.map(row => <p key={row.id}>{curriculumKinds[row.kind]} · {row.code} · {row.title}</p>)}</>}</details></div>;
}
