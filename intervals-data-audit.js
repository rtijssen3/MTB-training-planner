import {supabase} from './supabase-client.js';
import {fetchIntervalsActivities} from './intervals-api.js';
import {analyzeIntervalsActivity,summarizeIntervalsPeriod,summarizeFieldCoverage} from './training-analysis-model.js';
const $=id=>document.getElementById(id);
const date=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const now=new Date();const from=new Date(now);from.setDate(from.getDate()-27);$('from').value=date(from);$('to').value=date(now);
const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=String(value);return e};
const show=(id,value)=>{$(id).textContent=value};
let exportReport=null;
function rows(host,columns){const tr=document.createElement('tr');columns.forEach(x=>tr.appendChild(text('td',x)));host.appendChild(tr)}
function render(raw,start,end){
  const summary=summarizeIntervalsPeriod(raw,{start,end});const coverage=summarizeFieldCoverage(raw);
  $('results').hidden=false;$('headline').replaceChildren();$('fields').replaceChildren();$('activities').replaceChildren();$('zones').replaceChildren();
  for(const [label,value] of [['Activiteiten',summary.count],['Load (bekend)',Math.round(summary.load.knownTotal)],['Load ontbreekt',summary.load.missingCount],['Strain beschikbaar',`${summary.strain.count}/${summary.count}`],['Powerzones betrouwbaar',`${summary.powerZones.coveredActivities}/${summary.count}`]]){
    const card=document.createElement('div');card.className='card';card.append(text('b',value),text('small',label));$('headline').append(card);
  }
  show('caution',summary.powerZones.complete?'Alle activiteiten hebben expliciet herkende powerzone-labels. Controleer wel of je zone-instellingen gelijk zijn gebleven.':'De vermogenszoneverdeling is ONVOLLEDIG of de zone-ID’s konden niet betrouwbaar geïnterpreteerd worden. Geen weekclassificatie of herstelbeslissing afleiden uit deze deeltelling.');
  coverage.forEach(x=>rows($('fields'),[x.field,`${x.count}/${x.total}`]));
  summary.activities.forEach(a=>rows($('activities'),[a.date,a.name,a.load??'—',a.strainScore==null?'—':a.strainScore.toFixed(1),a.classification??'—',a.polarizationIndex??'—',a.zones.status]));
  const total=summary.powerZones.seconds.reduce((a,b)=>a+b,0);const z=summary.powerZones.seconds;
  show('zone-note',`Z1–Z7 uit ${summary.powerZones.coveredActivities} verifieerbare activiteiten; ${summary.powerZones.missingOrUnverified} onbekend. Dit zijn alleen powerzones, geen Combined Zones. S1/S2/S3 worden afgeleid uit dezelfde seconden en mogen niet bij Z1–Z7 worden opgeteld.`);
  z.forEach((seconds,i)=>{const line=document.createElement('div');line.className='bar';line.append(text('b',`Z${i+1}`));const holder=document.createElement('span');const inner=document.createElement('i');inner.style.width=(total?seconds/total*100:0)+'%';holder.append(inner);line.append(holder,text('small',`${Math.round(seconds/60)} min`));$('zones').append(line)});
  exportReport={period:{start,end},activityCount:summary.count,coverage,completeLoad:summary.load.complete,missingLoad:summary.load.missingCount,verifiedZoneActivities:summary.powerZones.coveredActivities,unverifiedZoneActivities:summary.powerZones.missingOrUnverified,zoneIdExamples:[...new Set(summary.activities.flatMap(a=>a.zones.rawIds))].slice(0,20)};
  show('copy-status','');
}
$('fetch').addEventListener('click',async()=>{
  const start=$('from').value,end=$('to').value;
  if(!start||!end||start>end){show('status','Vul een geldig datumbereik in.');return}
  const days=Math.round((new Date(end+'T12:00:00')-new Date(start+'T12:00:00'))/86400000);
  if(days>30){show('status','Maximaal 31 kalenderdagen per controle.');return}
  $('fetch').disabled=true;show('status','Verbinden via bestaande Supabase-sessie...');$('results').hidden=true;
  try{
    const {data:{user},error}=await supabase.auth.getUser();if(error||!user)throw new Error('Niet ingelogd. Log eerst in op de MTB Planner en open dit scherm opnieuw.');
    const raw=await fetchIntervalsActivities(start,end);if(!Array.isArray(raw))throw new Error('Activiteiten-API gaf geen array terug.');
    render(raw,start,end);show('status',`Geladen: ${raw.length} activiteiten. Alleen-lezen controle voltooid.`);
  }catch(e){show('status',`Niet gelukt: ${e.message}`)}finally{$('fetch').disabled=false}
});
$('copy').addEventListener('click',async()=>{if(!exportReport)return;const json=JSON.stringify(exportReport,null,2);
  try{await navigator.clipboard.writeText(json);show('copy-status','Technische samenvatting gekopieerd (zonder activiteitennamen of accountgegevens).')}
  catch{show('copy-status','Kopiëren niet mogelijk via deze browser. Gebruik een veilige lokale omgeving met HTTPS/localhost.')}
});
