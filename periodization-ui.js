// Les 34: handmatig aanpasbaar concept-blok in de Analyse-tab.
// Geen wijzigingen aan de bestaande kalender of Supabase-database.
import { supabase } from './supabase-client.js';
import { fetchTrainingHistory } from './training-history.js';
import { createDraft, validateDraft, assessDraft, nextMonday, dateKey } from './periodization-model.js';

const el = id => document.getElementById(id);
let activeUserId = null;
let draft = null;
let history = null;
let requestId = 0;

function key(userId, start) {
  return `mtb-periodization-draft:v1:${userId}:${start}`;
}

function status(message, error = false) {
  const node = el('pz-status');
  node.textContent = message;
  node.classList.toggle('pz-error', error);
}

function resetPrivate() {
  ++requestId;
  activeUserId = null;
  history = null;
  draft = null;
  el('pz-editor').hidden = true;
  el('pz-history').textContent = 'Historische load nog niet geladen.';
  el('pz-weeks').replaceChildren();
  status('Log in om een trainingsblok te ontwerpen.');
}

function renderDraft() {
  const table = el('pz-weeks');
  table.replaceChildren();
  if (!draft) return;
  draft.weeks.forEach((week, index) => {
    const row = document.createElement('div');
    row.className = 'pz-week';
    const label = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = `Week ${index + 1} · ${week.phase}`;
    const span = document.createElement('span');
    span.textContent = `${week.start} t/m ${week.end}`;
    label.append(strong, span);
    const input = document.createElement('input');
    input.type = 'number'; input.min = '1'; input.max = '3000'; input.step = '1';
    input.value = String(week.targetLoad);
    input.setAttribute('aria-label', `Belastingdoel week ${index + 1}`);
    input.addEventListener('change', () => {
      // Ongevalideerde invoer bewaren we niet als plan.
      try {
        const proposal = { ...draft, weeks: draft.weeks.map((w, i) =>
          i === index ? { ...w, targetLoad: Number(input.value) } : w) };
        draft = validateDraft(proposal);
        input.setCustomValidity('');
        renderAssessment();
      } catch (error) {
        input.setCustomValidity(error.message);
        input.reportValidity();
        status(error.message, true);
      }
    });
    row.append(label, input);
    table.appendChild(row);
  });
  renderAssessment();
}

function renderAssessment() {
  if (!draft) return;
  try {
    const assessed = assessDraft(draft, history?.recentFourWeekAverage, history ?? {});
    el('pz-total').textContent = `${assessed.totalLoad.toLocaleString('nl-NL')} loadpunten in 4 weken · gemiddeld ${assessed.averageLoad}/week`;
    el('pz-notes').textContent = assessed.notes.length
      ? assessed.notes.join(' ') : 'Geen automatische waarschuwingen. Dit is nog geen gevalideerd trainingsadvies.';
  } catch (error) {
    status(error.message, true);
  }
}

async function loadData() {
  const myRequest = ++requestId;
  el('pz-load').disabled = true;
  status('Historische trainingsbelasting ophalen…');
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Log eerst in.');
    const userId = data.user.id;
    const currentHistory = await fetchTrainingHistory(new Date());
    if (myRequest !== requestId || el('dashboard-section').hidden) return;
    activeUserId = userId;
    history = currentHistory;
    const avg = currentHistory.recentFourWeekAverage;
    el('pz-history').textContent =
      `Gemiddelde afgelopen 4 volledige weken: ${Math.round(avg)} load/week. ` +
      `Over 12 weken: ${currentHistory.activityCount} activiteiten. ` +
      (currentHistory.emptyWeeks ? `${currentHistory.emptyWeeks} lege weken. ` : '') +
      (currentHistory.totalMissingLoad ? `${currentHistory.totalMissingLoad} activiteiten zonder load.` : '');
    const start = dateKey(nextMonday(new Date()));
    const stored = localStorage.getItem(key(userId, start));
    if (stored) {
      try { draft = validateDraft(JSON.parse(stored)); }
      catch { draft = null; }
    } else draft = null;
    el('pz-base').value = avg > 0 ? String(Math.round(avg)) : '';
    el('pz-editor').hidden = false;
    if (draft) {
      renderDraft();
      status('Bewaard concept voor de komende vier weken geladen.');
    } else {
      status('Historie geladen. Kies zelf je startbelasting en maak een concept.');
    }
  } catch (error) {
    if (myRequest !== requestId) return;
    el('pz-editor').hidden = true;
    status(`Laden mislukt: ${error.message}`, true);
  } finally {
    if (myRequest === requestId) el('pz-load').disabled = false;
  }
}

