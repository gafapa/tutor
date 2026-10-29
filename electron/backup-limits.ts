export const MAX_BACKUP_FILE_BYTES = 75 * 1024 * 1024;
// Portable header, salt, vault magic, nonce and authentication tag.
export const ENCRYPTED_BACKUP_OVERHEAD = 13 + 16 + 7 + 12 + 16;
export const MAX_BACKUP_JSON_BYTES = MAX_BACKUP_FILE_BYTES - ENCRYPTED_BACKUP_OVERHEAD;

export const BACKUP_TABLE_LIMITS = {
  subjects: 200, concepts: 10000, materials: 2000, attempts: 100000,
  messages: 100000, events: 200000, settings: 1, diagnostics: 10000, tasks: 10000,
  curriculum: 10000, units: 10000, flashcards: 10000, card_revisions: 100000,
  card_reviews: 200000, portfolio: 10000, study_sessions: 10000, mock_exams: 10000,
  rubrics: 10000, rubric_versions: 100000, rubric_submissions: 100000, rubric_reviews: 200000,
  lms_connections: 200, lms_items: 50000, lms_versions: 200000, lms_runs: 100000,
  learning_analyses: 100000, observation_reviews: 200000, interventions: 100000,
  intervention_responses: 300000, intervention_reviews: 200000, concept_relations: 10000,
  relation_reviews: 100000, interdisciplinary_projects: 2000, project_versions: 20000,
  project_works: 100000, project_activity_reviews: 100000, learning_reports: 20000,
  report_preferences: 200, personal_goals: 10000, goal_reviews: 100000, alert_reviews: 100000,
  captures: 200, capture_reviews: 2000
} as const;

export function assertBackupFileSize(bytes: number) {
  if (bytes > MAX_BACKUP_FILE_BYTES) throw new Error('La copia supera el límite de 75 MB. No se ha cambiado el historial.');
}

export function assertBackupJsonSize(json: string) {
  assertBackupFileSize(Buffer.byteLength(json, 'utf8') + ENCRYPTED_BACKUP_OVERHEAD);
}
