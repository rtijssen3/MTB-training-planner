// Les 39 – pure kalender- en periodiseringsfuncties.
// Dit module schrijft niet naar Supabase of localStorage.
export const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
export const PHASES = { Base: 'Base', Build: 'Build', Peak: 'Peak', Recovery: 'Recovery' };

export function dateKey(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Ongeldige datum.');
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function parseDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Gebruik YYYY-MM-DD.');
  const [y,m,d] = key.split('-').map(Number);
  const result = new Date(y, m-1, d, 12);
  if (dateKey(result) !== key) throw new Error('Ongeldige kalenderdatum.');
  return result;
}
export function addDays(date, days) {
  const result = new Date(date.getFullYear(),date.getMonth(),date.getDate(),12);
  result.setDate(result.getDate()+days);
  return result;
}
export function monday(date) {
  const offset = (date.getDay()+6)%7;
  return addDays(date,-offset);
}
export function weekDates(start) {
  const startDate = parseDate(start);
  if (startDate.getDay() !== 1) throw new Error('Weekstart moet maandag zijn.');
  return Array.from({length:7},(_,i)=>dateKey(addDays(startDate,i)));
}
export function weekStartOf(date) { return dateKey(monday(date)); }
export function weekNumber(start) {
  const d = parseDate(start);
  const utc = new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  utc.setUTCDate(utc.getUTCDate()+4-(utc.getUTCDay()||7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(),0,1));
  return Math.ceil((((utc-yearStart)/86400000)+1)/7);
}
export function monthWeeks(year, month) {
  const first = monday(new Date(year,month,1,12));
  const last = new Date(year,month+1,0,12);
  const rows=[];
  for (let day=first; day<=last || rows.length<4; day=addDays(day,7)) {
    const start=dateKey(day);
    rows.push({start,end:dateKey(addDays(day,6)),days:weekDates(start),number:weekNumber(start)});
    if(rows.length>6)throw new Error('Te veel kalenderweken.');
  }
  return rows;
}
export function intervalChunks(start,end,maxDays=28) {
  const chunks=[];
  let current=parseDate(start);
  const last=parseDate(end);
  if(current>last)throw new Error('Ongeldige datumrange.');
  while(current<=last) {
    const chunkEnd=addDays(current,maxDays-1);
    const bounded=chunkEnd>last?last:chunkEnd;
    chunks.push({oldest:dateKey(current),newest:dateKey(bounded)});
    current=addDays(bounded,1);
  }
  return chunks;
}
function whole(value,min,max,label) {
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label}: kies ${min}–${max}.`);
  return n;
}
export function createMesocycle({name,start,weeks,baseLoad,progression=5,recoveryReduction=30,recoveryEvery=4,plateau=65,raceDate=''}) {
  const first=parseDate(start);
  if(first.getDay()!==1)throw new Error('Startdatum moet een maandag zijn.');
  const count=whole(weeks,4,26,'Aantal weken');
  const base=whole(baseLoad,1,3000,'Basisbelasting');
  const growth=Number(progression), reduction=Number(recoveryReduction), plateauValue=Number(plateau);
  if(!Number.isFinite(growth)||growth<0||growth>12)throw new Error('Opbouw moet tussen 0 en 12% liggen.');
  if(!Number.isFinite(reduction)||reduction<10||reduction>65)throw new Error('Herstelreductie moet tussen 10 en 65% liggen.');
  if(!Number.isFinite(plateauValue)||plateauValue<30||plateauValue>100)throw new Error('Plateau moet tussen 30 en 100% liggen.');
  const recoveryN=whole(recoveryEvery,3,6,'Herstelinterval');
  const race=raceDate?dateKey(parseDate(raceDate)):'';
  const weeksOut=[];
  const baseEnd=Math.max(1,Math.round(count*.4));
  const peakStart=count-Math.max(1,Math.round(count*.15));
  let stimulus=0;
  for(let i=0;i<count;i++) {
    const startDate=addDays(first,i*7);
    const basePhase=i<baseEnd?'Base':i<peakStart?'Build':'Peak';
    const recovery=(i+1)%recoveryN===0 && i!==count-1;
    const phase=recovery?'Recovery':basePhase;
    const weekIndex=Math.floor(i/recoveryN);
    const buildIndex=i%recoveryN;
    const plateauWeek=Math.ceil(count*plateauValue/100);
    let load=base*(1+growth/100*weekIndex)*(1+growth/100*buildIndex);
    if(i>=plateauWeek) load=Math.min(load,base*(1+growth/100*plateauWeek));
    if(recovery) load*=1-reduction/100;
    if(basePhase==='Peak'&&!recovery)load*=.88;
    weeksOut.push({week:i+1,start:dateKey(startDate),end:dateKey(addDays(startDate,6)),phase,basePhase,targetLoad:Math.max(1,Math.round(load))});
    stimulus+=load;
  }
  return {version:2,name:String(name||'Mijn trainingsplan').slice(0,80),sport:'Ride',start,dateEnd:weeksOut.at(-1).end,
    raceDate:race,baseLoad:base,progression:growth,recoveryReduction:reduction,recoveryEvery:recoveryN,plateau:plateauValue,weeks:weeksOut};
}
export function migrateLegacyPlan(legacy) {
  if(!legacy?.weeks?.length)return null;
  const weeks=legacy.weeks.map((w,i)=>({week:i+1,start:w.start,end:w.end,
    phase:w.phase==='Herstel'?'Recovery':'Base',basePhase:'Base',targetLoad:w.targetLoad}));
  return {version:2,name:'Mijn trainingsblok',sport:'Ride',start:weeks[0].start,dateEnd:weeks.at(-1).end,
    raceDate:'',baseLoad:weeks[0].targetLoad,progression:0,recoveryReduction:30,recoveryEvery:4,plateau:65,weeks};
}
export function weekFor(plan,start) {return plan?.weeks?.find(w=>w.start===start)??null;}
export function validSession(session,dates) {
  if(!session||!dates.includes(session.date))return false;
  return ['endurance','threshold','vo2max','group'].includes(session.type)&&Number.isInteger(session.durationMinutes)&&session.durationMinutes>=15&&session.durationMinutes<=360;
}
export function typeLabel(type) {
  return {endurance:'Duur Z2',threshold:'Threshold',vo2max:'VO₂max',group:'Groepsrit'}[type]??'Training';
}
export function sumKnownLoads(items) {
  let total=0,missing=0;
  for(const item of items){if(typeof item.load==='number'&&Number.isFinite(item.load))total+=item.load;else missing++;}
  return {total:Math.round(total),missing};
}
