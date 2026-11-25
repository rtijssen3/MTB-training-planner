// Les 39 – geïntegreerde gebruikersinterface voor bestaande Supabase- en workoutmodellen.
// Trainingsplannen en workoutconcepten blijven lokaal; uitgevoerde activiteiten komen uit Intervals.icu.
import { supabase } from './supabase-client.js';
import { initializeAvailability } from './availability-service.js';
import { fetchIntervalsActivities, fetchIntervalsWellness, testIntervalsConnection } from './intervals-api.js';
import { normalizeActivity } from './intervals-model.js';
import { createStructuredWorkout, toIntervalsWorkoutText } from './workout-details-model.js';
import { estimateWorkoutTss } from './workout-load-model.js';
import { proposeWorkoutWeek } from './workout-plan-model.js';
import { analyzeCompletedStimulus } from './training-stimulus-model.js';
import {
  WEEKDAYS,dateKey,parseDate,addDays,monday,weekDates,weekStartOf,weekNumber,
  monthWeeks,intervalChunks,createMesocycle,migrateLegacyPlan,weekFor,effectivePlanWeek,typeLabel,sumKnownLoads,proposalAvailability,mergeFutureSessions,remainingWeekLoad
} from './planner-model.js';

const $=id=>document.getElementById(id);
const today=()=>new Date();
const fmtMinutes=n=>n==null?'—':n>=60?`${Math.floor(n/60)}u ${String(n%60).padStart(2,'0')}m`:`${n}m`;
const num=n=>Number.isFinite(n)?Math.round(n).toLocaleString('nl-NL'):'—';
const prettyDate=key=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(parseDate(key));
const monthLabel=(y,m)=>new Intl.DateTimeFormat('nl-NL',{month:'long',year:'numeric'}).format(new Date(y,m,1));
const nowKey=()=>dateKey(today());
const fixedLabel=value=>{const t=String(value||'').trim();return /groep|group|🚴|🚲/i.test(t)?'Groepsrit':t;};
const PLAN_PREFIX='mtb-mesocycle:v2:';
const WORKOUT_PREFIX='mtb-workout-draft:v1:';
const localAvailabilityPrefix='mtb-availability-local:v1:';

const app={userId:null,plan:null,month:new Date(today().getFullYear(),today().getMonth(),1),focusedWeek:null,
  availability:new Map(),activityCache:new Map(),wellness:null,activeTab:'dashboard',
  weekModal:null,workoutModal:null,renderNumber:0,authGeneration:0,activityError:null,planDirty:false,proposing:false};

function status(id,message,kind='') {const el=$(id);if(!el)return;el.textContent=message;el.classList.toggle('is-error',kind==='error');el.classList.toggle('is-good',kind==='good');}
function htmlNode(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;}
function add(parent,tag,cls,text){const node=htmlNode(tag,cls,text);parent.appendChild(node);return node;}
function cleanUser(){app.userId=null;app.plan=null;app.planDirty=false;app.activityCache.clear();app.availability.clear();app.wellness=null;app.activityError=null;app.authGeneration++;$('l39-dashboard-body').hidden=true;$('l39-calendar-grid').replaceChildren();$('l39-two-weeks').replaceChildren();$('l39-timeline').replaceChildren();for(const d of document.querySelectorAll('dialog[open]'))d.close();}
function getPlanKey(){return PLAN_PREFIX+app.userId;}
function getWorkoutKey(start){return `${WORKOUT_PREFIX}${app.userId}:${start}`;}
function getOverrideKey(){return localAvailabilityPrefix+app.userId;}
function localAvailability(){try{return JSON.parse(localStorage.getItem(getOverrideKey())||'{}')}catch{return {}}}
function setLocalAvailability(data){localStorage.setItem(getOverrideKey(),JSON.stringify(data))}
function readPlan(){
  try{const stored=localStorage.getItem(getPlanKey());if(stored){const plan=JSON.parse(stored);if(plan?.version===2&&Array.isArray(plan.weeks)&&plan.weeks.length)return plan;}}catch(e){console.warn('Plan kon niet worden ingelezen',e)}
  // Concepten uit les 34 lezen, zonder ze te verwijderen of aan te passen.
  const next=addDays(monday(today()),7);
  try{const old=localStorage.getItem(`mtb-periodization-draft:v1:${app.userId}:${dateKey(next)}`);
    if(old)return migrateLegacyPlan(JSON.parse(old));}catch(e){console.warn('Ouder trainingsblok ongeldig',e)}
  return null;
}
function sessions(start){
  try{const raw=JSON.parse(localStorage.getItem(getWorkoutKey(start))||'null');
    if(!raw?.sessions||!Array.isArray(raw.sessions))return [];
    return raw.sessions.filter(s=>s?.date&&['endurance','threshold','vo2max'].includes(s.type)&&Number.isInteger(s.durationMinutes))
      .map(s=>({...s,protocol:s.protocol||'classic'}));
  }catch{return []}
}
function storeSessions(start,items){localStorage.setItem(getWorkoutKey(start),JSON.stringify({version:1,start,sessions:items}));}
function getSession(date){return sessions(weekStartOf(parseDate(date))).find(s=>s.date===date)||null}
function workoutInfo(s,week){
  if(!s)return {load:null,workout:null,reason:'Geen training'};
  if(s.group)return {load:null,workout:null,reason:'Groepsrit: belasting afhankelijk van de uitvoering'};
  try{
    // Alleen %FTP bepaalt relatieve power-TSS. De referentie-FTP dient
    // uitsluitend om de bestaande workoutbuilder aan te roepen.
    const phase=week?.phase==='Recovery'?'Herstel':'Opbouw';
    const workout=createStructuredWorkout({type:s.type,durationMinutes:s.durationMinutes,
      ftp:300,protocol:s.protocol||'classic',phase});
    return {load:estimateWorkoutTss(workout).estimatedTss,workout,reason:null};
  }catch(e){return {load:null,workout:null,reason:e.message};}
}
function weekSessionStats(start){const week=weekFor(app.plan,start);const items=sessions(start);
  const result=sumKnownLoads(items.map(s=>({load:workoutInfo(s,week).load})));
  return {...result,items};
}
function setTab(tab){
  if(!['dashboard','calendar','plan','settings'].includes(tab))tab='dashboard';
  app.activeTab=tab;
  for(const [name,id] of Object.entries({dashboard:'l39-dashboard',calendar:'l39-calendar-page',plan:'l39-plan-page',settings:'l39-settings-page'})){
    $(id).hidden=name!==tab;
  }
  for(const b of document.querySelectorAll('[data-tab]')){
    const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));
  }
  if(tab==='dashboard')loadDashboard();
  if(tab==='calendar')loadCalendar();
  if(tab==='plan')loadPlan();
  if(tab==='settings')status('l39-connection-status','');
  if(tab!=='settings')history.replaceState(null,'',`#${tab}`);
}

