import {createLocalPlannerStore} from './src/data/local-planner-store.js';
import {TYPES as FEEDBACK_TYPES,RATINGS,activityMatches,isCyclingActivity,evaluateExecution,recommendLevel,selectRecentSessions} from './src/engine/workout-feedback.js';
import {formatIntensityMinutes,summarizePlannedLoads,manualWorkoutValidation} from './src/core/workout-display.js';
import {workoutText} from './src/workouts/export.js';
import {createCloudSync} from './src/data/cloud-sync.js';
import {readSnapshot} from './src/data/planner-snapshot.js';
import {normalizePlannerAvailability,isGroupRide,fixedGroupDates} from './src/core/planner-adapters.js';
import {proposeSkillWeek} from './src/engine/friel.js';
import {disciplineTargets,disciplineQualityOrder,normalizeDiscipline,normalizeLimiter,aerobicFocus} from './src/engine/discipline-policy.js';
import {buildSkillProfile,describeMetric,skillLevel} from './src/engine/skill-profile.js';
import { raceWeekCount } from './src/engine/event-plan.js';
// Les 39 – geïntegreerde gebruikersinterface voor bestaande Supabase- en workoutmodellen.
// Trainingsplannen en workoutconcepten blijven lokaal; uitgevoerde activiteiten komen uit Intervals.icu.
import { supabase } from './supabase-client.js';
import { initializeAvailability } from './availability-service.js';
import { saveCalendarChecked } from './availability-api.js';
import { fetchIntervalsActivities, fetchIntervalsWellness, testIntervalsConnection, exportIntervalsWorkout, fetchSkillHistory } from './intervals-api.js';
import { normalizeActivity } from './intervals-model.js';
import {workoutInfo} from './src/workouts/workout-service.js';
import {getTemplate,templateTitle,libraryForCategory,libraryCandidates,minimumDuration} from './src/workouts/library.js';
import {observedTestResult} from './src/workouts/test-results.js';
import {LEGACY_SELECTION,editorOptions,editorSelection,editorMinimum} from './src/workouts/editor-selection.js';
import {progressionLevel,candidateSession,boundaryBlocks} from './src/workouts/progression.js';
import { buildPrivacySafeReport } from './training-analysis-model.js';
import { deriveAdaptiveWeekPolicy } from './adaptive-week-policy.js';
import {selectFitnessAnchor,actualLoads,forecastFitness,fitnessCandidateAllowed} from './src/engine/fitness-forecast.js';
import {renderFitnessForecast} from './src/ui/fitness-forecast.js';
import {isQuality} from './src/workouts/progression.js';
import { derivePhaseWorkoutPolicy } from './phase-focus-policy.js';
import {
  WEEKDAYS,dateKey,parseDate,addDays,monday,weekDates,weekStartOf,weekNumber,
  monthWeeks,intervalChunks,createMesocycle,weekFor,effectivePlanWeek,typeLabel,sumKnownLoads,proposalAvailability,mergeFutureSessions,remainingWeekLoad
} from './planner-model.js';

const $=id=>document.getElementById(id);
const today=()=>new Date();
const fmtMinutes=n=>n==null?'—':n>=60?`${Math.floor(n/60)}u ${String(n%60).padStart(2,'0')}m`:`${n}m`;
const num=n=>Number.isFinite(n)?Math.round(n).toLocaleString('nl-NL'):'—';
const prettyDate=key=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(parseDate(key));
const monthLabel=(y,m)=>new Intl.DateTimeFormat('nl-NL',{month:'long',year:'numeric'}).format(new Date(y,m,1));
const nowKey=()=>dateKey(today());
const sessionTitle=s=>s?.group?'Groepsrit':templateTitle(s)||typeLabel(s?.type);
const fixedLabel=value=>{const t=String(value||'').trim();return isGroupRide(t)?'Groepsrit':t;};

const app={savingWorkout:false,evaluationToken:0,dashboardRecords:[],feedbackRows:[],feedbackStatus:'',feedbackBusy:false,cloud:null,cloudBusy:false,cloudQueued:false,startupIssue:'',selectedCalendarDate:null,userId:null,plan:null,month:new Date(today().getFullYear(),today().getMonth(),1),focusedWeek:null,
  availability:new Map(),activityCache:new Map(),wellness:null,activeTab:'dashboard',
  weekModal:null,workoutModal:null,renderNumber:0,authGeneration:0,activityError:null,planDirty:false,proposing:false,detailCache:new Map()};

function status(id,message,kind='') {const el=$(id);if(!el)return;el.textContent=message;el.classList.toggle('is-error',kind==='error');el.classList.toggle('is-good',kind==='good');}
function htmlNode(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;}
function add(parent,tag,cls,text){const node=htmlNode(tag,cls,text);parent.appendChild(node);return node;}
function cleanUser(){app.planEditor=null;app.savingWorkout=false;app.evaluationToken++;$('l39-analyze-limiters').disabled=false;app.dashboardRecords=[];$('l39-completed-workouts').replaceChildren();app.weekModal=null;app.workoutModal=null;app.proposing=false;app.focusedWeek=null;app.feedbackRows=[];app.feedbackStatus='';app.feedbackBusy=false;app.cloud=null;app.cloudBusy=false;app.cloudQueued=false;app.startupIssue='';app.selectedCalendarDate=null;for(const id of ['l39-cloud-sync','l39-cloud-local','l39-cloud-remote'])$(id).disabled=false;app.userId=null;app.plan=null;app.planDirty=false;app.activityCache.clear();app.detailCache.clear();app.availability.clear();app.wellness=null;app.activityError=null;app.authGeneration++;$('l39-dashboard-body').hidden=true;$('l39-calendar-grid').replaceChildren();$('l39-mobile-calendar').replaceChildren();$('l39-two-weeks').replaceChildren();$('l39-fitness-forecast').replaceChildren();$('l39-timeline').replaceChildren();$('l39-feedback-list').replaceChildren();$('l39-skill-priorities').replaceChildren();$('l39-feedback-status').textContent='';for(const d of document.querySelectorAll('dialog[open]'))d.close();}
const store=()=>createLocalPlannerStore(localStorage,app.userId,today);
function localAvailability(){return store().localAvailability();}
function setLocalAvailability(data){store().setLocalAvailability(data);}
function readPlan(){return store().readPlan();}
function sessions(start){return store().sessions(start);}
function storeSessions(start,items,options){store().storeSessions(start,items,options);}
function getSession(date){return store().getSession(date);}
function weekSessionStats(start){const week=effectivePlanWeek(app.plan,start,weekStartOf(today())).week;const items=sessions(start);
  const loads=new Map(items.map(s=>[s.date,workoutInfo(s,week).load]));
  return {...summarizePlannedLoads([...loads.values()],week?.targetLoad),items,loads};
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
  const generation=app.authGeneration,user=app.userId;
  const {state}=await initializeAvailability(user,parseDate(start));
  if(generation!==app.authGeneration)throw Error('Account gewijzigd.');
  if(!state||typeof state.getEffective!=='function')throw new Error('Kan beschikbaarheid niet ophalen.');
  const overrides=localAvailability();const result={};
  for(const key of weekDates(start)){
    const raw=state.getEffective(key)||{};
    result[key]=normalizePlannerAvailability(raw,Object.hasOwn(overrides,key)?overrides[key]:undefined);
  }
  app.availability.set(start,result);return result;
}
async function getActivitiesRange(start,end,{force=false}={}) {
  const generation=app.authGeneration;
  const cacheKey=`${start}:${end}`;
  if(!force&&app.activityCache.has(cacheKey))return app.activityCache.get(cacheKey);
  const all=[];
  for(const chunk of intervalChunks(start,end,28)){
    const raw=await fetchIntervalsActivities(chunk.oldest,chunk.newest);
    if(generation!==app.authGeneration)throw Error('Account gewijzigd.');
    all.push(...raw.map(normalizeActivity));
  }
  const unique=[...new Map(all.map(a=>[a.id,a])).values()];
  app.activityCache.set(cacheKey,unique);
  return unique;
}

// Only fetch private activity details through the authenticated, user-restricted Edge Function.
// In-memory cache avoids repeated detail calls when regenerating a proposal in one session.
async function fetchActivityDetailForPlanning(id) {
  const generation=app.authGeneration,key=String(id);
  const cached=app.detailCache.get(key);
  if(cached && Date.now()-cached.at<10*60*1000)return cached.activity;
  const {data,error}=await supabase.functions.invoke('intervals-read',{
    body:{action:'get-activity-details',activityId:id}
  });
  if(generation!==app.authGeneration)throw Error('Account gewijzigd.');
  if(error)throw new Error('Ophalen van Intervals.icu-activiteitsdetails mislukt.');
  if(!data?.activity || typeof data.activity!=='object')throw new Error('Geen geldige activiteitsdetails.');
  app.detailCache.set(key,{at:Date.now(),activity:data.activity});
  return data.activity;
}

async function adaptivePolicyForWeek(records,weekStart,todayKey){
  const details=[];
  const unknownDates=[];
  // Do not silently use a partly fetched subset to claim complete intensity coverage.
  const bounded=records.filter(a=>a.date>=weekStart&&a.date<=todayKey);
  if(bounded.length>16){
    return {maxNewQuality:0,blockedQualityDates:weekDates(weekStart),
      remarks:['Meer dan 16 activiteiten deze week: automatische intensieve voorstellen uit voorzorg uitgeschakeld.']};
  }
  for(const record of bounded){
    if(record.id===null || record.id===undefined){unknownDates.push(record.date);continue;}
    try {
      const detail=await fetchActivityDetailForPlanning(record.id);
      // Date is derived from server-returned details, not from the title.
      if(!String(detail.start_date_local||'').startsWith(record.date)){
        unknownDates.push(record.date);
      } else details.push(detail);
    } catch { unknownDates.push(record.date); }
  }
  const report=buildPrivacySafeReport(details,{start:weekStart,end:todayKey});
  return deriveAdaptiveWeekPolicy({reportActivities:report.activities,unknownDates,weekStart,today:todayKey});
}

