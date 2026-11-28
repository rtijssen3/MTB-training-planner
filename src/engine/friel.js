import {isQuality} from '../workouts/progression.js';
// Friel-inspired coaching heuristics, not measured capacities or prescribed distributions.
export const SKILLS=["aerobic","force","skills","muscular","anaerobic","power"];
export const LABELS=["Aerobic endurance","Muscular force","Speed skills","Muscular endurance","Anaerobic endurance","Sprint power"];
const PROFILES={"xco":[4,4,5,4,5,4],"xcm":[5,4,4,5,3,2],"road":[4,3,3,5,4,4],"gravel":[5,3,3,5,3,2]};
const PHASES={"Base":[5,4,4,3,1,1],"Build":[4,2,3,5,5,4],"Peak":[3,1,2,4,4,3],"Recovery":[3,0,0,0,0,0]};
const MAP={"endurance":"aerobic","force":"force","skills":"skills","threshold":"muscular","vo2max":"anaerobic","anaerobic":"anaerobic","power":"power"};

export function priorities(discipline,phase,limiter='auto',analysis=null){
 const p=PHASES[phase];if(!p)throw Error('Onbekende fase');const d=PROFILES[discipline]||PROFILES.xco,focus=limiter==='auto'?analysis?.candidate:limiter;
 return SKILLS.map((skill,i)=>({skill,label:LABELS[i],score:p[i]===0?0:Math.min(5,Math.round((d[i]+2*p[i])/3)+(skill===focus?1:0)),focus:skill===focus}));
}

export function analyzeExposure(activities,discipline,expected=activities.length){
 const totals={aerobic:0,muscular:0,anaerobic:0,power:0};let covered=0;
 for(const a of activities){const z=a.zMinutes;if(a.zonesStatus!=='complete'||!z||!Array.from({length:7},(_,i)=>z['Z'+(i+1)]).every(x=>Number.isFinite(x)&&x>=0))continue;if(Object.values(z).reduce((s,x)=>s+x,0)<=0)continue;covered++;totals.aerobic+=z.Z2;totals.muscular+=z.Z3+z.Z4;totals.anaerobic+=z.Z5+z.Z6;totals.power+=z.Z7;}
 return recalculateExposure({covered,denominator:Math.max(activities.length,expected),minutes:totals},discipline);
}

export function qualityOrder(discipline,phase,limiter,analysis,seen=[]){
 const score=Object.fromEntries(priorities(discipline,phase,limiter,analysis).map(x=>[x.skill,x.score]));
 const types=phase==='Base'?['force','threshold']:phase==='Peak'?['threshold','vo2max']:discipline==='xco'?['vo2max','anaerobic','threshold','power']:['threshold','vo2max','power','anaerobic'];
 const focus=limiter==='auto'?analysis?.candidate:limiter;
 return types.sort((a,b)=>Number(seen.includes(a))-Number(seen.includes(b))||score[MAP[b]]-score[MAP[a]]||Number(MAP[b]===focus)-Number(MAP[a]===focus));
}

export function skillWorkout({type,durationMinutes,ftp,phase='Opbouw'}){
 const specs={force:[4,180,75,180,55,'Krachtgericht: zittend, 60–70 rpm'],skills:[6,20,70,160,60,'Hoge cadans, ontspannen'],anaerobic:[6,45,140,180,50,'Anaerobe herhaling'],power:[5,10,180,240,50,'Korte krachtige versnelling']};
 if(!specs[type]||!Number.isInteger(durationMinutes)||durationMinutes<45||durationMinutes>360||!Number.isFinite(ftp)||ftp<100||ftp>600)throw Error('Kies 45–360 minuten en geldige FTP.');
 if(phase==='Herstel'&&type!=='skills')throw Error('Geen nieuwe zware prikkel in herstelweek.');
 const [reps,work,basePct,rest,baseRest,label]=specs[type],steps=[];
 const pct=type==='skills'&&phase==='Herstel'?65:basePct;
 const rpct=type==='skills'&&phase==='Herstel'?55:baseRest;
 const add=(label,seconds,percentFtp,kind)=>{if(seconds>0)steps.push({label,seconds,percentFtp,kind,watts:Math.round(ftp*percentFtp/100)});};
 add('Warming-up',720,55,'warmup');for(let i=0;i<reps;i++){add(label,work,pct,type==='skills'?'endurance':'work');if(i<reps-1)add('Herstel',rest,rpct,'recovery');}
 const extra=durationMinutes*60-480-steps.reduce((s,x)=>s+x.seconds,0);if(extra<0)throw Error('Te weinig tijd voor dit protocol.');
 add('Rustig duurwerk',extra,phase==='Herstel'?55:type==='skills'?60:65,'endurance');add('Cooling-down',480,50,'cooldown');
 return {type,title:LABELS[SKILLS.indexOf(MAP[type])],durationMinutes,ftp,phase,protocol:'classic',steps,hardMinutes:steps.filter(s=>s.kind==='work'&&s.percentFtp>100).reduce((s,x)=>s+x.seconds,0)/60};
}

