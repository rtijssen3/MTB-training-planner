// Friel-inspired scheduling heuristics; percentages are personal maintenance goals,
// not published physiological standards or Friel's prescribed percentages.
export const ABILITIES=[['aerobic','Duurvermogen'],['muscular','Drempelvermogen'],['vo2max','VO₂max'],['anaerobic','Anaeroob vermogen'],['power','Explosiviteit']];
const GOALS={xco:[100,95,100,100,95],road:[100,100,95,85,95],gravel:[100,100,90,80,75]};
export function normalizeDiscipline(d){return d==='xcm'?'gravel':Object.hasOwn(GOALS,d)?d:'xco';}
export function normalizeLimiter(l){return ['auto','none',...ABILITIES.map(a=>a[0])].includes(l)?l:'auto';}
export function disciplineTargets(d){return ABILITIES.map(([skill,label],i)=>({skill,label,target:GOALS[normalizeDiscipline(d)][i]}));}
export function migrateDiscipline(plan){if(!plan)return plan;return {...plan,...(plan.discipline===undefined?{}:{discipline:normalizeDiscipline(plan.discipline)}),...(plan.limiter===undefined?{}:{limiter:normalizeLimiter(plan.limiter)})};}
const R={
 xco:{Base:[['force','threshold'],['threshold','force']],Build:[['vo2max','anaerobic','threshold','power'],['anaerobic','vo2max','power','threshold'],['vo2max','power','anaerobic','threshold'],['threshold','vo2max','anaerobic','power']],Peak:[['vo2max','anaerobic','threshold'],['anaerobic','vo2max','threshold']]},
 road:{Base:[['threshold','force'],['force','threshold']],Build:[['threshold','vo2max','power','anaerobic'],['vo2max','threshold','power','anaerobic'],['threshold','power','vo2max','anaerobic'],['power','threshold','vo2max','anaerobic']],Peak:[['threshold','power','vo2max'],['power','threshold','vo2max']]},
 gravel:{Base:[['threshold','force'],['threshold','force'],['force','threshold']],Build:[['threshold','vo2max','anaerobic','power'],['threshold','vo2max','power','anaerobic'],['vo2max','threshold','anaerobic','power'],['threshold','vo2max','anaerobic','power']],Peak:[['threshold','vo2max'],['threshold','vo2max']]}
};
const TYPE={muscular:'threshold',vo2max:'vo2max',anaerobic:'anaerobic',power:'power'};
export function disciplineQualityOrder(d,phase,limiter='auto',seen=[],weekIndex=0){
 if(phase==='Recovery')return [];
 const choices=R[normalizeDiscipline(d)][phase];if(!choices)throw Error('Onbekende fase');
 const types=[...choices[((Math.max(0,weekIndex)%choices.length)+choices.length)%choices.length]],focus=TYPE[normalizeLimiter(limiter)];
 // No high-intensity introduction during Base, even with manual focus.
 return types.sort((a,b)=>Number(seen.includes(a))-Number(seen.includes(b))||Number(b===focus)-Number(a===focus));
}
export function aerobicFocus(d,phase,limiter){return phase!=='Recovery'&&(normalizeDiscipline(d)==='gravel'||limiter==='aerobic');}