async function availabilityForWeek(start,{force=false}={}){
  if(!app.userId)throw new Error('Je bent niet ingelogd.');
  if(!force&&app.availability.has(start))return app.availability.get(start);
  const {state}=await initializeAvailability(app.userId,parseDate(start));
  if(!state||typeof state.getEffective!=='function')throw new Error('Kan beschikbaarheid niet ophalen.');
  const overrides=localAvailability();const result={};
  for(const key of weekDates(start)){
    const raw=state.getEffective(key)||{};
    const value=Number(raw.available_minutes);
    result[key]={available_minutes:Number.isFinite(value)&&value>=0?Math.round(value):null,
      workout:String(raw.workout??raw.fixed_activity??raw.activity??'')};
    if(Object.hasOwn(overrides,key)){
      result[key].available_minutes=overrides[key];result[key].localOnly=true;
    }
  }
  app.availability.set(start,result);return result;
}
async function getActivitiesRange(start,end,{force=false}={}) {
  const cacheKey=`${start}:${end}`;
  if(!force&&app.activityCache.has(cacheKey))return app.activityCache.get(cacheKey);
  const all=[];
  for(const chunk of intervalChunks(start,end,28)){
    const raw=await fetchIntervalsActivities(chunk.oldest,chunk.newest);
    all.push(...raw.map(normalizeActivity));
  }
  const unique=[...new Map(all.map(a=>[a.id,a])).values()];
  app.activityCache.set(cacheKey,unique);
  return unique;
}

// DASHBOARD -------------------------------------------------------
async function loadDashboard(){
  if(!app.userId)return;
  const generation=app.authGeneration,view=++app.renderNumber;
  status('l39-dashboard-status','Laden...');
  const start=weekStartOf(today()),dates=weekDates(start);
  const {week,indicative}=effectivePlanWeek(app.plan,start,start);
  try{
    const [available,activities]=await Promise.all([availabilityForWeek(start),getActivitiesRange(dates[0],dates[6])]);
    if(generation!==app.authGeneration||view!==app.renderNumber)return;
    $('l39-current-week-label').textContent=`Week ${weekNumber(start)} · ${prettyDate(dates[0])} – ${prettyDate(dates[6])}`;
    $('l39-current-phase').textContent=week?.phase||'Geen fase';
    $('l39-week-target').textContent=week?num(week.targetLoad):'—';
    const finished=activities.filter(a=>a.date<=nowKey());
    const completed=sumKnownLoads(finished.map(a=>({load:a.trainingLoad})));
    const planned=weekSessionStats(start);
    $('l39-week-done').textContent=num(completed.total);
    $('l39-week-planned').textContent=planned.items.length?(planned.missing?'Onvolledig':num(planned.total)):'—';
    const pct=week&&completed.missing===0?Math.round(completed.total/week.targetLoad*100):null;
    $('l39-week-percent').textContent=pct===null?'—':`${pct}%`;
    $('l39-progress-fill').style.width=`${Math.min(100,Math.max(0,pct??0))}%`;
    $('l39-week-footnote').textContent=`${finished.length} uitgevoerde activiteiten · ${planned.items.length} geplande trainingen`+
      (completed.missing?` · ${completed.missing} activiteiten zonder load`: '')+
      (!week?' · Stel een weekdoel in via Plan overview.':indicative?' · Weekdoel indicatief overgenomen uit de eerste mesocycleweek.':'');
    const upcoming=$('l39-upcoming');upcoming.replaceChildren();
    const future=dates.filter(d=>d>=nowKey());
    for(const key of future){
      const session=getSession(key);
      const fixed=fixedLabel(available[key]?.workout);
      if(!session&&!fixed)continue;
      const button=htmlNode('button','l39-upcoming-card');button.type='button';button.dataset.action='workout';button.dataset.date=key;
      const dateEl=add(button,'div','l39-upcoming-date');add(dateEl,'strong','',prettyDate(key).split(' ')[0]);add(dateEl,'small','',WEEKDAYS[weekDates(start).indexOf(key)]);
      const content=add(button,'div','l39-upcoming-body');add(content,'strong','',session?(session.group?'Groepsrit':typeLabel(session.type)):fixed);
      const info=session?workoutInfo(session,week):{load:null};add(content,'small','',session?`${fmtMinutes(session.durationMinutes)} · ${info.load===null?'load onbekend':num(info.load)+' geschatte TSS'}`:'Vaste activiteit · open om een workout te maken');
      add(button,'span','l39-upcoming-arrow','›');upcoming.appendChild(button);
    }
    if(!upcoming.children.length){const empty=add(upcoming,'p','l39-caption','Er zijn deze week nog geen komende trainingen gepland.');
      const b=add(upcoming,'button','l39-secondary','Open Plan overview');b.type='button';b.dataset.action='go-plan';}
    $('l39-dashboard-body').hidden=false;
    status('l39-dashboard-status','');
    loadWellness(generation);
  }catch(e){if(generation!==app.authGeneration)return;status('l39-dashboard-status',`Dashboard: ${e.message}`,'error');$('l39-dashboard-body').hidden=true;}
}
async function loadWellness(generation){
  try{const current=today(),old=addDays(current,-27);const records=await fetchIntervalsWellness(dateKey(old),dateKey(current));
    if(generation!==app.authGeneration||!records?.length)return;
    const latest=records.filter(r=>Number.isFinite(r.ctl)&&Number.isFinite(r.atl)).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
    if(!latest)return;
    $('l39-ctl').textContent=Number(latest.ctl).toFixed(1);
    $('l39-atl').textContent=Number(latest.atl).toFixed(1);
    $('l39-tsb').textContent=(Number(latest.ctl)-Number(latest.atl)).toFixed(1);
    $('l39-fitness-date').textContent=latest.date;
  }catch(e){if(generation===app.authGeneration){$('l39-fitness-date').textContent='Fitnessgegevens niet beschikbaar';console.warn(e)}}
}

