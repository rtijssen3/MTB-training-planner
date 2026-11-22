
import { supabase } from './supabase-client.js';

import {
  initializeAvailability
} from './availability-service.js';

import {
  fetchIntervalsActivities
} from './intervals-api.js';

import {
  buildWeeklyProgress,
  getWeekDates,
  formatTrainingMinutes
} from './weekly-progress.js';

const WEEKDAYS = [
  'Ma',
  'Di',
  'Wo',
  'Do',
  'Vr',
  'Za',
  'Zo'
];

let latestRequest = 0;

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = String(text);
  }

  return element;
}

function createStat(label, value, secondary = '') {
  const box = createElement('div', 'td-stat');

  box.appendChild(
    createElement('span', 'td-stat-label', label)
  );

  box.appendChild(
    createElement('strong', 'td-stat-value', value)
  );

  if (secondary) {
    box.appendChild(
      createElement('small', 'td-stat-description', secondary)
    );
  }

  return box;
}

function setMessage(message, type = '') {
  const element = document.getElementById('td-status');

  if (!element) return;

  element.textContent = message;
  element.className = `td-status ${type}`;
}

function renderDays(progress) {
  const container = document.getElementById('td-days');
  container.replaceChildren();

  const maxLoad = Math.max(
    1,
    ...progress.days.map(day => day.trainingLoad)
  );

  for (const day of progress.days) {
    const row = createElement('div', 'td-day-row');

    if (day.isFuture) {
      row.classList.add('td-day-future');
    }

    const label = createElement(
      'span',
      'td-day-label',
      WEEKDAYS[day.weekdayIndex]
    );

    label.title = day.date;

    const barTrack = createElement(
      'div',
      'td-load-track'
    );

    const bar = createElement(
      'div',
      'td-load-bar'
    );

    const width = day.isFuture
      ? 0
      : 100 * day.trainingLoad / maxLoad;

    bar.style.width = `${Math.max(0, width)}%`;
    barTrack.appendChild(bar);

    const value = createElement(
      'span',
      'td-day-load',
      day.isFuture
        ? '—'
        : Math.round(day.trainingLoad)
    );

    row.append(label, barTrack, value);
    container.appendChild(row);
  }
}

function renderProgress(progress) {
  const content = document.getElementById('td-content');

  const stats = document.getElementById('td-stats');

  stats.replaceChildren();

  stats.appendChild(
    createStat(
      'Geregistreerde load',
      Math.round(progress.totalTrainingLoad),
      'Intervals.icu · deze week'
    )
  );

  stats.appendChild(
    createStat(
      'Weekdoel TSS',
      '—',
      'Wordt later toegevoegd'
    )
  );

  stats.appendChild(
    createStat(
      'Uitgevoerde training',
      formatTrainingMinutes(
        progress.totalCompletedMinutes
      ),
      `${progress.totalActivityCount} activiteiten`
    )
  );

  stats.appendChild(
    createStat(
      'Beschikbare tijd',
      formatTrainingMinutes(
        progress.totalAvailableMinutes
      ),
      'Praktische weekplanning'
    )
  );

  document.getElementById(
    'td-week-label'
  ).textContent =
    `${progress.weekStart} t/m ${progress.weekEnd}`;

  renderDays(progress);

  const notes = [];

  if (progress.missingDurationCount > 0) {
    notes.push(
      `${progress.missingDurationCount} activiteiten ` +
      'hebben geen bekende trainingsduur.'
    );
  }

  const missingLoadCount = progress.days.reduce(
    (sum, day) =>
      sum + day.activities.filter(
        activity => activity.trainingLoad === null
      ).length,
    0
  );

  if (missingLoadCount > 0) {
    notes.push(
      `${missingLoadCount} activiteiten hebben geen ` +
      'geregistreerde trainingsload. Het totaal kan ' +
      'daardoor onvolledig zijn.'
    );
  }

  document.getElementById(
    'td-quality'
  ).textContent = notes.join(' ');

  content.hidden = false;

  setMessage(
    'Trainingsgegevens bijgewerkt.',
    'td-success'
  );
}

function clearDashboard() {
  document.getElementById('td-content').hidden = true;
}

