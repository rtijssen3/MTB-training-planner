// Les 38 - Weekbelasting uit individuele gestructureerde trainingen.
import { supabase } from './supabase-client.js';
import { initializeAvailability } from './availability-service.js';
import { dateKey, nextMonday, validateDraft } from './periodization-model.js';
import { analyzeStructuredWeek } from './weekly-workout-load.js';
import { WORKOUT_PROTOCOLS } from './workout-load-model.js';

const root = document.getElementById('weekly-workout-load');
const $ = id => document.getElementById(id);
let current = null;
let generation = 0;
const draftKey = (id, week) => `mtb-workout-draft:v1:${id}:${week}`;
const blockKey = (id, week) => `mtb-periodization-draft:v1:${id}:${week}`;
const ftpKey = id => `mtb-workout-ftp:v1:${id}`;
const typeLabels = { endurance: 'Duur Z2', threshold: 'Threshold', vo2max: 'VO₂max' };
const fmt = value => value === null ? '—' : value.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
const minutes = value => `${Math.floor(value / 60)}u ${String(value % 60).padStart(2, '0')}m`;
function status(text, error = false) { $('ww-status').textContent = text; $('ww-status').classList.toggle('ww-error', error); }
function cell(row, value) { const td = document.createElement('td'); td.textContent = String(value); row.appendChild(td); }
function clear() { current = null; $('ww-content').hidden = true; $('ww-rows').replaceChildren(); $('ww-breakdown').replaceChildren(); }
function protocolsFromControls() {
  const result = {};
  for (const node of root.querySelectorAll('[data-ww-protocol]')) result[node.dataset.wwProtocol] = node.value;
  return result;
}
function makeProtocolSelect(session) {
  const select = document.createElement('select');
  select.dataset.wwProtocol = session.date;
  select.setAttribute('aria-label', `Protocol voor ${session.date}`);
  for (const protocol of WORKOUT_PROTOCOLS[session.type] || []) {
    const opt = document.createElement('option'); opt.value = protocol.id; opt.textContent = protocol.label; select.appendChild(opt);
  }
  select.value = current.protocols[session.date] ?? 'classic';
  select.addEventListener('change', () => { current.protocols[session.date] = select.value; render(); });
  return select;
}
function renderTable() {
  const rows = $('ww-rows'); rows.replaceChildren();
  for (const session of current.sessions) {
    const tr = document.createElement('tr');
    cell(tr, session.date);
    cell(tr, typeLabels[session.type] ?? session.type);
    const choice = document.createElement('td'); choice.appendChild(makeProtocolSelect(session)); tr.appendChild(choice);
    cell(tr, `${session.durationMinutes} min`);
    const value = document.createElement('td');
    value.dataset.wwTss = session.date;
    value.textContent = '—'; tr.appendChild(value);
    rows.appendChild(tr);
  }
}
function render() {
  if (!current) return;
  const ftp = Number($('ww-ftp').value);
  try {
    const analysis = analyzeStructuredWeek({ week: current.week, sessions: current.sessions,
      availabilityByDate: current.availability, ftp, protocols: current.protocols });
    $('ww-target').textContent = fmt(analysis.targetLoad);
    $('ww-estimated').textContent = fmt(analysis.estimatedTss);
    $('ww-progress').textContent = analysis.percent === null ? '—' : `${analysis.percent}%`;
    $('ww-progress-fill').style.width = `${Math.max(0, Math.min(100, analysis.percent ?? 0))}%`;
    $('ww-time').textContent = `${minutes(analysis.totalMinutes)} / ${minutes(analysis.availableMinutes)} beschikbaar`;
    for (const row of analysis.rows) {
      const node = root.querySelector('[data-ww-tss="' + row.date + '"]');
      if (node) { node.textContent = row.problem ? 'Niet berekenbaar' : fmt(row.estimatedTss); node.title = row.problem ?? ''; }
    }
    const breakdown = $('ww-breakdown'); breakdown.replaceChildren();
    for (const [type, label] of Object.entries(typeLabels)) {
      const part = analysis.breakdown[type];
      const tile = document.createElement('div'); tile.className = 'ww-type';
      const heading = document.createElement('span'); heading.textContent = label;
      const value = document.createElement('strong'); value.textContent = `${fmt(part.tss)} TSS`;
      const detail = document.createElement('small');
      detail.textContent = `${part.sessions} sessies · ${minutes(part.minutes)}` +
        (type !== 'endurance' ? ` · ${fmt(part.hardMinutes)} min intervallen` : '');
      tile.append(heading, value, detail); breakdown.appendChild(tile);
    }
    $('ww-warnings').replaceChildren();
    for (const message of analysis.warnings) {
      const li = document.createElement('li'); li.textContent = message; $('ww-warnings').appendChild(li);
    }
    $('ww-note').textContent = analysis.complete
      ? 'NP-gebaseerde schatting uit alle voorgeschreven workouts. Vergelijk later met werkelijke Intervals.icu-load.'
      : `${analysis.unmodeled} workouts niet berekenbaar. Week-TSS en voortgang blijven onbekend totdat dit is opgelost.`;
    status('Weekanalyse bijgewerkt. Protocolkeuzes veranderen alleen deze voorbeeldanalyse.');
  } catch (error) {
    status(error.message, true);
    $('ww-estimated').textContent = '—'; $('ww-progress').textContent = '—';
    $('ww-progress-fill').style.width = '0%';
    for (const node of root.querySelectorAll('[data-ww-tss]')) node.textContent = '—';
    $('ww-breakdown').replaceChildren(); $('ww-warnings').replaceChildren();
  }
}
async function load() {
  const call = ++generation;
  $('ww-load').disabled = true; clear(); status('Bewaard weekconcept en beschikbaarheid ophalen...');
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Log eerst in.');
    const userId = data.user.id;
    const monday = dateKey(nextMonday(new Date()));
    const saved = localStorage.getItem(draftKey(userId, monday));
    if (!saved) throw new Error('Bewaar eerst een weekconcept onder Weekplanner → Trainingsvoorstel.');
    const parsed = JSON.parse(saved);
    if (parsed.version !== 1 || parsed.start !== monday || !Array.isArray(parsed.sessions)) throw new Error('Onbekend weekconceptformaat.');
    const blockString = localStorage.getItem(blockKey(userId, monday));
    if (!blockString) throw new Error('Bewaar eerst het vierweekse belastingblok onder Analyse.');
    const block = validateDraft(JSON.parse(blockString));
    const week = block.weeks.find(w => w.start === monday);
    if (!week) throw new Error('Weekdoel ontbreekt in het periodiseringsblok.');
    const { state } = await initializeAvailability(userId, new Date(monday + 'T12:00:00'));
    if (!state || typeof state.getEffective !== 'function') throw new Error('Beschikbaarheidsgegevens ontbreken.');
    const availability = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday + 'T12:00:00'); d.setDate(d.getDate() + i);
      const key = dateKey(d); availability[key] = state.getEffective(key);
    }
    const ftpStored = localStorage.getItem(ftpKey(userId));
    if (call !== generation || $('dashboard-section').hidden) return;
    current = { userId, week, sessions: parsed.sessions, availability, protocols: {} };
    $('ww-week').textContent = `Week ${week.week}: ${week.start} – ${week.end} · ${week.phase}`;
    $('ww-ftp').value = ftpStored ?? '';
    $('ww-content').hidden = false;
    renderTable();
    if (ftpStored) render();
    else status('Vul je FTP in en klik op Bereken weekbelasting.');
  } catch (error) { if (call === generation) status(error.message, true); }
  finally { if (call === generation) $('ww-load').disabled = false; }
}
async function calculate() {
  if (!current) return status('Laad eerst het bewaarde weekconcept.', true);
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== current.userId) return status('Gebruiker veranderd. Laad opnieuw.', true);
  const ftp = Number($('ww-ftp').value);
  if (!Number.isInteger(ftp) || ftp < 100 || ftp > 600) return status('Vul een FTP tussen 100 en 600 watt in.', true);
  localStorage.setItem(ftpKey(current.userId), String(ftp));
  render();
}
function init() {
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';
  root.innerHTML = `
    <div class="ww-header"><div><p class="pn-overline">LES 38 · TRAININGSANALYSE</p><h3>Geplande weekbelasting</h3>
    <p>NP-gebaseerde TSS uit alle gestructureerde workouts. Beschikbaarheid blijft in uren.</p></div>
    <button type="button" id="ww-load">Laad bewaarde week</button></div>
    <p id="ww-status" role="status">Laad je conceptweek om de belasting te analyseren.</p>
    <div id="ww-content" hidden>
      <p class="ww-week" id="ww-week"></p>
      <div class="ww-ftp-controls"><label for="ww-ftp">FTP (watt)</label><input type="number" id="ww-ftp" min="100" max="600" step="1" placeholder="bijv. 290">
      <button type="button" id="ww-calculate">Bereken weekbelasting</button></div>
      <div class="ww-kpis"><div><span>Doel (load)</span><strong id="ww-target">—</strong></div>
      <div><span>Geschatte power-TSS</span><strong id="ww-estimated">—</strong></div>
      <div><span>Voortgang</span><strong id="ww-progress">—</strong></div></div>
      <div class="ww-progress"><div id="ww-progress-fill"></div></div>
      <p class="ww-time" id="ww-time"></p>
      <h4>Verdeling per trainingsvorm</h4><div class="ww-breakdown" id="ww-breakdown"></div>
      <h4>Trainingen en protocollen</h4><div class="ww-table-wrap"><table class="ww-table"><thead><tr><th>Datum</th><th>Training</th><th>Protocol</th><th>Duur</th><th>TSS</th></tr></thead><tbody id="ww-rows"></tbody></table></div>
      <ul class="ww-warnings" id="ww-warnings"></ul><p class="ww-note" id="ww-note"></p>
      <p class="ww-note">Deze analyse wijzigt het opgeslagen weekconcept niet en verstuurt niets naar Intervals.icu.</p>
    </div>`;
  $('ww-load').addEventListener('click', load);
  $('ww-calculate').addEventListener('click', calculate);
  supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { ++generation; clear(); status('Log in om je trainingen te bekijken.'); } });
}
init();
