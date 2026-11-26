import {migrateDiscipline} from '../engine/discipline-policy.js';
import {addDays,dateKey,monday,migrateLegacyPlan,parseDate,weekStartOf,weekDates,validSession} from '../../planner-model.js';
// Keep historical browser keys unchanged so existing plans survive the release.
export function createLocalPlannerStore(storage,user,clock=()=>new Date()){
 if(!user)throw Error('Niet ingelogd.');
 const planKey='mtb-mesocycle:v2:'+user;
 const workoutKey=start=>'mtb-workout-draft:v1:'+user+':'+start;
 const availabilityKey='mtb-availability-local:v1:'+user;
 function read(key,fallback){try{return JSON.parse(storage.getItem(key)??'null')??fallback;}catch{return fallback;}}
 function readPlan(){
  const plan=read(planKey,null);
  if(plan?.version===2&&Array.isArray(plan.weeks)&&plan.weeks.length)return migrateDiscipline(plan);
  const next=dateKey(addDays(monday(clock()),7));
  try{return migrateDiscipline(migrateLegacyPlan(read('mtb-periodization-draft:v1:'+user+':'+next,null)));}catch{return null;}
 }
 function manualRestDates(start){const dates=weekDates(start),raw=read(workoutKey(start),null);return Array.isArray(raw?.manualRestDates)?[...new Set(raw.manualRestDates.filter(d=>dates.includes(d)))]:[];}
 function sessions(start){
  const raw=read(workoutKey(start),null);
  if(!Array.isArray(raw?.sessions))return [];
  const dates=weekDates(start);
  return raw.sessions.filter(s=>validSession(s,dates)).map(s=>({...s,type:s.type==='group'?'endurance':s.type,group:!!s.group||s.type==='group',protocol:s.protocol||'classic'}));
 }
 return {readPlan,sessions,manualRestDates,getSession:date=>sessions(weekStartOf(parseDate(date))).find(s=>s.date===date)||null,
 savePlan:plan=>storage.setItem(planKey,JSON.stringify(plan)),
 storeSessions:(start,items,{restDates=manualRestDates(start)}={})=>{const days=weekDates(start),dates=[...new Set(restDates)].filter(d=>days.includes(d)&&!items.some(s=>s.date===d));storage.setItem(workoutKey(start),JSON.stringify({version:1,start,sessions:items,...(dates.length?{manualRestDates:dates}:{})}));},
 localAvailability:()=>read(availabilityKey,{}),setLocalAvailability:data=>storage.setItem(availabilityKey,JSON.stringify(data))};
}
