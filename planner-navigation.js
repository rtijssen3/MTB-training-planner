import { supabase } from './supabase-client.js';
import { fetchTrainingHistory } from './training-history.js';
import { testIntervalsConnection } from './intervals-api.js';

const VALID_PAGES = new Set(['dashboard', 'weekplanner', 'analyse', 'instellingen']);
let currentPage = 'dashboard';
let analysisGeneration = 0;
let analysisLoaded = false;
let activeUserId = null;

const get = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('nl-NL');
const minutes = (n) => `${Math.floor(n / 60)}u ${String(Math.round(n % 60)).padStart(2, '0')}m`;

function switchPage(page, options = {}) {
  if (!VALID_PAGES.has(page)) page = 'dashboard';
  currentPage = page;

  for (const id of VALID_PAGES) {
    const section = get(`pn-page-${id}`);
    if (section) section.hidden = id !== page;
  }

  document.querySelectorAll('#planner-navigation [data-page]').forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle('pn-nav-active', active);
    button.setAttribute('aria-selected', String(active));
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  if (options.updateHash !== false) {
    history.replaceState(null, '', `#${page}`);
  }

  if (page === 'analyse' && !analysisLoaded) loadAnalysis();
  if (page === 'instellingen') updateUserStatus();

  if (options.scroll !== false) {
    get('planner-navigation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearAnalysis(message = 'Log in om de trainingsanalyse te bekijken.') {
  ++analysisGeneration;
  analysisLoaded = false;
  get('pn-analysis-content').hidden = true;
  get('pn-analysis-status').textContent = message;
}

function addCell(row, value) {
  const td = document.createElement('td');
  td.textContent = String(value);
  row.appendChild(td);
}

function renderAnalysis(history) {
  get('pn-recent').textContent = fmt(history.recentFourWeekAverage);
  get('pn-previous').textContent = fmt(history.previousFourWeekAverage);
  get('pn-change').textContent = history.changePercent === null
    ? '—'
    : `${history.changePercent > 0 ? '+' : ''}${history.changePercent.toFixed(1)}%`;

  const tbody = get('pn-analysis-rows');
  tbody.replaceChildren();
  for (const week of [...history.weeks].reverse()) {
    const row = document.createElement('tr');
    addCell(row, week.start);
    addCell(row, fmt(week.load));
    addCell(row, week.activityCount);
    addCell(row, minutes(week.durationMinutes));
    tbody.appendChild(row);
  }

  const warnings = [];
  if (history.emptyWeeks) warnings.push(`${history.emptyWeeks} weken zonder geregistreerde activiteiten.`);
  if (history.totalMissingLoad) warnings.push(`${history.totalMissingLoad} activiteiten zonder load.`);
  if (history.totalMissingDuration) warnings.push(`${history.totalMissingDuration} activiteiten zonder trainingsduur.`);
  warnings.push('Historische belasting is beschrijvend; dit is nog geen automatisch trainingsadvies.');
  get('pn-analysis-quality').textContent = warnings.join(' ');
  get('pn-analysis-content').hidden = false;
}

async function loadAnalysis() {
  const generation = ++analysisGeneration;
  const button = get('pn-analysis-refresh');
  button.disabled = true;
  get('pn-analysis-status').textContent = 'Trainingshistorie ophalen…';

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Log eerst in op de planner.');
    const history = await fetchTrainingHistory(new Date());
    if (generation !== analysisGeneration || get('dashboard-section').hidden) return;
    renderAnalysis(history);
    analysisLoaded = true;
    get('pn-analysis-status').textContent = `${history.activityCount} activiteiten over 12 afgesloten weken verwerkt.`;
  } catch (error) {
    if (generation !== analysisGeneration) return;
    get('pn-analysis-content').hidden = true;
    get('pn-analysis-status').textContent = `Kan analyse niet laden: ${error.message}`;
    console.error('Trainingsanalyse:', error);
  } finally {
    if (generation === analysisGeneration) button.disabled = false;
  }
}

async function updateUserStatus() {
  const { data, error } = await supabase.auth.getUser();
  get('pn-user-status').textContent = error || !data.user
    ? 'Niet ingelogd.'
    : `Ingelogd: ${data.user.email ?? 'Supabase-account'}`;
}

async function checkConnection() {
  const button = get('pn-test-connection');
  const status = get('pn-connection-result');
  button.disabled = true;
  status.className = 'pn-inline-status';
  status.textContent = 'Verbinding controleren…';
  try {
    await testIntervalsConnection();
    if (get('dashboard-section').hidden) return;
    status.textContent = 'Verbinding met Intervals.icu werkt.';
    status.classList.add('pn-success');
  } catch (error) {
    if (get('dashboard-section').hidden) return;
    status.textContent = `Verbinding mislukt: ${error.message}`;
    status.classList.add('pn-error');
  } finally {
    button.disabled = false;
  }
}

function initializeNavigation() {
  const appSection = get('dashboard-section');
  if (!appSection || !get('planner-navigation')) return;

  document.querySelectorAll('#planner-navigation [data-page]').forEach(button => {
    button.addEventListener('click', () => switchPage(button.dataset.page));
  });
  get('pn-open-planner').addEventListener('click', () => switchPage('weekplanner'));
  get('pn-analysis-refresh').addEventListener('click', () => {
    analysisLoaded = false;
    loadAnalysis();
  });
  get('pn-test-connection').addEventListener('click', checkConnection);

  const initialHash = location.hash.slice(1);
  switchPage(VALID_PAGES.has(initialHash) ? initialHash : 'dashboard', {
    updateHash: false, scroll: false
  });

  window.addEventListener('hashchange', () => {
    const page = location.hash.slice(1);
    if (VALID_PAGES.has(page)) switchPage(page, { updateHash: false, scroll: false });
  });

  const observeLogin = new MutationObserver(() => {
    if (appSection.hidden) {
      activeUserId = null;
      clearAnalysis();
      get('pn-connection-result').textContent = '';
      return;
    }
    // App.js beheert de daadwerkelijke login-zichtbaarheid.
  });
  observeLogin.observe(appSection, { attributes: true, attributeFilter: ['hidden'] });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      activeUserId = null;
      clearAnalysis();
      get('pn-connection-result').textContent = '';
      switchPage('dashboard', { scroll: false });
    }
    if (event === 'SIGNED_IN' && session?.user?.id !== activeUserId) {
      activeUserId = session.user.id;
      clearAnalysis('Open Analyse om je trainingshistorie op te halen.');
      if (currentPage === 'analyse') setTimeout(loadAnalysis, 0);
    }
  });
}

initializeNavigation();