// CALENDAR -------------------------------------------------------
async function loadCalendar(){
  if(!app.userId)return;
  const generation=app.authGeneration,view=++app.renderNumber;
  const y=app.month.getFullYear(),m=app.month.getMonth(),rows=monthWeeks(y,m);
  $('l39-month-title').textContent=monthLabel(y,m);
  status('l39-calendar-status','Activiteiten ophalen...');
  try{
    const all=await getActivitiesRange(rows[0].start,rows.at(-1).end);
    if(generation!==app.authGeneration||view!==app.renderNumber)return;
    renderCalendar(rows,all,m);
    status('l39-calendar-status',`${all.length} activiteiten geladen via Intervals.icu.`,'good');
  }catch(e){if(generation!==app.authGeneration)return;app.activityError=e.message;renderCalendar(rows,[],m,true);
    status('l39-calendar-status',`Uitgevoerde activiteiten konden niet worden geladen: ${e.message}`,'error');}
}
function renderCalendar(rows,activities,currentMonth,failed=false){
  const host=$('l39-calendar-grid');host.replaceChildren();
  const byDate=new Map();for(const a of activities){if(!byDate.has(a.date))byDate.set(a.date,[]);byDate.get(a.date).push(a)}
  for(const row of rows){
    const {week:phase,indicative}=effectivePlanWeek(app.plan,row.start,weekStartOf(today()));const stat=weekSessionStats(row.start);
    const section=htmlNode('div','l39-cal-week');
    const band=htmlNode('div',`l39-week-phase ${(phase?.phase||'').toLowerCase()}`);
    band.style.display=phase&&row.end>=nowKey()?'flex':'none';
    add(band,'span','',`${phase?.phase??''} · ${app.plan?.name??''}`);
    add(band,'span','',`Geplande weekload ${phase?.targetLoad??'—'}${indicative?' (indicatief)':''}`);
    const line=htmlNode('div','l39-cal-row');
    const summary=add(line,'div','l39-week-meta');add(summary,'strong','',`Week ${row.number}`);
    add(summary,'small','',`${prettyDate(row.start)} – ${prettyDate(row.end)}`);
    const weekExecuted=activities.filter(a=>a.date>=row.start&&a.date<=row.end);
    const total=sumKnownLoads(weekExecuted.map(a=>({load:a.trainingLoad})));
    add(summary,'small','',failed?'Uitgevoerd: niet beschikbaar':`Uitgevoerd: ${num(total.total)}${total.missing?'*':''}`);
    if(phase)add(summary,'em','',`Doel: ${phase.targetLoad}${indicative?' (indicatief)':''}`);
    if(stat.items.length)add(summary,'small','',`Workouts: ${stat.missing?'load onbekend':num(stat.total)}`);
    for(const day of row.days){
      const d=parseDate(day),dateCell=add(line,'div','l39-cal-day');
      if(day===nowKey())dateCell.classList.add('today');
      if(d.getMonth()!==currentMonth)dateCell.classList.add('outside');
      const head=add(dateCell,'div','l39-cal-day-header');add(head,'strong','',String(d.getDate()));add(head,'span','',WEEKDAYS[row.days.indexOf(day)]);
      const done=byDate.get(day)||[];
      for(const activity of done.slice(0,2)){
        const b=add(dateCell,'button','l39-activity-chip');b.type='button';b.dataset.action='completed';b.dataset.date=day;b.dataset.activityId=activity.id;
        add(b,'b','',activity.name);add(b,'span','',`${fmtMinutes(activity.durationMinutes)} · ${activity.trainingLoad??'—'} load`);
      }
      if(done.length>2)add(dateCell,'small','l39-caption',`+${done.length-2} activiteiten`);
      const session=getSession(day);
      if(session){const b=add(dateCell,'button','l39-planned-chip');b.type='button';b.dataset.action='workout';b.dataset.date=day;
        add(b,'b','',session.group?'Groepsrit':typeLabel(session.type));
        const info=workoutInfo(session,phase);add(b,'span','',`${fmtMinutes(session.durationMinutes)} · ${info.load===null?'TSS —':num(info.load)+' TSS'}`);
      }else if(day>=nowKey()){
        const b=add(dateCell,'button','l39-cal-empty','+ Plan');b.type='button';b.dataset.action='workout';b.dataset.date=day;
      }
    }
    section.append(band,line);host.appendChild(section);
  }
}

