
import { supabase } from './supabase-client.js';

import {
  fetchTrainingHistory
} from './training-history.js';

import {
  testIntervalsConnection
} from './intervals-api.js';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'weekplanner', label: 'Weekplanner' },
  { id: 'analyse', label: 'Trainingsanalyse' },
  { id: 'instellingen', label: 'Instellingen' }
];

let initialized = false;
let analysisRequest = 0;

function byId(id) {
  return document.getElementById(id);
}

function make(tag, className, text) {
  const node = document.createElement(tag);

  if (className) node.className = className;

  if (text !== undefined) {
    node.textContent = String(text);
  }

  return node;
}

function formatLoad(value) {
  return Math.round(value).toLocaleString('nl-NL');
}

function getCalendarElement() {
  // We herkennen alleen bekende kandidaten.
  // We verplaatsen of wijzigen de kalender niet.
  const selectors = [
    '#availability-calendar',
    '#calendar-container',
    '#availability-section',
    '#planner-calendar',
    '#availability',
    '#calendar'
  ];

  for (const selector of selectors) {
    const candidate = document.querySelector(selector);

    if (
      candidate &&
      !candidate.closest('#training-dashboard') &&
      !candidate.closest('#pn-analysis') &&
      !candidate.closest('#pn-settings')
    ) {
      return candidate;
    }
  }

  // Tweede poging: zoek een bestaande titel.
  const headings = document.querySelectorAll(
    'h1, h2, h3'
  );

  for (const heading of headings) {
    const title = heading.textContent
      ?.trim()
      .toLowerCase();

    if (
      title &&
      (
        title.includes('beschikbaarheid') ||
        title.includes('weekkalender')
      )
    ) {
      const section =
        heading.closest('section') ||
        heading.closest('article') ||
        heading.parentElement;

      if (
        section &&
        !section.closest('#training-dashboard')
      ) {
        return section;
      }
    }
  }

  return null;
}

