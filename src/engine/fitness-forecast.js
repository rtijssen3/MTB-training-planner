// Fitness/fatigue are modeled loads, not physiological measurements or safety thresholds.
// Default Intervals.icu time constants; the current API adapter does not expose athlete-specific constants.
// Use yesterday's end-of-day wellness to avoid counting today's load twice or anchoring to future plans.
export const DEFAULT_LOAD_MODEL=Object.freeze({ctlDays:42,atlDays:7,caution:-20,reduced:-30,recovery:-35,reducedMax:30,recoveryMax:15});
const dayMs=86400000;
const utc=d=>{const n=Date.parse(d+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==d)throw Error('Ongeldige prognosedatum.');return n;};
const shift=(d,n)=>new Date(utc(d)+n*dayMs).toISOString().slice(0,10);
const good=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function selectFitnessAnchor(rows,today){
 const yesterday=shift(today,-1);
 const row=Array.isArray(rows)?rows.find(r=>r.date===yesterday&&good(r.ctl)&&good(r.atl)):null;
 return row?{date:yesterday,ctl:row.ctl,atl:row.atl,tsb:row.ctl-row.atl}:null;
}
export function stepFitness(state,load,settings=DEFAULT_LOAD_MODEL){
 if(!good(state?.ctl)||!good(state?.atl)||!good(load)||!Number.isFinite(settings.ctlDays)||settings.ctlDays<=0||!Number.isFinite(settings.atlDays)||settings.atlDays<=0)throw Error('Onbekende belasting of fitnessgegevens.');
 const ctl=state.ctl+(load-state.ctl)*(-Math.expm1(-1/settings.ctlDays));
 const atl=state.atl+(load-state.atl)*(-Math.expm1(-1/settings.atlDays));
 return {ctl,atl,tsb:ctl-atl};
}
export function actualLoads(records,today){
 const rows=records.filter(r=>r.date===today),total=rows.reduce((n,r)=>n+(good(r.trainingLoad)?r.trainingLoad:0),0);
 return rows.some(r=>!good(r.trainingLoad))?null:new Map(rows.length?[[today,total]]:[]);
}
// Explicit actual day replaces rather than supplements the planned session on the same day.
// An absent plan on future dates means rest in this scenario, not proof of actual rest.
export function forecastFitness({anchor,end,actual=new Map(),planned=[],settings=DEFAULT_LOAD_MODEL}){
 if(!anchor||!good(anchor.ctl)||!good(anchor.atl)||!actual)return null;
 const days=(utc(end)-utc(anchor.date))/dayMs;
 if(days<0||days>56)return null;
 const byDate=new Map();
 for(const s of planned){if(s.date<=anchor.date||s.date>end||actual.has(s.date))continue;if(!good(s.load))return null;byDate.set(s.date,(byDate.get(s.date)||0)+s.load);}
 let state={ctl:anchor.ctl,atl:anchor.atl,tsb:anchor.ctl-anchor.atl};
 const result=[{date:anchor.date,...state,load:null,actual:true}];
 for(let i=1;i<=days;i++){const date=shift(anchor.date,i),load=actual.has(date)?actual.get(date):byDate.get(date)||0;if(!good(load))return null;state=stepFitness(state,load,settings);result.push({date,...state,load,actual:actual.has(date)});}
 return result;
}
// Candidate evaluates the entire remaining week, including protected group/manual
// sessions, and the first week is carried into the next. Never remove protected
// sessions. If a protected session itself causes low Form, show that warning;
// an additional automatic session must not worsen a day below -30.
export function fitnessCandidateAllowed({anchor,actual,prior=[],existing=[],candidate,end,settings=DEFAULT_LOAD_MODEL}){
 if(!anchor||!actual)return true;
 const before=forecastFitness({anchor,actual,end,planned:[...prior,...existing],settings});
 const after=forecastFitness({anchor,actual,end,planned:[...prior,...existing.filter(s=>s.date!==candidate.date),candidate],settings});
 if(!before||!after)return true; // missing metrics: normal mesocycle/phase rules, no invented numbers
 const i=after.findIndex(r=>r.date===candidate.date);
 if(i<1)return true;
 const pre=after[i-1].tsb,post=after[i].tsb,load=candidate.load;
 if(actual.has(candidate.date))return false;
 if(candidate.quality&&(pre<settings.caution||post<settings.reduced))return false;
 if(pre<settings.recovery&&(candidate.quality||!candidate.recovery||load>settings.recoveryMax))return false;
 if((pre<settings.reduced||post<settings.reduced)&&(candidate.quality||load>settings.reducedMax))return false;
 for(let j=i;j<after.length;j++)if(after[j].tsb<settings.recovery&&after[j].tsb<before[j].tsb-.01)return false;
 return true;
}
