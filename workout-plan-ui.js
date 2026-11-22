import { supabase } from './supabase-client.js';
import { initializeAvailability } from './availability-service.js';
import { nextMonday, dateKey, validateDraft } from './periodization-model.js';
import { WORKOUT_TYPES, proposeWorkoutWeek, evaluateWorkoutPlan } from './workout-plan-model.js';

const get = id => document.getElementById(id);
const typeEntries = Object.entries(WORKOUT_TYPES);
let activeUserId = null;
let currentWeek = null;
let availabilityByDate = null;
let currentSessions = [];
let generation = 0;

function planKey(userId, start) { return `mtb-workout-draft:v1:${userId}:${start}`; }
function blockKey(userId, start) { return `mtb-periodization-draft:v1:${userId}:${start}`; }
function say(message, error = false) {
  const status = get('wp-status');
  status.textContent = message;
  status.classList.toggle('wp-error', error);
}
function resetPrivate() {
  generation++;
  activeUserId = null;
  currentWeek = null;
  availabilityByDate = null;
  currentSessions = [];
  get('wp-content').hidden = true;
  get('wp-days').replaceChildren();
  say('Log in en laad je opgeslagen trainingsblok.');
}
function valueNumber(value) { return Math.round(value).toLocaleString('nl-NL'); }
function minutesLabel(value) { return `${Math.floor(value / 60)}u ${String(value % 60).padStart(2, '0')}m`; }

function render() {
  if (!currentWeek || !availabilityByDate) return;
  const assessment = evaluateWorkoutPlan({
    week: currentWeek,
    availabilityByDate,
    sessions: currentSessions
  });
  const container = get('wp-days');
  container.replaceChildren();

  for (const day of assessment.days) {
    const row = document.createElement('div');
    row.className = 'wp-day-row';
    const name = document.createElement('div');
    name.className = 'wp-day-info';
    const heading = document.createElement('strong');
    heading.textContent = `${day.dayName} · ${day.date}`;
    const available = document.createElement('small');
    available.textContent = `${minutesLabel(day.availableMinutes)} beschikbaar`;
    name.append(heading, available);
    row.appendChild(name);

    const select = document.createElement('select');
    select.setAttribute('aria-label', `Type training ${day.date}`);
    const options = [['', 'Rust / geen training'], ...typeEntries.map(([key, value]) => [key, value.label])];
    for (const [key, label] of options) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = day.session?.type ?? '';
    select.disabled = day.availableMinutes < 15;

    const duration = document.createElement('input');
    duration.type = 'number';
    duration.min = '15';
    duration.max = String(Math.min(day.availableMinutes, 360));
    duration.step = '15';
    duration.value = day.session?.durationMinutes ?? '';
    duration.placeholder = 'min';
    duration.setAttribute('aria-label', `Trainingsduur in minuten ${day.date}`);
    duration.disabled = !day.session;

    const load = document.createElement('strong');
    load.className = 'wp-row-load';
    load.textContent = day.session ? `${day.session.estimatedLoad} load` : '—';

    function commit(type, durationMinutes) {
      const next = currentSessions.filter(s => s.date !== day.date);
      if (type) next.push({ date: day.date, type, durationMinutes });
      try {
        evaluateWorkoutPlan({ week: currentWeek, availabilityByDate, sessions: next });
        currentSessions = next;
        render();
        say('Concept aangepast. Bewaar het om de wijzigingen te behouden.');
      } catch (error) {
        say(error.message, true);
        render();
      }
    }
    select.addEventListener('change', () => {
      const type = select.value;
      if (!type) return commit('', 0);
      const initial = day.session?.durationMinutes ?? Math.min(60, Math.floor(day.availableMinutes / 15) * 15);
      commit(type, Math.max(15, initial));
    });
    duration.addEventListener('change', () => {
      if (!day.session) return;
      const newValue = Number(duration.value);
      commit(day.session.type, newValue);
    });

    row.append(select, duration, load);
    container.appendChild(row);
  }

  get('wp-summary').textContent =
    `${valueNumber(assessment.totalLoad)} / ${valueNumber(assessment.targetLoad)} loadpunten (${assessment.completionPercent}%) · ` +
    `${minutesLabel(assessment.totalMinutes)} gepland van ${minutesLabel(assessment.availableMinutes)} beschikbaar.`;
  get('wp-warnings').textContent = assessment.warnings.length
    ? assessment.warnings.join(' ') : 'Geen automatische waarschuwingen. Controleer zelf de gekozen trainingsprikkels en het herstel.';
  get('wp-content').hidden = false;
}

