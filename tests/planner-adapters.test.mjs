import test from 'node:test';import assert from 'node:assert/strict';import {normalizePlannerAvailability,isGroupRide,fixedGroupDates,refreshFocus} from '../src/core/planner-adapters.js';import {recalculateExposure,proposeSkillWeek,priorities} from '../src/engine/friel.js';import {AvailabilityState} from '../availability-state.js';
const sample={available_minutes:180,fixed_workout:'Groepsrit'};
test("actual Supabase fixed_workout mapping",()=>assert.ok((()=>normalizePlannerAvailability(sample).workout==='Groepsrit')()));
test("local minutes override preserves fixed workout",()=>assert.ok((()=>normalizePlannerAvailability(sample,120).workout==='Groepsrit'&&normalizePlannerAvailability(sample,120).available_minutes===120)()));
test("group detection with real field",()=>assert.ok((()=>fixedGroupDates({'2026-11-29':normalizePlannerAvailability(sample)},['2026-11-29']).length===1)()));
test("manual discipline changes plan without regenerating",()=>assert.ok((()=>{const p={discipline:'xco',limiter:'auto',weeks:[1]};const n=refreshFocus(p,{discipline:'gravel',limiter:'auto'},recalculateExposure);return n.discipline==='gravel'&&n.weeks===p.weeks&&p.discipline==='xco';})()));
test("discipline recalculates prior exposure",()=>assert.ok((()=>{const a={covered:8,denominator:8,minutes:{aerobic:75,muscular:12,anaerobic:6,power:1.5}};const b={...a,minutes:Object.fromEntries(Object.entries(a.minutes).map(([k,v])=>[k,v*10]))};return recalculateExposure(b,'xco').candidate==='muscular'&&recalculateExposure(b,'gravel').candidate===null;})()));
test('real AvailabilityState feeds group ride into proposal even at zero remaining load',()=>{
 const state=new AvailabilityState([{weekday:'Zondag',...sample}],[],new Date(2026,10,23,12));
 const dates=state.days.slice(0,7).map(d=>d.date);
 const availability=Object.fromEntries(dates.map(d=>[d,normalizePlannerAvailability(state.getEffective(d))]));
 const r=proposeSkillWeek({dates,availability,target:0,maxQuality:0,fixed:fixedGroupDates(availability,dates),loadFor:()=>50});
 assert.deepEqual(r.sessions,[{date:'2026-11-29',type:'endurance',group:true,groupIntensity:'mixed',durationMinutes:180,protocol:'classic'}]);
});
test('discipline selection changes skill priorities without changing weeks',()=>{const a={discipline:'xco',limiter:'auto',weeks:[{phase:'Build'}]};const b=refreshFocus(a,{discipline:'gravel',limiter:'auto'},recalculateExposure);assert.notDeepEqual(priorities(a.discipline,'Build'),priorities(b.discipline,'Build'));assert.equal(a.weeks,b.weeks)});
