import { supabase } from './supabase-client.js';
import { dateKey, nextMonday } from './periodization-model.js';
import { createStructuredWorkout, toIntervalsWorkoutText, SESSION_NAMES } from './workout-details-model.js';

const root = document.getElementById('workout-details');
const $ = id => document.getElementById(id);
let current = null;
let requestId = 0;
const draftKey = (id, monday) => `mtb-workout-draft:v1:${id}:${monday}`;
const ftpKey = id => `mtb-workout-ftp:v1:${id}`;

function status(message, error = false) {
  $('wd-status').textContent = message;
  $('wd-status').classList.toggle('wd-error', error);
}
function clear() {
  current = null;
  $('wd-content').hidden = true;
  $('wd-sessions').replaceChildren();
  $('wd-steps').replaceChildren();
  $('wd-export').value = '';
}
function renderWorkout() {
  if (!current) return;
  const index = Number($('wd-sessions').value);
  const session = current.sessions[index];
  if (!session) return;
  try {
    const ftp = Number($('wd-ftp').value);
    const result = createStructuredWorkout({ type: session.type, durationMinutes: session.durationMinutes, ftp });
    const rows = $('wd-steps');
    rows.replaceChildren();
    for (const s of result.steps) {
      const tr = document.createElement('tr');
      for (const value of [s.label, `${s.seconds / 60} min`, `${s.percentFtp}%`, `${s.watts} W`]) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        tr.appendChild(cell);
      }
      rows.appendChild(tr);
    }
    $('wd-summary').textContent = `${result.title} · ${result.durationMinutes} min · ${result.hardMinutes} min intensief · indicatieve segmentbelasting ${result.estimatedSegmentLoad}.`;
    $('wd-export').value = toIntervalsWorkoutText(result);
    status('Workout samengesteld. Controleer de vermogens en intervallen voordat je hem gebruikt.');
  } catch (error) {
    $('wd-steps').replaceChildren();
    $('wd-export').value = '';
    $('wd-summary').textContent = '';
    status(error.message, true);
  }
}
async function loadDraft() {
  const call = ++requestId;
  status('Bewaard trainingsconcept ophalen…');
  clear();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Log eerst in.');
    const monday = dateKey(nextMonday(new Date()));
    const stored = localStorage.getItem(draftKey(data.user.id, monday));
    if (!stored) throw new Error('Bewaar eerst je weekconcept in de Weekplanner (les 35).');
    const parsed = JSON.parse(stored);
    if (parsed.version !== 1 || parsed.start !== monday || !Array.isArray(parsed.sessions)) {
      throw new Error('Het bewaarde weekconcept heeft een onbekend formaat.');
    }
    const sessions = parsed.sessions.filter(s =>
      s && SESSION_NAMES[s.type] && /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
      Number.isInteger(s.durationMinutes) && s.durationMinutes >= 15 && s.durationMinutes <= 360
    ).sort((a,b) => a.date.localeCompare(b.date));
    if (sessions.length === 0) throw new Error('Geen fietstrainingen in het opgeslagen concept.');
    if (call !== requestId || $('dashboard-section').hidden) return;
    current = { id: data.user.id, monday, sessions };
    const select = $('wd-sessions');
    select.replaceChildren();
    sessions.forEach((s, i) => {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = `${s.date} · ${SESSION_NAMES[s.type]} · ${s.durationMinutes} min`;
      select.appendChild(option);
    });
    const savedFtp = localStorage.getItem(ftpKey(data.user.id));
    $('wd-ftp').value = savedFtp ?? '';
    $('wd-content').hidden = false;
    if (savedFtp) renderWorkout();
    else status('Voer je actuele FTP in om de doelvermogens te berekenen.');
  } catch (error) {
    if (call !== requestId) return;
    status(error.message, true);
  }
}
async function updateFtp() {
  try {
    if (!current) throw new Error('Laad eerst je trainingsconcept.');
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user?.id !== current.id) throw new Error('Gebruiker gewijzigd. Laad opnieuw.');
    const ftp = Number($('wd-ftp').value);
    if (!Number.isInteger(ftp) || ftp < 100 || ftp > 600) throw new Error('FTP moet tussen 100 en 600 watt liggen.');
    localStorage.setItem(ftpKey(current.id), String(ftp));
    renderWorkout();
  } catch (error) { status(error.message, true); }
}
async function copyWorkout() {
  const value = $('wd-export').value;
  if (!value) return status('Maak eerst een geldige workout.', true);
  try {
    await navigator.clipboard.writeText(value);
    status('Workouttekst gekopieerd. Plak deze in de workout-editor van Intervals.icu.');
  } catch {
    $('wd-export').focus();
    $('wd-export').select();
    status('Automatisch kopiëren niet toegestaan. Selecteer de tekst en kopieer handmatig.', true);
  }
}
function init() {
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';
  root.innerHTML = `
    <div class="wd-head"><div><p class="pn-overline">LES 36 · UITVOERBARE WORKOUTS</p><h3>Trainingsdetails & vermogen</h3>
      <p>Maak van je bewaarde weekconcept een workout met blokken en doelvermogens.</p></div>
      <button type="button" id="wd-load">Laad weekconcept</button></div>
    <p id="wd-status" role="status">Laad eerst je trainingsweek uit les 35.</p>
    <div id="wd-content" hidden>
      <div class="wd-controls"><label>Training<select id="wd-sessions"></select></label>
        <label>FTP (watt)<input type="number" min="100" max="600" step="1" placeholder="bijv. 290" id="wd-ftp"></label>
        <button type="button" id="wd-apply">Bereken workout</button></div>
      <div class="wd-table-wrap"><table class="wd-table"><thead><tr><th>Blok</th><th>Duur</th><th>FTP</th><th>Doelvermogen</th></tr></thead><tbody id="wd-steps"></tbody></table></div>
      <p id="wd-summary" class="wd-summary"></p>
      <p class="wd-note">De segmentbelasting is een ruwe schatting, niet de exacte TSS. Werkelijke TSS gebruikt Normalized Power van het volledige vermogensprofiel.</p>
      <label class="wd-export-label" for="wd-export">Kopieerbare workout voor Intervals.icu</label>
      <textarea id="wd-export" rows="11" readonly></textarea>
      <button type="button" id="wd-copy">Kopieer workouttekst</button>
      <p class="wd-note">Alleen handmatig kopiëren: er worden geen workouts naar Intervals.icu of Supabase gestuurd.</p>
    </div>`;
  $('wd-load').addEventListener('click', loadDraft);
  $('wd-sessions').addEventListener('change', renderWorkout);
  $('wd-apply').addEventListener('click', updateFtp);
  $('wd-copy').addEventListener('click', copyWorkout);
  supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      ++requestId;
      clear();
      status('Log in om trainingen te bekijken.');
    }
  });
}
init();
