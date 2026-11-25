
import { supabase } from './supabase-client.js';

import {
  initializeAvailability
} from './availability-service.js';

import {
  fetchIntervalsActivities,
  fetchIntervalsWellness
} from './intervals-api.js';

import {
  buildWeeklyProgress,
  getWeekDates,
  formatTrainingMinutes,
  toLocalDateKey
} from './weekly-progress.js';

import {
  calculateLoadProgress,
  validateTargetLoad
} from './tss-plan.js';

import {
  analyzeFitnessData
} from './fitness-model.js';

const DAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

const root = document.getElementById('training-dashboard');

let currentUser = null;
let currentWeek = null;
let cachedActivities = [];
let cachedProgress = null;
let requestNumber = 0;
let lastLoadedAt = 0;

function byId(id) {
  return document.getElementById(id);
}

function loadNumber(value) {
  return Math.round(value).toLocaleString('nl-NL');
}

function decimal(value) {
  return value == null
    ? '—'
    : value.toLocaleString('nl-NL', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      });
}

function targetKey(userId, weekStart) {
  // Dezelfde sleutel als in les 28.
  return `mtb-target-load:v1:${userId}:${weekStart}`;
}

function readTarget(userId, weekStart) {
  const saved = localStorage.getItem(
    targetKey(userId, weekStart)
  );

  return saved === null
    ? null
    : validateTargetLoad(saved);
}

function setStatus(message, error = false) {
  const status = byId('po-status');

  status.textContent = message;
  status.classList.toggle('po-error', error);
}

function clearPrivateData() {
  currentUser = null;
  currentWeek = null;
  cachedActivities = [];
  cachedProgress = null;

  const privatePanel = byId('po-private');

  if (privatePanel) {
    privatePanel.hidden = true;
  }

  const targetInput = byId('po-target-input');

  if (targetInput) {
    targetInput.value = '';
  }
}

function showFitnessUnavailable(message) {
  byId('po-ctl').textContent = '—';
  byId('po-atl').textContent = '—';
  byId('po-tsb').textContent = '—';
  byId('po-ramp').textContent = '—';
  byId('po-fitness-date').textContent = message;
}

function renderLoadProgress() {
  if (!currentUser || !currentWeek) return;

  const target = readTarget(
    currentUser,
    currentWeek[0]
  );

  const result = calculateLoadProgress({
    targetLoad: target,
    rawActivities: cachedActivities,
    weekStart: currentWeek[0],
    weekEnd: currentWeek[6],
    today: toLocalDateKey(new Date())
  });

  byId('po-target').textContent =
    target === null ? '—' : loadNumber(target);

  byId('po-completed').textContent =
    loadNumber(result.completedLoad);

  byId('po-percent').textContent =
    result.progressPercent === null
      ? '—'
      : `${result.progressPercent}%`;

  byId('po-progress-fill').style.width =
    result.progressPercent === null
      ? '0%'
      : `${Math.min(
          100,
          Math.max(0, result.progressPercent)
        )}%`;

  const messages = [];

  if (target === null) {
    messages.push(
      'Er is nog geen weekdoel ingesteld.'
    );
  } else if (result.exceededTarget) {
    messages.push(
      'Het weekdoel is overschreden. ' +
      'Meer belasting is niet automatisch beter.'
    );
  } else {
    messages.push(
      `${loadNumber(result.remainingLoad)} ` +
      'loadpunten tot het weekdoel.'
    );
  }

  if (result.missingLoadCount > 0) {
    messages.push(
      `${result.missingLoadCount} activiteiten ` +
      'hebben geen geregistreerde load.'
    );
  }

  byId('po-load-info').textContent =
    messages.join(' ');
}

function renderDailyLoad(progress) {
  const container = byId('po-days');
  container.replaceChildren();

  for (const day of progress.days) {
    const card = document.createElement('div');
    card.className = 'po-day';

    const label = document.createElement('span');
    label.className = 'po-day-label';
    label.textContent = DAYS[day.weekdayIndex];

    const value = document.createElement('strong');
    value.className = 'po-day-value';

    if (day.isFuture) {
      card.classList.add('po-day-future');
      value.textContent = '—';
    } else {
      const missingLoad = day.activities.some(
        activity => activity.trainingLoad === null
      );

      value.textContent = loadNumber(day.trainingLoad);

      if (missingLoad) {
        value.textContent += '*';
        card.title =
          `${day.date}: niet alle activiteiten ` +
          'hebben een bekende trainingsload';
      }
    }

    if (!card.title) {
      card.title = day.date;
    }

    card.append(label, value);
    container.appendChild(card);
  }
}