async function refreshDashboard() {
  const requestId = ++latestRequest;

  const button = document.getElementById(
    'td-refresh'
  );

  button.disabled = true;
  setMessage('Gegevens ophalen...');

  try {
    const { data, error } =
      await supabase.auth.getUser();

    if (error || !data.user) {
      if (requestId !== latestRequest) return;

      clearDashboard();
      setMessage(
        'Log in om je trainingsdashboard te bekijken.'
      );
      return;
    }

    const today = new Date();
    const dates = getWeekDates(today);

    const { state } = await initializeAvailability(
      data.user.id,
      today
    );

    if (!state || typeof state.getEffective !== 'function') {
      throw new Error(
        'Beschikbaarheidsstatus is niet beschikbaar.'
      );
    }

    const availabilityByDate = {};

    for (const date of dates) {
      availabilityByDate[date] =
        state.getEffective(date);
    }

    const rawActivities =
      await fetchIntervalsActivities(
        dates[0],
        dates[6]
      );

    const progress = buildWeeklyProgress({
      date: today,
      availabilityByDate,
      rawActivities
    });

    // Voorkom dat een ouder netwerkantwoord
    // een nieuwer dashboard overschrijft.
    if (requestId !== latestRequest) return;

    renderProgress(progress);

  } catch (error) {
    if (requestId !== latestRequest) return;

    console.error(
      'Trainingsdashboard:',
      error
    );

    clearDashboard();
    setMessage(
      `Dashboard niet beschikbaar: ${error.message}`,
      'td-error'
    );

  } finally {
    if (requestId === latestRequest) {
      button.disabled = false;
    }
  }
}

export function initializeTrainingDashboard() {
  const root = document.getElementById(
    'training-dashboard'
  );

  if (!root) {
    console.warn(
      'Dashboard-element ontbreekt in index.html.'
    );
    return;
  }

  // Voorkomt dubbele initialisatie.
  if (root.dataset.initialized === 'true') {
    return;
  }

  root.dataset.initialized = 'true';

  root.replaceChildren();

  const header = createElement(
    'div',
    'td-header'
  );

  const heading = createElement(
    'div',
    'td-heading'
  );

  heading.appendChild(
    createElement('h2', '', 'Voortgang')
  );

  const weekLabel = createElement(
    'span',
    'td-week-label'
  );

  weekLabel.id = 'td-week-label';
  heading.appendChild(weekLabel);

  const refreshButton = createElement(
    'button',
    'td-refresh-button',
    'Vernieuwen'
  );

  refreshButton.id = 'td-refresh';
  refreshButton.type = 'button';

  header.append(heading, refreshButton);
  root.appendChild(header);

  const status = createElement(
    'p',
    'td-status',
    'Dashboard wordt geladen...'
  );

  status.id = 'td-status';
  status.setAttribute('role', 'status');

  root.appendChild(status);

  const content = createElement(
    'div',
    'td-content'
  );

  content.id = 'td-content';
  content.hidden = true;

  const stats = createElement(
    'div',
    'td-stats'
  );

  stats.id = 'td-stats';

  content.appendChild(stats);

  const sectionTitle = createElement(
    'h3',
    'td-section-title',
    'Trainingsbelasting per dag'
  );

  content.appendChild(sectionTitle);

  const days = createElement(
    'div',
    'td-days'
  );

  days.id = 'td-days';
  content.appendChild(days);

  const explanation = createElement(
    'p',
    'td-explanation',
    'De balken tonen de geregistreerde ' +
    'trainingsbelasting per dag. ' +
    'Beschikbaarheid blijft gebaseerd op tijd.'
  );

  content.appendChild(explanation);

  const quality = createElement(
    'p',
    'td-quality'
  );

  quality.id = 'td-quality';
  content.appendChild(quality);

  root.appendChild(content);

  refreshButton.addEventListener(
    'click',
    refreshDashboard
  );

  // Vernieuwen wanneer de gebruiker terugkomt
  // naar het browservenster.
  window.addEventListener('focus', () => {
    refreshDashboard();
  });

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        refreshDashboard();
      }
    }
  );

  // Als de gebruiker inlogt of uitlogt,
  // moet het dashboard mee veranderen.
  supabase.auth.onAuthStateChange((event) => {
    if (
      event === 'SIGNED_IN' ||
      event === 'SIGNED_OUT'
    ) {
      // Buiten de auth-callback uitvoeren,
      // om vastlopende auth-verzoeken te vermijden.
      setTimeout(refreshDashboard, 0);
    }
  });

  // Ook andere onderdelen kunnen een refresh vragen.
  window.addEventListener(
    'training-dashboard-refresh',
    refreshDashboard
  );

  refreshDashboard();
}
