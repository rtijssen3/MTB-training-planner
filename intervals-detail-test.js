// Read-only diagnosis in Settings > Intervals.icu.
// Requires existing supabase-client.js, intervals-api.js and detail Edge Function.
import { supabase } from './supabase-client.js';
import { fetchIntervalsActivities } from './intervals-api.js';
import { analyzeIntervalsActivity, summarizeIntervalsPeriod, buildPrivacySafeReport } from './training-analysis-model.js';

const mount = document.getElementById('l39-connection-status')?.closest('.l39-panel');
if (mount) initialize(mount);
else console.warn('Intervals audit: instellingenpaneel niet gevonden.');

function initialize(parent) {
  const section = document.createElement('section');
  section.id = 'intervals-detail-test';
  section.style.cssText = 'border-top:1px solid rgba(128,128,128,.25);margin-top:20px;padding-top:16px';
  section.innerHTML = `
    <h3>Intervals.icu analyse controleren <small style="opacity:.7;font-weight:normal">(tijdelijk)</small></h3>
    <p class="l39-caption">Lees Strain, vermogenszones en gedetecteerde intervallen. Alleen-lezen; je trainingsplan wordt niet aangepast.</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:12px 0">
      <label>Van<br><input type="date" id="iat-from" value="2026-10-29"></label>
      <label>Tot<br><input type="date" id="iat-to" value="2026-11-25"></label>
      <button type="button" id="iat-fetch" class="l39-secondary">Analyseer activiteiten</button>
    </div>
    <p id="iat-status" role="status" aria-live="polite" class="l39-caption"></p>
    <div id="iat-output" hidden>
      <div id="iat-summary"></div>
      <h4>Per activiteit</h4>
      <div id="iat-activities" style="display:grid;gap:10px"></div>
      <p class="l39-caption">S1–S3 zijn samengevoegde vermogenszones. SS is Sweet Spot en telt niet extra mee. Herkende intervallen kunnen elkaar overlappen.</p>
      <button type="button" id="iat-copy" class="l39-secondary">Kopieer geanonimiseerde analyse</button>
      <p id="iat-copystatus" class="l39-caption" aria-live="polite"></p>
    </div>`;
  parent.append(section);
  const $ = id => section.querySelector('#'+id);
  const status = msg => { $('iat-status').textContent = msg; };
  const fmt = (n, suffix='') => typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n*10)/10}${suffix}` : '—';
  const minutes = secs => secs == null ? '—' : fmt(secs/60,' min');
  const el = (tag, text, className='') => { const node=document.createElement(tag);node.textContent=String(text);if(className)node.className=className;return node; };
  let report = null;

  async function getDetails(id) {
    const {data,error} = await supabase.functions.invoke('intervals-read', {
      body: {action:'get-activity-details',activityId:id}
    });
    if (error) {
      let reason = error.message || 'Detailverzoek mislukt';
      try { const json=await error.context?.json?.(); if (json?.error) reason=json.error; } catch { /* fallback */ }
      throw new Error(reason);
    }
    if (!data?.activity || typeof data.activity !== 'object') throw new Error('Geen geldig detailantwoord. Controleer deployment van intervals-read.');
    return data.activity;
  }

  function render(details,errors,start,end) {
    $('iat-output').hidden = false;
    $('iat-summary').replaceChildren();
    $('iat-activities').replaceChildren();
    const summary = summarizeIntervalsPeriod(details);
    report = buildPrivacySafeReport(details,{start,end});
    const cards=[
      ['Activiteiten',`${summary.count} detailrecords`],
      ['Load', summary.load.complete ? fmt(summary.load.value) : `${fmt(summary.load.value)} (onvolledig)`],
      ['Strain Score',summary.strain.score.complete ? fmt(summary.strain.score.value) : `${fmt(summary.strain.score.value)} (onvolledig)`],
      ['Powerzones',`${summary.powerZones.covered}/${summary.count} compleet`],
      ['Intervallen',`${summary.intervals.available}/${summary.count} aanwezig`]
    ];
    const tiles=document.createElement('div');tiles.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
    for (const [title,value] of cards) {
      const tile=el('div','');tile.style.cssText='border:1px solid rgba(128,128,128,.25);padding:10px;border-radius:8px;min-width:125px';
      tile.append(el('small',title),document.createElement('br'),el('strong',value));tiles.append(tile);
    }
    $('iat-summary').append(tiles);
    if (summary.powerZones.covered) {
      const table=el('table','');table.style.width='100%';
      const row=el('tr','');for(const key of ['Z1','Z2','Z3','Z4','Z5','Z6','Z7','S1','S2','S3'])row.append(el('th',key));table.append(row);
      const valueRow=el('tr','');for(const key of ['Z1','Z2','Z3','Z4','Z5','Z6','Z7'])valueRow.append(el('td',minutes(summary.powerZones.seconds[key])));
      for(const key of ['S1','S2','S3'])valueRow.append(el('td',minutes(summary.powerZones.sSeconds[key])));
      table.append(valueRow);$('iat-summary').append(table);
    }
    for (const activity of details) {
      const parsed=analyzeIntervalsActivity(activity);
      const card=el('div','');card.style.cssText='padding:12px;border:1px solid rgba(128,128,128,.25);border-radius:10px';
      card.append(el('strong',`${parsed.date} · ${activity.name || 'Activiteit'}`));
      const line=el('p',`Load ${fmt(parsed.load)} · Strain ${fmt(parsed.strainScore)} · PI ${fmt(parsed.polarizationIndex)} · Class ${parsed.reportedClass ?? 'niet geleverd'}`,'l39-caption');card.append(line);
      card.append(el('p',`Aerobic ${fmt(parsed.strain.aerobic)} · Glycolytic ${fmt(parsed.strain.glycolytic)} · PCr ${fmt(parsed.strain.pcr)}`,'l39-caption'));
      const zoneLine=parsed.zones.status==='complete'
        ? `Vermogenszones: ${Object.entries(parsed.zones.seconds).map(([k,v])=>`${k} ${minutes(v)}`).join(' · ')} · Sweet Spot ${minutes(parsed.zones.sweetSpotSeconds)}`
        : `Zonegegevens ${parsed.zones.status}: ${parsed.zones.issues.join('; ')}`;
      card.append(el('p',zoneLine,'l39-caption'));
      const d=document.createElement('details');
      d.append(el('summary',`Gedetecteerde intervallen (${parsed.intervals.count})${parsed.intervalsTruncated?' – afgekapt':''}`));
      const table=el('table','');table.style.cssText='width:100%;font-size:12px';
      const hr=document.createElement('tr');['#','Duur','IF (indien geleverd)','Zone','Gem. W','Type'].forEach(v=>hr.append(el('th',v)));table.append(hr);
      parsed.intervals.records.forEach((r,i)=>{const tr=document.createElement('tr');[i+1,minutes(r.durationSeconds),fmt(r.intensity),r.zone??'—',fmt(r.averageWatts),r.type??'—'].forEach(v=>tr.append(el('td',v)));table.append(tr);});
      if (!parsed.intervals.records.length) d.append(el('p','Geen intervalrecords beschikbaar.'));else d.append(table);
      card.append(d);$('iat-activities').append(card);
    }
    if(errors.length) {
      const warning=el('p',`${errors.length} activiteit(en) konden niet worden opgehaald. De totalen zijn daardoor ONVOLLEDIG.`, 'l39-caption');
      $('iat-summary').prepend(warning);
      report.incompleteRequests=errors.length;
    }
  }

  $('iat-fetch').addEventListener('click',async()=>{
    const start=$('iat-from').value,end=$('iat-to').value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end){status('Gebruik geldige datums.');return;}
    const days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
    if(days>30){status('Kies maximaal 31 kalenderdagen per analyse.');return;}
    $('iat-fetch').disabled=true;$('iat-output').hidden=true;report=null;
    try {
      const {data:{user},error}=await supabase.auth.getUser();
      if(error||!user)throw new Error('Log eerst in op de planner.');
      status('Activiteitenlijst ophalen...');
      const activities=await fetchIntervalsActivities(start,end);
      if(!Array.isArray(activities))throw new Error('Geen geldige activiteitenlijst ontvangen.');
      if(activities.length>30)throw new Error('Meer dan 30 activiteiten. Kies een kortere periode.');
      const details=[], errors=[];
      // Sequential requests reduce burst pressure on Intervals.icu API.
      for(let i=0;i<activities.length;i++){
        status(`Activiteitsdetails ophalen: ${i+1}/${activities.length}...`);
        try { details.push(await getDetails(activities[i].id)); }
        catch(e){errors.push(String(e.message||e));}
      }
      render(details,errors,start,end);
      status(`Analyse gereed: ${details.length}/${activities.length} activiteitsdetails ontvangen.${errors.length?' Onvolledige gegevens!':''}`);
    } catch(e) {status(`Fout: ${e.message||'Onbekend'}`);} finally {$('iat-fetch').disabled=false;}
  });

  $('iat-copy').addEventListener('click',async()=>{
    if(!report)return;
    const json=JSON.stringify(report,null,2);
    try {await navigator.clipboard.writeText(json);$('iat-copystatus').textContent='Samenvatting gekopieerd. Controleer de inhoud voordat je deze deelt.';}
    catch {$('iat-copystatus').textContent='Kopiëren mislukt. Gebruik een browser via localhost of HTTPS.';}
  });
}