// PLAN OVERVIEW ---------------------------------------------------
function fillPlanForm(plan){
  if(!plan){$('l39-plan-start').value=weekStartOf(today());return;}
  $('l39-plan-name').value=plan.name||'Mijn trainingsplan';$('l39-plan-start').value=plan.start;
  $('l39-plan-race').value=plan.raceDate||'';$('l39-plan-weeks').value=plan.weeks.length;
  $('l39-plan-base').value=plan.baseLoad;$('l39-plan-growth').value=plan.progression;
  $('l39-plan-reduction').value=plan.recoveryReduction;$('l39-plan-recovery-every').value=plan.recoveryEvery;
  $('l39-plan-plateau').value=plan.plateau;
}
function renderTimeline(){
  const host=$('l39-timeline');host.replaceChildren();
  if(!app.plan){add(host,'p','l39-caption','Nog geen trainingsplan. Vul bovenaan je uitgangspunten in en genereer een concept.');$('l39-timeline-summary').textContent='Nog geen plan';return;}
  const weeks=app.plan.weeks;const max=Math.max(1,...weeks.map(w=>w.targetLoad));
  $('l39-timeline-summary').textContent=`${weeks.length} weken · ${prettyDate(weeks[0].start)} – ${prettyDate(weeks.at(-1).end)}`;
  for(const w of weeks){
    const button=add(host,'button','l39-timeline-week');button.type='button';button.dataset.action='focus-week';button.dataset.week=w.start;
    if(app.focusedWeek===w.start)button.classList.add('selected');
    add(button,'strong','',num(w.targetLoad));
    const wrap=add(button,'div','l39-timeline-barwrap');const bar=add(wrap,'div',`l39-timeline-bar ${w.phase.toLowerCase()}`);
    bar.style.setProperty('--bar-height',`${Math.max(7,w.targetLoad/max*100)}%`);
    add(button,'small','',`W${w.week}`);button.title=`${w.phase} • week ${weekNumber(w.start)} • ${w.targetLoad} load`;
  }
}
async function loadPlan(){if(!app.userId)return;renderTimeline();await renderTwoWeeks()}
function weekWindowStart(){return app.focusedWeek||weekStartOf(today());}
async function renderTwoWeeks(){
  if(!app.userId)return;
  const generation=app.authGeneration,view=++app.renderNumber;
  const start=weekWindowStart();
  $('l39-weeks-title').textContent=app.focusedWeek?`Week ${weekNumber(start)} en ${weekNumber(dateKey(addDays(parseDate(start),7)))}`:'Beschikbaarheid · deze & volgende week';
  const host=$('l39-two-weeks');host.replaceChildren();add(host,'p','l39-caption','Beschikbaarheid laden...');
  try{
    const next=dateKey(addDays(parseDate(start),7));
    const [one,two]=await Promise.all([availabilityForWeek(start),availabilityForWeek(next)]);
    if(generation!==app.authGeneration||view!==app.renderNumber)return;
    host.replaceChildren();renderWeekCard(host,start,one);renderWeekCard(host,next,two);
    const local=Object.keys(localAvailability()).length;
    $('l39-availability-hint').textContent=local?`${local} dagaanpassingen staan alleen lokaal in deze browser en zijn niet bevestigd in Supabase.`:
      'Beschikbare uren komen uit de bestaande planner. Je trainingsvoorstellen worden lokaal als concept bewaard.';
  }catch(e){if(generation===app.authGeneration){host.replaceChildren();add(host,'p','l39-status',`Beschikbaarheid kon niet worden geladen: ${e.message}`);}}
}
function renderWeekCard(host,start,availability){
  const keys=weekDates(start),{week:planWeek,indicative}=effectivePlanWeek(app.plan,start,weekStartOf(today())),info=weekSessionStats(start),container=add(host,'section','l39-week-card');
  const head=add(container,'div','l39-week-card-head');
  head.title='Klik om de beschikbaarheid van de hele week te bewerken';head.tabIndex=0;
  head.addEventListener('click',event=>{if(!event.target.closest('button'))openAvailability(start)});
  head.addEventListener('keydown',event=>{if(event.target===head&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openAvailability(start)}});
  const title=add(head,'div');
  add(title,'h3','',`Week ${weekNumber(start)} · ${prettyDate(keys[0])} – ${prettyDate(keys[6])}`);
  add(title,'small','',`${planWeek?.phase??'Geen fase'} · ${planWeek?num(planWeek.targetLoad)+(indicative?' load indicatief':' load gepland'):'Nog geen weekdoel'}`);
  const edit=add(head,'button','l39-week-edit','✎ Bewerk week');edit.dataset.action='availability';edit.dataset.week=start;edit.type='button';
  const days=add(container,'div','l39-week-days');
  for(const [i,key] of keys.entries()){
    const day=add(days,'div','l39-week-day');if(key===nowKey())day.classList.add('today');if(key<nowKey())day.classList.add('past');
    add(day,'strong','',WEEKDAYS[i]);add(day,'span','date',prettyDate(key));
    const mins=availability[key]?.available_minutes;
    add(day,'span','minutes',mins===null?'—':fmtMinutes(mins));
    add(day,'span','capacity','beschikbaar');
    const session=getSession(key);const button=add(day,'button',`l39-session-button${session?'':' rest'}`,
      session?(session.group?'Groepsrit':typeLabel(session.type)):
        (availability[key]?.workout?fixedLabel(availability[key].workout):key<nowKey()?'—':'+ Training'));
    button.type='button';button.dataset.action='workout';button.dataset.date=key;
    if(key<nowKey())button.disabled=true;
  }
  const foot=add(container,'div','l39-week-footer');
  add(foot,'span','',`Beschikbaar: ${fmtMinutes(keys.reduce((s,k)=>s+(availability[k]?.available_minutes??0),0))}`);
  add(foot,'span','',`Workouts: ${info.items.length?info.missing?'TSS onvolledig':num(info.total)+' TSS':'nog niet gepland'}`);
}
async function proposeWeek(){
  if(!app.userId || app.proposing)return;
  if(!app.plan){
    status('l39-plan-status','Genereer eerst een mesocycle.','error');
    return;
  }
  app.proposing=true;
  const button=$('l39-propose');button.disabled=true;
  try{
    if(app.planDirty && window.confirm('Huidige mesocycle opslaan?'))savePlan();
    const start=weekWindowStart();
    const second=dateKey(addDays(parseDate(start),7));
    const starts=[start,second];
    const prepared=[];
    const warnings=[];
    const now=nowKey();
    const currentWeek=weekStartOf(today());

    // Bereken beide weken voordat we iets in de lokale opslag schrijven.
    // Voor de huidige week tellen uitgevoerde activiteiten eerst mee.
    for(const weekStart of starts){
      const {week,indicative}=effectivePlanWeek(app.plan,weekStart,currentWeek);
      if(!week){
        warnings.push(`Week ${weekNumber(weekStart)} heeft geen mesocycle-doel en is overgeslagen.`);
        continue;
      }
      if(weekDates(weekStart)[6] < now){
        warnings.push(`Week ${weekNumber(weekStart)} is afgesloten en wordt niet gewijzigd.`);
        continue;
      }
      if(indicative)warnings.push(`Week ${weekNumber(weekStart)}: indicatief doel uit de eerste mesocycleweek.`);
      const availability=await availabilityForWeek(weekStart);
      const usable=proposalAvailability(availability,weekStart,now);
      let remainingTarget=week.targetLoad;
      let completedLoad=0;
      let occupiedDates=[];
      let stimulus=null;

      if(weekStart===currentWeek){
        // Een reeds voltooide training telt mee voor het weekdoel.
        // Ophalen met force om een eerder geladen browsercache niet
        // onbedoeld als nieuwe stand van de week te beschouwen.
        const records=await getActivitiesRange(weekStart,now,{force:true});
        const progress=remainingWeekLoad(week.targetLoad,records,weekStart,now);
        completedLoad=progress.completedLoad;
        occupiedDates=progress.occupiedDates;
        stimulus=analyzeCompletedStimulus(records,weekStart,now);
        if(stimulus.qualityCount){
          warnings.push(`Week ${weekNumber(weekStart)}: ${stimulus.qualityCount} reeds uitgevoerde kwaliteitsprikkel(s) herkend aan de activiteitstitel.`);
        }
        if(stimulus.unknownCount){
          warnings.push(`Week ${weekNumber(weekStart)}: ${stimulus.unknownCount} activiteit(en) met onbekende intensiteit; maximaal één nieuwe intensieve training en geen intensieve training direct naast die activiteit.`);
        }
        if(progress.missingLoadCount){
          warnings.push(`Week ${weekNumber(weekStart)}: ${progress.missingLoadCount} uitgevoerde activiteit(en) zonder trainingsload. Restdoel onbekend; geen automatisch voorstel voor deze week.`);
          continue;
        }
        remainingTarget=progress.remainingLoad;
        if(progress.targetReached){
          warnings.push(`Week ${weekNumber(weekStart)}: het weekdoel is met ${completedLoad} load al bereikt. Geen extra training voorgesteld.`);
          continue;
        }
        // Bescherm dagen waarop deze week al een training is uitgevoerd.
        for(const day of occupiedDates){
          if(usable[day])usable[day].available_minutes=0;
        }
      }

      if(!Object.values(usable).some(v=>v.available_minutes>=45)){
        warnings.push(`Week ${weekNumber(weekStart)} heeft geen resterende beschikbare momenten van minstens 45 minuten.`);
        continue;
      }
      const result=proposeWorkoutWeek({
        week:{...week,targetLoad:Math.max(1,remainingTarget),phase:week.phase==='Recovery'?'Herstel':'Opbouw'},
        availabilityByDate:usable,
        maxQualitySessions: stimulus ? stimulus.maxNewQuality : 2,
        blockedQualityDates: stimulus ? stimulus.blockedQualityDates : []
      });
      const suggestions=result.sessions
        .filter(s=>s.date>=now && !occupiedDates.includes(s.date))
        .map(s=>({date:s.date,type:s.type,durationMinutes:s.durationMinutes,protocol:'classic'}));
      if(!suggestions.length){
        warnings.push(`Week ${weekNumber(weekStart)}: geen passende trainingen mogelijk.`);
        continue;
      }
      const existing=sessions(weekStart);
      const preservedToday=existing.filter(s=>occupiedDates.includes(s.date));
      prepared.push({start:weekStart,suggestions,existing,
        // Behoud reeds uitgevoerde dagen, inclusief vandaag.
        merged:[...mergeFutureSessions(existing,suggestions,now),...preservedToday]
          .sort((a,b)=>a.date.localeCompare(b.date)),
        completedLoad,remainingTarget});
    }
    if(!prepared.length){
      status('l39-plan-status',warnings.join(' ')||'Geen resterende trainingsmomenten beschikbaar.','error');
      return;
    }
    const replacing=prepared.filter(item=>item.existing.some(s=>s.date>=now));
    if(replacing.length && !window.confirm(`Voor ${replacing.map(item=>'week '+weekNumber(item.start)).join(' en ')} bestaan al trainingsvoorstellen. Alleen de komende trainingen overschrijven?`))return;
    for(const item of prepared)storeSessions(item.start,item.merged);
    const count=prepared.reduce((sum,item)=>sum+item.suggestions.length,0);
    const current=prepared.find(item=>item.start===currentWeek);
    const detail=current?` Huidige week: ${current.completedLoad} load uitgevoerd, ${current.remainingTarget} load resterend vóór het voorstel.`:'';
    status('l39-plan-status',`${count} trainingen voorgesteld voor ${prepared.length} week/weken.${detail} ${warnings.join(' ')} TSS-voorstellen blijven schattingen.`,'good');
    await renderTwoWeeks();
  }catch(e){
    status('l39-plan-status',e.message,'error');
  }finally{
    app.proposing=false;button.disabled=false;
  }
}

