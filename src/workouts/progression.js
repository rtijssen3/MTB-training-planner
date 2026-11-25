// Versioned workload recipes. Levels raise repetition volume, not FTP targets.
const SPECS={"threshold":[[2,480,100,180,50],[3,480,100,180,50],[3,600,100,180,50]],"vo2max":[[4,180,115,180,50],[5,180,115,180,50],[6,180,115,180,50]],"force":[[3,180,75,180,55],[4,180,75,180,55],[5,180,75,180,55]],"skills":[[4,20,70,160,60],[6,20,70,160,60],[8,20,70,160,60]],"anaerobic":[[4,45,140,180,50],[5,45,140,180,50],[6,45,140,180,50]],"power":[[3,10,180,240,50],[4,10,180,240,50],[5,10,180,240,50]]};
const TITLES={"threshold":"Threshold","vo2max":"VO₂max","force":"Krachtgericht (60–70 rpm, zittend)","skills":"Souplesse (hoge cadans)","anaerobic":"Anaerobe intervallen","power":"Korte krachtige versnellingen"};

export function progressionLevel(plan,week){
 if(!week||week.phase==='Recovery'||week.phase==='Peak')return 1;
 const earlier=(plan?.weeks||[]).filter(w=>w.start<week.start&&w.phase===week.phase).length;
 return Math.min(3,1+Math.floor(earlier/2));
}

export function buildProgressiveWorkout({type,durationMinutes,ftp=300,level,phase='Opbouw'}){
 if(!Number.isInteger(level)||level<1||level>3||!Object.hasOwn(SPECS,type))throw Error('Ongeldige progressieve workout.');
 if(!Number.isInteger(durationMinutes)||durationMinutes<45||durationMinutes>360||!Number.isFinite(ftp)||ftp<100||ftp>600)throw Error('Kies 45–360 minuten en geldige FTP.');
 if(phase==='Herstel'&&type!=='skills')throw Error('Geen zware workout in herstelweek.');
 const [reps,work,pct,rest,baseRest]=SPECS[type][level-1],steps=[];
 const rpct=type==='skills'&&phase==='Herstel'?55:baseRest;
 const workPct=type==='skills'&&phase==='Herstel'?65:pct;
 const required=1200+reps*work+(reps-1)*rest;
 if(required>durationMinutes*60)throw Error('Dit niveau past niet in de beschikbare tijd. Kies een lager niveau of langere duur.');
 const add=(label,seconds,percentFtp,kind)=>{if(seconds>0)steps.push({label,seconds,percentFtp,kind,watts:Math.round(ftp*percentFtp/100)});};
 add('Warming-up',720,55,'warmup');
 for(let i=0;i<reps;i++){add(TITLES[type]+' '+(i+1)+'/'+reps,work,workPct,type==='skills'?'endurance':'work');if(i<reps-1)add('Herstel',rest,rpct,'recovery');}
 add('Rustig duurwerk',durationMinutes*60-required,phase==='Herstel'?55:type==='skills'?60:65,'endurance');add('Cooling-down',480,50,'cooldown');
 return {type,title:TITLES[type],durationMinutes,ftp,phase,protocol:'progressive',level,steps,hardMinutes:steps.filter(s=>s.kind==='work').reduce((sum,s)=>sum+s.seconds,0)/60};
}

export function isQuality(session){return !!session&&(session.group||['threshold','vo2max','force','anaerobic','power'].includes(session.type));}

export function boundaryBlocks({dates,previous=[],next=[]}){
 const blocked=[];
 if(previous.some(s=>isQuality(s)&&s.date===shiftIso(dates[0],-1)))blocked.push(dates[0]);
 if(next.some(s=>isQuality(s)&&s.date===shiftIso(dates[6],1)))blocked.push(dates[6]);
 return blocked;
}

export function shiftIso(date,days){const t=new Date(date+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+days);return t.toISOString().slice(0,10);}

export function candidateSession(type,durationMinutes,level,phase){
 return {type,durationMinutes,protocol:type==='endurance'?'classic':'progressive',...(type==='endurance'?{}:{level}),prescribedPhase:phase==='Recovery'?'Herstel':'Opbouw'};
}