// DASHBOARD -------------------------------------------------------
async function loadDashboard(){
  if(!app.userId)return;
  const generation=app.authGeneration,view=++app.renderNumber;
  status('l39-dashboard-status','Laden...');
  const start=weekStartOf(today()),dates=weekDates(start);
  const {week,indicative}=effectivePlanWeek(app.plan,start,start);
  try{
    const [available,activities]=await Promise.all([availabilityForWeek(start),getActivitiesRange(dates[0],dates[6],{force:true})]);
    if(generation!==app.authGeneration||view!==app.renderNumber)return;
    $('l39-current-week-label').textContent=`Week ${weekNumber(start)} · ${prettyDate(dates[0])} – ${prettyDate(dates[6])}`;
    $('l39-current-phase').textContent=week?.phase||'Geen fase';
    $('l39-week-target').textContent=week?num(week.targetLoad):'—';
    const finished=activities.filter(a=>a.date<=nowKey());
    const completed=sumKnownLoads(finished.map(a=>({load:a.trainingLoad})));
    const planned=weekSessionStats(start);
    $('l39-week-done').textContent=num(completed.total);
    $('l39-week-planned').textContent=planned.items.length?num(planned.total)+(planned.missing?' + ?':''):'—';
    const pct=week&&completed.missing===0?Math.round(completed.total/week.targetLoad*100):null;
    $('l39-week-percent').textContent=pct===null?'—':`${pct}%`;
    $('l39-progress-fill').style.width=`${Math.min(100,Math.max(0,pct??0))}%`;
    $('l39-week-footnote').textContent=`${finished.length} uitgevoerde activiteiten · ${planned.items.length} geplande trainingen`+
      (completed.missing?` · ${completed.missing} activiteiten zonder load`: '')+
      (!week?' · Stel een weekdoel in via Plan overview.':indicative?' · Weekdoel indicatief overgenomen uit de eerste mesocycleweek.':'');
    const upcoming=$('l39-upcoming');upcoming.replaceChildren();
    app.dashboardRecords=finished;
    const future=dates.filter(d=>d>=nowKey()&&!finished.some(a=>a.date===d&&isCyclingActivity(a)));
    for(const key of future){
      const session=getSession(key);
      const fixed=fixedLabel(available[key]?.workout);
      if(!session&&(!fixed||store().manualRestDates(start).includes(key)))continue;
      const button=htmlNode('button','l39-upcoming-card');button.type='button';button.dataset.action='workout';button.dataset.date=key;
      const dateEl=add(button,'div','l39-upcoming-date');add(dateEl,'strong','',prettyDate(key).split(' ')[0]);add(dateEl,'small','',WEEKDAYS[weekDates(start).indexOf(key)]);
      const content=add(button,'div','l39-upcoming-body');add(content,'strong','',session?(sessionTitle(session)):fixed);
      const info=session?workoutInfo(session,week):{load:null};add(content,'small','',session?`${fmtMinutes(session.durationMinutes)} · ${info.load===null?'load onbekend':num(info.load)+' geschatte TSS'}`:'Vaste activiteit · open om een workout te maken');
      add(button,'span','l39-upcoming-arrow','›');upcoming.appendChild(button);
    }
    if(!upcoming.children.length){const empty=add(upcoming,'p','l39-caption','Er zijn deze week nog geen komende trainingen gepland.');
      const b=add(upcoming,'button','l39-secondary','Open Plan overview');b.type='button';b.dataset.action='go-plan';}
    renderCompletedWorkouts(finished,week);
    $('l39-dashboard-body').hidden=false;
    status('l39-dashboard-status',app.startupIssue,app.startupIssue?'error':'');
    loadWellness(generation);
  }catch(e){if(generation!==app.authGeneration)return;status('l39-dashboard-status',`Dashboard: ${e.message}`,'error');$('l39-dashboard-body').hidden=true;}
}

function renderCompletedWorkouts(activities,week){
  const host=$('l39-completed-workouts');host.replaceChildren();
  for(const a of [...activities].sort((x,y)=>y.date.localeCompare(x.date))){
    const card=add(host,'article','l39-completed-card'),top=add(card,'button','l39-upcoming-card l39-completed-top'),date=add(top,'div','l39-upcoming-date');top.type='button';
    add(date,'strong','',prettyDate(a.date).split(' ')[0]);add(date,'small','',WEEKDAYS[weekDates(weekStartOf(parseDate(a.date))).indexOf(a.date)]);
    const content=add(top,'div','l39-upcoming-body');add(content,'strong','',a.name);add(content,'small','',`${fmtMinutes(a.durationMinutes)} · ${num(a.trainingLoad)} TSS`);
    const done=add(top,'span','l39-upcoming-arrow','›');done.setAttribute('aria-hidden','true');
    const expanded=add(card,'div','l39-completed-expanded');expanded.hidden=true;
    const session=getSession(a.date),rides=activityMatches(session,activities),linked=!!session&&rides.length===1&&rides[0].id===a.id;
    const info=linked?workoutInfo(session,week):null;
    const comparison=add(expanded,'table','l39-evaluation-table'),head=add(comparison,'thead'),tr=add(head,'tr');
    for(const h of ['','Gepland','Uitgevoerd']){const th=add(tr,'th','',h);th.scope='col';}
    const body=add(comparison,'tbody');
    const compare=(label,planned,actual)=>{const r=add(body,'tr');const h=add(r,'th','',label);h.scope='row';add(r,'td','',planned);add(r,'td','',actual);};
    compare('Duur',linked?fmtMinutes(session.durationMinutes):'—',fmtMinutes(a.durationMinutes));
    compare('TSS / Load',info?num(info.load):'—',num(a.trainingLoad));
    const intervalCount=info?.workout?.steps.filter(s=>s.kind==='work').length??0;
    if(intervalCount&&!info?.workout?.test&&['threshold','vo2max','anaerobic','power'].includes(session?.type))compare('Intervallen',String(intervalCount),'Open evaluatie');
    if(!linked)add(expanded,'p','l39-caption',session&&rides.length>1?'Meerdere fietsactiviteiten op deze dag; geen automatische koppeling.':'Geen eenduidig gekoppelde geplande workout.');
    let rating=linked&&(!session.feedbackActivityId||session.feedbackActivityId===a.id)?session.feedback:null;
    const ratingLabel={easy:'Te gemakkelijk',good:'Goed uitvoerbaar',hard:'Te zwaar',neutral:'Niet goed te beoordelen'},ratingLine=add(expanded,'p','l39-caption',rating?'Beoordeling: '+ratingLabel[rating]:'');ratingLine.hidden=!rating;
    const toggle=top;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label',(rating?'Bewerk evaluatie':'Evalueer workout')+' · '+a.name);
    const panel=add(expanded,'div','l39-inline-evaluation');panel.hidden=true;
    toggle.addEventListener('click',async()=>{
      if(!panel.hidden){panel.hidden=true;expanded.hidden=true;toggle.setAttribute('aria-expanded','false');done.textContent='›';return;}
      panel.hidden=false;expanded.hidden=false;toggle.setAttribute('aria-expanded','true');done.textContent='⌃';
      const generation=app.authGeneration,token=app.evaluationToken;panel.replaceChildren();
      if(!linked){add(panel,'p','l39-caption','Geen niveauadvies mogelijk zonder unieke koppeling met een bewaarde workout.');return;}
      add(panel,'p','l39-caption','Uitvoering ophalen…');
      let detail=null,testResult=null;
      if(info?.workout?.test){try{testResult=observedTestResult(session,await fetchSkillHistory(a.date,a.date));}catch{testResult={known:false,values:[],note:'Testgegevens niet beschikbaar. Probeer later opnieuw.'};}}
      else if(['threshold','vo2max','anaerobic','power'].includes(session.type)&&!session.group)try{detail=await fetchActivityDetailForPlanning(a.id);}catch{}
      if(generation!==app.authGeneration||token!==app.evaluationToken||!panel.isConnected||panel.hidden)return;
      const row=evaluateExecution(session,info?.workout,rides,detail);
      panel.replaceChildren();
      if(testResult){add(panel,'strong','','Waargenomen testresultaat');for(const value of testResult.values){const r=add(panel,'div','l39-activity-row');add(r,'span','',value.label);add(r,'strong','',value.value+' '+value.unit);}add(panel,'p','l39-caption',testResult.note);add(panel,'p','l39-caption','Analyseer het vaardigheidsprofiel opnieuw om nieuwe waargenomen vermogensrecords te verwerken.');}
      else if(row.required)add(panel,'p','l39-caption',`Intervallen: ${row.evidence==='unknown'?'onbekend':row.matched+' / '+row.required} · ${row.reason}`);
      else add(panel,'p','l39-caption',session.group?'Groepsrit: TSS is een Z2-schatting; geen niveauadvies.':session.type==='endurance'?'Duurtraining: beoordeling wordt bewaard, geen intervalniveau.':row.reason);
      const form=add(panel,'form','l39-evaluation-form');add(form,'strong','','Hoe heb je de training ervaren?');
      const choices=add(form,'fieldset','l39-evaluation-options');choices.setAttribute('aria-label','Eigen beoordeling');
      const name='evaluation-'+a.id;
      let selected=row.rating||'';
      for(const [value,label] of [['easy','Te gemakkelijk'],['good','Goed uitvoerbaar'],['hard','Te zwaar'],['neutral','Niet goed te beoordelen']]){
        const l=add(choices,'label'),input=add(l,'input');input.type='radio';input.name=name;input.value=value;input.checked=selected===value;input.required=true;l.append(document.createTextNode(' '+label));input.addEventListener('change',()=>{selected=value;updateAdvice();save.disabled=false;});
      }
      const advice=add(form,'div','l39-evaluation-advice');add(advice,'strong','','Trainingsadvies');const message=add(advice,'p','l39-caption');
      const updateAdvice=()=>{message.textContent=(!session.group&&FEEDBACK_TYPES.includes(session.type)&&row.level)?({easy:'Mogelijk toe aan een hoger niveau. Eerdere workouts en herstel worden meegewogen.',good:'Huidig niveau lijkt passend. Progressie hangt af van eerdere workouts en herstel.',hard:'Volgend voorstel kan een lager niveau gebruiken; neem voldoende herstel.',neutral:'Geen verhoging op basis van deze beoordeling.'})[selected]||'Kies je eigen beoordeling.':'Beoordeling bewaren als trainingshistorie; geen automatisch intervalniveau voor dit type.';};updateAdvice();
      const save=add(form,'button','l39-primary','Evaluatie bewaren');save.type='submit';save.disabled=!selected;
      const messageEl=add(form,'p','l39-status');messageEl.setAttribute('role','status');
      form.addEventListener('submit',e=>{e.preventDefault();if(generation!==app.authGeneration||!RATINGS.includes(selected))return;
        const current=getSession(a.date),currentRides=activityMatches(current,app.dashboardRecords);
        if(!current||['type','group','durationMinutes','protocol','level','templateId','prescribedPhase'].some(k=>current[k]!==session[k])||currentRides.length!==1||currentRides[0].id!==a.id){messageEl.textContent='Koppeling is gewijzigd. Vernieuw het dashboard.';return;}
        if(!saveFeedback(a.date,selected,a.id)){messageEl.textContent='Niet bewaard. Probeer opnieuw.';return;}
        rating=selected;session.feedback=selected;session.feedbackActivityId=a.id;ratingLine.hidden=false;ratingLine.textContent='Beoordeling: '+ratingLabel[rating];toggle.setAttribute('aria-label','Bewerk evaluatie · '+a.name);
        messageEl.textContent=info?.workout?.test?'Evaluatie bewaard. FTP is niet gewijzigd.':'Evaluatie bewaard. Volgende trainingsvoorstellen houden rekening met je beoordeling.';done.textContent='⌃';
      });
    });
  }
  if(!host.children.length)add(host,'p','l39-caption','Nog geen uitgevoerde trainingen deze week.');
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
    if(stat.items.length)add(summary,'small','',`Workouts: ${num(stat.total)} TSS${stat.missing?' + '+stat.missing+' onbekend':''}`);
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
        add(b,'b','',sessionTitle(session));
        const info=workoutInfo(session,phase);add(b,'span','',`${fmtMinutes(session.durationMinutes)} · ${info.load===null?'TSS —':num(info.load)+' TSS'}`);
      }else if(day>=nowKey()){
        const b=add(dateCell,'button','l39-cal-empty','+ Plan');b.type='button';b.dataset.action='workout';b.dataset.date=day;
      }
    }
    section.append(band,line);host.appendChild(section);
  }
  renderMobileCalendar(rows,activities,currentMonth,failed);
}