async function loadWeek() {
  const call = ++generation;
  get('wp-load').disabled = true;
  say('Beschikbaarheid en periodiseringsconcept laden…');
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Log eerst in.');
    const userId = data.user.id;
    const start = dateKey(nextMonday(new Date()));
    const saved = localStorage.getItem(blockKey(userId, start));
    if (!saved) throw new Error('Bewaar eerst een vierweeks trainingsblok onder Analyse (les 34).');
    const block = validateDraft(JSON.parse(saved));
    const week = block.weeks[0];
    const monday = new Date(`${week.start}T12:00:00`);
    const { state } = await initializeAvailability(userId, monday);
    if (!state || typeof state.getEffective !== 'function') {
      throw new Error('Beschikbaarheid kon niet worden geladen.');
    }
    const availability = {};
    for (let day = 0; day < 7; day++) {
      const date = new Date(monday);
      date.setDate(date.getDate() + day);
      const key = dateKey(date);
      availability[key] = state.getEffective(key);
    }
    if (call !== generation || get('dashboard-section').hidden) return;
    activeUserId = userId;
    currentWeek = week;
    availabilityByDate = availability;
    const stored = localStorage.getItem(planKey(userId, week.start));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        currentSessions = evaluateWorkoutPlan({ week, availabilityByDate: availability, sessions: parsed.sessions }).sessions
          .map(s => ({ date: s.date, type: s.type, durationMinutes: s.durationMinutes }));
        say('Bewaard weekconcept geladen.');
      } catch {
        currentSessions = proposeWorkoutWeek({ week, availabilityByDate: availability }).sessions
          .map(s => ({ date: s.date, type: s.type, durationMinutes: s.durationMinutes }));
        say('Het bewaarde concept past niet meer bij je beschikbaarheid; nieuw voorstel gemaakt.');
      }
    } else {
      currentSessions = proposeWorkoutWeek({ week, availabilityByDate: availability }).sessions
        .map(s => ({ date: s.date, type: s.type, durationMinutes: s.durationMinutes }));
      say('Voorstel berekend. Controleer de inhoud voordat je bewaart.');
    }
    get('wp-week').textContent = `Week 1 · ${week.start} t/m ${week.end} · ${week.phase}`;
    render();
  } catch (error) {
    if (call !== generation) return;
    get('wp-content').hidden = true;
    say(`Laden mislukt: ${error.message}`, true);
  } finally {
    if (call === generation) get('wp-load').disabled = false;
  }
}

async function save() {
  try {
    if (!activeUserId || !currentWeek) throw new Error('Laad eerst een weekconcept.');
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user?.id !== activeUserId) throw new Error('Gebruiker gewijzigd; laad opnieuw.');
    if (dateKey(nextMonday(new Date())) !== currentWeek.start) throw new Error('De startweek is gewijzigd. Laad opnieuw.');
    const result = evaluateWorkoutPlan({ week: currentWeek, availabilityByDate, sessions: currentSessions });
    localStorage.setItem(planKey(activeUserId, currentWeek.start), JSON.stringify({
      version: 1, start: currentWeek.start, sessions: result.sessions.map(s => ({ date: s.date, type: s.type, durationMinutes: s.durationMinutes }))
    }));
    say('Weekconcept lokaal bewaard. Er zijn geen trainingen naar Intervals.icu of je kalender verstuurd.');
  } catch (error) { say(error.message, true); }
}

function regenerate() {
  try {
    if (!currentWeek) throw new Error('Laad eerst je periodiseringsconcept.');
    currentSessions = proposeWorkoutWeek({ week: currentWeek, availabilityByDate }).sessions
      .map(s => ({ date: s.date, type: s.type, durationMinutes: s.durationMinutes }));
    render();
    say('Voorstel opnieuw berekend; nog niet bewaard.');
  } catch (error) { say(error.message, true); }
}

function initialize() {
  const root = get('workout-planner');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';
  root.innerHTML = `
    <div class="wp-heading">
      <div><p class="pn-overline">TRAININGSVOORSTEL</p><h3>Van weekload naar trainingen</h3>
        <p>Een eerste voorstel voor de komende week. De totale TSS/load blijft de leidraad; beschikbaarheid bepaalt wat praktisch past.</p></div>
      <button id="wp-load" type="button">Laad weekvoorstel</button>
    </div>
    <p id="wp-status" role="status">Laad het bewaarde periodiseringsconcept uit Analyse.</p>
    <div id="wp-content" hidden>
      <p class="wp-week" id="wp-week"></p>
      <div class="wp-headings"><span>Dag</span><span>Training</span><span>Minuten</span><span>Load*</span></div>
      <div id="wp-days" class="wp-days"></div>
      <p id="wp-summary" class="wp-summary"></p>
      <p id="wp-warnings" class="wp-warnings"></p>
      <div class="wp-actions"><button id="wp-regenerate" type="button" class="wp-secondary">Bereken opnieuw</button><button id="wp-save" type="button">Bewaar weekconcept</button></div>
      <p class="wp-explanation">* Schatting met IF voor de héle fietstraining (inclusief warming-up en rust). Intervallen binnen threshold/VO₂max zijn hiermee nog niet gespecificeerd. Er wordt niets naar Intervals.icu of Supabase geschreven.</p>
    </div>`;
  get('wp-load').addEventListener('click', loadWeek);
  get('wp-regenerate').addEventListener('click', regenerate);
  get('wp-save').addEventListener('click', save);
  supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') resetPrivate(); });
}
initialize();
