export function formatIntensityMinutes(value){
 return Number.isFinite(value)?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:1}).format(value):'—';
}

export function summarizePlannedLoads(loads,target=null){
 const known=loads.filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
 const total=Math.round(known.reduce((s,v)=>s+v,0));
 const missing=loads.length-known.length;
 const delta=typeof target==='number'&&Number.isFinite(target)?Math.round(target-total):null;
 return {total,missing,delta,knownCount:known.length};
}

export function manualWorkoutValidation({durationMinutes,capacity,type}){
 if(type==='rest')return {valid:true,overCapacity:false};
 if(!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>360||durationMinutes%15!==0)return {valid:false,overCapacity:false};
 return {valid:true,overCapacity:typeof capacity==='number'&&Number.isFinite(capacity)&&durationMinutes>capacity};
}