export function proposeSkillWeek({dates,availability,target,maxQuality=2,blocked=[],qualityTypes=[],phase='Build',loadFor,fixed=[],groupLoadFor=minutes=>loadFor('endurance',minutes),reserved=[],reservedLoadFor=s=>s.group?groupLoadFor(s.durationMinutes):loadFor(s.type,s.durationMinutes),restDates=[],preferLong=false,sessionCandidates=null,sessionLoad=null,allowCandidate=null,groupIntensity='mixed'}){
 if(dates.length!==7||!Number.isFinite(target)||target<0||!Number.isInteger(maxQuality)||maxQuality<0||maxQuality>2)throw Error('Ongeldige planningsparameters');
 const slots=new Map(),busy=new Set(blocked),hard=[],locked=new Set(),rest=new Set(restDates);let used=0,unknownFixed=0,reservedQuality=0;
 const cap=d=>rest.has(d)?0:Math.min(360,Math.floor((availability[d]?.available_minutes||0)/15)*15);
 // Manual sessions are immutable reservations, including those beyond standard availability.
 for(const s of reserved){const i=dates.indexOf(s.date);if(i<0||locked.has(i)||rest.has(s.date))continue;slots.set(i,{...s});locked.add(i);const load=reservedLoadFor(s);if(Number.isFinite(load)&&load>=0)used+=load;else unknownFixed++;if(isQuality(s)){reservedQuality++;for(const j of [i-1,i,i+1])if(dates[j])busy.add(dates[j]);}}
 const loadSession=s=>sessionLoad?sessionLoad(s):loadFor(s.type,s.durationMinutes);
 const allowed=s=>!allowCandidate||allowCandidate(s,[...slots.values()]);
 const put=(i,type,minutes)=>{const date=dates[i],candidates=sessionCandidates?sessionCandidates(type,minutes,date):[{type,durationMinutes:minutes,protocol:'classic'}];for(const candidate of candidates){const s={...candidate,date},load=loadSession(s);if(!Number.isFinite(load)||load<0||used+load>target+.01||!allowed(s))continue;slots.set(i,s);used+=load;return true;}return false;};
 for(const date of new Set(fixed)){const i=dates.indexOf(date);if(i<0||slots.has(i)||cap(date)<15)continue;slots.set(i,{date,type:'endurance',group:true,groupIntensity,durationMinutes:cap(date),protocol:'classic'});const load=groupLoadFor(cap(date),groupIntensity);if(Number.isFinite(load)&&load>=0)used+=load;else unknownFixed++;if(groupIntensity!=='easy')for(const j of [i-1,i,i+1])if(dates[j])busy.add(dates[j]);}
 const groups=[...slots.entries()].filter(([i,s])=>s.group&&s.groupIntensity!=='easy'&&!locked.has(i)).length,limit=phase==='Recovery'||unknownFixed?0:Math.max(0,maxQuality-groups-reservedQuality);
 const qualityOrder=preferLong?[1,3,2,5,0,4,6].sort((a,b)=>cap(dates[a])-cap(dates[b])):[1,3,2,5,0,4,6];
 for(const type of qualityTypes){if(hard.length>=limit||slots.size>=6)break;for(const i of qualityOrder){if(slots.has(i)||busy.has(dates[i])||cap(dates[i])<(sessionCandidates?45:60)||hard.some(j=>Math.abs(j-i)<2))continue;const lengths=sessionCandidates?(preferLong&&type==='threshold'?[75,60,90,45]:[60,75,45,90]):[60];if(lengths.some(n=>n<=cap(dates[i])&&put(i,type,n))){hard.push(i);break;}}}
 const enduranceOrder=preferLong?[0,1,2,3,4,5,6].sort((a,b)=>cap(dates[b])-cap(dates[a])||[6,2,5,1,3,0,4].indexOf(a)-[6,2,5,1,3,0,4].indexOf(b)):[6,2,5,1,3,0,4];
 for(const i of enduranceOrder){if(slots.size>=6||slots.has(i)||cap(dates[i])<45)continue;if(unknownFixed||used>=target)break;const type=phase==='Base'&&!Array.from(slots.values()).some(s=>s.type==='skills')&&i!==6&&(!preferLong||cap(dates[i])<=90)?'skills':'endurance';
  // Gravel / aerobic emphasis: spend the available budget on a longer steady ride before filling additional days.
  let placed=false;if(preferLong&&type==='endurance'){for(let minutes=cap(dates[i]);minutes>=45;minutes-=15){if(put(i,type,minutes)){placed=true;break;}}}if(!placed&&sessionCandidates&&cap(dates[i])>=60)placed=put(i,type,60);if(!placed)placed=put(i,type,45);
  if(!placed&&sessionCandidates&&type==='skills'){if(cap(dates[i])>=60)placed=put(i,'endurance',60);if(!placed)put(i,'endurance',45);}
 }
 for(let pass=0;pass<150;pass++){let changed=false;for(const i of enduranceOrder){const s=slots.get(i);if(!s||locked.has(i)||s.group||s.type!=='endurance'||s.durationMinutes+15>cap(s.date))continue;const next=s.durationMinutes+15,delta=loadSession({...s,durationMinutes:next})-loadSession(s);if(Number.isFinite(delta)&&delta>=0&&!unknownFixed&&used+delta<=target+.01&&allowed({...s,durationMinutes:next})){s.durationMinutes=next;used+=delta;changed=true;break;}}if(!changed)break;}
 // Use short low-intensity sessions only after the regular allocation and extensions.
 // Never add intensity, exceed available minutes or budget, or replace a reserved day.
 if(sessionCandidates&&!unknownFixed){
  for(const i of enduranceOrder){
   if(slots.size>=6||used>=target)break;
   if(slots.has(i)||cap(dates[i])<15)continue;
   for(const minutes of [45,30,15]){
    if(minutes>cap(dates[i]))continue;
    if((minutes<45&&put(i,'endurance',minutes))||put(i,'recovery',minutes))break;
   }
  }
 }
 return {sessions:[...slots.values()].sort((a,b)=>a.date.localeCompare(b.date)),estimatedKnownLoad:used,unknownFixed};
}

export function recalculateExposure(analysis,discipline){
 const {covered,denominator,minutes}=analysis;
 const keys=['aerobic','muscular','anaerobic','power'];
 const valid=keys.every(k=>Number.isFinite(minutes?.[k])&&minutes[k]>=0);
 const total=valid?keys.reduce((s,k)=>s+minutes[k],0):0;
 const reference={xco:[.70,.20,.08,.02],xcm:[.78,.17,.04,.01],road:[.72,.20,.06,.02],gravel:[.80,.15,.04,.01]}[discipline]||[.70,.20,.08,.02];
 const rank=keys.map((skill,i)=>({skill,ratio:total?minutes[skill]/total/reference[i]:Infinity})).sort((a,b)=>a.ratio-b.ratio);
 return {...analysis,candidate:covered>=6&&denominator>0&&covered/denominator>=.7&&total>=180&&rank[0].ratio<.7?rank[0].skill:null};
}
