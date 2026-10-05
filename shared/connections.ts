export type RelationKind = 'equivalent' | 'prerequisite' | 'related';
export interface ConceptRelation { id:string; subjectId:string; fromId:string; toId:string; kind:RelationKind; reason:string; createdAt:string; }
export interface RelationReview { id:string; subjectId:string; relationId:string; decision:'accepted'|'rejected'|'forgotten'; reason:string; supersedesId:string|null; createdAt:string; }
export interface RelationSuggestion { fromId:string; toId:string; reason:string; }
export interface TransferSuggestion { relationId:string; fromId:string; toId:string; reason:string; evidenceIds:string[]; }
export interface GraphNode { id:string; kind:'subject'|'concept'|'competency'|'evidence'; refId:string; subjectId:string; label:string; evidenceKind?:'attempt'|'submission'|'project-work'|'portfolio'; }
export interface GraphEdge { id:string; from:string; to:string; kind:'belongs'|'prerequisite'|'equivalent'|'related'|'competency'|'evidence'; relationId:string|null; }
export interface LearningGraph { nodes:GraphNode[]; edges:GraphEdge[]; }
export interface ProjectActivity { id:string; title:string; instructions:string; subjectIds:string[]; conceptIds:string[]; curriculumIds:string[]; dueOn:string|null; minutes:number; }
export interface InterdisciplinaryProject { id:string; subjectId:string; subjectIds:string[]; title:string; goal:string; description:string; conceptIds:string[]; curriculumIds:string[]; activities:ProjectActivity[]; revision:number; createdAt:string; updatedAt:string; }
export type ProjectInput = Pick<InterdisciplinaryProject,'subjectIds'|'title'|'goal'|'description'|'conceptIds'|'curriculumIds'|'activities'>;
export type ProjectVersion = Omit<InterdisciplinaryProject,'id'> & {id:string;projectId:string};
export type ProjectSource = {kind:'attempt'|'submission'|'portfolio';id:string|null;hash:string};
export interface ProjectWork { id:string; subjectId:string; projectId:string; projectRevision:number; activityId:string; source:ProjectSource; evidenceKey:string; statement:string; text:string; conceptIds:string[]; reflection:string; originalCreatedAt:string; createdAt:string; }
export interface ProjectActivityReview { id:string; subjectId:string; projectId:string; projectRevision:number; activityId:string; completed:boolean; workIds:string[]; reflection:string; supersedesId:string|null; createdAt:string; }
export interface ProjectSuggestion { relationId:string; input:ProjectInput; reason:string; }
export interface ConnectionSnapshot { conceptRelations:ConceptRelation[]; relationReviews:RelationReview[]; relationSuggestions:RelationSuggestion[]; transfers:TransferSuggestion[]; learningGraph:LearningGraph; interdisciplinaryProjects:InterdisciplinaryProject[]; projectVersions:ProjectVersion[]; projectWorks:ProjectWork[]; projectActivityReviews:ProjectActivityReview[]; projectSuggestions:ProjectSuggestion[]; }
export interface ConnectionAPI {
  createConceptRelation(input:Pick<ConceptRelation,'fromId'|'toId'|'kind'|'reason'>):Promise<ConceptRelation>;
  reviewConceptRelation(input:{id:string;decision:RelationReview['decision'];reason:string}):Promise<RelationReview>;
  deleteConceptRelation(id:string):Promise<void>;
  saveInterdisciplinaryProject(input:ProjectInput&{id?:string}):Promise<InterdisciplinaryProject>;
  deleteInterdisciplinaryProject(id:string):Promise<void>;
  addProjectWork(input:{projectId:string;activityId:string;source:{kind:ProjectSource['kind'];id:string};conceptIds:string[];reflection:string}):Promise<ProjectWork>;
  reviewProjectActivity(input:{projectId:string;activityId:string;completed:boolean;workIds:string[];reflection:string}):Promise<ProjectActivityReview>;
}
