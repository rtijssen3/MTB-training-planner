
import { supabase } from './supabase-client.js';

import {
  fetchIntervalsActivities
} from './intervals-api.js';

import {
  getWeekDates,
  toLocalDateKey
} from './weekly-progress.js';

import {
  validateTargetLoad,
  calculateLoadProgress,
  previewFourWeekBlock
} from './tss-plan.js';

let latestRequest = 0;

function byId(id) {
  return document.getElementById(id);
}

// Iedere gebruiker krijgt zijn eigen lokale opslagruimte.
// Het weekdoel hoort daarnaast bij de startdatum
// van de betreffende trainingsweek.
function storageKey(userId, monday) {
  return `mtb-target-load:v1:${userId}:${monday}`;
}

function readTarget(userId, monday) {
  const saved = localStorage.getItem(
    storageKey(userId, monday)
  );

  return saved === null
    ? null
    : validateTargetLoad(saved);
}

function formatLoad(value) {
  return Math.round(value).toLocaleString('nl-NL');
}

function setStatus(message, isError = false) {
  const status = byId('tss-status');
  status.textContent = message;
  status.className = isError
    ? 'tss-status tss-error'
    : 'tss-status';
}

function renderBlockPreview(target) {
  const container = byId('tss-block-preview');
  container.replaceChildren();

  if (target === null) return;

  const heading = document.createElement('h3');
  heading.textContent = 'Illustratie: vierweekse opbouw';
  container.appendChild(heading);

  const description = document.createElement('p');

  description.textContent =
    'Dit is uitsluitend een rekenvoorbeeld. ' +
    'De doelen zijn geen persoonlijk trainingsadvies ' +
    'en worden niet automatisch opgeslagen.';

  container.appendChild(description);

  const list = document.createElement('div');
  list.className = 'tss-block-weeks';

  for (const week of previewFourWeekBlock(target)) {
    const item = document.createElement('div');
    item.className = 'tss-block-week';

    const label = document.createElement('span');
    label.textContent =
      `Week ${week.week} · ${week.phase}`;

    const value = document.createElement('strong');
    value.textContent =
      formatLoad(week.targetLoad);

    item.append(label, value);
    list.appendChild(item);
  }

  container.appendChild(list);
}

function renderSummary(result, weekStart, weekEnd) {
  byId('tss-week').textContent =
    `${weekStart} t/m ${weekEnd}`;

  byId('tss-completed').textContent =
    formatLoad(result.completedLoad);

  byId('tss-target').textContent =
    result.targetLoad === null
      ? 'Niet ingesteld'
      : formatLoad(result.targetLoad);

  byId('tss-percentage').textContent =
    result.progressPercent === null
      ? '—'
      : `${result.progressPercent}%`;

  byId('tss-progress-fill').style.width =
    result.progressPercent === null
      ? '0%'
      : `${Math.min(100, Math.max(
          0,
          result.progressPercent
        ))}%`;

  let explanation;

  if (result.targetLoad === null) {
    explanation =
      'Stel een weekdoel in om de voortgang ' +
      'te kunnen vergelijken.';
  } else if (result.missingLoadCount > 0) {
    explanation =
      'Let op: niet alle activiteiten hebben ' +
      'een bekende trainingsload. De berekende ' +
      'voortgang kan daardoor te laag zijn.';
  } else if (result.exceededTarget) {
    explanation =
      'Het weekdoel is overschreden. Dat betekent ' +
      'niet automatisch dat extra belasting wenselijk is.';
  } else {
    explanation =
      `${formatLoad(result.remainingLoad)} loadpunten ` +
      'tot het ingestelde weekdoel.';
  }

  byId('tss-explanation').textContent = explanation;

  renderBlockPreview(result.targetLoad);
}

