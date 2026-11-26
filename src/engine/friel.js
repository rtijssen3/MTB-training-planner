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

export function proposeSkillWeek({dates,availability,target,maxQuality=2,blocked=[],qualityTypes=[],phase='Build',loadFor,fixed=[],groupLoadFor=minutes=>loadFor('endurance',minutes)}){
 if(dates.length!==7||!Number.isFinite(target)||target<0||!Number.isInteger(maxQuality)||maxQuality<0||maxQuality>2)throw Error('Ongeldige planningsparameters');
 const slots=new Map(),busy=new Set(blocked),hard=[];let used=0,unknownFixed=0;
 const cap=d=>Math.min(360,Math.floor((availability[d]?.available_minutes||0)/15)*15);
 const put=(i,type,minutes)=>{const date=dates[i],load=loadFor(type,minutes);if(!Number.isFinite(load)||load<0||used+load>target+.01)return false;slots.set(i,{date,type,durationMinutes:minutes,protocol:'classic'});used+=load;return true;};
 for(const date of new Set(fixed)){const i=dates.indexOf(date);if(i<0||cap(date)<15)continue;slots.set(i,{date,type:'endurance',group:true,durationMinutes:cap(date),protocol:'classic'});const load=groupLoadFor(cap(date));if(Number.isFinite(load)&&load>=0)used+=load;else unknownFixed++;for(const j of [i-1,i,i+1])if(dates[j])busy.add(dates[j]);}
 const groups=slots.size,limit=phase==='Recovery'||unknownFixed?0:Math.max(0,maxQuality-groups);
 for(const type of qualityTypes){if(hard.length>=limit)break;for(const i of [1,3,2,5,0,4,6]){if(slots.has(i)||busy.has(dates[i])||cap(dates[i])<60||hard.some(j=>Math.abs(j-i)<2))continue;if(put(i,type,60)){hard.push(i);break;}}}
 for(const i of [6,2,5,1,3,0,4]){if(slots.size>=6||slots.has(i)||cap(dates[i])<45)continue;if(unknownFixed||used>=target)break;const type=phase==='Base'&&!Array.from(slots.values()).some(s=>s.type==='skills')&&i!==6?'skills':'endurance';put(i,type,45);}
 for(let pass=0;pass<150;pass++){let changed=false;for(const i of [6,2,5,1,3,0,4]){const s=slots.get(i);if(!s||s.group||s.type!=='endurance'||s.durationMinutes+15>cap(s.date))continue;const next=s.durationMinutes+15,delta=loadFor(s.type,next)-loadFor(s.type,s.durationMinutes);if(Number.isFinite(delta)&&delta>=0&&!unknownFixed&&used+delta<=target+.01){s.durationMinutes=next;used+=delta;changed=true;break;}}if(!changed)break;}
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