// Compact calendar is a second presentation of the same saved sessions and actual loads.
function renderMobileCalendar(rows,activities,currentMonth,failed=false){
  const host=$('l39-mobile-calendar');host.replaceChildren();
  const days=rows.flatMap(r=>r.days),currentDays=days.filter(d=>parseDate(d).getMonth()===currentMonth);
  if(!currentDays.includes(app.selectedCalendarDate))app.selectedCalendarDate=currentDays.includes(nowKey())?nowKey():currentDays[0];
  const byDate=new Map();for(const a of activities){if(!byDate.has(a.date))byDate.set(a.date,[]);byDate.get(a.date).push(a);}
  const grid=add(host,'div','l39-mobile-month');
  for(const label of WEEKDAYS)add(grid,'span','l39-mobile-weekday',label);
  const details=htmlNode('section','l39-mobile-details');
  function select(date){
    app.selectedCalendarDate=date;for(const b of grid.querySelectorAll('button')){const selected=b.dataset.date===date;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
    details.replaceChildren();const row=rows.find(r=>r.days.includes(date));if(!row)return;
    const {week,indicative}=effectivePlanWeek(app.plan,row.start,weekStartOf(today())),stat=weekSessionStats(row.start);
    const done=sumKnownLoads(activities.filter(a=>a.date>=row.start&&a.date<=row.end).map(a=>({load:a.trainingLoad})));
    add(details,'h3','',`Week ${row.number}`);
    const stats=add(details,'div','l39-mobile-week-stats');
    for(const [label,value,cls] of [['Uitgevoerde workouts',failed?'—':num(done.total)+(done.missing?' + ?':''),'done'],['Geplande workouts',stat.items.length?num(stat.total)+(stat.missing?' + ?':''):'—','planned'],['Weekdoel',week?num(week.targetLoad):'—','goal']]){
      const cell=add(stats,'div',cls);add(cell,'small','',label);add(cell,'strong','',value);add(cell,'small','','TSS');
    }
    if(indicative)add(details,'p','l39-caption','Weekdoel indicatief.');
    if(failed)add(details,'p','l39-caption','Uitgevoerde workouts niet beschikbaar.');
    add(details,'h3','',prettyDate(date));
    for(const a of byDate.get(date)||[]){
      const b=add(details,'button','l39-activity-chip');b.type='button';b.dataset.action='completed';b.dataset.date=date;b.dataset.activityId=a.id;
      add(b,'b','',a.name);add(b,'span','',`${fmtMinutes(a.durationMinutes)} · ${a.trainingLoad??'—'} TSS · Uitgevoerd`);
    }
    const s=getSession(date);
    if(s){const b=add(details,'button','l39-planned-chip');b.type='button';b.dataset.action='workout';b.dataset.date=date;const info=workoutInfo(s,week);add(b,'b','',sessionTitle(s));add(b,'span','',`${fmtMinutes(s.durationMinutes)} · ${info.load===null?'—':num(info.load)} TSS · Gepland`);if(date<nowKey())b.disabled=true;}
    else if(!(byDate.get(date)||[]).length)add(details,'p','l39-caption','Geen geplande of uitgevoerde workouts.');
    if(!s&&date>=nowKey()){const b=add(details,'button','l39-secondary','+ Plan');b.type='button';b.dataset.action='workout';b.dataset.date=date;}
  }
  for(const date of days){
    const d=parseDate(date),b=add(grid,'button','l39-mobile-day');b.type='button';b.dataset.date=date;
    if(d.getMonth()!==currentMonth)b.classList.add('outside');if(date===nowKey())b.classList.add('today');
    add(b,'span','l39-mobile-date',d.getDate());const dots=add(b,'span','l39-mobile-dots');
    const done=(byDate.get(date)||[]).length,planned=!!getSession(date);
    if(done)add(dots,'i','l39-mobile-dot done');if(planned)add(dots,'i','l39-mobile-dot planned');
    b.setAttribute('aria-label',`${date}${done?', uitgevoerd':''}${planned?', gepland':''}`);b.addEventListener('click',()=>select(date));
  }
  const legend=add(host,'div','l39-mobile-legend');for(const [label,cls] of [['Uitgevoerde workouts','done'],['Geplande workouts','planned']]){const item=add(legend,'span');add(item,'i','l39-mobile-dot '+cls);item.append(document.createTextNode(' '+label));}
  host.append(details);select(app.selectedCalendarDate);
}

// PLAN OVERVIEW ---------------------------------------------------
function fillPlanForm(plan){
  if(!plan){$('l39-plan-form').reset();$('l39-plan-start').value=weekStartOf(today());$('l39-discipline').value='xco';$('l39-limiter').value='auto';return;}
  $('l39-plan-name').value=plan.name||'Mijn trainingsplan';$('l39-plan-start').value=plan.start;
  $('l39-plan-race').value=plan.raceDate||'';$('l39-discipline').value=normalizeDiscipline(plan.discipline);$('l39-plan-weeks').value=plan.weeks.length;
  $('l39-plan-base').value=plan.baseLoad;$('l39-plan-growth').value=plan.progression;
  $('l39-plan-reduction').value=plan.recoveryReduction;$('l39-plan-recovery-every').value=plan.recoveryEvery;
  $('l39-plan-plateau').value=plan.plateau;$('l39-limiter').value=normalizeLimiter(plan.limiter);
}
function openPlanDialog(mode){
 if(!app.userId||app.proposing)return;
 const existing=app.plan;
 app.planEditor={mode,profile:existing?.skillProfile??null};
 fillPlanForm(mode==='edit'?existing:null);
 $('l39-plan-dialog-title').textContent=mode==='edit'?'Bewerk trainingsplan':'Generate new training plan';
 $('l39-plan-dialog').querySelector('button[type=submit]').textContent=mode==='edit'?'Wijzigingen toepassen':'Genereer concept';
 $('l39-analyze-limiters').disabled=false;
 for(const b of $('l39-plan-dialog').querySelectorAll('.l39-info')){b.setAttribute('aria-expanded','false');$(b.getAttribute('aria-controls')).hidden=true;}
 status('l39-plan-modal-status','');renderSkillPanel();$('l39-plan-dialog').showModal();$('l39-plan-dialog').scrollTop=0;
}
function renderSkillPanel(){
  const host=$('l39-skill-priorities');host.replaceChildren();
  const source=app.planEditor?app.planEditor.profile:app.plan?.skillProfile;
  const profile=source?.version===1?source:null;
  const legend=add(host,'div','l39-skill-legend');add(legend,'span','goal','Doelprofiel');if(profile)add(legend,'span','current','Huidig profiel');
  for(const p of disciplineTargets($('l39-discipline').value)){
    const row=add(host,'div','l39-skill-pair');add(row,'strong','',p.label);
    const bar=(value,kind,label)=>{const line=add(row,'div','l39-skill-bar-row '+kind);const track=add(line,'div','l39-skill-segments');track.setAttribute('role','meter');track.setAttribute('aria-label',label);track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','5');track.setAttribute('aria-valuenow',String(value??0));if(value==null){track.removeAttribute('aria-valuenow');track.setAttribute('aria-valuetext','Onvoldoende data');}for(let i=1;i<=5;i++)add(track,'span',value!=null&&i<=value?'filled':'');add(line,'span','',value==null?'—':value+'/5');};
    bar(p.target,'goal',p.label+' doel');
    if(profile){const m=profile.metrics?.[p.skill];bar(skillLevel(m?.score),'current',p.label+' huidig');add(row,'small','l39-caption',describeMetric(m));}
  }
  $('l39-limiter-status').textContent=profile?'Analyse '+profile.asOf+' · '+profile.activityCount+' fietsactiviteiten · actuele 90 dagen t.o.v. persoonlijke 365 dagen. Groen: disciplineprioriteit. Blauw: persoonlijk prestatieniveau (1–5); geen bewezen fysiologisch tekort.':'Analyseer het huidige profiel; zonder gegevens tonen we geen actuele score.';
}
function updateSkillFocus(){renderSkillPanel();}
async function analyzeLimiterHistory(){
  if(!app.userId||!app.planEditor)return;
  const editor=app.planEditor,generation=app.authGeneration,button=$('l39-analyze-limiters');button.disabled=true;
  $('l39-limiter-status').textContent='Prestatiegegevens ophalen…';
  try{
    const end=nowKey(),start=dateKey(addDays(today(),-364));
    const records=await fetchSkillHistory(start,end);
    if(generation!==app.authGeneration||editor!==app.planEditor)return;
    editor.profile=buildSkillProfile(records,end);
    renderSkillPanel();status('l39-plan-modal-status','Vaardigheidsprofiel bijgewerkt. Pas de wijzigingen toe om het profiel mee te nemen.','good');
  }catch(e){if(generation===app.authGeneration&&editor===app.planEditor)$('l39-limiter-status').textContent='Analyse niet beschikbaar: '+e.message;}
  finally{if(generation===app.authGeneration&&editor===app.planEditor)button.disabled=false;}
}
function renderTimeline(){
  const host=$('l39-timeline');host.replaceChildren();renderSkillPanel();renderFeedbackPanel();
  $('l39-edit-plan').hidden=!app.plan;$('l39-plan-draft-actions').hidden=!app.planDirty;
  $('l39-active-plan-name').textContent=app.plan?.name||'Geen trainingsplan';
  const current=app.plan?.weeks?.find(w=>w.start===weekStartOf(today()));
  $('l39-active-plan-meta').textContent=app.plan?({xco:'MTB XCO',road:'Wegwielrennen',gravel:'Gravel'}[normalizeDiscipline(app.plan.discipline)]+' · '+app.plan.weeks.length+' weken'+(current?' · Week '+current.week+' van '+app.plan.weeks.length:'')+(app.planDirty?' · Concept':'')):'';
  if(!app.plan){add(host,'p','l39-caption','Nog geen trainingsplan. Kies Generate new training plan om te beginnen.');$('l39-timeline-summary').textContent='Nog geen plan';return;}
  const weeks=app.plan.weeks;const max=Math.max(1,...weeks.map(w=>w.targetLoad));
  $('l39-timeline-summary').textContent=`${weeks.length} weken · ${prettyDate(weeks[0].start)} – ${prettyDate(weeks.at(-1).end)}`;
  for(const w of weeks){
    const button=add(host,'button','l39-timeline-week');button.type='button';button.dataset.action='focus-week';button.dataset.week=w.start;
    if(app.focusedWeek===w.start)button.classList.add('selected');
    add(button,'strong','',num(w.targetLoad));
    const wrap=add(button,'div','l39-timeline-barwrap');const bar=add(wrap,'div',`l39-timeline-bar ${w.phase.toLowerCase()}`);
    bar.style.setProperty('--bar-height',`${Math.max(7,w.targetLoad/max*100)}%`);
    add(button,'small','',`W${w.week}`);add(button,'small','',w.phase==='Recovery'?'Herstel':'N'+progressionLevel(app.plan,w));button.title=`${w.phase} • week ${weekNumber(w.start)} • ${w.targetLoad} load • ${w.phase==='Recovery'?'herstel':'niveau '+progressionLevel(app.plan,w)}`;
  }
}
async function loadPlan(){if(!app.userId)return;renderTimeline();if(app.startupIssue)status('l39-plan-status',app.startupIssue,'error');await renderTwoWeeks()}
function renderFeedbackPanel(){
  const host=$('l39-feedback-list');host.replaceChildren();
  const {week}=effectivePlanWeek(app.plan,weekWindowStart(),weekStartOf(today()));
  const planned=progressionLevel(app.plan,week);
  $('l39-feedback-status').textContent=app.feedbackStatus||'Analyseer de laatste 28 dagen. Alleen eerdere bewaarde interval-/techniektrainingen worden vergeleken.';
  if(!app.feedbackRows.length)return;
  const summary=add(host,'div','feedback-summary');
  for(const type of FEEDBACK_TYPES){
    const latest=app.feedbackRows.find(r=>r.type===type&&r.completed&&r.level);const advice=recommendLevel(type,planned,app.feedbackRows,nowKey(),latest?.templateId??null);
    const row=add(summary,'div','feedback-advice');add(row,'strong','',templateTitle(latest)||typeLabel(type));add(row,'span','','N'+advice.level+' · '+({start:'start',hold:'handhaven',increase:'verhogen',reduce:'verlagen'})[advice.decision]);add(row,'small','',advice.reason);
  }
  const list=add(host,'div','feedback-history');
  for(const entry of app.feedbackRows){
    const row=add(list,'div','feedback-history-row'),left=add(row,'div');
    add(left,'strong','',prettyDate(entry.date)+' · '+(templateTitle(entry)||typeLabel(entry.type))+(entry.level?' · N'+entry.level:' · standaard'));
    add(left,'small','',entry.required?entry.matched+'/'+entry.required+' intervallen · '+entry.reason:entry.reason);
    const label=add(row,'label','','Eigen beoordeling');const select=add(label,'select');select.setAttribute('aria-label','Beoordeling '+entry.date);
    for(const [value,name] of [['','Niet beoordeeld'],['easy','Te gemakkelijk'],['good','Goed uitvoerbaar'],['hard','Te zwaar / onvoldoende hersteld'],['neutral','Niet goed te beoordelen']]){const o=add(select,'option','',name);o.value=value;}
    select.value=entry.rating||'';
    select.disabled=entry.completed!==true;select.addEventListener('change',()=>saveFeedback(entry.date,select.value,entry.activityId));
  }
}
async function refreshWorkoutFeedback({activities=null}={}){
  const generation=app.authGeneration;
  if(!app.userId)throw Error('Niet ingelogd.');
  const end=nowKey(),start=dateKey(addDays(today(),-28));
  const weeks=[];for(let d=monday(parseDate(start));dateKey(d)<=end;d=addDays(d,7))weeks.push(sessions(dateKey(d)));
  const recent=selectRecentSessions(weeks,start,end);
  const records=activities??await getActivitiesRange(start,end,{force:true});
  if(generation!==app.authGeneration)throw Error('Account gewijzigd.');
  const cycling=records.filter(a=>isCyclingActivity(a)&&a.date>=start&&a.date<=end);
  const rows=[];
  for(const s of recent){
    const rides=activityMatches(s,cycling);if(s.date===end&&!rides.length)continue;
    let detail=null;
    if(rides.length===1&&['threshold','vo2max','anaerobic','power'].includes(s.type))try{detail=await fetchActivityDetailForPlanning(rides[0].id);}catch{}
    if(generation!==app.authGeneration)throw Error('Account gewijzigd.');
    const w=weekFor(app.plan,weekStartOf(parseDate(s.date)));
    rows.push(evaluateExecution(s,workoutInfo(s,w).workout,rides,detail));
  }
  app.feedbackRows=rows;
  app.feedbackStatus=rows.length?rows.length+' eerdere trainingen vergeleken. Advies blijft afhankelijk van eigen herstelbeoordeling.':'Geen bewaarde vergelijkbare trainingen uit de afgelopen 28 dagen.';
  renderFeedbackPanel();
  return rows;
}
async function analyzeWorkoutFeedback(){
  if(app.feedbackBusy||!app.userId)return;
  const gen=app.authGeneration;app.feedbackBusy=true;const button=$('l39-analyze-feedback');button.disabled=true;status('l39-feedback-status','Trainingshistorie ophalen…');
  try{await refreshWorkoutFeedback();}catch(e){if(gen===app.authGeneration){app.feedbackRows=[];app.feedbackStatus='Analyse niet beschikbaar: '+e.message;renderFeedbackPanel();}}
  finally{if(gen===app.authGeneration){app.feedbackBusy=false;button.disabled=false;}}
}
function saveFeedback(date,value,activityId=null){
  if(!app.userId||app.proposing||date>nowKey()||date===nowKey()&&!activityId||!['',...RATINGS].includes(value))return false;
  const start=weekStartOf(parseDate(date)),items=sessions(start),session=items.find(s=>s.date===date);
  if(!session)return false;
  if(value){session.feedback=value;if(activityId)session.feedbackActivityId=String(activityId);}else{delete session.feedback;delete session.feedbackActivityId;}
  storeSessions(start,items);
  const entry=app.feedbackRows.find(r=>r.date===date);if(entry)entry.rating=value||null;
  renderFeedbackPanel();syncPlanner({automatic:true});return true;
}
function weekWindowStart(){return app.focusedWeek||weekStartOf(today());}
// Read only. Seed from yesterday, not today's possibly partially completed
// or planned Intervals state. Use all actual activity load today, once.
async function fitnessContext(){
 const now=nowKey(),yesterday=dateKey(addDays(today(),-1));
 const [rows,records]=await Promise.all([fetchIntervalsWellness(yesterday,yesterday),getActivitiesRange(now,now,{force:true})]);
 const anchor=selectFitnessAnchor(rows,now),actual=actualLoads(records,now);
 return anchor&&actual?{anchor,actual}:null;
}
function forecastPlanned(context,before,prepared=[]){
 if(!context)return null;
 const now=nowKey(),first=weekStartOf(today()),start=parseDate(first),end=parseDate(before);
 if((end-start)/86400000>56)return null;
 const rows=[];
 for(let d=start;d<end;d=addDays(d,7)){
  const key=dateKey(d),week=effectivePlanWeek(app.plan,key,first).week;
  const source=prepared.find(p=>p.start===key)?.merged??sessions(key);
  for(const s of source)if(s.date>=now&&s.date<before)rows.push({date:s.date,load:workoutInfo(s,week).load});
 }
 return rows;
}
async function showFitnessForecast(start,end,generation,view){
 const host=$('l39-fitness-forecast');renderFitnessForecast(host,null,{message:'Fitnessgegevens ophalen…'});
 try{
  const context=await fitnessContext();
  if(generation!==app.authGeneration||view!==app.renderNumber)return;
  if(!context){renderFitnessForecast(host,null);return;}
  const before=dateKey(addDays(parseDate(end),7)),planned=forecastPlanned(context,before);
  const points=planned?forecastFitness({...context,planned,end:weekDates(end)[6]}):null;
  renderFitnessForecast(host,points);
 }catch{if(generation===app.authGeneration&&view===app.renderNumber)renderFitnessForecast(host,null);}
}
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
    void showFitnessForecast(start,next,generation,view);
    const local=Object.keys(localAvailability()).length;
    $('l39-availability-hint').textContent=local?`${local} dagaanpassingen staan alleen lokaal in deze browser en zijn niet bevestigd in Supabase.`:
      'Beschikbare uren komen uit de bestaande planner. Je trainingsvoorstellen worden lokaal als concept bewaard.';
  }catch(e){if(generation===app.authGeneration){host.replaceChildren();add(host,'p','l39-status',`Beschikbaarheid kon niet worden geladen: ${e.message}`);}}
}
function renderWeekCard(host,start,availability){
  const keys=weekDates(start),{week:planWeek,indicative}=effectivePlanWeek(app.plan,start,weekStartOf(today())),info=weekSessionStats(start),container=add(host,'section','l39-week-card');
  const head=add(container,'div','l39-week-card-head');
  const title=add(head,'div');
  add(title,'h3','',`Week ${weekNumber(start)} · ${prettyDate(keys[0])} – ${prettyDate(keys[6])}`);
  add(title,'small','',`${planWeek?.phase??'Geen fase'} · ${planWeek?num(planWeek.targetLoad)+(indicative?' load indicatief':' load gepland'):'Nog geen weekdoel'}`);
  const days=add(container,'div','l39-week-days');
  for(const [i,key] of keys.entries()){
    const day=add(days,'div','l39-week-day');if(key===nowKey())day.classList.add('today');if(key<nowKey())day.classList.add('past');
    day.tabIndex=0;day.setAttribute('aria-label',`${WEEKDAYS[i]} ${prettyDate(key)}: bewerk beschikbaarheid van deze week`);day.title='Bewerk beschikbaarheid van deze week';
    day.addEventListener('click',e=>{if(!e.target.closest('button'))openAvailability(start)});
    day.addEventListener('keydown',e=>{if(e.target===day&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openAvailability(start)}});
    add(day,'strong','',WEEKDAYS[i].slice(0,2));add(day,'span','date',prettyDate(key));
    const mins=availability[key]?.available_minutes;
    add(day,'span','minutes',mins===null?'—':fmtMinutes(mins));
    add(day,'span','capacity','beschikbaar');
    const session=getSession(key),manualRest=store().manualRestDates(start).includes(key);const button=add(day,'button',`l39-session-button${session?'':' rest'}`,
      session?(sessionTitle(session)):
        (manualRest?'Rust':availability[key]?.workout?fixedLabel(availability[key].workout):key<nowKey()?'—':'+ Training'));
    button.type='button';button.dataset.action='workout';button.dataset.date=key;
    if(session){
      const load=info.loads.get(key);
      add(button,'span','l39-session-load',`${fmtMinutes(session.durationMinutes)} · ${load==null?'TSS onbekend':num(load)+' TSS'}`);
    }
    if(key<nowKey())button.disabled=true;
  }
  const foot=add(container,'div','l39-week-footer');
  add(foot,'span','',`Beschikbaar: ${fmtMinutes(keys.reduce((s,k)=>s+(availability[k]?.available_minutes??0),0))}`);
  const totals=add(foot,'div','l39-week-load-summary');
  add(totals,'strong','',`Workouts: ${num(info.total)} TSS${info.missing?' + '+info.missing+' onbekend':''}`);
  if(info.delta!==null)add(totals,'small','',`${info.delta>0?'Nog '+num(info.delta):info.delta<0?num(-info.delta)+' boven doel':'Doel bereikt'}${info.delta!==0?' TSS':''} · alleen geplande TSS${info.missing?' (excl. onbekend)':''}`);
  if(!info.items.length)add(totals,'small','','Nog geen workouts gepland');
}
async function proposeWeek(){
  if(!app.userId || app.proposing || app.feedbackBusy || app.savingWorkout)return;
  const generation=app.authGeneration;
  if(!app.plan){
    status('l39-plan-status','Genereer eerst een mesocycle.','error');
    return;
  }
  app.proposing=true;
  const button=$('l39-propose');button.disabled=true;
  try{
    if(app.planDirty){if(!window.confirm('Huidige mesocycle opslaan voordat je workouts genereert?'))return;savePlan();}
    const start=weekWindowStart();
    const second=dateKey(addDays(parseDate(start),7));
    const starts=[start,second];
    const prepared=[];
    const warnings=[];
    const now=nowKey();
    const currentWeek=weekStartOf(today());
    const activePlan=app.plan;
    let feedback=[];
    try{feedback=await refreshWorkoutFeedback();}catch(e){app.feedbackRows=[];app.feedbackStatus='Historie niet beschikbaar: '+e.message;renderFeedbackPanel();warnings.push('Geen actuele workoutfeedback; nieuwe niveaus blijven op N1.');}
    if(generation!==app.authGeneration||activePlan!==app.plan)return;
    let fitness=null;
    try{fitness=await fitnessContext();}catch{}
    if(generation!==app.authGeneration||activePlan!==app.plan)return;
    if(!fitness)warnings.push('Geen betrouwbare actuele Fitness/Fatigue-gegevens; mesocycle en bestaande herstelregels blijven leidend.');

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
      const availability=await availabilityForWeek(weekStart,{force:true});
      const usable=proposalAvailability(availability,weekStart,now);
      if(app.plan.raceDate){for(const day of Object.keys(usable))if(day>=app.plan.raceDate)usable[day].available_minutes=0;}
      let remainingTarget=week.targetLoad;
      let completedLoad=0;
      let occupiedDates=[];
      let stimulus=null;
      let groupOnly=false;

      if(weekStart===currentWeek){
        // Een reeds voltooide training telt mee voor het weekdoel.
        // Ophalen met force om een eerder geladen browsercache niet
        // onbedoeld als nieuwe stand van de week te beschouwen.
        const records=await getActivitiesRange(weekStart,now,{force:true});
        if(fitness){fitness.actual=actualLoads(records,now);if(!fitness.actual)fitness=null;}
        const progress=remainingWeekLoad(week.targetLoad,records,weekStart,now);
        completedLoad=progress.completedLoad;
        occupiedDates=progress.occupiedDates;
        stimulus=await adaptivePolicyForWeek(records,weekStart,now);
        for(const remark of stimulus.remarks){
          warnings.push(`Week ${weekNumber(weekStart)}: ${remark}`);
        }
        if(progress.missingLoadCount){
          warnings.push(`Week ${weekNumber(weekStart)}: ${progress.missingLoadCount} uitgevoerde activiteit(en) zonder trainingsload. Restdoel onbekend; alleen vaste groepsritten worden voorgesteld.`);
          groupOnly=true;
        }
        remainingTarget=progress.remainingLoad??0;
        if(progress.targetReached){
          warnings.push(`Week ${weekNumber(weekStart)}: het weekdoel is met ${completedLoad} load al bereikt. Alleen vaste groepsritten worden behouden.`);
          groupOnly=true;
        }
        // Bescherm dagen waarop deze week al een training is uitgevoerd.
        for(const day of occupiedDates){
          if(usable[day])usable[day].available_minutes=0;
        }
      }

      const existing=sessions(weekStart);
      const reserved=existing.filter(s=>s.manual===true&&s.date>=now&&!occupiedDates.includes(s.date));
      const restDates=store().manualRestDates(weekStart).filter(d=>d>=now);
      const reservedDates=new Set([...reserved.map(s=>s.date),...restDates]);
      for(const day of reservedDates)if(usable[day])usable[day].available_minutes=0;
      const groups=fixedGroupDates(availability,weekDates(weekStart)).filter(d=>usable[d]?.available_minutes>=15);
      if(reservedDates.size)warnings.push(`Week ${weekNumber(weekStart)}: ${reservedDates.size} handmatig aangepaste dag(en) behouden.`);
      if(!reservedDates.size&&!groups.length&&!Object.values(usable).some(v=>v.available_minutes>=15)&&!groupOnly){
        warnings.push(`Week ${weekNumber(weekStart)} heeft geen resterende beschikbare momenten van minstens 15 minuten.`);
        continue;
      }
      // Combineer mesocyclefase en werkelijk uitgevoerde trainingsprikkels.
      // De strengste begrenzing wint; wijzig het opgeslagen weekdoel niet.
      const phasePolicy=derivePhaseWorkoutPolicy({week,adaptivePolicy:stimulus});
      warnings.push(`Week ${weekNumber(weekStart)}: ${phasePolicy.remarks.join(' ')}`);
      const seen=[];
      if(stimulus?.classes?.some(c=>c.indicators.includes('repeated-vo2-like-intervals-observed')))seen.push('vo2max');
      if(stimulus?.classes?.some(c=>c.indicators.includes('repeated-threshold-like-intervals-observed')))seen.push('threshold');
      const plannedLevel=progressionLevel(app.plan,week);
      const levels=Object.fromEntries(FEEDBACK_TYPES.map(type=>[type,recommendLevel(type,plannedLevel,feedback,now)]));
      const levelFor=type=>levels[type]?.level??1;
      const dates=weekDates(weekStart);
      const prevStart=dateKey(addDays(parseDate(weekStart),-7)),nextStart=dateKey(addDays(parseDate(weekStart),7));
      const prev=prepared.find(item=>item.start===prevStart)?.merged??sessions(prevStart);
      const next=sessions(nextStart);
      const boundary=boundaryBlocks({dates,previous:prev,next});
      const estimates=new Map(),phaseIndex=app.plan.weeks.filter(w=>w.phase===week.phase&&w.start<week.start).length,discipline=normalizeDiscipline(app.plan.discipline),priorities=Object.fromEntries(disciplineTargets(discipline).map(x=>[x.skill,x.target]));
      const templateLevel=t=>FEEDBACK_TYPES.includes(t.type)?recommendLevel(t.type,plannedLevel,feedback,now,t.id).level:1;
      const candidateCache=new Map();
      const candidates=(type,durationMinutes,date)=>{const k=type+':'+durationMinutes+':'+date;if(!candidateCache.has(k)){const rows=libraryCandidates({type,phase:week.phase,discipline,priorities,weekIndex:phaseIndex,recent:feedback,levelFor:templateLevel,durationMinutes,date});candidateCache.set(k,rows);}return candidateCache.get(k);};
      const exactLoad=s=>{const k=[s.type,s.durationMinutes,s.protocol,s.templateId,s.level,s.prescribedPhase,s.group].join(':');if(!estimates.has(k))estimates.set(k,workoutInfo(s,week).load??NaN);return estimates.get(k);};
      const prior=forecastPlanned(fitness,weekStart,prepared);
      let fatigueRejected=0;
      const asLoad=s=>({date:s.date,load:exactLoad(s),quality:isQuality(s),recovery:getTemplate(s.templateId)?.category==='recovery'});
      const allowCandidate=fitness&&prior?(s,existing)=>{const ok=fitnessCandidateAllowed({...fitness,prior,existing:existing.map(asLoad),candidate:asLoad(s),end:dates[6]});if(!ok)fatigueRejected++;return ok;}:null;
      const result=proposeSkillWeek({dates:weekDates(weekStart),availability:usable,target:groupOnly?0:remainingTarget,
        maxQuality:groupOnly?0:phasePolicy.maxQualitySessions,blocked:[...new Set([...phasePolicy.blockedQualityDates,...boundary])],
        qualityTypes:disciplineQualityOrder(app.plan.discipline,week.phase,app.plan.limiter,seen,app.plan.weeks.filter(w=>w.phase===week.phase&&w.start<week.start).length),phase:week.phase,preferLong:aerobicFocus(app.plan.discipline,week.phase,app.plan.limiter),
        sessionCandidates:candidates,sessionLoad:exactLoad,allowCandidate,
        fixed:groups,reserved,restDates,reservedLoadFor:s=>workoutInfo(s,week).load??NaN,groupLoadFor:durationMinutes=>workoutInfo({type:'endurance',group:true,durationMinutes},week).load??NaN,
        loadFor:(type,durationMinutes)=>{const k=type+':'+durationMinutes;if(!estimates.has(k))estimates.set(k,workoutInfo(candidateSession(type,durationMinutes,levelFor(type),week.phase),week).load??NaN);return estimates.get(k);}
      });
      const projection=fitness&&prior?forecastFitness({...fitness,planned:[...prior,...result.sessions.map(asLoad)],end:dates[6]}):null;
      if(fatigueRejected)warnings.push(`Week ${weekNumber(weekStart)}: Fitness/Fatigue-prognose beperkt intensiteit of extra TSS (${fatigueRejected} kandidaatkeuzes niet passend).`);
      if(projection?.some(p=>p.date>=weekStart&&p.tsb<-30))warnings.push(`Week ${weekNumber(weekStart)}: voorspelde Form onder −30 ondanks behoud van vaste/handmatige trainingen; beoordeel herstel en pas deze zo nodig aan.`);
      const budget=groupOnly?0:remainingTarget,shortfall=Math.max(0,budget-result.estimatedKnownLoad);
      const freeDates=weekDates(weekStart).filter(d=>!result.sessions.some(s=>s.date===d)&&usable[d]?.available_minutes>=15);
      if(result.unknownFixed)warnings.push(`Week ${weekNumber(weekStart)}: een vaste of handmatige workout heeft geen geldige TSS-schatting; geen aanvullende trainingen voorgesteld.`);
      if(!result.unknownFixed&&shortfall>=1)warnings.push(`Week ${weekNumber(weekStart)}: voorstel ${num(result.estimatedKnownLoad)} / ${num(budget)} TSS (nog ${num(shortfall)} binnen het voorstelbudget). ${freeDates.length?'Geen extra passende sessie binnen beschikbaarheid, resterend TSS-budget en herstelregels.':'Geen extra beschikbare dagen.'}`);
      if(!result.unknownFixed&&budget<week.targetLoad-completedLoad&&weekStart!==currentWeek)warnings.push(`Week ${weekNumber(weekStart)}: effectief automatisch voorstelbudget ${num(budget)} TSS; mesocycledoel ${num(week.targetLoad)} TSS.`);
      if(result.estimatedKnownLoad>(groupOnly?0:remainingTarget)+.01)warnings.push(`Week ${weekNumber(weekStart)}: vaste/handmatige workouts overschrijden het resterende automatische TSS-budget; ze blijven behouden.`);
      if(groups.length)warnings.push('Groepsrit meegerekend als Z2-schatting; herstel conservatief behandeld.');
      const suggestions=result.sessions
        .filter(s=>s.date>=now && !occupiedDates.includes(s.date))
         .map(s=>s.manual===true||s.protocol==='library'?s:({date:s.date,...candidateSession(s.type,s.durationMinutes,levelFor(s.type),week.phase),group:!!s.group}));
      if(!suggestions.length&&!groupOnly&&!reservedDates.size)warnings.push(`Week ${weekNumber(weekStart)}: geen passende trainingen mogelijk; oude automatische toekomstige workouts worden bij bevestiging verwijderd.`);
      const preservedToday=existing.filter(s=>s.date===now && occupiedDates.includes(s.date));
      prepared.push({start:weekStart,suggestions,existing,
        // Behoud reeds uitgevoerde dagen, inclusief vandaag.
        merged:[...mergeFutureSessions(existing,suggestions,now),...preservedToday]
          .sort((a,b)=>a.date.localeCompare(b.date)),
        completedLoad,remainingTarget,budget,estimatedLoad:result.estimatedKnownLoad,originalTarget:week.targetLoad,projection,fatigueRejected,levels});
    }
    if(!prepared.length){
      status('l39-plan-status',warnings.join(' ')||'Geen resterende trainingsmomenten beschikbaar.','error');
      return;
    }
    if(generation!==app.authGeneration||activePlan!==app.plan)return;
    const replacing=prepared.filter(item=>item.existing.some(s=>s.date>=now&&s.manual!==true));
    const preview=prepared.map(item=>`Week ${weekNumber(item.start)}: mesocycledoel ${num(item.originalTarget)} TSS · automatisch restbudget ${num(item.budget)} TSS · voorstel ${num(item.estimatedLoad)} TSS${item.projection?' · Form min. '+Math.min(...item.projection.filter(p=>p.date>=item.start).map(p=>p.tsb)).toFixed(1):''}\n`+(item.suggestions.length?item.suggestions.map(s=>`${s.date}: ${sessionTitle(s)} · ${s.durationMinutes} min${s.level?' · niveau '+s.level+' ('+(s.manual?'handmatig behouden':item.levels[s.type]?.reason||'standaard')+')':''}`).join('\n'):'Geen aanvullende trainingen')).join('\n\n');
    if(!window.confirm(`${preview}\n\n${warnings.filter(w=>/Fitness\/Fatigue|voorspelde Form/.test(w)).join('\n')}\n${replacing.length?'Bestaande automatische toekomstige trainingen worden vervangen. Handmatige wijzigingen blijven behouden. ':''}Voorstel bevestigen?`))return;
    if(generation!==app.authGeneration||activePlan!==app.plan)return;
    for(const item of prepared)storeSessions(item.start,item.merged);
    syncPlanner({automatic:true});
    const count=prepared.reduce((sum,item)=>sum+item.suggestions.length,0);
    const current=prepared.find(item=>item.start===currentWeek);
    const detail=prepared.map(item=>` Week ${weekNumber(item.start)}: ${num(item.estimatedLoad)} TSS voorgesteld, ${num(item.budget)} TSS automatisch restbudget, ${num(item.originalTarget)} TSS mesocycledoel${item.completedLoad?' ('+num(item.completedLoad)+' load uitgevoerd)':''}.`).join('');
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
  if(!app.planEditor||!app.userId||app.proposing)return;
  try{
    const data={name:$('l39-plan-name').value,start:$('l39-plan-start').value,weeks:$('l39-plan-weeks').value,
      baseLoad:$('l39-plan-base').value,progression:$('l39-plan-growth').value,
      recoveryReduction:$('l39-plan-reduction').value,recoveryEvery:$('l39-plan-recovery-every').value,
      plateau:$('l39-plan-plateau').value,raceDate:$('l39-plan-race').value,discipline:$('l39-discipline').value};
    if(data.raceDate)data.weeks=raceWeekCount(data.start,data.raceDate);
    if(Number(data.weeks)<8||Number(data.weeks)>24)throw Error('Kies 8–24 weken.');
    const previous=app.plan;
    const sameTargets=app.planEditor.mode==='edit'&&previous&&['name','start','raceDate','baseLoad','progression','recoveryReduction','recoveryEvery','plateau'].every(k=>String(data[k]??'')===String(previous[k]??''))&&Number(data.weeks)===previous.weeks.length;
    const next=sameTargets?{...previous,weeks:previous.weeks}:createMesocycle(data);
    next.discipline=normalizeDiscipline(data.discipline);next.limiter=normalizeLimiter($('l39-limiter').value);
    if(app.planEditor.profile?.version===1){next.skillProfile=app.planEditor.profile;delete next.limiterAnalysis;}
    app.plan=next;app.planDirty=true;if(!sameTargets)app.focusedWeek=null;
    app.planEditor=null;$('l39-plan-dialog').close();fillPlanForm(app.plan);renderTimeline();renderTwoWeeks();
    status('l39-plan-status','Concept gereed. Controleer de timeline en klik op Bewaar mesocycle.','good');
  }catch(e){status('l39-plan-modal-status',e.message,'error')}
}
function discardPlan(){
 if(!app.planDirty||!app.userId)return;
 if(!confirm('Concept verwerpen en het laatst bewaarde plan herstellen?'))return;
 app.plan=readPlan();app.planDirty=false;app.focusedWeek=null;fillPlanForm(app.plan);renderTimeline();renderTwoWeeks();
 status('l39-plan-status','Concept verworpen.','good');
}
function cloudEnabled(){return !!app.userId&&localStorage.getItem('mtb-cloud-enabled:'+app.userId)==='1';}
async function syncPlanner({automatic=false,resolveConflict=null,startup=false}={}){
  if(!app.cloud||automatic&&!cloudEnabled())return;
  if(app.cloudBusy){if(automatic)app.cloudQueued=true;return;}
  if(app.planDirty&&!automatic){status('l39-cloud-status','Bewaar eerst je mesocycle.','error');return;}
  if(automatic&&app.planDirty)return;
  const generation=app.authGeneration,client=app.cloud;
  app.cloudBusy=true;app.cloudQueued=false;status('l39-cloud-status','Synchroniseren…');
  for(const id of ['l39-cloud-sync','l39-cloud-local','l39-cloud-remote'])$(id).disabled=true;
  try{
    const result=await client.sync({allowDownload:!automatic,resolveConflict,downloadOnly:startup});
    if(generation!==app.authGeneration)return;
    if(result==='download'){app.plan=readPlan();app.planDirty=false;fillPlanForm(app.plan);if(!startup)setTab(app.activeTab);}
    app.startupIssue='';status('l39-cloud-status',({localOnly:'Lokale versie behouden; synchroniseer om deze naar de cloud te sturen.',upload:'Cloudopslag bevestigd.',download:'Cloudversie opgehaald. Lokale back-up behouden.',same:'Lokaal en cloud zijn gelijk.',nothing:'Nog geen opgeslagen gegevens.'})[result],'good');
  }catch(e){if(generation===app.authGeneration){status('l39-cloud-status',e.message,'error');if(startup)app.startupIssue='Trainingsplan niet automatisch opgehaald: '+e.message;if(automatic)status('l39-plan-status','Lokaal opgeslagen; cloud niet bevestigd: '+e.message,'error');}}
  finally{if(generation===app.authGeneration){app.cloudBusy=false;for(const id of ['l39-cloud-sync','l39-cloud-local','l39-cloud-remote'])$(id).disabled=false;const queued=app.cloudQueued;app.cloudQueued=false;if(queued)void syncPlanner({automatic:true});}}
}
function savePlan(){
  if(!app.plan||!app.userId){status('l39-plan-status','Genereer eerst een plan.','error');return}
  store().savePlan(app.plan);
  app.planDirty=false;renderTimeline();
  status('l39-plan-status','Mesocycle lokaal bewaard.','good');syncPlanner({automatic:true});
}

