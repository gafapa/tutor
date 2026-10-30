export const SCHOOL_YEARS = {eso1:'1.º ESO',eso2:'2.º ESO',eso3:'3.º ESO',eso4:'4.º ESO',bach1:'1.º Bachillerato',bach2:'2.º Bachillerato'} as const;
export type SchoolYear=keyof typeof SCHOOL_YEARS;
export function studentGuidance(year?:SchoolYear){
  if(year==='eso1'||year==='eso2')return 'Use short sentences, define new vocabulary, give one instruction at a time and use everyday examples. Respect the student; never use baby talk.';
  if(year==='bach1'||year==='bach2')return 'Use appropriate academic vocabulary, explicit reasoning and exam-level depth. Encourage independent justification and compare alternative approaches.';
  return 'Use clear Spanish, explain technical words when introduced and adapt to the student response. Encourage an attempt before hints.';
}