function generate() {
  try {
    if (!activeUserId) throw new Error('Laad eerst je historie.');
    draft = createDraft({
      today: new Date(),
      baseLoad: el('pz-base').value,
      buildPercent: el('pz-step').value,
      recoveryPercent: el('pz-recovery').value
    });
    renderDraft();
    status('Concept berekend. Controleer en pas zo nodig iedere week aan; nog niet opgeslagen.');
  } catch (error) { status(error.message, true); }
}

async function save() {
  try {
    if (!draft || !activeUserId) throw new Error('Maak eerst een concept.');
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user?.id !== activeUserId) throw new Error('Gebruiker gewijzigd; laad opnieuw.');
    const plan = validateDraft(draft);
    if (plan.start !== dateKey(nextMonday(new Date()))) throw new Error('Startweek veranderd; laad opnieuw.');
    localStorage.setItem(key(activeUserId, plan.start), JSON.stringify(plan));
    status('Concept lokaal opgeslagen. Nog geen trainingen of kalenderafspraken aangemaakt.');
  } catch (error) { status(error.message, true); }
}

function deleteDraft() {
  if (!activeUserId) return;
  localStorage.removeItem(key(activeUserId, dateKey(nextMonday(new Date()))));
  draft = null;
  el('pz-weeks').replaceChildren();
  el('pz-notes').textContent = '';
  el('pz-total').textContent = '';
  status('Lokaal concept gewist.');
}

function initialize() {
  const analysisPage = el('pn-page-analyse');
  if (!analysisPage || el('pz-panel')) return;
  const section = document.createElement('section');
  section.id = 'pz-panel';
  section.className = 'pz-panel';
  // Vaste markup; externe gegevens worden uitsluitend via textContent getoond.
  section.innerHTML = `
    <div class="pz-heading"><div><p class="pn-overline">PLANNING</p>
    <h3>Ontwerp je eerste vierweekse trainingsblok</h3>
    <p>Historische load als referentie, jouw doelen als keuze. Beschikbare uren blijven een aparte randvoorwaarde.</p></div>
    <button type="button" id="pz-load">Laad mijn historie</button></div>
    <p id="pz-status" role="status">Nog geen concept geladen.</p>
    <p id="pz-history" class="pz-muted">Historische load nog niet geladen.</p>
    <div id="pz-editor" hidden>
      <div class="pz-controls">
        <label>Startbelasting (load/week)<input id="pz-base" type="number" min="1" max="3000" step="1" placeholder="Zelf kiezen"></label>
        <label>Opbouw per week (%)<input id="pz-step" type="number" min="0" max="15" step="1" value="0"></label>
        <label>Herstelweek (% van basis)<input id="pz-recovery" type="number" min="40" max="100" step="5" value="70"></label>
      </div>
      <p class="pz-muted">Standaard is 0% opbouw. 70% in week 4 is uitsluitend een aanpasbaar rekenvoorbeeld, geen persoonlijk voorschrift.</p>
      <button id="pz-generate" type="button">Maak concept</button>
      <div id="pz-weeks" class="pz-weeks"></div>
      <p id="pz-total" class="pz-total"></p>
      <p id="pz-notes" class="pz-muted"></p>
      <div class="pz-actions"><button id="pz-save" type="button">Bewaar concept</button><button id="pz-delete" type="button" class="pz-secondary">Wis concept</button></div>
      <p class="pz-muted">Alleen lokaal in deze browser bewaard; niet naar Supabase, Intervals.icu of de kalender verstuurd. Geen automatische beoordeling van belastinghaalbaarheid.</p>
    </div>`;
  analysisPage.appendChild(section);
  el('pz-load').addEventListener('click', loadData);
  el('pz-generate').addEventListener('click', generate);
  el('pz-save').addEventListener('click', save);
  el('pz-delete').addEventListener('click', deleteDraft);
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') resetPrivate();
    if (event === 'SIGNED_IN' && activeUserId && session?.user?.id !== activeUserId) resetPrivate();
  });
  // Bij een andere login pas data laden na expliciete gebruikersactie.
  resetPrivate();
}
initialize();
