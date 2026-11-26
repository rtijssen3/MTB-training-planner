import test from 'node:test';import assert from 'node:assert/strict';import {priorities,analyzeExposure,qualityOrder,skillWorkout,proposeSkillWeek} from '../src/engine/friel.js';
const dates=Array.from({length:7},(_,i)=>'2026-11-'+(23+i)),availability=Object.fromEntries(dates.map(d=>[d,{available_minutes:90}])),loadFor=(type,min)=>min*(type==='endurance'?.5:.8);
test("six skills",()=>assert.ok((()=>priorities('xco','Base').length===6)()));
test("recovery excludes power",()=>assert.ok((()=>priorities('xco','Recovery','power').find(x=>x.skill==='power').score===0)()));
test("missing data",()=>assert.ok((()=>analyzeExposure([],'xco',8).candidate===null)()));
test("manual focus",()=>assert.ok((()=>priorities('xco','Base','power').find(x=>x.skill==='power').score>priorities('xco','Base').find(x=>x.skill==='power').score)()));
test("all four workouts exact duration",()=>assert.ok((()=>['force','skills','anaerobic','power'].every(type=>skillWorkout({type,durationMinutes:60,ftp:280}).steps.reduce((s,x)=>s+x.seconds,0)===3600))()));
test("low target",()=>assert.ok((()=>proposeSkillWeek({dates,availability,target:20,qualityTypes:['threshold','vo2max'],loadFor}).estimatedKnownLoad<=20)()));
test("fixed group and adjacent protection",()=>assert.ok((()=>{const r=proposeSkillWeek({dates,availability,target:400,qualityTypes:['threshold','vo2max'],fixed:[dates[2]],loadFor});return r.sessions.some(s=>s.date===dates[2]&&s.group)&&!r.sessions.some(s=>[dates[1],dates[3]].includes(s.date)&&['threshold','vo2max'].includes(s.type));})()));
test("recovery no hard sessions",()=>assert.ok((()=>proposeSkillWeek({dates,availability,target:300,phase:'Recovery',qualityTypes:['threshold','vo2max'],loadFor}).sessions.every(s=>s.type==='endurance'))()));
test("one rest day",()=>assert.ok((()=>proposeSkillWeek({dates,availability,target:800,qualityTypes:['threshold','vo2max'],loadFor}).sessions.length<=6)()));
test("spaced quality",()=>assert.ok((()=>{const r=proposeSkillWeek({dates,availability,target:500,qualityTypes:['threshold','vo2max'],loadFor});const ids=r.sessions.filter(s=>s.type!=='endurance').map(s=>dates.indexOf(s.date));return ids.length<=2&&ids.every((x,i)=>i===0||x-ids[i-1]>=2)})()));

test('group load counted in total and remaining budget',()=>{const r=proposeSkillWeek({dates,availability,target:100,qualityTypes:['threshold'],fixed:[dates[2]],loadFor,groupLoadFor:()=>55});assert.equal(r.unknownFixed,0);assert.ok(r.estimatedKnownLoad<=100.01);assert.equal(r.estimatedKnownLoad,55+r.sessions.filter(s=>!s.group).reduce((t,s)=>t+loadFor(s.type,s.durationMinutes),0));});
test('fixed group retained even above target, no extra training',()=>{const r=proposeSkillWeek({dates,availability,target:20,qualityTypes:['threshold'],fixed:[dates[2]],loadFor,groupLoadFor:()=>55});assert.equal(r.sessions.length,1);assert.equal(r.estimatedKnownLoad,55);});
