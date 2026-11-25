import test from 'node:test';import assert from 'node:assert/strict';import {raceWeekCount,raceAdjustedWeeks,eventQualityTypes} from '../src/engine/event-plan.js';
test('race week across DST',()=>assert.equal(raceWeekCount('2026-09-07','2026-11-01'),8));
test('reject invalid or short race range',()=>{assert.throws(()=>raceWeekCount('2026-09-07','2026-09-08'));assert.throws(()=>raceWeekCount('2026-09-07','2026-11-31'));});
test('taper reduces load and does not mutate original',()=>{const weeks=Array.from({length:8},(_,i)=>({start:new Date(Date.UTC(2026,8,7+i*7)).toISOString().slice(0,10),targetLoad:400,phase:'Build'}));const result=raceAdjustedWeeks(weeks,'2026-11-01');assert.equal(result.at(-1).targetLoad,220);assert.equal(weeks.at(-1).targetLoad,400);});
test('discipline and existing evidence',()=>{assert.deepEqual(eventQualityTypes('gravel','Build'),['threshold','vo2max']);assert.deepEqual(eventQualityTypes('xco','Build',['threshold','vo2max']),['threshold','vo2max']);});
