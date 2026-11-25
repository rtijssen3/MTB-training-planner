export function canonical(x){return JSON.stringify(x, function(k,v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v;});}

export function validateSnapshot(s){
 if(!s||s.version!==1||!s.weeks||typeof s.weeks!=='object'||Array.isArray(s.weeks))throw Error('Ongeldige planneropslag.');
 if(s.plan!==null&&(!s.plan||s.plan.version!==2||!Array.isArray(s.plan.weeks)||!s.plan.weeks.length))throw Error('Ongeldig trainingsplan.');
 for(const [start,week] of Object.entries(s.weeks)){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||week?.version!==1||week.start!==start||!Array.isArray(week.sessions))throw Error('Ongeldige workoutweek.');
   const first=new Date(start+'T00:00:00Z');if(!Number.isFinite(+first)||first.toISOString().slice(0,10)!==start||first.getUTCDay()!==1)throw Error('Ongeldige weekstart.');
   const end=new Date(+first+6*86400000).toISOString().slice(0,10),seen=new Set();
   for(const a of week.sessions){if(!a||a.date<start||a.date>end||!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||seen.has(a.date)||!['endurance','threshold','vo2max','force','skills','anaerobic','power','group'].includes(a.type)||!Number.isInteger(a.durationMinutes)||a.durationMinutes<15||a.durationMinutes>360)throw Error('Ongeldige workout.');seen.add(a.date);}
 }
 return s;
}

export function readSnapshot(storage,user){
 const prefix='mtb-workout-draft:v1:'+user+':',planKey='mtb-mesocycle:v2:'+user,weeks={};
 for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(prefix)){const start=k.slice(prefix.length);weeks[start]=JSON.parse(storage.getItem(k));}}
 return validateSnapshot({version:1,plan:JSON.parse(storage.getItem(planKey)||'null'),weeks});
}

export function installSnapshot(storage,user,snapshot){
 validateSnapshot(snapshot);const backup=readSnapshot(storage,user),prefix='mtb-workout-draft:v1:'+user+':',planKey='mtb-mesocycle:v2:'+user;
 // Save full backup before removing or replacing any local data.
 storage.setItem('mtb-cloud-backup:v1:'+user,JSON.stringify(backup));
 if(snapshot.plan)storage.setItem(planKey,JSON.stringify(snapshot.plan));else storage.removeItem(planKey);
 for(const [k,v] of Object.entries(snapshot.weeks))storage.setItem(prefix+k,JSON.stringify(v));
 for(const k of Object.keys(backup.weeks))if(!Object.hasOwn(snapshot.weeks,k))storage.removeItem(prefix+k);
}

export function syncDecision(local,remote,baseline){
 validateSnapshot(local);if(remote)validateSnapshot(remote.snapshot);
 const same=(a,b)=>canonical(a)===canonical(b),empty=s=>s.plan===null&&Object.keys(s.weeks).length===0;
 if(!remote)return empty(local)?'nothing':'upload';
 if(same(local,remote.snapshot))return 'same';
 if(!baseline)return empty(local)?'download':'conflict';
 const localChanged=!same(local,baseline),remoteChanged=!same(remote.snapshot,baseline);
 if(localChanged&&remoteChanged)return 'conflict';
 return localChanged?'upload':'download';
}
