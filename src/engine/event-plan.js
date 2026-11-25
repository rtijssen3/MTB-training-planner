// Friel-inspired event planning. Priorities are coaching heuristics, not measured abilities.
export const disciplines = Object.freeze({
  xco: ['vo2max','threshold'], xcm: ['threshold','vo2max'],
  road: ['vo2max','threshold'], gravel: ['threshold','vo2max']
});
export function raceWeekCount(start,race) {
  const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Ongeldige datum.');const d=new Date(s+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw Error('Ongeldige datum.');return d;};
  const a=parse(start),b=parse(race);
  if(a.getUTCDay()!==1)throw Error('Startdatum moet maandag zijn.');
  const n=Math.floor((b-a)/604800000)+1;
  if(n<8||n>24)throw Error('Kies een wedstrijddatum in week 8–24.');
  return n;
}
export function raceAdjustedWeeks(weeks,race) {
  if(!race)return weeks;
  const count=raceWeekCount(weeks[0].start,race);
  if(count!==weeks.length)throw Error('Aantal weken komt niet overeen met wedstrijddatum.');
  const last=weeks.at(-1), prior=weeks.at(-2);
  return weeks.map((w,i)=>i===weeks.length-1?{...w,phase:'Peak',basePhase:'Peak',targetLoad:Math.max(1,Math.round(Math.min(last.targetLoad,prior.targetLoad)*.55)),raceDate:race}:w);
}
export function eventQualityTypes(discipline,phase,observed) {
  if(phase!=='Build'||!disciplines[discipline])return observed;
  return observed?.length?observed:[...disciplines[discipline]];
}
