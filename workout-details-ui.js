// Les 37: workoutdetails met protocolkeuze en modelmatige NP/TSS.
import { supabase } from './supabase-client.js';
import { dateKey, nextMonday, validateDraft } from './periodization-model.js';
import { createStructuredWorkout, toIntervalsWorkoutText, SESSION_NAMES } from './workout-details-model.js';
import { estimateWorkoutTss, WORKOUT_PROTOCOLS } from './workout-load-model.js';

const root = document.getElementById('workout-details');
const $ = id => document.getElementById(id);
let current = null;
let requestId = 0;
const draftKey = (id, monday) => `mtb-workout-draft:v1:${id}:${monday}`;
const blockKey = (id, monday) => `mtb-periodization-draft:v1:${id}:${monday}`;
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
  $('wd-profile').replaceChildren();
  $('wd-export').value = '';
  $('wd-summary').textContent = '';
}
function getCurrentSession() {
  if (!current) return null;
  return current.sessions[Number($('wd-sessions').value)] ?? null;
}
function updateProtocols() {
  const session = getCurrentSession();
  const select = $('wd-protocol');
  select.replaceChildren();
  if (!session) return;
  for (const protocol of WORKOUT_PROTOCOLS[session.type] ?? []) {
    const option = document.createElement('option');
    option.value = protocol.id;
    option.textContent = protocol.label;
    select.appendChild(option);
  }
}
function addCell(row, value) {
  const td = document.createElement('td');
  td.textContent = String(value);
  row.appendChild(td);
}
function renderProfile(workout) {
  const track = $('wd-profile');
  track.replaceChildren();
  for (const block of workout.steps) {
    const segment = document.createElement('div');
    segment.className = 'wd-profile-segment';
    segment.classList.add(block.kind === 'work' ? 'wd-profile-hard' :
      block.kind === 'endurance' ? 'wd-profile-endurance' : 'wd-profile-easy');
    segment.style.flexGrow = String(block.seconds);
    segment.title = `${block.label}: ${block.seconds / 60} min, ${block.percentFtp}% FTP`;
    track.appendChild(segment);
  }
}
function renderWorkout() {
  const session = getCurrentSession();
  if (!session) return;
  try {
    const ftp = Number($('wd-ftp').value);
    const workout = createStructuredWorkout({
      type: session.type,
      durationMinutes: session.durationMinutes,
      ftp,
      protocol: $('wd-protocol').value,
      phase: current.phase
    });
    const estimate = estimateWorkoutTss(workout);

    $('wd-steps').replaceChildren();
    for (const block of workout.steps) {
      const tr = document.createElement('tr');
      for (const value of [block.label, `${block.seconds / 60} min`, `${block.percentFtp}%`, `${block.watts} W`]) {
        addCell(tr, value);
      }
      $('wd-steps').appendChild(tr);
    }
    renderProfile(workout);
    $('wd-np').textContent = `${Math.round(estimate.normalizedPowerWatts)} W`;
    $('wd-if').textContent = estimate.intensityFactor.toFixed(2);
    $('wd-tss').textContent = estimate.estimatedTss.toFixed(1);
    $('wd-segment-load').textContent = String(workout.estimatedSegmentLoad);
    $('wd-summary').textContent =
      `${workout.title} · ${workout.durationMinutes} min · ${workout.hardMinutes} min intensief · fase: ${current.phase}.`;
    $('wd-export').value = toIntervalsWorkoutText(workout);
    status('Workout berekend met gemodelleerde doelvermogens. Vergelijk de TSS na import met Intervals.icu.');
  } catch (error) {
    $('wd-steps').replaceChildren();
    $('wd-profile').replaceChildren();
    $('wd-export').value = '';
    for (const id of ['wd-np', 'wd-if', 'wd-tss', 'wd-segment-load']) $(id).textContent = '—';
    $('wd-summary').textContent = '';
    status(error.message, true);
  }
}
function lookupPhase(userId, monday) {
  const saved = localStorage.getItem(blockKey(userId, monday));
  if (!saved) return { phase: 'Opbouw', known: false };
  try {
    const block = validateDraft(JSON.parse(saved));
    const week = block.weeks.find(w => w.start === monday);
    if (week) return { phase: week.phase, known: true };
  } catch (error) {
    console.warn('Periodiseringsconcept niet leesbaar:', error);
  }
  return { phase: 'Opbouw', known: false };
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
    if (!stored) throw new Error('Bewaar eerst je weekconcept in Weekplanner → Trainingsvoorstel (les 35).');
    const parsed = JSON.parse(stored);
    if (parsed.version !== 1 || parsed.start !== monday || !Array.isArray(parsed.sessions)) {
      throw new Error('Het bewaarde weekconcept heeft een onbekend formaat.');
    }
    const sessions = parsed.sessions.filter(s =>
      s && SESSION_NAMES[s.type] && /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
      Number.isInteger(s.durationMinutes) && s.durationMinutes >= 15 && s.durationMinutes <= 360
    ).sort((a, b) => a.date.localeCompare(b.date));
    if (sessions.length === 0) throw new Error('Geen fietstrainingen in het opgeslagen concept.');
    if (call !== requestId || $('dashboard-section').hidden) return;

    const phaseInfo = lookupPhase(data.user.id, monday);
    current = { id: data.user.id, monday, sessions, phase: phaseInfo.phase };
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
    $('wd-phase').textContent = phaseInfo.known
      ? `Trainingsfase uit periodiseringsconcept: ${phaseInfo.phase}`
      : 'Geen periodiseringsfase gevonden: voorlopig Opbouw. Controleer je concept.';
    $('wd-content').hidden = false;
    updateProtocols();
    if (savedFtp) renderWorkout();
    else status('Voer je actuele FTP in om de workout te berekenen.');
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
    status('Workouttekst gekopieerd. Controleer de workout en belasting in Intervals.icu.');
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
    <div class="wd-head"><div><p class="pn-overline">LES 37 · TRAININGSOPBOUW</p><h3>Trainingsdetails & vermogen</h3>
      <p>Varianten voor threshold en VO₂max, plus een TSS-schatting uit het voorgeschreven vermogensprofiel.</p></div>
      <button type="button" id="wd-load">Laad weekconcept</button></div>
    <p id="wd-status" role="status">Laad eerst je bewaarde trainingsweek.</p>
    <div id="wd-content" hidden>
      <p id="wd-phase" class="wd-phase"></p>
      <div class="wd-controls">
        <label>Training<select id="wd-sessions"></select></label>
        <label>Protocol<select id="wd-protocol"></select></label>
        <label>FTP (watt)<input type="number" min="100" max="600" step="1" placeholder="bijv. 290" id="wd-ftp"></label>
        <button type="button" id="wd-apply">Bereken workout</button>
      </div>
      <div id="wd-profile" class="wd-profile" aria-label="Vermogensblokken van deze workout"></div>
      <div class="wd-metrics">
        <div><span>Gemodelleerde NP</span><strong id="wd-np">—</strong></div>
        <div><span>Intensity Factor</span><strong id="wd-if">—</strong></div>
        <div><span>Geschatte power-TSS</span><strong id="wd-tss">—</strong></div>
        <div><span>Oude segmentproxy</span><strong id="wd-segment-load">—</strong></div>
      </div>
      <div class="wd-table-wrap"><table class="wd-table"><thead><tr><th>Blok</th><th>Duur</th><th>FTP</th><th>Doelvermogen</th></tr></thead><tbody id="wd-steps"></tbody></table></div>
      <p id="wd-summary" class="wd-summary"></p>
      <p class="wd-note">Deze NP en power-TSS zijn berekend uit ideale, constante doelvermogens per blok, met een 30-secondenvenster. Het is geen meting; werkelijk TSS en Intervals.icu-load kunnen afwijken.</p>
      <label class="wd-export-label" for="wd-export">Workouttekst voor Intervals.icu</label>
      <textarea id="wd-export" rows="11" readonly></textarea>
      <button type="button" id="wd-copy">Kopieer workouttekst</button>
      <p class="wd-note">Er worden geen workouts automatisch naar Intervals.icu of Supabase gestuurd.</p>
    </div>`;
  $('wd-load').addEventListener('click', loadDraft);
  $('wd-sessions').addEventListener('change', () => { updateProtocols(); renderWorkout(); });
  $('wd-protocol').addEventListener('change', renderWorkout);
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
