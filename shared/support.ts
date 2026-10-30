export interface MoodleLinkProposal { taskId:string; taskVersion:string; itemId:string; revision:number; unitId:string|null; conceptIds:string[]; curriculumIds:string[]; quote:string; reason:string; }
export interface ScheduleProposal {unitId:string;unitVersion:string;startsOn:string;endsOn:string;weeks:number;quote:string;estimated:boolean;}
export interface SupportDraft {id:string;subjectId:string;links:MoodleLinkProposal[];schedule:ScheduleProposal[];warnings:string[];}
export interface StudyExercise {kind:'recall'|'application'|'reasoning';title:string;statement:string;hints:string[];checkpoints:string[];quote:string;}
export interface StudyPack {id:string;subjectId:string;itemId:string;revision:number;sourceTitle:string;exercises:StudyExercise[];}
export interface AnswerReview {observations:{quote:string;comment:string}[];nextStep:string;}
export interface SupportAPI {
  prepareSubjectSupport(input:{subjectId:string;startDate:string}):Promise<SupportDraft>;
  commitSubjectSupport(input:{draftId:string;links:MoodleLinkProposal[];schedule:ScheduleProposal[];createStudyTasks:boolean}):Promise<void>;
  discardSubjectSupport(id:string):Promise<void>;
  prepareStudyPack(itemId:string):Promise<StudyPack>;
  reviewStudyAnswer(input:{packId:string;exercise:number;answer:string}):Promise<AnswerReview>;
  saveStudyAnswer(input:{packId:string;exercise:number;answer:string;reflection:string;hints:number}):Promise<void>;
}
