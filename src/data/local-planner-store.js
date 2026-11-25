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
  if(plan?.version===2&&Array.isArray(plan.weeks)&&plan.weeks.length)return plan;
  const next=dateKey(addDays(monday(clock()),7));
  try{return migrateLegacyPlan(read('mtb-periodization-draft:v1:'+user+':'+next,null));}catch{return null;}
 }
 function sessions(start){
  const raw=read(workoutKey(start),null);
  if(!Array.isArray(raw?.sessions))return [];
  const dates=weekDates(start);
  return raw.sessions.filter(s=>validSession(s,dates)).map(s=>({...s,type:s.type==='group'?'endurance':s.type,group:!!s.group||s.type==='group',protocol:s.protocol||'classic'}));
 }
 return {readPlan,sessions,getSession:date=>sessions(weekStartOf(parseDate(date))).find(s=>s.date===date)||null,
 savePlan:plan=>storage.setItem(planKey,JSON.stringify(plan)),
 storeSessions:(start,items)=>storage.setItem(workoutKey(start),JSON.stringify({version:1,start,sessions:items})),
 localAvailability:()=>read(availabilityKey,{}),setLocalAvailability:data=>storage.setItem(availabilityKey,JSON.stringify(data))};
}
