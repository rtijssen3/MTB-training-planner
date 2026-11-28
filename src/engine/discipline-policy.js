// Friel-inspired discipline priorities (1–5); not validated capacity standards.
export const ABILITIES=[['aerobic','Duurvermogen'],['muscular','Drempelvermogen'],['vo2max','VO₂max'],['anaerobic','Anaeroob vermogen'],['power','Explosiviteit']];
const GOALS={xco:[4,4,5,5,4],road:[4,5,4,3,5],gravel:[5,5,3,2,2]};
export function normalizeDiscipline(d){return d==='xcm'?'gravel':Object.hasOwn(GOALS,d)?d:'xco';}
export function normalizeLimiter(l){return ['auto','none',...ABILITIES.map(a=>a[0])].includes(l)?l:'auto';}
export function disciplineTargets(d){return ABILITIES.map(([skill,label],i)=>({skill,label,target:GOALS[normalizeDiscipline(d)][i]}));}
export function migrateDiscipline(plan){if(!plan)return plan;return {...plan,...(plan.discipline===undefined?{}:{discipline:normalizeDiscipline(plan.discipline)}),...(plan.limiter===undefined?{}:{limiter:normalizeLimiter(plan.limiter)})};}
const R={
 xco:{Base:[['force','threshold'],['threshold','force']],Build:[['vo2max','anaerobic','threshold','power'],['anaerobic','vo2max','power','threshold'],['vo2max','power','anaerobic','threshold'],['power','vo2max','anaerobic','threshold'],['anaerobic','threshold','vo2max','power'],['threshold','vo2max','anaerobic','power']],Peak:[['vo2max','anaerobic','threshold'],['anaerobic','vo2max','threshold']]},
 road:{Base:[['threshold','force'],['force','threshold']],Build:[['threshold','vo2max','power','anaerobic'],['vo2max','threshold','power','anaerobic'],['threshold','power','vo2max','anaerobic'],['power','threshold','vo2max','anaerobic']],Peak:[['threshold','power','vo2max'],['power','threshold','vo2max']]},
 gravel:{Base:[['threshold','force'],['threshold','force'],['force','threshold']],Build:[['threshold','vo2max','anaerobic','power'],['threshold','vo2max','power','anaerobic'],['vo2max','threshold','anaerobic','power'],['threshold','vo2max','anaerobic','power']],Peak:[['threshold','vo2max'],['threshold','vo2max']]}
};
const TYPE={muscular:'threshold',vo2max:'vo2max',anaerobic:'anaerobic',power:'power'};
export function disciplineQualityOrder(d,phase,limiter='auto',seen=[],weekIndex=0){
 if(phase==='Recovery')return [];
 const choices=R[normalizeDiscipline(d)][phase];if(!choices)throw Error('Onbekende fase');
 const types=[...choices[((Math.max(0,weekIndex)%choices.length)+choices.length)%choices.length]],focus=TYPE[normalizeLimiter(limiter)];
 // Maintain selected intensity throughout Base; later Base emphasizes VO2 and threshold.
 if(phase==='Base'){const order=normalizeDiscipline(d)==='xco'?(weekIndex===0?['force','vo2max','threshold']:['vo2max','threshold','force']):['threshold','vo2max','force'];return order.sort((a,b)=>Number(seen.includes(a))-Number(seen.includes(b))||Number(b===focus)-Number(a===focus));}
 return types.sort((a,b)=>Number(seen.includes(a))-Number(seen.includes(b))||Number(b===focus)-Number(a===focus));
}
export function aerobicFocus(d,phase,limiter){return phase!=='Recovery'&&(normalizeDiscipline(d)==='gravel'||limiter==='aerobic');}

 // Relative phase position excludes recovery weeks. A one-week phase uses its early emphasis.
export function phasePosition(weeks,week){
 const peers=weeks.filter(w=>w.phase===week.phase).sort((a,b)=>a.start.localeCompare(b.start));
 const index=peers.findIndex(w=>w.start===week.start);
 return index<0||peers.length<2?0:index/(peers.length-1);
}
export function phaseAbilityTargets(d,phase,position=0){
 const late=position>=.5;
 const scores=phase==='Base'?(late?[5,4,3,2,2]:[5,2,1,1,2]):phase==='Build'?(late?[4,4,5,5,4]:[4,5,5,3,3]):phase==='Peak'?[3,3,4,4,3]:[3,0,0,0,0];
 const goals=disciplineTargets(d);
 return goals.map((g,i)=>({...g,target:scores[i]===0?0:Math.max(1,Math.min(5,scores[i]+(normalizeDiscipline(d)==='xco'?0:Math.sign(g.target-GOALS.xco[i]))))}));
}
export function phaseQualityOrder(d,phase,limiter='auto',seen=[],position=0,index=0){
 if(phase==='Recovery')return [];
 const discipline=normalizeDiscipline(d),late=position>=.5;
 const order=discipline==='xco'?(phase==='Base'?(late?['vo2max','threshold','force']:['force','vo2max','threshold']):phase==='Build'?(late?['vo2max','anaerobic','power','threshold']:['vo2max','threshold','anaerobic','power']):['vo2max','anaerobic','threshold']):disciplineQualityOrder(d,phase,'none',[],index);
 const focus=TYPE[normalizeLimiter(limiter)];
 return [...order].sort((a,b)=>Number(seen.includes(a))-Number(seen.includes(b))||Number(b===focus)-Number(a===focus));
}