async function refreshTssPlan() {
  const requestId = ++latestRequest;

  const input = byId('tss-target-input');
  const saveButton = byId('tss-save');

  saveButton.disabled = true;
  setStatus('Trainingsbelasting ophalen...');

  try {
    const { data, error } =
      await supabase.auth.getUser();

    if (requestId !== latestRequest) return;

    if (error || !data.user) {
      byId('tss-private').hidden = true;
      input.value = '';
      setStatus('Log in om je weekdoel te bekijken.');
      return;
    }

    const userId = data.user.id;
    const today = new Date();
    const dates = getWeekDates(today);

    const weekStart = dates[0];
    const weekEnd = dates[6];

    const target = readTarget(userId, weekStart);

    // Onthoud welke gebruiker en week op dit moment
    // in het scherm staan, zodat opslaan niet per
    // ongeluk bij een andere week terechtkomt.
    const rawActivities =
      await fetchIntervalsActivities(
        weekStart,
        weekEnd
      );

    if (requestId !== latestRequest) return;

    const result = calculateLoadProgress({
      targetLoad: target,
      rawActivities,
      weekStart,
      weekEnd,
      today: toLocalDateKey(today)
    });

    byId('tss-private').hidden = false;

    input.value =
      target === null ? '' : String(target);

    input.dataset.userId = userId;
    input.dataset.weekStart = weekStart;

    renderSummary(result, weekStart, weekEnd);
    setStatus('Weekdoel en trainingsload geladen.');

  } catch (error) {
    if (requestId !== latestRequest) return;

    byId('tss-private').hidden = true;
    console.error('TSS-plan:', error);

    setStatus(
      `Kan trainingsbelasting niet laden: ${error.message}`,
      true
    );

  } finally {
    if (requestId === latestRequest) {
      saveButton.disabled = false;
    }
  }
}

async function saveTarget() {
  const input = byId('tss-target-input');

  try {
    const { data, error } =
      await supabase.auth.getUser();

    if (error || !data.user) {
      throw new Error('Je bent niet ingelogd.');
    }

    const currentWeek = getWeekDates(
      new Date()
    )[0];

    if (
      input.dataset.userId !== data.user.id ||
      input.dataset.weekStart !== currentWeek
    ) {
      throw new Error(
        'De actieve week of gebruiker is veranderd. ' +
        'Vernieuw het overzicht.'
      );
    }

    const target = validateTargetLoad(
      input.value.trim()
    );

    const key = storageKey(
      data.user.id,
      currentWeek
    );

    if (target === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(
        key,
        String(target)
      );
    }

    await refreshTssPlan();

  } catch (error) {
    setStatus(error.message, true);
  }
}

export function initializeTssPlan() {
  const root = byId('tss-plan');

  if (!root || root.dataset.initialized === 'true') {
    return;
  }

  root.dataset.initialized = 'true';

  // Statische HTML: er worden geen waarden
  // uit Intervals.icu in deze template geplaatst.
  root.innerHTML = `
    <div class="tss-header">
      <div>
        <h2>Trainingsbelasting & weekdoel</h2>
        <p id="tss-week"></p>
      </div>
      <button type="button" id="tss-refresh">
        Vernieuwen
      </button>
    </div>

    <p id="tss-status"
       class="tss-status"
       role="status"></p>

    <div id="tss-private" hidden>
      <div class="tss-target-form">
        <label for="tss-target-input">
          Weekdoel (loadpunten)
        </label>

        <div class="tss-target-controls">
          <input
            id="tss-target-input"
            type="number"
            min="1"
            max="3000"
            step="1"
            placeholder="Nog geen doel"
          >

          <button type="button" id="tss-save">
            Opslaan
          </button>
        </div>

        <small>
          Leeg opslaan verwijdert het weekdoel.
          Alleen lokaal in deze browser bewaard.
        </small>
      </div>

      <div class="tss-summary">
        <div>
          <span>Weekdoel</span>
          <strong id="tss-target">—</strong>
        </div>

        <div>
          <span>Uitgevoerde load</span>
          <strong id="tss-completed">—</strong>
        </div>

        <div>
          <span>Voortgang</span>
          <strong id="tss-percentage">—</strong>
        </div>
      </div>

      <div class="tss-progress-track">
        <div id="tss-progress-fill"></div>
      </div>

      <p id="tss-explanation"></p>

      <div id="tss-block-preview"></div>
    </div>
  `;

  byId('tss-save').addEventListener(
    'click',
    saveTarget
  );

  byId('tss-refresh').addEventListener(
    'click',
    refreshTssPlan
  );

  window.addEventListener(
    'training-dashboard-refresh',
    refreshTssPlan
  );

  // Bij een volgende login of logout opnieuw laden.
  // Auth-verzoeken starten we buiten de callback.
  supabase.auth.onAuthStateChange(event => {
    if (
      event === 'SIGNED_IN' ||
      event === 'SIGNED_OUT'
    ) {
      setTimeout(refreshTssPlan, 0);
    }
  });

  refreshTssPlan();
}
