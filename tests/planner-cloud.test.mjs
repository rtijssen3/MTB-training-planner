import test from 'node:test';import assert from 'node:assert/strict';import {syncDecision,readSnapshot,installSnapshot} from '../src/data/planner-snapshot.js';import {workoutText} from '../src/workouts/export.js';
const empty={version:1,plan:null,weeks:{}},one={version:1,plan:{version:2,weeks:[{start:'2026-11-23'}]},weeks:{}},two={...one,plan:{...one.plan,name:'ander'}},remote={snapshot:one,revision:1};
test("first device uploads",()=>assert.ok((()=>syncDecision(one,null,null)==='upload')()));
test("empty device downloads",()=>assert.ok((()=>syncDecision(empty,remote,null)==='download')()));
test("divergent first devices conflict",()=>assert.ok((()=>syncDecision(two,remote,null)==='conflict')()));
test("unchanged cloud accepts local update",()=>assert.ok((()=>syncDecision(two,remote,one)==='upload')()));
test("both changed conflict",()=>assert.ok((()=>syncDecision(two,{snapshot:empty,revision:2},one)==='conflict')()));
test("identical snapshot",()=>assert.ok((()=>syncDecision(one,remote,null)==='same')()));
test("seconds preserved",()=>assert.ok((()=>workoutText({steps:[{seconds:10,percentFtp:180},{seconds:60,percentFtp:50}]})==='- 10s 180%\n- 1m 50%')()));
test('install saves backup and round trips',()=>{const m=new Map(),storage={get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};installSnapshot(storage,'a',one);assert.deepEqual(readSnapshot(storage,'a'),one);assert.deepEqual(JSON.parse(storage.getItem('mtb-cloud-backup:v1:a')),empty);assert.deepEqual(readSnapshot(storage,'b'),empty);});

import {createCloudSync} from '../src/data/cloud-sync.js';
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('download cannot overwrite a dirty unsaved concept',async()=>{
 const storage=memory();let allowed=true;
 const client=createCloudSync({storage,user:'a',canDownload:()=>allowed,supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{allowed=false;return {data:remote,error:null};}})})})}});
 await assert.rejects(client.sync(),/niet-opgeslagen concept/);assert.deepEqual(readSnapshot(storage,'a'),empty);
});
test('changed local snapshot during lookup is never overwritten',async()=>{
 const storage=memory();
 const client=createCloudSync({storage,user:'a',supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{installSnapshot(storage,'a',two);return {data:remote,error:null};}})})})}});
 await assert.rejects(client.sync(),/Lokale wijzigingen/);assert.deepEqual(readSnapshot(storage,'a'),two);
});

test('startup read-only sync never uploads local-only changes',async()=>{
 const storage=memory();installSnapshot(storage,'a',one);
 const client=createCloudSync({storage,user:'a',supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),rpc:()=>{throw Error('Unexpected upload');}}});
 assert.equal(await client.sync({downloadOnly:true}),'localOnly');assert.deepEqual(readSnapshot(storage,'a'),one);
});
test('startup read-only sync downloads onto empty device',async()=>{
 const storage=memory();const client=createCloudSync({storage,user:'a',supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:remote,error:null})})})})}});
 assert.equal(await client.sync({downloadOnly:true}),'download');assert.deepEqual(readSnapshot(storage,'a'),one);
});

test('manual workout marker and rest dates round-trip through cloud snapshot',()=>{const storage=memory(),start='2026-11-23',snap={...one,weeks:{[start]:{version:1,start,sessions:[{date:'2026-11-27',type:'endurance',durationMinutes:120,manual:true}],manualRestDates:['2026-11-29']}}};installSnapshot(storage,'a',snap);assert.deepEqual(readSnapshot(storage,'a'),snap);});