function renderAvailability(progress) {
  byId('po-available').textContent =
    formatTrainingMinutes(
      progress.totalAvailableMinutes
    );

  byId('po-duration').textContent =
    formatTrainingMinutes(
      progress.totalCompletedMinutes
    );

  byId('po-activity-count').textContent =
    `${progress.totalActivityCount} activiteiten`;

  const note = byId('po-duration-note');

  note.textContent =
    progress.missingDurationCount > 0
      ? `${progress.missingDurationCount} activiteiten ` +
        'zonder bekende duur; totaal mogelijk onvolledig.'
      : '';
}

function renderFitness(analysis) {
  if (!analysis.hasData) {
    showFitnessUnavailable(
      'Geen CTL/ATL-gegevens beschikbaar.'
    );
    return;
  }

  const latest = analysis.latest;

  byId('po-ctl').textContent = decimal(latest.ctl);
  byId('po-atl').textContent = decimal(latest.atl);
  byId('po-tsb').textContent = decimal(latest.tsb);

  byId('po-ramp').textContent =
    decimal(latest.rampRate);

  byId('po-fitness-date').textContent =
    `Laatste beschikbare datum: ${latest.date}`;
}

async function refreshOverview() {
  const thisRequest = ++requestNumber;

  const button = byId('po-refresh');
  button.disabled = true;

  setStatus('Trainingsgegevens ophalen...');

  try {
    const { data, error } =
      await supabase.auth.getUser();

    if (thisRequest !== requestNumber) return;

    if (error || !data.user) {
      clearPrivateData();
      setStatus('Log in om je trainingsoverzicht te bekijken.');
      return;
    }

    // Maak bij opnieuw laden nooit oude privégegevens
    // zichtbaar terwijl een andere gebruiker inlogt.
    if (currentUser !== data.user.id) {
      clearPrivateData();
    }

    const today = new Date();
    const dates = getWeekDates(today);

    const { state } = await initializeAvailability(
      data.user.id,
      today
    );

    if (
      !state ||
      typeof state.getEffective !== 'function'
    ) {
      throw new Error(
        'Beschikbaarheidsgegevens ontbreken.'
      );
    }

    const availabilityByDate = {};

    for (const day of dates) {
      availabilityByDate[day] = state.getEffective(day);
    }

    // Eén aanvraag voor alle trainingen van deze week.
    const activities = await fetchIntervalsActivities(
      dates[0],
      dates[6]
    );

    const progress = buildWeeklyProgress({
      date: today,
      availabilityByDate,
      rawActivities: activities
    });

    if (thisRequest !== requestNumber) return;

    currentUser = data.user.id;
    currentWeek = dates;
    cachedActivities = activities;
    cachedProgress = progress;

    byId('po-week').textContent =
      `${dates[0]} t/m ${dates[6]}`;

    const target = readTarget(
      currentUser,
      dates[0]
    );

    byId('po-target-input').value =
      target === null ? '' : String(target);

    renderLoadProgress();
    renderDailyLoad(progress);
    renderAvailability(progress);

    byId('po-private').hidden = false;

    setStatus('Trainingsgegevens bijgewerkt.');
    lastLoadedAt = Date.now();

    // Fitnessgegevens worden afzonderlijk geladen.
    // Een storing in wellness mag het weekoverzicht
    // niet laten verdwijnen.
    try {
      const firstDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 27
      );

      const wellness = await fetchIntervalsWellness(
        toLocalDateKey(firstDay),
        toLocalDateKey(today)
      );

      if (thisRequest !== requestNumber) return;

      renderFitness(analyzeFitnessData(wellness));
    } catch (fitnessError) {
      if (thisRequest !== requestNumber) return;

      console.warn(
        'Fitnessgegevens niet beschikbaar:',
        fitnessError
      );

      showFitnessUnavailable(
        'CTL/ATL konden niet worden opgehaald.'
      );
    }

  } catch (error) {
    if (thisRequest !== requestNumber) return;

    console.error('Planner-overzicht:', error);

    clearPrivateData();

    setStatus(
      `Dashboard kon niet worden geladen: ${error.message}`,
      true
    );

  } finally {
    if (thisRequest === requestNumber) {
      button.disabled = false;
    }
  }
}