// MODAL: WEEK AVAILABILITY --------------------------------------
async function openAvailability(start){
  if(!app.userId||app.savingWorkout)return;
  const generation=app.authGeneration;
  try{
    const values=await availabilityForWeek(start);
    if(generation!==app.authGeneration)return;
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
 event.preventDefault();if(!app.weekModal||app.savingWorkout)return;
 const modal=app.weekModal,start=modal.start,generation=app.authGeneration,changes=[];
 for(const input of $('l39-week-sliders').querySelectorAll('input[type=number]')){
  if(input.disabled)continue;
  const minutes=Number(input.value),date=input.dataset.date;
  if(date<nowKey()||!Number.isInteger(minutes)||minutes<0||minutes>1440){status('l39-week-modal-status','Ongeldige beschikbaarheid op '+date,'error');return;}
  if(minutes!==modal.original[date].available_minutes)changes.push({date,minutes});
 }
 if(!changes.length){$('l39-week-dialog').close();return;}
 const save=$('l39-week-form').querySelector('button[type=submit]');save.disabled=true;app.savingWorkout=true;
 try{
  const {state}=await initializeAvailability(app.userId,parseDate(start));
  if(generation!==app.authGeneration)return;
  if(state.getPendingCount()>0)throw Error('Bewaar eerst de openstaande wijzigingen in de kalender.');
  const payload=changes.map(({date,minutes})=>{const saved=state.getSaved(date);if(!modal.original[date].localOnly&&saved.available_minutes!==modal.original[date].available_minutes)throw Error('Beschikbaarheid is elders gewijzigd. Open de week opnieuw.');return {date,action:'upsert',available_minutes:minutes,fixed_workout:saved.fixed_workout};});
  await saveCalendarChecked(payload,state.revision);
  if(generation!==app.authGeneration)return;
  const overrides=localAvailability();for(const {date} of changes)delete overrides[date];setLocalAvailability(overrides);app.availability.delete(start);
  $('l39-week-dialog').close();await renderTwoWeeks();status('l39-plan-status','Beschikbaarheid opgeslagen in Supabase.','good');
 }catch(e){if(generation===app.authGeneration)status('l39-week-modal-status','Niet opgeslagen: '+e.message,'error');}
 finally{if(generation===app.authGeneration){app.savingWorkout=false;save.disabled=false;}}
}

// MODAL: WORKOUT --------------------------------------------------
async function openWorkout(date){
  if(!app.userId||date<nowKey()||app.savingWorkout)return;
  const start=weekStartOf(parseDate(date)),generation=app.authGeneration;
  try{
    const available=await availabilityForWeek(start);
    if(generation!==app.authGeneration)return;
    const capacity=available[date]?.available_minutes;
    if(capacity===null)throw new Error('Geen beschikbare minuten voor deze datum bekend.');
    const s=getSession(date),phase=effectivePlanWeek(app.plan,start,weekStartOf(today())).week;
    app.workoutModal={date,start,capacity,phase,saved:s};
    $('l39-workout-title').textContent=`${prettyDate(date)} · Training aanpassen`;
    const fixed=fixedLabel(available[date]?.workout).toLowerCase();
    $('l39-workout-type').value=s?(s.group?'group':getTemplate(s.templateId)?.test?'test':s.type):store().manualRestDates(start).includes(date)?'rest':isGroupRide(fixed)?'group':'endurance';
    $('l39-workout-duration').value=String(s?.durationMinutes|| (capacity<15?60:isGroupRide(fixed)?Math.min(360,Math.floor(capacity/15)*15):Math.max(15,Math.min(60,Math.floor(capacity/15)*15))));
    $('l39-workout-duration').max='360';
    populateWorkoutTemplates(s?.templateId??(s&&!s.group?LEGACY_SELECTION:''));
    configureWorkoutSelection({preferred:s?.level??1,fit:!s});
    $('l39-workout-capacity').textContent=`${fmtMinutes(capacity)} beschikbaar · ${phase?.phase??'Geen fase'}`;
    $('l39-workout-form').querySelector('button[type=submit]').disabled=false;$('l39-delete-workout').hidden=!s;
    status('l39-workout-modal-status','');renderWorkoutPreview();$('l39-workout-dialog').showModal();
  }catch(e){status('l39-plan-status',e.message,'error')}
}
function populateWorkoutTemplates(selected=''){
 const select=$('l39-workout-template'),type=$('l39-workout-type').value,rows=editorOptions(type,app.workoutModal.saved);
 select.replaceChildren();
 for(const row of rows){const o=add(select,'option','',row.title);o.value=row.id;}
 select.value=selected;
 if(!select.value&&rows.length)select.selectedIndex=0;
 $('l39-workout-template-field').hidden=!rows.length;
 select.disabled=!rows.length;
}
function configureWorkoutSelection({preferred=1,fit=true}={}){
 const choice=editorSelection($('l39-workout-type').value,$('l39-workout-template').value,app.workoutModal.saved);
 const level=$('l39-workout-level'),duration=$('l39-workout-duration');
 const labels={1:'1 · Introductie',2:'2 · Opbouw',3:'3 · Verdieping'};
 level.replaceChildren();
 for(const n of choice.levels){const o=add(level,'option','',labels[n]);o.value=String(n);}
 const n=choice.levels.includes(Number(preferred))?Number(preferred):choice.levels[0]??1;
 level.value=choice.levels.length?String(n):'';
 level.disabled=choice.levels.length<=1;$('l39-workout-level-field').hidden=choice.levels.length<=1;
 duration.disabled=choice.type==='rest'||!!choice.test;
 $('l39-workout-duration-field').hidden=choice.type==='rest';
 duration.min=String(editorMinimum(choice,n));duration.max=String(choice.max);
 if(fit&&choice.type!=='rest'){
  const min=editorMinimum(choice,n);
  duration.value=String(choice.test?choice.min:Math.min(choice.max,Math.max(min,Number(duration.value)||min)));
 }
 return choice;
}
function readWorkoutControls(){
 const choice=editorSelection($('l39-workout-type').value,$('l39-workout-template').value,app.workoutModal.saved);
 const common={date:app.workoutModal.date,durationMinutes:Number($('l39-workout-duration').value),prescribedPhase:app.workoutModal.phase?.phase==='Recovery'?'Herstel':'Opbouw',type:choice.type,protocol:choice.protocol};
 if(choice.template)return {...common,templateId:choice.templateId,level:choice.levels.length===1?choice.levels[0]:Number($('l39-workout-level').value)};
 return {...common,...(choice.protocol==='progressive'?{level:Number($('l39-workout-level').value)}:{})};
}
function previewWorkoutResult(){
  if(!app.workoutModal)throw new Error('Geen dag geselecteerd.');
  const s=readWorkoutControls();
  if(s.type==='rest')return {s,info:null};
  if(s.type==='group')return {s,info:workoutInfo({...s,group:true},app.workoutModal.phase)};
  const old=app.workoutModal.saved;
  if(old&&old.type===s.type&&old.protocol===s.protocol&&(old.protocol!=='progressive'&&old.protocol!=='library'||old.level===s.level)&&old.templateId===s.templateId&&old.prescribedPhase)s.prescribedPhase=old.prescribedPhase;
  // Older fixed protocols may contain a redundant level; retain it only when
  // reopening that exact saved recipe, never display it as a selectable level.
  if(old&&$('l39-workout-template').value===LEGACY_SELECTION&&old.protocol!=='progressive'&&old.level!==undefined)s.level=old.level;
  return {s,info:workoutInfo(s,app.workoutModal.phase)};
}
function renderWorkoutPreview(){
  const host=$('l39-workout-chart'),steps=$('l39-workout-steps');host.replaceChildren();steps.replaceChildren();
  const type=$('l39-workout-type').value,template=getTemplate($('l39-workout-template').value);
  $('l39-copy-workout').disabled=type==='group'||type==='rest';$('l39-export-workout').disabled=type==='group'||type==='rest'||!!template?.variable||!!template?.pattern?.some(s=>s.effort==='max');
  try{
    const {s,info}=previewWorkoutResult();
    const check=manualWorkoutValidation({type:s.type,durationMinutes:s.durationMinutes,capacity:app.workoutModal.capacity});
    const warning=$('l39-workout-override');warning.hidden=true;warning.textContent='';
    if(s.type==='rest'){$('l39-workout-tss').textContent='0';$('l39-workout-hard').textContent='0';add(steps,'p','l39-caption','Rustdag: geen gestructureerde workout.');return}
    if(info.reason){
      $('l39-workout-tss').textContent='—';$('l39-workout-hard').textContent='—';
      add(steps,'p','l39-caption',info.reason);status('l39-workout-modal-status',info.reason,'error');return;
    }
    $('l39-workout-tss').textContent=num(info.load)+(info.estimatedTest?' (indicatief)':'');$('l39-workout-hard').textContent=formatIntensityMinutes(info.workout.hardMinutes);
    if(s.type==='group')add(steps,'p','l39-caption','Z2-referentie voor TSS; de werkelijke groepsrit is variabel.');
    if(info.workout.instructions)add(steps,'p','l39-caption',info.workout.instructions+(info.workout.variable||info.workout.steps.some(s=>s.effort==='max')?' Test-TSS is een grove planningindicatie. Volg het vrije testprotocol hier; automatische export is niet gevalideerd.':''));
    for(const step of info.workout.steps){
      const slot=add(host,'div','bar-slot');slot.style.flex=String(step.seconds);
      const bar=add(slot,'div',`bar ${step.kind}`);bar.style.setProperty('--bar-height',`${Math.max(8,step.percentFtp/200*100)}%`);
      bar.title=`${step.label} · ${step.seconds<60?step.seconds+'s':Math.round(step.seconds/60*10)/10+'m'} · ${step.effort==='max'?'Maximaal (indicatieve balkhoogte)':step.percentFtp+'% FTP'}`;
      const row=add(steps,'div','l39-workout-step');add(row,'span','',`${step.label} · ${step.seconds<60?step.seconds+' sec':Math.round(step.seconds/60*10)/10+' min'}`);
      add(row,'strong','',step.effort==='max'?'Maximaal · vrije weerstand':`${step.percentFtp}% FTP`+(step.cadence?' · '+step.cadence+' rpm':''));
    }
    status('l39-workout-modal-status','');
  }catch(e){$('l39-workout-tss').textContent='—';$('l39-workout-hard').textContent='—';
    add(steps,'p','l39-caption',e.message);status('l39-workout-modal-status',e.message,'error')}
}
async function saveWorkout(event){
  event.preventDefault();if(!app.workoutModal||!app.userId||app.savingWorkout)return;
  const modal=app.workoutModal,{date,start,capacity,phase}=modal,generation=app.authGeneration;
  if(date<nowKey()){status('l39-workout-modal-status','Deze dag is inmiddels verstreken.','error');return;}
  const {s,info}=previewWorkoutResult();
  if(s.type!=='rest'){
    const check=manualWorkoutValidation({type:s.type,durationMinutes:s.durationMinutes,capacity});
    if(!check.valid){status('l39-workout-modal-status','Gebruik 15–360 minuten in stappen van 15 minuten.','error');return;}
    if(s.type!=='group'&&info?.reason){status('l39-workout-modal-status',info.reason,'error');return}
  }
  if(app.proposing){status('l39-workout-modal-status','Wacht tot het trainingsvoorstel is afgerond.','error');return;}
  if(s.type!=='rest'){
    app.savingWorkout=true;const save=$('l39-workout-form').querySelector('button[type=submit]');save.disabled=true;
    try{
      // Fresh revision, saved value, and fixed ride label; never modify the standard week.
      const {state}=await initializeAvailability(app.userId,parseDate(start));
      if(generation!==app.authGeneration||modal!==app.workoutModal)return;
      if(state.getPendingCount()>0)throw Error('Bewaar eerst de openstaande wijzigingen in beschikbaarheid.');
      const current=state.getSaved(date),overrides=localAvailability(),local=Object.hasOwn(overrides,date)?overrides[date]:null,minutes=Math.max(current.available_minutes,Number.isFinite(local)?local:0,s.durationMinutes);
      if(minutes>current.available_minutes){
        await saveCalendarChecked([{date,action:'upsert',available_minutes:minutes,fixed_workout:current.fixed_workout}],state.revision);
        if(generation!==app.authGeneration||modal!==app.workoutModal)return;
        delete overrides[date];setLocalAvailability(overrides);
      }else if(Number.isFinite(local)&&local<s.durationMinutes){delete overrides[date];setLocalAvailability(overrides);}
      app.availability.delete(start);
    }catch(e){if(generation===app.authGeneration)status('l39-workout-modal-status','Beschikbaarheid niet opgeslagen: '+e.message+'. Training niet gewijzigd; probeer opnieuw.','error');return;}
    finally{if(generation===app.authGeneration){app.savingWorkout=false;save.disabled=false;}}
  }
  const previous=getSession(date),all=sessions(start).filter(x=>x.date!==date),restDates=store().manualRestDates(start).filter(d=>d!==date);
  if(s.type==='rest')restDates.push(date);
  else{
    const next={...s,type:s.type==='group'?'endurance':s.type,group:s.type==='group'};
    const changed=!previous||['type','group','durationMinutes','protocol','level','prescribedPhase','templateId'].some(k=>previous[k]!==next[k]);
    const saved={...previous,...next,templateId:next.templateId,level:next.level,manual:changed||previous?.manual===true};if(changed){delete saved.feedback;delete saved.feedbackActivityId;}all.push(saved);
  }
  storeSessions(start,all,{restDates});$('l39-workout-dialog').close();syncPlanner({automatic:true});
  if(app.activeTab==='calendar')loadCalendar();else if(app.activeTab==='dashboard')loadDashboard();else renderTwoWeeks();
  const feedback=app.activeTab==='dashboard'?'l39-dashboard-status':app.activeTab==='calendar'?'l39-calendar-status':'l39-plan-status';
  status(feedback,'Training lokaal opgeslagen. Handmatige wijzigingen blijven behouden bij een nieuw trainingsvoorstel. Intervals.icu is niet gewijzigd.','good');
}
function deleteWorkout(){
  const modal=app.workoutModal;if(!app.userId||!modal||app.proposing||app.savingWorkout||modal.date<nowKey()||!getSession(modal.date))return;
  const {date,start}=modal;
  if(!confirm('Verwijder de geplande training uit de planner? Beschikbaarheid en eventuele export naar Intervals.icu blijven behouden.'))return;
  storeSessions(start,sessions(start).filter(s=>s.date!==date),{restDates:[...store().manualRestDates(start),date]});
  $('l39-workout-dialog').close();syncPlanner({automatic:true});
  if(app.activeTab==='calendar')loadCalendar();else if(app.activeTab==='dashboard')loadDashboard();else renderTwoWeeks();
  status(app.activeTab==='dashboard'?'l39-dashboard-status':app.activeTab==='calendar'?'l39-calendar-status':'l39-plan-status','Training verwijderd. Beschikbaarheid en Intervals.icu ongewijzigd.','good');
}
async function exportWorkout(){
  const b=$('l39-export-workout');if(b.disabled)return;
  try{const {s,info}=previewWorkoutResult();const saved=getSession(s.date);if(!info?.workout||!saved||saved.group||saved.type!==s.type||saved.durationMinutes!==s.durationMinutes||(saved.protocol||'classic')!==s.protocol||saved.level!==s.level||saved.templateId!==s.templateId)throw Error('Bewaar de gestructureerde training eerst en open hem opnieuw.');
    if(s.date<nowKey())throw Error('Geen export van verstreken dagen.');
    if(!confirm('Exporteer '+info.workout.title+' op '+s.date+' naar je echte Intervals.icu-kalender?'))return;
    b.disabled=true;status('l39-workout-modal-status','Exporteren…');const result=await exportIntervalsWorkout({date:s.date,title:info.workout.title,description:workoutText(info.workout)});status('l39-workout-modal-status','Export bevestigd · event '+result.id,'good');
  }catch(e){status('l39-workout-modal-status',e.message,'error');}finally{b.disabled=false;}
}
async function copyWorkout(){
  try{const {info}=previewWorkoutResult();if(!info?.workout)throw new Error('Geen gestructureerde workout om te kopiëren.');
    await navigator.clipboard.writeText([`# ${info.workout.title}`,...info.workout.steps.map(s=>`- ${s.label} ${s.seconds%60===0?s.seconds/60+'m':s.seconds+'s'} ${s.effort==='max'?'maximaal (vrije weerstand)':s.percentFtp+'%'}${s.cadence?' '+s.cadence+' rpm':''}`)].join('\n'));status('l39-workout-modal-status','Workouttekst gekopieerd.','good');
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
  if(action==='focus-week'){app.focusedWeek=target.dataset.week;setTab('plan');}
  if(action==='close-dialog'&&!app.savingWorkout)target.closest('dialog')?.close();
}
function registerListeners(){
  // Refresh only while the dashboard is visible, never interrupt an open evaluation.
  const refreshVisible=()=>{if(app.userId&&app.activeTab==='dashboard'&&!document.hidden&&!document.querySelector('.l39-inline-evaluation:not([hidden])')&&!document.querySelector('dialog[open]'))void loadDashboard();};
  document.addEventListener('visibilitychange',refreshVisible);window.setInterval(refreshVisible,60000);
  for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>setTab(button.dataset.tab));
  $('l39-settings-link').addEventListener('click',()=>setTab('settings'));
  $('l39-dashboard-refresh').addEventListener('click',()=>{app.activityCache.clear();app.detailCache.clear();app.availability.clear();loadDashboard()});
  $('l39-month-prev').addEventListener('click',()=>{app.month=new Date(app.month.getFullYear(),app.month.getMonth()-1,1);loadCalendar()});
  $('l39-month-next').addEventListener('click',()=>{app.month=new Date(app.month.getFullYear(),app.month.getMonth()+1,1);loadCalendar()});
  $('l39-month-today').addEventListener('click',()=>{app.month=new Date(today().getFullYear(),today().getMonth(),1);app.selectedCalendarDate=nowKey();loadCalendar()});
  $('l39-plan-form').addEventListener('submit',generatePlan);$('l39-plan-save').addEventListener('click',savePlan);
  $('l39-new-plan').addEventListener('click',()=>{if(!app.planDirty||confirm('Een nieuw concept beginnen? Je huidige onbewaarde concept wordt pas vervangen na toepassen.'))openPlanDialog('new');});
  $('l39-edit-plan').addEventListener('click',()=>openPlanDialog('edit'));
  $('l39-plan-discard').addEventListener('click',discardPlan);
  $('l39-plan-dialog').addEventListener('close',()=>{if($('l39-plan-dialog').open)return;app.planEditor=null;fillPlanForm(app.plan);renderSkillPanel();});
  for(const b of $('l39-plan-dialog').querySelectorAll('.l39-info'))b.addEventListener('click',()=>{const p=$(b.getAttribute('aria-controls'));p.hidden=!p.hidden;b.setAttribute('aria-expanded',String(!p.hidden));});
  $('l39-current-weeks').addEventListener('click',()=>{app.focusedWeek=null;renderTimeline();renderTwoWeeks()});
  $('l39-propose').addEventListener('click',proposeWeek);
  $('l39-analyze-limiters').addEventListener('click',analyzeLimiterHistory);
  $('l39-analyze-feedback').addEventListener('click',analyzeWorkoutFeedback);
  for(const id of ['l39-discipline','l39-limiter'])$(id).addEventListener('change',updateSkillFocus);
  $('l39-week-form').addEventListener('submit',saveAvailability);
  $('l39-workout-form').addEventListener('submit',saveWorkout);
  $('l39-delete-workout').addEventListener('click',deleteWorkout);
  for(const id of ['l39-workout-dialog','l39-week-dialog'])$(id).addEventListener('cancel',e=>{if(app.savingWorkout)e.preventDefault()});
  $('l39-copy-workout').addEventListener('click',copyWorkout);
  $('l39-export-workout').addEventListener('click',exportWorkout);
  const selectTemplate=()=>{configureWorkoutSelection({preferred:1});renderWorkoutPreview();};
  $('l39-workout-type').addEventListener('input',()=>{populateWorkoutTemplates('');selectTemplate();});
  $('l39-workout-template').addEventListener('input',selectTemplate);
  $('l39-workout-duration').addEventListener('input',renderWorkoutPreview);
  $('l39-workout-level').addEventListener('input',()=>{configureWorkoutSelection({preferred:Number($('l39-workout-level').value)});renderWorkoutPreview();});
  $('l39-cloud-enabled').addEventListener('change',()=>{if(app.userId)localStorage.setItem('mtb-cloud-enabled:'+app.userId,$('l39-cloud-enabled').checked?'1':'0');});
  $('l39-cloud-sync').addEventListener('click',()=>syncPlanner());
  $('l39-cloud-local').addEventListener('click',()=>{if(confirm('Lokale versie als cloudversie bewaren? Alleen bij een conflict wordt de cloudversie vervangen.'))syncPlanner({resolveConflict:'local'});});
  $('l39-cloud-remote').addEventListener('click',()=>{if(confirm('Cloudversie lokaal herstellen? Een lokale back-up wordt bewaard.'))syncPlanner({resolveConflict:'remote'});});
  $('l39-cloud-backup').addEventListener('click',()=>{try{if(!app.userId)return;const blob=new Blob([JSON.stringify(readSnapshot(localStorage,app.userId),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mtb-planner-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){status('l39-cloud-status',e.message,'error');}});
  $('l39-test-connection').addEventListener('click',async()=>{
    status('l39-connection-status','Verbinding testen...');try{await testIntervalsConnection();status('l39-connection-status','Intervals.icu werkt.','good')}
    catch(e){status('l39-connection-status',e.message,'error')}
  });
  document.addEventListener('click',handleActions);
  $('l39-plan-race').addEventListener('change',()=>{
    try{const race=$('l39-plan-race').value,start=$('l39-plan-start').value;if(!race||!start)return;
      $('l39-plan-weeks').value=String(raceWeekCount(start,race));
    }catch(e){status('l39-plan-modal-status',e.message,'error')}
  });
}
async function setSignedIn(user){
  if(app.userId===user.id)return;
  cleanUser();app.userId=user.id;const generation=app.authGeneration;app.cloud=createCloudSync({supabase,storage:localStorage,user:user.id,isCurrent:()=>generation===app.authGeneration,canDownload:()=>!app.planDirty});$('l39-cloud-enabled').checked=cloudEnabled();status('l39-cloud-status','');app.plan=readPlan();app.planDirty=false;app.focusedWeek=null;fillPlanForm(app.plan);
  const tab=location.hash.slice(1);await syncPlanner({startup:true});if(generation!==app.authGeneration)return;setTab(['dashboard','calendar','plan'].includes(tab)?tab:'dashboard');if(app.startupIssue)status('l39-cloud-status',app.startupIssue,'error');
}
async function initialize(){
  registerListeners();fillPlanForm(null);
  const {data}=await supabase.auth.getUser();if(data?.user)setSignedIn(data.user);
  supabase.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){cleanUser();}
    if(event==='SIGNED_IN'&&session?.user)setTimeout(()=>setSignedIn(session.user),0);
  });
}
initialize().catch(e=>{console.error('Planner initialisatie:',e);status('status-message','Planner kon niet worden gestart. Vernieuw de pagina.','error');});
