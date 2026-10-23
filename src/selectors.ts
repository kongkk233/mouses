import type { AppState, Mouse, Reminder } from '../shared/types';
export const cageMembers=(s:AppState,id:string)=>s.mice.filter(m=>m.cageId===id&&m.status==='active');
export const currentOccurrence=(s:AppState,id:string)=>s.occurrences.find(o=>o.cageId===id&&['pending','paused'].includes(o.status));
export function mouseTags(s:AppState,m:Mouse):{label:string;tone:string}[]{
 const tags:{label:string;tone:string}[]=[];
 const breeding=s.breedings.find(b=>b.motherId===m.id&&b.status!=='ended');
 if(breeding)tags.push({label:{paired:'配种中',observing:'待确认',confirmed:'妊娠已确认',ended:''}[breeding.status],tone:breeding.status==='confirmed'?'gold':'pink'});
 if(s.litters.some(l=>l.nursing&&(l.fosterMotherId||l.motherId)===m.id))tags.push({label:'哺乳中',tone:'sage'});
 if(m.weaningStatus==='unweaned')tags.push({label:'幼鼠',tone:'lilac'});
 if(m.breedingStopped)tags.push({label:'停止繁殖',tone:'muted'});
 if(m.status!=='active')tags.push({label:{transferred:'已转出',deceased:'已死亡',retired:'已结束实验',active:''}[m.status],tone:'muted'});
 return tags;
}
export function actionable(s:AppState,r:Reminder,includeSnoozed=false):boolean{
 if(r.status!=='pending'||r.dueOn>s.today||(!includeSnoozed&&r.snoozedUntil&&r.snoozedUntil>new Date().toISOString()))return false;
 if(r.kind==='care') {const t=s.careTasks.find(t=>t.id===r.subjectId);if(t?.dueOn!==s.today&&!['weight','observation'].includes(t?.kind||''))return false;}
 return true;
}
export function mouseMatches(s:AppState,m:Mouse,q:string){
 const c=s.cages.find(c=>c.id===m.cageId);return [m.code,...m.aliases,m.nickname,m.genotype,m.strain,c?.code,c?.nickname].some(v=>v?.toLowerCase().includes(q.toLowerCase()));
}
export function eventsFor(s:AppState,id:string){return s.events.filter(e=>e.mouseIds.includes(id)||e.cageIds.includes(id)||e.litterId===id||e.breedingId===id).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));}