function markActive(id) {
  document.querySelectorAll(
    '.pn-nav-button'
  ).forEach(button => {
    const active = button.dataset.page === id;

    button.classList.toggle(
      'pn-nav-active',
      active
    );

    if (active) {
      button.setAttribute(
        'aria-current',
        'page'
      );
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

function scrollToElement(element) {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function openPage(id) {
  markActive(id);

  const analysis = byId('pn-analysis');
  const settings = byId('pn-settings');

  // Alleen onze eigen extra secties worden
  // aan- of uitgezet. De kalender blijft intact.
  analysis.hidden = id !== 'analyse';
  settings.hidden = id !== 'instellingen';

  if (id === 'dashboard') {
    const dashboard = byId('training-dashboard');

    if (dashboard) {
      scrollToElement(dashboard);
    }

  } else if (id === 'weekplanner') {
    const calendar = getCalendarElement();

    if (calendar) {
      scrollToElement(calendar);
    } else {
      // Geen aannames over onbekende kalender-IDs.
      byId('pn-message').textContent =
        'De kalender is niet automatisch gevonden. ' +
        'Hij staat nog op zijn oorspronkelijke plek.';

      scrollToElement(byId('pn-navigation'));
    }

  } else if (id === 'analyse') {
    scrollToElement(analysis);
    loadAnalysis();

  } else if (id === 'instellingen') {
    scrollToElement(settings);
    updateConnectionStatus();
  }

  // Hash maakt de navigatie deelbaar.
  // Er is geen pagina-herlaadactie nodig.
  history.replaceState(
    null,
    '',
    `#${id}`
  );
}

function createNavigation() {
  const nav = make(
    'nav',
    'pn-navigation'
  );

  nav.id = 'pn-navigation';
  nav.setAttribute(
    'aria-label',
    'Hoofdnavigatie MTB Training Planner'
  );

  const heading = make(
    'div',
    'pn-brand'
  );

  heading.appendChild(
    make('strong', '', 'MTB Training Planner')
  );

  heading.appendChild(
    make('small', '', 'TSS-gestuurd trainen')
  );

  nav.appendChild(heading);

  const buttons = make(
    'div',
    'pn-nav-buttons'
  );

  for (const item of NAV_ITEMS) {
    const button = make(
      'button',
      'pn-nav-button',
      item.label
    );

    button.type = 'button';
    button.dataset.page = item.id;

    button.addEventListener(
      'click',
      () => openPage(item.id)
    );

    buttons.appendChild(button);
  }

  nav.appendChild(buttons);

  const message = make(
    'p',
    'pn-message',
    ''
  );

  message.id = 'pn-message';
  nav.appendChild(message);

  return nav;
}

function createAnalysis() {
  const section = make(
    'section',
    'pn-page pn-analysis'
  );

  section.id = 'pn-analysis';
  section.hidden = true;

  section.innerHTML = `
    <div class="pn-section-header">
      <div>
        <h2>Trainingsanalyse</h2>
        <p>
          De laatste 12 volledig afgesloten
          trainingsweken.
        </p>
      </div>

      <button
        id="pn-analysis-refresh"
        class="pn-action"
        type="button"
      >
        Vernieuwen
      </button>
    </div>

    <p id="pn-analysis-status" role="status">
      Nog geen analyse geladen.
    </p>

    <div id="pn-analysis-content" hidden>
      <div class="pn-analysis-stats">
        <div class="pn-stat">
          <span>Laatste 4 weken</span>
          <strong id="pn-recent">—</strong>
          <small>Load per week</small>
        </div>

        <div class="pn-stat">
          <span>Vorige 4 weken</span>
          <strong id="pn-previous">—</strong>
          <small>Load per week</small>
        </div>

        <div class="pn-stat">
          <span>Verandering</span>
          <strong id="pn-change">—</strong>
          <small>Recent versus vorig blok</small>
        </div>
      </div>

      <h3>Trainingsbelasting per week</h3>

      <div class="pn-table-wrapper">
        <table class="pn-table">
          <thead>
            <tr>
              <th>Week vanaf</th>
              <th>Load</th>
              <th>Activiteiten</th>
              <th>Trainingsduur</th>
            </tr>
          </thead>
          <tbody id="pn-analysis-rows"></tbody>
        </table>
      </div>

      <p id="pn-analysis-quality" class="pn-note"></p>
    </div>
  `;

  return section;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  return hours > 0
    ? `${hours}u ${String(rest).padStart(2, '0')}m`
    : `${rest}m`;
}

function addCell(row, text) {
  const cell = document.createElement('td');

  cell.textContent = String(text);
  row.appendChild(cell);
}

function renderHistory(history) {
  byId('pn-recent').textContent =
    formatLoad(history.recentFourWeekAverage);

  byId('pn-previous').textContent =
    formatLoad(history.previousFourWeekAverage);

  byId('pn-change').textContent =
    history.changePercent === null
      ? '—'
      : `${history.changePercent > 0 ? '+' : ''}` +
        `${history.changePercent.toFixed(1)}%`;

  const rows = byId('pn-analysis-rows');
  rows.replaceChildren();

  // De nieuwste week staat bovenaan.
  for (const week of [...history.weeks].reverse()) {
    const row = document.createElement('tr');

    addCell(row, week.start);
    addCell(row, formatLoad(week.load));
    addCell(row, week.activityCount);
    addCell(
      row,
      formatDuration(week.durationMinutes)
    );

    rows.appendChild(row);
  }

  const notes = [];

  if (history.emptyWeeks > 0) {
    notes.push(
      `${history.emptyWeeks} weken zonder ` +
      'geregistreerde activiteiten.'
    );
  }

  if (history.totalMissingLoad > 0) {
    notes.push(
      `${history.totalMissingLoad} activiteiten ` +
      'zonder trainingsload.'
    );
  }

  if (history.totalMissingDuration > 0) {
    notes.push(
      `${history.totalMissingDuration} activiteiten ` +
      'zonder bekende duur.'
    );
  }

  notes.push(
    'De historische gemiddelden zijn beschrijvend. ' +
    'Ze vormen nog geen automatisch trainingsadvies.'
  );

  byId('pn-analysis-quality').textContent =
    notes.join(' ');

  byId('pn-analysis-content').hidden = false;
}

async function loadAnalysis() {
  const thisRequest = ++analysisRequest;

  const button = byId('pn-analysis-refresh');
  button.disabled = true;

  const status = byId('pn-analysis-status');

  status.textContent =
    'Historische trainingsbelasting ophalen...';

  try {
    const { data, error } =
      await supabase.auth.getUser();

    if (error || !data.user) {
      throw new Error(
        'Log eerst in op de planner.'
      );
    }

    const history = await fetchTrainingHistory(
      new Date()
    );

    if (thisRequest !== analysisRequest) return;

    renderHistory(history);

    status.textContent =
      `${history.activityCount} activiteiten ` +
      'over 12 afgesloten weken verwerkt.';

  } catch (error) {
    if (thisRequest !== analysisRequest) return;

    console.error('Trainingsanalyse:', error);

    byId('pn-analysis-content').hidden = true;

    status.textContent =
      `Kan analyse niet laden: ${error.message}`;

  } finally {
    if (thisRequest === analysisRequest) {
      button.disabled = false;
    }
  }
}

function createSettings() {
  const section = make(
    'section',
    'pn-page pn-settings'
  );

  section.id = 'pn-settings';
  section.hidden = true;

  section.innerHTML = `
    <h2>Instellingen</h2>

    <div class="pn-settings-group">
      <h3>Intervals.icu</h3>

      <p>
        De API-key is opgeslagen aan de
        serverkant in Supabase Secrets.
      </p>

      <button
        id="pn-test-connection"
        type="button"
        class="pn-action"
      >
        Test verbinding
      </button>

      <p id="pn-connection-result"
         role="status"></p>
    </div>

    <div class="pn-settings-group">
      <h3>Account</h3>

      <p id="pn-user-status">
        Account controleren...
      </p>
    </div>

    <div class="pn-settings-group">
      <h3>Trainingsinstellingen</h3>

      <p>
        FTP, trainingszones en wedstrijdplanning
        voegen we in latere lessen toe.
      </p>

      <p>
        De beschikbaarheid blijft voorlopig
        ingesteld via de Weekplanner.
      </p>
    </div>
  `;

  return section;
}

async function updateConnectionStatus() {
  const label = byId('pn-user-status');

  const { data, error } =
    await supabase.auth.getUser();

  label.textContent =
    error || !data.user
      ? 'Niet ingelogd.'
      : 'Ingelogd bij Supabase.';
}

async function runConnectionTest() {
  const button = byId('pn-test-connection');

  const result = byId('pn-connection-result');

  button.disabled = true;
  result.textContent = 'Verbinding controleren...';

  try {
    await testIntervalsConnection();

    result.textContent =
      'Verbinding met Intervals.icu werkt.';

    result.className = 'pn-success';

  } catch (error) {
    result.textContent =
      `Verbinding mislukt: ${error.message}`;

    result.className = 'pn-error';

  } finally {
    button.disabled = false;
  }
}

export function initializePlannerNavigation() {
  if (initialized) return;
  initialized = true;

  const navigation = createNavigation();
  const analysis = createAnalysis();
  const settings = createSettings();

  // Voeg navigatie bovenaan de bestaande pagina toe.
  document.body.prepend(navigation);

  // De nieuwe schermen komen onder de bestaande app.
  // We wijzigen de kalender zelf niet.
  document.body.append(analysis, settings);

  byId('pn-analysis-refresh').addEventListener(
    'click',
    loadAnalysis
  );

  byId('pn-test-connection').addEventListener(
    'click',
    runConnectionTest
  );

  supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      ++analysisRequest;

      byId('pn-analysis-content').hidden = true;

      byId('pn-analysis-status').textContent =
        'Log in om de analyse te bekijken.';

      byId('pn-connection-result').textContent = '';
      byId('pn-user-status').textContent =
        'Niet ingelogd.';
    }
  });

  const initialPage = location.hash.slice(1);

  if (
    initialPage === 'analyse' ||
    initialPage === 'instellingen'
  ) {
    // De rest van de pagina krijgt eerst de kans
    // om zich te initialiseren.
    setTimeout(
      () => openPage(initialPage),
      0
    );
  } else {
    markActive('dashboard');
  }
}

initializePlannerNavigation();