function generatePlan(event){
  event.preventDefault();
  try{
    const data={name:$('l39-plan-name').value,start:$('l39-plan-start').value,weeks:$('l39-plan-weeks').value,
      baseLoad:$('l39-plan-base').value,progression:$('l39-plan-growth').value,
      recoveryReduction:$('l39-plan-reduction').value,recoveryEvery:$('l39-plan-recovery-every').value,
      plateau:$('l39-plan-plateau').value,raceDate:$('l39-plan-race').value};
    app.plan=createMesocycle(data);app.planDirty=true;app.focusedWeek=null;renderTimeline();renderTwoWeeks();
    status('l39-plan-status','Concept gegenereerd maar nog niet opgeslagen. Klik op Bewaar mesocycle.','good');
  }catch(e){status('l39-plan-status',e.message,'error')}
}
function savePlan(){
  if(!app.plan||!app.userId){status('l39-plan-status','Genereer eerst een plan.','error');return}
  localStorage.setItem(getPlanKey(),JSON.stringify(app.plan));
  app.planDirty=false;
  status('l39-plan-status','Mesocycle lokaal bewaard. Nog niet naar Supabase of Intervals.icu verzonden.','good');
}

// MODAL: WEEK AVAILABILITY --------------------------------------
async function openAvailability(start){
  if(!app.userId)return;
  try{
    const values=await availabilityForWeek(start);
    app.weekModal={start,original:JSON.parse(JSON.stringify(values))};
    $('l39-week-dialog-title').textContent=`Week ${weekNumber(start)} · ${prettyDate(start)} – ${prettyDate(weekDates(start)[6])}`;
    const host=$('l39-week-sliders');host.replaceChildren();
    for(const [i,key] of weekDates(start).entries()){
      const row=add(host,'div','l39-week-slider-row');if(key<nowKey())row.classList.add('disabled');
      const label=add(row,'label','',`${WEEKDAYS[i]} ${prettyDate(key)}`);label.htmlFor=`l39-slide-${i}`;
      const range=add(row,'input');range.type='range';range.min='0';range.max='360';range.step='15';range.id=`l39-slide-${i}`;
      const input=add(row,'input');input.type='number';input.min='0';input.max='1440';input.step='1';
      range.value=String(Math.min(360,values[key]?.available_minutes??0));input.value=String(values[key]?.available_minutes??0);
      range.dataset.date=key;input.dataset.date=key;range.disabled=input.disabled=key<nowKey()||values[key]?.available_minutes===null;
      range.addEventListener('input',()=>{input.value=range.value});input.addEventListener('input',()=>{const n=Number(input.value);if(Number.isFinite(n))range.value=String(Math.min(360,Math.max(0,n)))});
    }
    status('l39-week-modal-status','');$('l39-week-dialog').showModal();
  }catch(e){status('l39-plan-status',e.message,'error')}
}
function findLegacyTile(date){
  const calendar=$('calendar');
  if(!calendar)return null;
  const safe=CSS.escape(date);
  const candidate=calendar.querySelector(`[data-date="${safe}"], [data-day="${safe}"], [data-date-key="${safe}"]`);
  if(!candidate)return null;
  return candidate.closest('button,[role="button"],.calendar-day,.day-card')||candidate;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function trySaveOriginalCalendar(changes){
  const save=$('save-calendar-button');
  if(!save||!$('day-minutes-number'))throw new Error('Bestaande kalendereditor ontbreekt.');
  if(!save.disabled)throw new Error('Er staan al niet-opgeslagen wijzigingen in de oude kalender.');
  for(const {date,minutes} of changes){
    const tile=findLegacyTile(date);
    if(!tile)throw new Error(`De oorspronkelijke kalender heeft geen herkenbare dagknop voor ${date}.`);
    tile.click();await pause(25);
    const input=$('day-minutes-number');input.value=String(minutes);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));await pause(25);
  }
  if(save.disabled)throw new Error('De bestaande kalender herkende de wijzigingen niet.');
  save.click();
  // Verifieer bij Supabase dat alle aanpassingen daadwerkelijk zijn opgeslagen.
  for(let attempt=0;attempt<12;attempt++){
    await pause(350);
    try{
      const {state}=await initializeAvailability(app.userId,parseDate(changes[0].date));
      if(changes.every(x=>Number(state.getEffective(x.date)?.available_minutes)===x.minutes))return true;
    }catch{ /* Verificatie opnieuw proberen */ }
  }
  throw new Error('Opslag in Supabase kon niet worden bevestigd.');
}
async function saveAvailability(event){
  event.preventDefault();if(!app.weekModal)return;
  const start=app.weekModal.start,changes=[];
  for(const input of $('l39-week-sliders').querySelectorAll('input[type=number]')){
    if(input.disabled)continue;
    const n=Number(input.value),date=input.dataset.date;
    if(!Number.isInteger(n)||n<0||n>1440){status('l39-week-modal-status',`Ongeldige minuten op ${date}.`,'error');return}
    if(n!==app.weekModal.original[date].available_minutes)changes.push({date,minutes:n});
  }
  if(!changes.length){$('l39-week-dialog').close();return}
  status('l39-week-modal-status','Opslag in bestaande kalender proberen...');
  let confirmed=false,reason='';
  try{confirmed=await trySaveOriginalCalendar(changes)}catch(e){
    reason=e.message;console.warn('Weekeditor synchronisatie:',e);
    // Verwijder eventuele gedeeltelijke pending wijzigingen uit de legacy editor.
    const discard=$('discard-calendar-button');if(discard&&!discard.disabled)discard.click();
  }
  const overrides=localAvailability();
  for(const change of changes){
    if(confirmed)delete overrides[change.date];else overrides[change.date]=change.minutes;
  }
  setLocalAvailability(overrides);
  app.availability.delete(start);
  $('l39-week-dialog').close();
  await renderTwoWeeks();
  status('l39-plan-status',confirmed?'Beschikbaarheid opgeslagen en gecontroleerd in Supabase.':
    `Week voorlopig alleen lokaal opgeslagen. Supabase-opslag NIET bevestigd: ${reason}.` ,confirmed?'good':'error');
}

