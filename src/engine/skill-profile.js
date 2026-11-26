import {ABILITIES} from './discipline-policy.js';
export const POWER_DURATIONS=[5,15,30,60,300,1200];
const DAY=86400000,valid=n=>Number.isFinite(n)&&n>0;
const daysAgo=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')-n*DAY).toISOString().slice(0,10);
const median=a=>{const v=[...a].sort((x,y)=>x-y);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;};
const round=n=>Math.round(n*10)/10;
export function buildSkillProfile(records,asOf){
 const from=daysAgo(asOf,89),year=daysAgo(asOf,364);
 const rows=records.filter(r=>typeof r.date==='string'&&r.date>=year&&r.date<=asOf);
 const recent=rows.filter(r=>r.date>=from),prior=rows.filter(r=>r.date<from);
 const missing=(label,reason)=>({score:null,label,reason});
 const best=(seconds)=>{
   const a=recent.filter(r=>valid(r.watts?.[seconds])),b=prior.filter(r=>valid(r.watts?.[seconds]));
   if(!a.length||!b.length)return null;
   const normalized=[...a,...b].every(r=>valid(r.weight)&&r.weight>=25&&r.weight<=250);
   const value=r=>r.watts[seconds]/(normalized?r.weight:1);
   const top=list=>list.reduce((x,y)=>value(y)>value(x)?y:x);
   const current=top(a),historical=top(b),reference=Math.max(value(current),value(historical));
   return {score:Math.min(100,100*value(current)/reference),value:round(value(current)),reference:round(reference),unit:normalized?'W/kg':'W',date:current.date,seconds};
 };
 const make=(label,secs)=>{
   const points=secs.map(best);
   if(points.some(p=>!p))return missing(label,'Onvoldoende recente of historische vermogensgegevens; geen score.');
   return {label,score:Math.round(points.reduce((s,p)=>s+p.score,0)/points.length),points,reason:'Waargenomen beste inspanningen, geen garantie op maximale test.'};
 };
 // Restrict to steady 2–3h endurance rides; exclude short/variable rides and unreliable HR.
 const steady=recent.filter(r=>r.duration>=7200&&r.duration<=10800&&r.powerMeter===true&&valid(r.hr)&&valid(r.ftp)&&valid(r.avgPower)&&valid(r.np)&&r.avgPower/r.ftp>=.55&&r.avgPower/r.ftp<=.75&&r.np/r.avgPower>=.98&&r.np/r.avgPower<=1.1&&Number.isFinite(r.decoupling)&&r.decoupling>=-10&&r.decoupling<=30);
 const drift=median(steady.map(r=>r.decoupling));
 const aerobic=steady.length>=2?{label:'Aerobic decoupling',score:Math.round(100*5/Math.max(5,drift)),value:round(drift),unit:'%',count:steady.length,reason:'Mediaan van vergelijkbare lange Z2-ritten; warmte, voeding en pacing beïnvloeden dit.'}:missing('Aerobic decoupling','Minstens twee geschikte Z2-ritten van 2–3 uur nodig.');
 return {version:1,asOf,from,year,metrics:{aerobic,muscular:make('20-min vermogen (FTP-proxy)',[1200]),vo2max:make('5-min vermogen (MAP-proxy)',[300]),anaerobic:make('30- en 60-s vermogen',[30,60]),power:make('5- en 15-s vermogen',[5,15])},activityCount:rows.length};
}
export function describeMetric(m){
 if(!m||m.score===null)return m?.reason||'Nog niet geanalyseerd.';
 if(m.points)return m.points.map(p=>p.seconds===1200?'20 min':p.seconds===300?'5 min':p.seconds+' s').map((label,i)=>label+': '+m.points[i].value+' '+m.points[i].unit+' (referentie '+m.points[i].reference+')').join(' · ');
 return m.value+'% decoupling · '+m.count+' ritten';
}
