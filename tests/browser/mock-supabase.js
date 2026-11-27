// Browser tests only. No credentials, no external requests.
const user={id:'synthetic-test-user',email:'test@example.invalid'};
const session={user,access_token:'fake'};
let current=sessionStorage.getItem('fake-login')?session:null;
let handlers=[],revision=0,remote=JSON.parse(sessionStorage.getItem('fake-cloud')||'null');
const weekdays=['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
let weekly=weekdays.map((weekday,i)=>({weekday,available_minutes:[0,90,120,90,0,60,180][i],fixed_workout:i===6?'Groepsrit':null}));
const overrides=new Map(JSON.parse(sessionStorage.getItem('fake-availability-overrides')||'[]'));
const ok=data=>({data,error:null});
export const supabase={
 auth:{
 getSession:async()=>ok({session:current}),getUser:async()=>ok({user:current?.user??null}),
 onAuthStateChange:fn=>{handlers.push(fn);return {data:{subscription:{unsubscribe(){handlers=handlers.filter(x=>x!==fn)}}}}},
 signInWithPassword:async()=>{current=session;sessionStorage.setItem('fake-login','1');handlers.forEach(fn=>fn('SIGNED_IN',current));return ok({user,session});},
 signOut:async()=>{current=null;sessionStorage.removeItem('fake-login');handlers.forEach(fn=>fn('SIGNED_OUT',null));return ok(null);}
 },
 from(table){
  const q={select:()=>q,eq:()=>q,gte:()=>q,lte:()=>q,order:()=>q,maybeSingle:async()=>ok(remote),
    then:(resolve,reject)=>Promise.resolve(ok(table==='weekly_availability'?weekly:table==='availability_overrides'?[...overrides.values()]:[])).then(resolve,reject)};
  return q;
 },
 rpc:async(name,args={})=>{
  if(name==='get_availability_revision')return ok(revision);
  if(name==='freeze_past_availability')return ok(null);
  if(name==='save_calendar_checked'){if(args.p_expected_revision!==revision)return {error:{message:'AVAILABILITY_CONFLICT'}};for(const c of args.p_changes){if(c.action==='delete')overrides.delete(c.date);else overrides.set(c.date,c);}sessionStorage.setItem('fake-availability-overrides',JSON.stringify([...overrides]));return ok({saved_count:args.p_changes.length,revision:++revision});}
  if(name==='save_weekly_checked'){weekly=args.p_rows;return ok(++revision);}
  if(name==='save_training_planner_state'){await new Promise(resolve=>setTimeout(resolve,700));if(args.p_expected_revision!==(remote?.revision??0))return {error:{message:'PLANNER_CONFLICT'}};remote={snapshot:args.p_snapshot,revision:(remote?.revision??0)+1};sessionStorage.setItem('fake-cloud',JSON.stringify(remote));window.__testCloudSnapshot=remote.snapshot;return ok(remote.revision);}
  return {data:null,error:{message:'Unexpected test RPC '+name}};
 },
 functions:{invoke:async(name,{body})=>{
  if(body.action==='list-activities')return ok({provider:'intervals.icu',oldest:body.oldest,newest:body.newest,activities:(window.__testActivities||JSON.parse(sessionStorage.getItem('fake-activities')||'[]')).filter(a=>a.start_date_local.slice(0,10)>=body.oldest&&a.start_date_local.slice(0,10)<=body.newest)});
  if(body.action==='get-activity-details')return ok({activity:(window.__testDetails||{})[body.activityId]||{id:body.activityId}});
  if(body.action==='skill-history')return ok({provider:'intervals.icu',oldest:body.oldest,newest:body.newest,records:window.__testSkillRecords||[]});
  if(body.action==='list-wellness')return ok({provider:'intervals.icu',oldest:body.oldest,newest:body.newest,wellness:(window.__testWellness||[{date:'2026-11-24',ctl:50,atl:50},{date:'2026-11-25',ctl:50,atl:60}]).filter(r=>r.date>=body.oldest&&r.date<=body.newest)});
  if(body.action==='test-connection')return ok({provider:'intervals.icu',connected:true});
  return {data:null,error:{message:'Unexpected test action '+body.action}};
 }}
};