// MODAL: WORKOUT --------------------------------------------------
async function openWorkout(date){
  if(!app.userId||date<nowKey())return;
  const start=weekStartOf(parseDate(date));
  try{
    const available=await availabilityForWeek(start);
    const capacity=available[date]?.available_minutes;
    if(capacity===null)throw new Error('Geen beschikbare minuten voor deze datum bekend.');
    const s=getSession(date),phase=weekFor(app.plan,start);
    app.workoutModal={date,start,capacity,phase};
    $('l39-workout-title').textContent=`${prettyDate(date)} · Training aanpassen`;
    const fixed=fixedLabel(available[date]?.workout).toLowerCase();
    $('l39-workout-type').value=s?.group?'group':s?.type||(fixed.includes('groep')?'group':'endurance');
    $('l39-workout-duration').value=String(s?.durationMinutes||Math.max(15,Math.min(60,Math.floor(capacity/15)*15)));
    $('l39-workout-duration').max=String(Math.min(360,capacity));
    $('l39-workout-protocol').value=s?.protocol||'classic';
    $('l39-workout-capacity').textContent=`${fmtMinutes(capacity)} beschikbaar · ${phase?.phase??'Geen fase'}`;
    status('l39-workout-modal-status','');renderWorkoutPreview();$('l39-workout-dialog').showModal();
  }catch(e){status('l39-plan-status',e.message,'error')}
}
function readWorkoutControls(){return {date:app.workoutModal.date,
  type:$('l39-workout-type').value,durationMinutes:Number($('l39-workout-duration').value),
  protocol:$('l39-workout-protocol').value};}