async function saveTarget() {
  const input = byId('po-target-input');
  const button = byId('po-save-target');

  button.disabled = true;

  try {
    const { data, error } =
      await supabase.auth.getUser();

    if (error || !data.user) {
      throw new Error('Je bent niet ingelogd.');
    }

    if (
      data.user.id !== currentUser ||
      !currentWeek ||
      getWeekDates(new Date())[0] !== currentWeek[0]
    ) {
      throw new Error(
        'De gebruiker of week is veranderd. ' +
        'Vernieuw eerst het dashboard.'
      );
    }

    const target = validateTargetLoad(
      input.value.trim()
    );

    const key = targetKey(
      currentUser,
      currentWeek[0]
    );

    if (target === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(
        key,
        String(target)
      );
    }

    renderLoadProgress();
    setStatus('Weekdoel opgeslagen in deze browser.');

  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function initializeOverview() {
  if (!root) {
    console.error(
      'Het element #training-dashboard ontbreekt.'
    );
    return;
  }

  if (root.dataset.overviewInitialized === 'true') {
    return;
  }

  root.dataset.overviewInitialized = 'true';

  // Uitsluitend vaste, eigen HTML.
  // Alle data uit de API wordt via textContent gezet.
  root.innerHTML = `
    <div class="po-header">
      <div>
        <h2>Mijn trainingsoverzicht</h2>
        <p id="po-week"></p>
      </div>

      <button id="po-refresh" type="button">
        Alles vernieuwen
      </button>
    </div>

    <p id="po-status" role="status"></p>

    <div id="po-private" hidden>
      <div class="po-main-stats">
        <div class="po-stat">
          <span>Weekdoel</span>
          <strong id="po-target">—</strong>
          <small>Loadpunten</small>
        </div>

        <div class="po-stat">
          <span>Uitgevoerd</span>
          <strong id="po-completed">—</strong>
          <small>Intervals.icu</small>
        </div>

        <div class="po-stat">
          <span>Voortgang</span>
          <strong id="po-percent">—</strong>
          <small>Uitgevoerd / doel</small>
        </div>
      </div>

      <div class="po-progress-track">
        <div id="po-progress-fill"></div>
      </div>

      <p id="po-load-info" class="po-note"></p>

      <div class="po-target-form">
        <label for="po-target-input">
          Weekdoel aanpassen
        </label>

        <div class="po-target-controls">
          <input
            type="number"
            min="1"
            max="3000"
            step="1"
            id="po-target-input"
            placeholder="Geen weekdoel"
          >

          <button
            id="po-save-target"
            type="button"
          >
            Opslaan
          </button>
        </div>

        <small>
          Leeg opslaan verwijdert het doel.
          Opslag is voorlopig lokaal in deze browser.
        </small>
      </div>

      <section class="po-section">
        <h3>Trainingsbelasting per dag</h3>

        <div id="po-days" class="po-days"></div>

        <p class="po-note">
          Getallen zijn geregistreerde loadpunten.
          Toekomstige dagen tonen een streepje.
          * betekent dat een activiteit geen load heeft.
        </p>
      </section>

      <section class="po-section">
        <h3>Fitness & vermoeidheid</h3>

        <p id="po-fitness-date" class="po-note"></p>

        <div class="po-fitness-stats">
          <div class="po-stat">
            <span>CTL</span>
            <strong id="po-ctl">—</strong>
          </div>

          <div class="po-stat">
            <span>ATL</span>
            <strong id="po-atl">—</strong>
          </div>

          <div class="po-stat">
            <span>TSB</span>
            <strong id="po-tsb">—</strong>
          </div>
        </div>

        <p class="po-note">
          Ramp rate: <strong id="po-ramp">—</strong>
        </p>

        <p class="po-note">
          TSB = CTL − ATL op dezelfde recorddatum.
          Dit is geen directe meting van herstel.
        </p>
      </section>

      <section class="po-section">
        <h3>Trainingstijd</h3>

        <div class="po-time-stats">
          <div class="po-stat">
            <span>Uitgevoerd</span>
            <strong id="po-duration">—</strong>
            <small id="po-activity-count"></small>
          </div>

          <div class="po-stat">
            <span>Beschikbaar</span>
            <strong id="po-available">—</strong>
            <small>Volgens weekplanner</small>
          </div>
        </div>

        <p id="po-duration-note" class="po-note"></p>
      </section>

      <p class="po-footnote">
        Trainingsload is niet voor elke sport automatisch
        identiek aan klassieke fiets-TSS.
        Beschikbaarheid blijft in tijd gepland.
      </p>
    </div>
  `;

  byId('po-refresh').addEventListener(
    'click',
    refreshOverview
  );

  byId('po-save-target').addEventListener(
    'click',
    saveTarget
  );

  window.addEventListener(
    'training-dashboard-refresh',
    refreshOverview
  );

  supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      ++requestNumber;
      clearPrivateData();
      setStatus('Log in om je trainingsoverzicht te bekijken.');
    }

    if (event === 'SIGNED_IN') {
      // Buiten de authenticatiecallback verversen.
      setTimeout(refreshOverview, 0);
    }
  });

  // Vernieuw na terugkeer, maar voorkom
  // voortdurend nieuwe API-aanvragen.
  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        !document.hidden &&
        Date.now() - lastLoadedAt > 60000
      ) {
        refreshOverview();
      }
    }
  );

  refreshOverview();
}

initializeOverview();
