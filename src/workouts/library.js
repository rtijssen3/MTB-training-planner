// Versioned original recipes inspired by training concepts on
// https://www.formbeat.com/cycling-workouts/ and https://joefrieltraining.com/build-period-overview/.
// Never edit a published recipe in place; add a new version ID.
const ALL=['xco','road','gravel'],BASE=['Base','Build'],HARD=['Build','Peak'],ANY=['Base','Build','Peak','Recovery'];
const b=(seconds,percentFtp,label='Werk',kind='work',extra={})=>({seconds,percentFtp,label,kind,...extra});
const m=(minutes,pct,label,kind,extra)=>b(minutes*60,pct,label,kind,extra);
const r=seconds=>b(seconds,52,'Herstel','recovery');
const z=(minutes,pct=65,label='Duurwerk')=>m(minutes,pct,label,'endurance');
const max=(seconds,pct,label)=>b(seconds,pct,label,'work',{effort:'max'});
const E=(id,title,weights,disc=ALL,phases=BASE,min=45,max=360,category='endurance')=>({id:id+'-v1',title,type:'endurance',category,primary:'aerobic',secondary:[],disciplines:disc,phases,min,max,quality:false,levels:[1],weights});
const Q=(id,title,type,primary,pattern,reps,opts={})=>({id:id+'-v1',title,type,category:type,primary,secondary:[],disciplines:ALL,phases:HARD,min:45,max:180,quality:type!=='skills',levels:[1,2,3],pattern,reps,gap:180,...opts});
const T=(id,title,type,primary,pattern,min,extra={})=>({id:id+'-v1',title,type,primary,category:'test',secondary:[],disciplines:ALL,phases:['Base','Build'],min,max:min,quality:true,levels:[1],pattern,reps:[1],gap:0,test:true,...extra});
const endurance=[
 E('steady-aerobic','Duur Z2 · gelijkmatig',[[1,65]],ALL,ANY),
 E('upper-aerobic','Duur Z2 · bovenzijde',[[1,72]],ALL,BASE,60),
 E('progressive-endurance','Progressieve duurtraining',[[1,60],[1,66],[1,73]],ALL,BASE,60),
 E('long-steady','Lange gelijkmatige duur',[[1,66]],['gravel','road'],BASE,120),
 E('endurance-pyramid','Duurpiramide',[[1,60],[1,67],[1,74],[1,67],[1,60]],ALL,BASE,60),
 E('two-speed','Wisselende Z2',[[1,60],[1,72],[1,60],[1,72]],ALL,BASE,60),
 E('late-durability','Duur met stevig slot',[[3,63],[1,73]],['gravel','road'],BASE,90),
 E('endurance-sandwich','Rustig–stevig–rustig',[[1,60],[3,71],[1,60]],ALL,BASE,75)
];
const tempo=[
 Q('tempo-double','Tempo · dubbele blokken','threshold','muscular',[m(12,82,'Tempo')],[2,2,3],{category:'tempo',phases:BASE,gap:240}),
 Q('tempo-climb','Klimtempo','threshold','muscular',[m(8,84,'Klimtempo')],[3,4,5],{category:'tempo',phases:BASE,disciplines:['road','gravel'],gap:180}),
 Q('sweetspot-builder','Sweet Spot opbouw','threshold','muscular',[m(10,89,'Sweet Spot')],[2,3,4],{category:'tempo',phases:BASE,gap:180}),
 Q('long-sweetspot','Lange Sweet Spot','threshold','muscular',[m(18,88,'Sweet Spot')],[2,2,3],{category:'tempo',phases:BASE,disciplines:['gravel','road'],gap:300,min:60}),
 Q('tempo-wave','Tempo golven','threshold','muscular',[m(3,78,'Tempo laag'),m(3,88,'Tempo hoog'),m(3,82,'Tempo')],[2,3,4],{category:'tempo',phases:BASE,gap:180}),
 Q('tempo-pyramid','Tempo piramide','threshold','muscular',[m(6,80,'Tempo'),m(10,86,'Tempo'),m(6,80,'Tempo')],[1,2,2],{category:'tempo',phases:BASE,gap:240}),
 Q('sweetspot-finish','Sweet Spot met versnelling','threshold','muscular',[m(8,88,'Sweet Spot'),m(2,96,'Drempel')],[2,3,4],{category:'tempo',phases:BASE,gap:240}),
 Q('sprint-sweetspot','Sprint Building Sweetspot','threshold','muscular',[m(7,88,'Sweet Spot'),b(12,180,'Krachtige sprint'),b(408,88,'Sweet Spot')],[2,3,3],{category:'tempo',secondary:['power','anaerobic'],disciplines:['xco','road'],phases:['Build'],gap:300,min:60})
];
const threshold=[
 Q('threshold-long','Threshold lange blokken','threshold','muscular',[m(20,98,'Drempel')],[1,2,2],{disciplines:['road','gravel'],phases:BASE,gap:300}),
 Q('threshold-10','Threshold 10 min','threshold','muscular',[m(10,100,'Drempel')],[2,3,4],{phases:BASE,gap:240}),
 Q('threshold-8','Threshold 8 min','threshold','muscular',[m(8,101,'Drempel')],[3,4,5],{phases:BASE,gap:180}),
 Q('over-under','Over-unders','threshold','muscular',[m(2,92,'Onder drempel'),m(1,108,'Boven drempel'),m(2,92,'Onder drempel'),m(1,108,'Boven drempel')],[3,4,5],{secondary:['vo2max'],disciplines:['road','xco'],gap:180}),
 Q('attack-settle','Aanval en vasthouden','threshold','muscular',[b(20,145,'Aanval'),b(280,99,'Vasthouden')],[3,4,5],{secondary:['anaerobic','vo2max'],disciplines:['xco','road'],gap:240}),
 Q('late-threshold','Drempel op vermoeide benen','threshold','muscular',[z(18,67,'Voorbelasting'),m(12,96,'Drempel')],[1,1,2],{secondary:['aerobic'],disciplines:['gravel','road'],phases:['Build'],min:75,gap:240})
];
const vo2=[
 Q('vo2-3','VO₂max 3 min','vo2max','vo2max',[m(3,115,'VO₂max')],[4,5,6],{gap:180}),
 Q('vo2-4','VO₂max 4 min','vo2max','vo2max',[m(4,111,'VO₂max')],[3,4,5],{gap:240}),
 Q('vo2-30-30','VO₂max 30/30','vo2max','vo2max',Array.from({length:6},()=>[b(30,125,'Aan'),b(30,55,'Uit','recovery')]).flat(),[2,3,4],{secondary:['anaerobic'],disciplines:['xco','road'],gap:240}),
 Q('vo2-40-20','VO₂max 40/20','vo2max','vo2max',Array.from({length:5},()=>[b(40,120,'Aan'),b(20,55,'Uit','recovery')]).flat(),[2,3,4],{secondary:['anaerobic'],disciplines:['xco','road'],gap:240}),
 Q('vo2-hardstart','VO₂max · harde start','vo2max','vo2max',[b(30,135,'Aanloop'),b(150,112,'VO₂max')],[3,4,5],{secondary:['anaerobic'],disciplines:['xco','road'],gap:240}),
 Q('vo2-ladder','VO₂max ladder','vo2max','vo2max',[m(2,120,'Kort'),r(120),m(3,115,'Midden'),r(180),m(4,110,'Lang')],[1,2,2],{gap:240})
];
const anaerobic=[
 Q('anaerobic-30','Anaeroob 30 sec','anaerobic','anaerobic',[b(30,155,'Versnelling')],[5,6,8],{secondary:['power'],gap:180,disciplines:['xco','road']}),
 Q('anaerobic-45','Anaeroob 45 sec','anaerobic','anaerobic',[b(45,140,'Versnelling')],[4,5,6],{gap:210,disciplines:['xco','road']}),
 Q('anaerobic-60','Anaeroob 60 sec','anaerobic','anaerobic',[b(60,130,'Versnelling')],[4,5,6],{secondary:['vo2max'],gap:240}),
 Q('repeat-attacks','Herhaalde aanvallen','anaerobic','anaerobic',[b(25,150,'Aanval'),b(95,75,'Blijf rijden','endurance'),b(25,150,'Aanval')],[3,4,5],{secondary:['muscular'],disciplines:['xco','road'],gap:240}),
 Q('punchy-climb','Korte klimaanvallen','anaerobic','anaerobic',[b(45,145,'Klim'),b(75,70,'Doorrijden','endurance')],[4,5,6],{secondary:['vo2max'],disciplines:['xco','road'],gap:180})
];
const sprint=[
 Q('sprint-8','Sprint 8 sec','power','power',[b(8,180,'Sprint')],[4,5,6],{gap:270,disciplines:['xco','road']}),
 Q('sprint-12','Sprint 12 sec','power','power',[b(12,175,'Sprint')],[4,5,6],{gap:300,disciplines:['xco','road']}),
 Q('rolling-sprint','Vliegende sprint','power','power',[b(20,85,'Aanloop','endurance'),b(10,190,'Vliegende sprint')],[4,5,6],{gap:300,disciplines:['xco','road']}),
 Q('sprint-tempo','Sprint vanuit tempo','power','power',[m(3,82,'Tempo'),b(10,180,'Sprint')],[3,4,5],{secondary:['muscular'],gap:300,disciplines:['xco','road']}),
 Q('sprint-pyramid','Sprintpiramide','power','power',[b(6,190,'Sprint'),r(240),b(12,175,'Sprint'),r(240),b(8,185,'Sprint')],[1,2,2],{gap:300,disciplines:['xco','road']})
];
const technique=[
 Q('torque-3','Kracht · 3 min zittend','force','aerobic',[m(3,75,'Zittend 60–65 rpm','work',{cadence:65})],[3,4,5],{phases:BASE,gap:180}),
 Q('torque-5','Kracht · 5 min zittend','force','muscular',[m(5,78,'Zittend 65–70 rpm','work',{cadence:68})],[2,3,4],{phases:BASE,gap:240}),
 Q('spinups','Souplesse · korte spin-ups','skills','aerobic',[b(20,65,'Hoge cadans, ontspannen','endurance',{cadence:105})],[4,6,8],{phases:ANY,gap:120,quality:false}),
 Q('cadence-ladder','Souplesse · cadansladder','skills','aerobic',[m(2,65,'90 rpm','endurance',{cadence:90}),m(2,65,'95 rpm','endurance',{cadence:95}),m(2,65,'100 rpm','endurance',{cadence:100})],[2,3,4],{phases:BASE,gap:180,quality:false})
];
const recovery=[
 E('easy-spin','Herstel · rustig losrijden',[[1,50]],ALL,ANY,15,60,'recovery'),
 E('easy-wave','Herstel · lichte variatie',[[1,45],[1,53],[1,48]],ALL,ANY,30,60,'recovery'),
 E('easy-cool','Herstel · ontspannen trappen',[[1,55],[1,47]],ALL,ANY,30,60,'recovery')
];
const tests=[
 T('test-ftp20','FTP-test 20 minuten','threshold','muscular',[z(8,65),max(300,110,'5 min maximaal (voorbelasting)'),r(600),max(1200,105,'20 min maximaal gelijkmatig')],75,{testGroup:'ftp',instructions:'Vrije weerstand voor maximale inspanningen. FTP-indicatie uit 20-minutenvermogen; geen automatische FTP-wijziging.'}),
 T('test-ramp','FTP-ramp-test','threshold','muscular',Array.from({length:21},(_,i)=>b(60,60+6*i,'Rampstap '+(i+1)+' · stop bij uitputting','work')),45,{testGroup:'ftp',variable:true,instructions:'Verhoog elke minuut 6% van huidige FTP; stop de ramp zodra je het vermogen niet meer kunt vasthouden en rijd rustig uit. Geplande duur is bovengrens; FTP-schatting bevestigen in Intervals.icu.'}),
 T('test-map5','5-minuten maximaaltest','vo2max','vo2max',[z(8,65),max(300,120,'5 min maximaal gelijkmatig')],45,{instructions:'Vrije weerstand; gebruik beste 5-minutenvermogen als MAP-proxy, niet als gemeten VO₂max.'}),
 T('test-anaerobic','30/60-sec maximaaltest','anaerobic','anaerobic',[max(30,175,'30 s maximaal'),r(1200),max(60,145,'60 s maximaal')],60,{instructions:'Volledig herstel tussen inspanningen; voor zuivere maximale waarden bij voorkeur op aparte dagen herhalen.'}),
 T('test-sprint','5/15-sec sprinttest','power','power',[max(5,190,'5 s maximaal'),r(360),max(15,185,'15 s maximaal'),r(360),max(5,190,'5 s maximaal')],45,{instructions:'Vrije weerstand, veilige locatie, volledige recuperatie. Geen vast vermogensplafond.'}),
 T('test-decoupling','Z2-decouplingtest','endurance','aerobic',[z(100,65,'Constante Z2; houd vermogen en houding stabiel')],120,{quality:false,instructions:'Vermijd stops en variabele belasting; registreer hartslag en vermogen. Herhaal minstens tweemaal voor vergelijking.'})
];
export const WORKOUT_LIBRARY=Object.freeze([...endurance,...tempo,...threshold,...vo2,...anaerobic,...sprint,...technique,...recovery,...tests].map(Object.freeze));
const byId=new Map(WORKOUT_LIBRARY.map(x=>[x.id,x]));
export const getTemplate=id=>byId.get(id)||null;
export const templateTitle=s=>getTemplate(s?.templateId)?.title??null;
export function validTemplateSession(s){if(s?.protocol!=='library')return !s?.templateId;const t=getTemplate(s.templateId);return !!t&&s.type===t.type&&!s.group&&t.levels.includes(s.level);}
export function buildLibraryWorkout({templateId,type,durationMinutes,level=1,ftp=300,phase='Opbouw'}){
 const t=getTemplate(templateId);if(!t||type!==t.type||!t.levels.includes(level))throw Error('Onbekende workouttemplate of niveau.');
 if(!Number.isInteger(durationMinutes)||durationMinutes<t.min||durationMinutes>t.max||durationMinutes%15!==0||!Number.isFinite(ftp)||ftp<100||ftp>600)throw Error('Kies een duur die past bij deze workout.');
 if(phase==='Herstel'&&(t.quality||t.test))throw Error('Geen zware training of prestatietest in herstelweek.');
 const steps=[],total=durationMinutes*60,warm=t.quality||t.test?720:Math.min(360,Math.floor(total/5)),cool=t.quality||t.test?480:Math.min(240,Math.floor(total/6));
 const add=s=>{if(s.seconds>0)steps.push({...s,watts:Math.round(ftp*s.percentFtp/100)});};
 add(b(warm,55,'Warming-up','warmup'));
 if(t.weights){
   const active=total-warm-cool,weight=t.weights.reduce((n,x)=>n+x[0],0);let used=0;
   t.weights.forEach(([w,p],i)=>{const seconds=i===t.weights.length-1?active-used:Math.floor(active*w/weight);used+=seconds;add(b(seconds,p,'Duurwerk','endurance'));});
 }else{
   const count=t.reps[level-1],blocks=[];
   for(let i=0;i<count;i++){if(i&&t.gap)blocks.push(r(t.gap));blocks.push(...t.pattern);}
   const extra=total-warm-cool-blocks.reduce((s,x)=>s+x.seconds,0);if(extra<0)throw Error('Dit niveau past niet in de gekozen duur.');
   if(t.id==='late-threshold-v1')add(b(extra,65,'Duurwerk vóór drempel','endurance'));
   blocks.forEach(add);if(t.id!=='late-threshold-v1')add(b(extra,t.test?50:62,t.test?'Rustig uitrijden':'Rustig duurwerk','endurance'));
 }
 add(b(cool,48,'Cooling-down','cooldown'));
 return {type,title:t.title,templateId:t.id,protocol:'library',level,durationMinutes,ftp,phase,steps,hardMinutes:steps.filter(s=>s.kind==='work').reduce((n,s)=>n+s.seconds,0)/60,test:!!t.test,variable:!!t.variable,quality:t.quality,instructions:t.instructions??'',primary:t.primary,secondary:t.secondary};
}
export function libraryForCategory(type){return WORKOUT_LIBRARY.filter(t=>type==='test'?t.test:!t.test&&t.type===type);}
export function minimumDuration(t,level=1){const warm=t.quality||t.test?1200:600,active=t.pattern?t.pattern.reduce((n,s)=>n+s.seconds,0)*t.reps[level-1]+t.gap*(t.reps[level-1]-1):0;return Math.max(t.min,15*Math.ceil((warm+active)/900));}
export function libraryCandidates({type,phase,discipline,priorities={},weekIndex=0,recent=[],levelFor=()=>1,durationMinutes,date=''}){
 const suitable=WORKOUT_LIBRARY.filter(t=>!t.test&&t.type===type&&t.disciplines.includes(discipline)&&t.phases.includes(phase)&&durationMinutes>=t.min&&durationMinutes<=t.max&&(phase==='Recovery'?t.category==='recovery'||t.type==='skills':t.category!=='recovery'));
 const scores=(t,i)=>{
  const recentRows=recent.filter(x=>x.templateId===t.id&&x.completed===true),last=recentRows[0],age=last?.date&&date?(Date.parse(date)-Date.parse(last.date))/86400000:Infinity,recentEnough=age>=0&&age<=21;
  const repeat=recentEnough&&recentRows.length===1&&['easy','good'].includes(last.rating)?3:0;
  const fatigue=last?.rating==='hard'&&recentEnough?-4:0;
  const emphasis=priorities[t.primary]??3,secondary=t.secondary.reduce((n,k)=>n+(priorities[k]??3),0)*.12;
  const dayOffset=type==='endurance'&&date?Math.floor(Date.parse(date)/86400000)%7:0;
  const rotation=(i-((weekIndex+dayOffset)%Math.max(1,suitable.length))+suitable.length)%Math.max(1,suitable.length);
  return emphasis+secondary+repeat+fatigue+(t.disciplines.length<3?.25:0)-rotation*.3;
 };
 const ordered=suitable.map((t,i)=>({t,score:scores(t,i)})).sort((a,b)=>b.score-a.score);
 const result=[];
 for(const {t} of ordered){const desired=levelFor(t),level=t.levels.includes(desired)?desired:1;for(let n=level;n>=1;n--){if(!t.levels.includes(n)||durationMinutes<minimumDuration(t,n))continue;const session={type,durationMinutes,protocol:'library',templateId:t.id,level:n,prescribedPhase:phase==='Recovery'?'Herstel':'Opbouw'};try{buildLibraryWorkout({...session,phase:session.prescribedPhase});result.push(session);break;}catch{}}}
 return result;
}