function previewWorkoutResult(){
  if(!app.workoutModal)throw new Error('Geen dag geselecteerd.');
  const s=readWorkoutControls();
  if(s.type==='rest')return {s,info:null};
  if(s.type==='group')return {s,info:{load:null,workout:null,reason:'Groepsritten hebben geen vast vermogensprofiel. TSS wordt na uitvoering geregistreerd.'}};
  return {s,info:workoutInfo(s,app.workoutModal.phase)};
}
function renderWorkoutPreview(){
  const host=$('l39-workout-chart'),steps=$('l39-workout-steps');host.replaceChildren();steps.replaceChildren();
  const type=$('l39-workout-type').value;
  $('l39-workout-protocol').disabled=!['threshold','vo2max'].includes(type);
  $('l39-workout-duration').disabled=type==='rest';
  try{
    const {s,info}=previewWorkoutResult();
    if(s.type==='rest'){$('l39-workout-tss').textContent='0';$('l39-workout-hard').textContent='0';add(steps,'p','l39-caption','Rustdag: geen gestructureerde workout.');return}
    if(info.reason){
      $('l39-workout-tss').textContent='—';$('l39-workout-hard').textContent='—';
      add(steps,'p','l39-caption',info.reason);status('l39-workout-modal-status',info.reason);return;
    }
    $('l39-workout-tss').textContent=num(info.load);$('l39-workout-hard').textContent=String(info.workout.hardMinutes);
    for(const step of info.workout.steps){
      const slot=add(host,'div','bar-slot');slot.style.flex=String(step.seconds);
      const bar=add(slot,'div',`bar ${step.kind}`);bar.style.setProperty('--bar-height',`${Math.max(8,step.percentFtp/130*100)}%`);
      bar.title=`${step.label} · ${Math.round(step.seconds/60)}m · ${step.percentFtp}% FTP`;
      const row=add(steps,'div','l39-workout-step');add(row,'span','',`${step.label} · ${Math.round(step.seconds/60)} min`);
      add(row,'strong','',`${step.percentFtp}% FTP`);
    }
    status('l39-workout-modal-status','');
  }catch(e){$('l39-workout-tss').textContent='—';$('l39-workout-hard').textContent='—';
    add(steps,'p','l39-caption',e.message);status('l39-workout-modal-status',e.message,'error')}
}
async function saveWorkout(event){
  event.preventDefault();if(!app.workoutModal||!app.userId)return;
  const {date,start,capacity,phase}=app.workoutModal;
  const {s,info}=previewWorkoutResult();
  if(s.type!=='rest'){
    if(!Number.isInteger(s.durationMinutes)||s.durationMinutes<15||s.durationMinutes>360||s.durationMinutes>capacity||s.durationMinutes%15!==0){
      status('l39-workout-modal-status',`Gebruik stappen van 15 minuten, maximaal ${capacity} minuten beschikbaar.`,'error');return;
    }
    if(s.type!=='group'&&info.reason){status('l39-workout-modal-status',info.reason,'error');return}
  }
  const all=sessions(start).filter(x=>x.date!==date);
  if(s.type!=='rest')all.push({...s,type:s.type==='group'?'endurance':s.type,group:s.type==='group'});
  storeSessions(start,all);$('l39-workout-dialog').close();
  if(app.activeTab==='calendar')loadCalendar();else if(app.activeTab==='dashboard')loadDashboard();else renderTwoWeeks();
  const feedback=app.activeTab==='dashboard'?'l39-dashboard-status':app.activeTab==='calendar'?'l39-calendar-status':'l39-plan-status';
  status(feedback,'Training lokaal opgeslagen. Intervals.icu is niet gewijzigd.','good');
}
async function copyWorkout(){
  try{const {info}=previewWorkoutResult();if(!info?.workout)throw new Error('Geen gestructureerde workout om te kopiëren.');
    await navigator.clipboard.writeText(toIntervalsWorkoutText(info.workout));status('l39-workout-modal-status','Workouttekst gekopieerd.','good');
  }catch(e){status('l39-workout-modal-status',e.message,'error')}
}

