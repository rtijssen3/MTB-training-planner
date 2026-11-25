// Workout feedback: detected intervals are evidence of exposure, not a recovery test.
export const TYPES=["threshold","vo2max","force","skills","anaerobic","power"];
export const RATINGS=["good","hard","neutral"];
const POWER_TYPES=["threshold","vo2max","anaerobic","power"];
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);

export function evaluateExecution(session,workout,rides,detail){
 const result={date:session.date,type:session.type,level:session.protocol==='progressive'&&[1,2,3].includes(session.level)?session.level:null,rating:RATINGS.includes(session.feedback)?session.feedback:null,matched:0,required:0,evidence:'unknown',reason:''};
 if(!rides.length){result.reason='Geen fietsactiviteit gevonden op deze datum.';return result;}
 if(rides.length!==1){result.reason='Meerdere fietsactiviteiten; koppeling niet eenduidig.';return result;}
 if(!POWER_TYPES.includes(session.type)){result.reason='Cadans/techniek niet aantoonbaar uit deze gegevens; eigen beoordeling nodig.';return result;}
 if(!workout?.steps?.length){result.reason='Voorgeschreven profiel niet beschikbaar.';return result;}
 const work=workout.steps.filter(s=>s.kind==='work');
 result.required=work.length;
 if(!work.length||!detail||String(detail.id)!==String(rides[0].id)||String(detail.start_date_local||'').slice(0,10)!==session.date||detail.power_meter===false||!Number.isFinite(detail.icu_ftp)||detail.icu_ftp<=0||detail.intervals_truncated===true){result.reason='Onvoldoende betrouwbare interval- of FTP-gegevens.';return result;}
 const zones=detail.icu_zone_times;
 if(!Array.isArray(zones)||!Array.from({length:7},(_,i)=>'Z'+(i+1)).every(k=>zones.some(z=>String(z?.id??z?.zone).toUpperCase()===k&&Number.isFinite(z.secs)&&z.secs>=0))){result.reason='Onvolledige vermogenszones.';return result;}
 const intervals=Array.isArray(detail.icu_intervals)?detail.icu_intervals:[];
 const rows=intervals.filter(i=>i&&Number.isFinite(i.start_time)&&Number.isFinite(i.end_time)&&i.start_time>=0&&i.end_time>i.start_time&&Number.isFinite(i.moving_time)&&i.moving_time>0&&i.moving_time<=i.end_time-i.start_time+2&&Number.isFinite(i.average_watts)&&i.average_watts>0).sort((a,b)=>a.end_time-b.end_time||a.start_time-b.start_time);
 let lastEnd=-1;
 for(const step of work){
  const match=rows.find(i=>i.start_time>=lastEnd&&i.moving_time>=.8*step.seconds&&i.moving_time<=1.25*step.seconds&&i.end_time-i.start_time<=1.35*step.seconds&&i.average_watts/detail.icu_ftp*100>=.9*step.percentFtp&&i.average_watts/detail.icu_ftp*100<=1.15*step.percentFtp);
  if(!match)break;
  result.matched++;lastEnd=match.end_time;
 }
 if(result.matched===work.length&&Number.isFinite(detail.moving_time)&&detail.moving_time>=session.durationMinutes*60*.75){
  result.evidence='matched';result.reason='Vergelijkbare werkintervallen gevonden; geen bewijs van herstel.';
 }else{result.evidence='partial';result.reason='Niet alle voorgeschreven intervallen aantoonbaar; geen oordeel over falen.';}
 return result;
}

export function recommendLevel(type,planned,rows,today){
 if(!TYPES.includes(type)||![1,2,3].includes(planned)||!iso(today))throw Error('Ongeldige niveauvraag.');
 const recent=rows.filter(r=>r.type===type&&iso(r.date)&&r.date<today&&[1,2,3].includes(r.level)).sort((a,b)=>b.date.localeCompare(a.date));
 const latest=recent[0];
 if(!latest)return {level:1,decision:'start',reason:'Geen recent beoordeeld niveau; begin op N1.'};
 const age=(Date.parse(today+'T00:00:00Z')-Date.parse(latest.date+'T00:00:00Z'))/86400000;
 if(age>21)return {level:Math.min(planned,1),decision:'start',reason:'Laatste vergelijkbare sessie langer dan 21 dagen geleden.'};
 const cap=Math.min(planned,latest.level);
 if(latest.rating==='hard')return {level:Math.max(1,Math.min(planned,latest.level-1)),decision:'reduce',reason:'Laatste sessie als te zwaar beoordeeld.'};
 if(planned<latest.level)return {level:planned,decision:'reduce',reason:'De geplande fase begrenst het niveau.'};
 // Subjective recovery is required before increasing; matching intervals alone cannot show readiness.
 const previous=recent[1];
 const qualifies=r=>r&&(r.rating==='good'||r.evidence==='matched'&&r.rating!=='hard');
 const separation=previous?(Date.parse(latest.date+'T00:00:00Z')-Date.parse(previous.date+'T00:00:00Z'))/86400000:0;
 const previousAge=previous?(Date.parse(today+'T00:00:00Z')-Date.parse(previous.date+'T00:00:00Z'))/86400000:Infinity;
 if(latest.rating==='good'&&previous?.level===latest.level&&qualifies(previous)&&separation>=2&&previousAge<=21&&planned>latest.level){
  return {level:latest.level+1,decision:'increase',reason:'Twee vergelijkbare sessies op hetzelfde niveau; laatste als goed uitgevoerd en hersteld beoordeeld.'};
 }
 return {level:cap,decision:'hold',reason:latest.evidence==='matched'?'Intervallen herkend; nog onvoldoende bevestigde herstel-/herhalingsevidentie voor verhogen.':'Niveau behouden; uitvoering of herstel niet voldoende bevestigd.'};
}

export function selectRecentSessions(weeks,start,end){
 const byDate=new Map();
 for(const week of weeks)for(const s of week||[]){if(s&&!s.group&&TYPES.includes(s.type)&&iso(s.date)&&s.date>=start&&s.date<=end)byDate.set(s.date,s);}
 return [...byDate.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
