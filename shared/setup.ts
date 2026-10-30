import type { CurriculumKind } from './education.js';
export type AIProvider = 'local' | 'codex' | 'claude';
export interface LearningSetup {
  schoolYear?: import('./student.js').SchoolYear; acceleration?: 'auto'|'cpu';
  onboardingCompleted?: boolean; aiProvider?: AIProvider; cloudConsent?: boolean; localModelId?: string;
  codexExecutable?: string; claudeExecutable?: string;
}
export interface HardwareInfo { ramGB: number; availableGB: number; cpu: string; cores: number; graphics: string[]; graphicsMemoryGB: number | null; acceleration: string; }
export interface ModelChoice { id: string; name: string; bytes: number; vision?: boolean; minRamGB: number; description: string; recommended: boolean; installed: boolean; }
export interface AIConfiguration { hardware: HardwareInfo; models: ModelChoice[]; selected: string; provider: AIProvider; }
export interface ProgrammeRow { kind: 'unit' | CurriculumKind; code: string; title: string; description: string; page: number; quote: string; }
export interface ProgrammeDraft { id: string; subjectId: string; filename: string; rows: ProgrammeRow[]; pages?: { page: number; image: {mime:string;base64:string}; text:string }[]; warnings: string[]; }
export interface SetupAPI {
  aiConfiguration(): Promise<AIConfiguration>;
  configureAI(input: { provider: AIProvider; modelId: string; cloudConsent: boolean; acceleration?:'auto'|'cpu' }): Promise<void>;
  chooseAIExecutable(provider: 'codex' | 'claude'): Promise<boolean>;
  loginAI(provider: 'codex' | 'claude'): Promise<string>;
  logoutAI(provider: 'codex' | 'claude'): Promise<void>;
  aiAccountStatus(provider: 'codex' | 'claude'): Promise<string>;
  prepareProgramme(subjectId: string): Promise<ProgrammeDraft | null>;
  commitProgramme(input: { draftId: string; rows: ProgrammeRow[] }): Promise<void>;
  discardProgramme(draftId: string): Promise<void>;
}
