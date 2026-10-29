import type { LmsItem } from '../shared/lms.js';
export function moodleLearningContext(items:LmsItem[],subjectId:string,query:string):string {
  const words=query.toLocaleLowerCase().split(/\W+/).filter(w=>w.length>3);
  const rows=items.filter(item=>item.active&&item.subjectId===subjectId&&item.data.kind==='activity');
  rows.sort((a,b)=>words.filter(w=>b.data.title.toLocaleLowerCase().includes(w)).length-words.filter(w=>a.data.title.toLocaleLowerCase().includes(w)).length||b.updatedAt.localeCompare(a.updatedAt));
  return JSON.stringify(rows.slice(0,2).map(item=>item.data.kind==='activity'?{title:item.data.title.slice(0,100),url:item.data.url,due:item.data.dueAt,instructions:item.data.instructions.slice(0,240),response:item.data.submission?.text.slice(0,240),feedback:item.data.submissionFeedback?.slice(0,240)}:null));
}
