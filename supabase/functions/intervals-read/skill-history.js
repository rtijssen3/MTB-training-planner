// Pure allowlist: never return raw activities, streams, GPS or notes.
export const DURATIONS=[5,15,30,60,300,1200];
const SPORTS=new Set(['Ride','MountainBikeRide','GravelRide','VirtualRide']);
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function skillHistoryRecords(activities,curveSet,oldest,newest){
 if(!Array.isArray(activities)||!curveSet||!Array.isArray(curveSet.secs)||!Array.isArray(curveSet.curves))throw Error('Onverwacht vermogenscurve-antwoord.');
 if(activities.length>6000||curveSet.curves.length>6000)throw Error('Te veel activiteiten in referentieperiode.');
 const indices=DURATIONS.map(s=>curveSet.secs.indexOf(s));
 if(indices.some(i=>i<0)&&curveSet.curves.length)throw Error('Gevraagde vermogensduur ontbreekt.');
 const curves=new Map(curveSet.curves.filter(c=>c&&typeof c==='object').map(c=>[String(c.id),c]));
 return activities.filter(a=>a&&SPORTS.has(a.type)&&typeof a.start_date_local==='string'&&a.start_date_local.slice(0,10)>=oldest&&a.start_date_local.slice(0,10)<=newest).map(a=>{
  const c=curves.get(String(a.id)),watts={};
  if(a.power_meter===true&&Array.isArray(c?.watts))for(let i=0;i<DURATIONS.length;i++){const p=num(c.watts[indices[i]]);if(p>0)watts[DURATIONS[i]]=p;}
  return {date:a.start_date_local.slice(0,10),powerMeter:a.power_meter===true,weight:num(c?.weight)??num(a.icu_weight),watts,duration:num(a.moving_time),ftp:num(a.icu_ftp),avgPower:num(a.icu_average_watts),np:num(a.icu_weighted_avg_watts),hr:num(a.average_heartrate),decoupling:num(a.decoupling)};
 });
}
