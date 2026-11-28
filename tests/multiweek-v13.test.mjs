import test from 'node:test';
import assert from 'node:assert/strict';
import {createMesocycle,weekDates} from '../planner-model.js';
import {phasePosition,phaseAbilityTargets,phaseQualityOrder,aerobicFocus} from '../src/engine/discipline-policy.js';
import {proposeSkillWeek} from '../src/engine/friel.js';
import {stepFitness,fitnessCandidateAllowed} from '../src/engine/fitness-forecast.js';
import {derivePhaseWorkoutPolicy} from '../phase-focus-policy.js';
import {libraryCandidates} from '../src/workouts/library.js';
import {workoutInfo} from '../src/workouts/workout-service.js';
import {isQuality,boundaryBlocks} from '../src/workouts/progression.js';

for(const weeks of [12,16,24])for(const discipline of ['xco','road','gravel'])for(const groupIntensity of ['easy','mixed','hard'])test(`multiweek ${weeks} ${discipline} ${groupIntensity}`,()=>{
 const plan=createMesocycle({start:'2026-11-30',weeks,baseLoad:300,discipline});
 let anchor={date:'2026-11-29',ctl:40,atl:40},previous=[];
 for(const [index,week] of plan.weeks.entries()){
  const dates=weekDates(week.start),availability=Object.fromEntries(dates.map((d,i)=>[d,{available_minutes:(index%5===2?[0,45,0,60,0,30,120]:[0,90,120,90,0,60,180])[i]}]));
  const position=phasePosition(plan.weeks,week),priorities=Object.fromEntries(phaseAbilityTargets(discipline,week.phase,position).map(x=>[x.skill,x.target]));
  const load=s=>workoutInfo(s,week).load??NaN;
  const asLoad=s=>({date:s.date,load:load(s),quality:isQuality(s),recovery:s.type==='recovery'});
  const maxQuality=derivePhaseWorkoutPolicy({week}).maxQualitySessions;
  const r=proposeSkillWeek({dates,availability,target:week.targetLoad,phase:week.phase,maxQuality,groupIntensity,fixed:[dates[6]],blocked:boundaryBlocks({dates,previous,next:[]}),qualityTypes:phaseQualityOrder(discipline,week.phase,'auto',[],position,index),preferLong:aerobicFocus(discipline,week.phase,'auto'),loadFor:(type,durationMinutes)=>load({type,durationMinutes}),sessionLoad:load,sessionCandidates:(type,durationMinutes,date)=>libraryCandidates({type,phase:week.phase,discipline,priorities,weekIndex:index,durationMinutes,date}),allowCandidate:(s,existing)=>fitnessCandidateAllowed({anchor,actual:new Map(),existing:existing.map(asLoad),candidate:asLoad(s),end:dates[6]})});
  const fixed=r.sessions.filter(s=>s.group),auto=r.sessions.filter(s=>!s.group),fixedLoad=fixed.reduce((n,s)=>n+load(s),0);
  assert.equal(fixed.length,1);assert.equal(fixed[0].groupIntensity,groupIntensity);
  assert.ok(r.estimatedKnownLoad<=Math.max(week.targetLoad,fixedLoad)+.011);
  assert.ok(Math.abs(r.estimatedKnownLoad-r.sessions.reduce((n,s)=>n+load(s),0))<.011);
  assert.equal(new Set(r.sessions.map(s=>s.date)).size,r.sessions.length);
  assert.ok(r.sessions.every(s=>s.durationMinutes<=availability[s.date].available_minutes));
  assert.ok(auto.filter(isQuality).length<=Math.max(0,maxQuality-Number(groupIntensity!=='easy')));
  if(week.phase==='Recovery')assert.ok(auto.every(s=>!isQuality(s)));
  const hard=r.sessions.filter(isQuality);
  for(let i=1;i<hard.length;i++)assert.ok(Date.parse(hard[i].date)-Date.parse(hard[i-1].date)>=172800000);
  if(previous.some(s=>s.date===anchor.date&&isQuality(s)))assert.ok(!hard.some(s=>s.date===dates[0]));
  for(const date of dates){const s=r.sessions.find(s=>s.date===date);anchor={date,...stepFitness(anchor,s?load(s):0)};assert.ok(Number.isFinite(anchor.tsb));}
  previous=r.sessions;
 }
});
