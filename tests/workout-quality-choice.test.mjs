import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeWorkoutWeek } from '../workout-plan-model.js';
const start='2026-11-23';
const availabilityByDate=Object.fromEntries(Array.from({length:7},(_,i)=>{
  const d=new Date('2026-11-23T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);
  return [d.toISOString().slice(0,10),{available_minutes:90}];
}));
const week={start,targetLoad:300,phase:'Opbouw'};
test('default proposal keeps original quality order',()=>{const r=proposeWorkoutWeek({week,availabilityByDate});assert.equal(r.sessions.find(x=>x.type!=='endurance')?.type,'vo2max')});
test('quality order changes based on completed stimulus',()=>{const r=proposeWorkoutWeek({week,availabilityByDate,maxQualitySessions:1,qualityTypes:['threshold','vo2max']});assert.equal(r.sessions.filter(x=>x.type!=='endurance')[0]?.type,'threshold')});
test('no new quality with exhausted session allowance',()=>{const r=proposeWorkoutWeek({week,availabilityByDate,maxQualitySessions:0});assert.equal(r.sessions.filter(x=>x.type!=='endurance').length,0)});
test('blocked dates exclude threshold from recovery neighbour',()=>{const r=proposeWorkoutWeek({week,availabilityByDate,maxQualitySessions:1,blockedQualityDates:['2026-11-24','2026-11-25'],qualityTypes:['threshold','vo2max']});assert.ok(r.sessions.filter(x=>x.type==='threshold').every(x=>x.date!=='2026-11-24'&&x.date!=='2026-11-25'))});