function openCompleted(date,id){
  const all=[...app.activityCache.values()].flat();const a=all.find(x=>x.id===id&&x.date===date);
  if(!a)return;
  $('l39-activity-title').textContent=a.name;
  const details=$('l39-activity-details');details.replaceChildren();
  for(const [label,value] of [
    ['Datum',a.date],['Sport',a.sport],['Duur',fmtMinutes(a.durationMinutes)],
    ['Trainingsbelasting',a.trainingLoad===null?'Onbekend':num(a.trainingLoad)]
  ]){
    const row=add(details,'div','l39-activity-row');add(row,'span','',label);add(row,'strong','',value);
  }
  $('l39-activity-dialog').showModal();
}

function handleActions(event){
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;
  if(action==='go-plan')setTab('plan');
  if(action==='workout')openWorkout(target.dataset.date);
  if(action==='completed')openCompleted(target.dataset.date,target.dataset.activityId);
  if(action==='availability')openAvailability(target.dataset.week);
  if(action==='focus-week'){app.focusedWeek=target.dataset.week;setTab('plan');renderTimeline();renderTwoWeeks();}
  if(action==='close-dialog')target.closest('dialog')?.close();
}
function registerListeners(){
  for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>setTab(button.dataset.tab));
  $('l39-settings-link').addEventListener('click',()=>setTab('settings'));
  $('l39-dashboard-refresh').addEventListener('click',()=>{app.activityCache.clear();app.availability.clear();loadDashboard()});
  $('l39-month-prev').addEventListener('click',()=>{app.month=new Date(app.month.getFullYear(),app.month.getMonth()-1,1);loadCalendar()});
  $('l39-month-next').addEventListener('click',()=>{app.month=new Date(app.month.getFullYear(),app.month.getMonth()+1,1);loadCalendar()});
  $('l39-month-today').addEventListener('click',()=>{app.month=new Date(today().getFullYear(),today().getMonth(),1);loadCalendar()});
  $('l39-plan-form').addEventListener('submit',generatePlan);$('l39-plan-save').addEventListener('click',savePlan);
  $('l39-current-weeks').addEventListener('click',()=>{app.focusedWeek=null;renderTimeline();renderTwoWeeks()});
  $('l39-propose').addEventListener('click',proposeWeek);
  $('l39-week-form').addEventListener('submit',saveAvailability);
  $('l39-workout-form').addEventListener('submit',saveWorkout);
  $('l39-copy-workout').addEventListener('click',copyWorkout);
  for(const id of ['l39-workout-type','l39-workout-duration','l39-workout-protocol'])$(id).addEventListener('input',renderWorkoutPreview);
  $('l39-test-connection').addEventListener('click',async()=>{
    status('l39-connection-status','Verbinding testen...');try{await testIntervalsConnection();status('l39-connection-status','Intervals.icu werkt.','good')}
    catch(e){status('l39-connection-status',e.message,'error')}
  });
  document.addEventListener('click',handleActions);
  $('l39-plan-race').addEventListener('change',()=>{
    try{const race=$('l39-plan-race').value,start=$('l39-plan-start').value;if(!race||!start)return;
      const delta=(parseDate(race)-parseDate(start))/86400000;if(delta<0)throw new Error('Wedstrijd valt vóór startdatum.');
      const weeks=Math.floor(delta/7)+1;if(weeks>26)throw new Error('Deze versie ondersteunt maximaal 26 weken.');
      $('l39-plan-weeks').value=String(Math.max(4,weeks));
    }catch(e){status('l39-plan-status',e.message,'error')}
  });
}
function setSignedIn(user){
  if(app.userId===user.id)return;
  cleanUser();app.userId=user.id;app.plan=readPlan();app.planDirty=false;app.focusedWeek=null;fillPlanForm(app.plan);
  const tab=location.hash.slice(1);setTab(['dashboard','calendar','plan'].includes(tab)?tab:'dashboard');
}
async function initialize(){
  registerListeners();fillPlanForm(null);
  const {data}=await supabase.auth.getUser();if(data?.user)setSignedIn(data.user);
  supabase.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){cleanUser();}
    if(event==='SIGNED_IN'&&session?.user)setTimeout(()=>setSignedIn(session.user),0);
  });
}
initialize().catch(e=>console.error('Les 39 initialisatie:',e));
