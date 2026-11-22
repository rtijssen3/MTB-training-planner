
import {
  normalizeActivity
} from './intervals-model.js';

import {
  getWeekMonday,
  toLocalDateKey
} from './weekly-progress.js';

import {
  fetchIntervalsActivities
} from './intervals-api.js';

function addDays(date, numberOfDays) {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  result.setDate(
    result.getDate() + numberOfDays
  );

  return result;
}

function dateFromKey(key) {
  const [year, month, day] =
    key.split('-').map(Number);

  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    toLocalDateKey(date) !== key
  ) {
    throw new Error('Ongeldige datum: ' + key);
  }

  return date;
}

// Drie blokken van 28 dagen, eindigend
// op de zondag vóór de huidige week.
export function getHistoryRanges(today) {
  if (
    !(today instanceof Date) ||
    Number.isNaN(today.getTime())
  ) {
    throw new Error('Ongeldige peildatum.');
  }

  const currentMonday = getWeekMonday(today);

  const firstMonday = addDays(
    currentMonday,
    -84
  );

  return [0, 1, 2].map(index => {
    const start = addDays(
      firstMonday,
      index * 28
    );

    const end = addDays(start, 27);

    return {
      oldest: toLocalDateKey(start),
      newest: toLocalDateKey(end)
    };
  });
}

// Zet alle activiteiten om naar één overzicht
// van precies 12 volledige weken.
export function analyzeTrainingHistory({
  today,
  rawActivities
}) {
  if (!Array.isArray(rawActivities)) {
    throw new Error(
      'Trainingshistorie moet een array zijn.'
    );
  }

  const ranges = getHistoryRanges(today);

  const firstDate = ranges[0].oldest;
  const lastDate = ranges[2].newest;

  const firstMonday = dateFromKey(firstDate);

  const normalized = rawActivities.map(
    normalizeActivity
  );

  // Eén activiteit mag niet twee keer meetellen.
  const unique = [
    ...new Map(
      normalized.map(activity => [
        activity.id,
        activity
      ])
    ).values()
  ];

  const included = unique.filter(activity =>
    activity.date >= firstDate &&
    activity.date <= lastDate
  );

  const weeks = Array.from(
    { length: 12 },
    (_, index) => {
      const monday = addDays(
        firstMonday,
        index * 7
      );

      const sunday = addDays(monday, 6);

      const start = toLocalDateKey(monday);
      const end = toLocalDateKey(sunday);

      const activities = included.filter(
        activity =>
          activity.date >= start &&
          activity.date <= end
      );

      const load = activities.reduce(
        (sum, activity) =>
          sum + (activity.trainingLoad ?? 0),
        0
      );

      const durationMinutes = activities.reduce(
        (sum, activity) =>
          sum + (activity.durationMinutes ?? 0),
        0
      );

      const missingLoadCount = activities.filter(
        activity => activity.trainingLoad === null
      ).length;

      const missingDurationCount = activities.filter(
        activity => activity.durationMinutes === null
      ).length;

      return {
        index,
        start,
        end,
        load,
        durationMinutes,
        activityCount: activities.length,
        missingLoadCount,
        missingDurationCount
      };
    }
  );

  function averageLoad(selectedWeeks) {
    return selectedWeeks.reduce(
      (sum, week) => sum + week.load,
      0
    ) / selectedWeeks.length;
  }

  // Weken 1–4 zijn het oudste blok,
  // weken 9–12 zijn het meest recente blok.
  const oldestFourWeekAverage =
    averageLoad(weeks.slice(0, 4));

  const previousFourWeekAverage =
    averageLoad(weeks.slice(4, 8));

  const recentFourWeekAverage =
    averageLoad(weeks.slice(8, 12));

  const allTwelveWeekAverage =
    averageLoad(weeks);

  // Geen percentage bij een basis van 0.
  const changePercent =
    previousFourWeekAverage > 0
      ? (
          (
            recentFourWeekAverage /
            previousFourWeekAverage
          ) - 1
        ) * 100
      : null;

  const totalMissingLoad = weeks.reduce(
    (sum, week) =>
      sum + week.missingLoadCount,
    0
  );

  const totalMissingDuration = weeks.reduce(
    (sum, week) =>
      sum + week.missingDurationCount,
    0
  );

  const emptyWeeks = weeks.filter(
    week => week.activityCount === 0
  ).length;

  return {
    start: firstDate,
    end: lastDate,
    weeks,
    activityCount: included.length,
    totalLoad: weeks.reduce(
      (sum, week) => sum + week.load,
      0
    ),
    oldestFourWeekAverage,
    previousFourWeekAverage,
    recentFourWeekAverage,
    allTwelveWeekAverage,
    changePercent,
    totalMissingLoad,
    totalMissingDuration,
    emptyWeeks
  };
}

// Dit is de enige functie die
// rechtstreeks de externe API gebruikt.
export async function fetchTrainingHistory(today) {
  const ranges = getHistoryRanges(today);

  const allActivities = [];

  // Bewust achtereenvolgens ophalen:
  // eenvoudig en minder gelijktijdige belasting
  // voor Intervals.icu.
  for (const range of ranges) {
    const activities =
      await fetchIntervalsActivities(
        range.oldest,
        range.newest
      );

    allActivities.push(...activities);
  }

  return analyzeTrainingHistory({
    today,
    rawActivities: allActivities
  });
}
