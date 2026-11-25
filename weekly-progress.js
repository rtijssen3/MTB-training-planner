
import { normalizeActivity } from './intervals-model.js';

// Een datum omzetten naar YYYY-MM-DD in lokale tijd.
export function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// Maandag van de week bepalen.
export function getWeekMonday(date) {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const weekday = result.getDay();
  const daysSinceMonday = (weekday + 6) % 7;

  result.setDate(result.getDate() - daysSinceMonday);

  return result;
}

// Alle zeven kalenderdagen van de week.
export function getWeekDates(date) {
  const monday = getWeekMonday(date);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);

    return toLocalDateKey(day);
  });
}

export function formatTrainingMinutes(minutes) {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;

  if (hours === 0) return `${remaining}m`;
  return `${hours}u ${String(remaining).padStart(2, '0')}m`;
}

// Een compleet weekoverzicht samenstellen.
//
// availabilityByDate:
// {
//   "2026-11-17": { available_minutes: 90 },
//   ...
// }
//
// rawActivities: activiteiten zoals de Edge Function
// van les 25 ze teruggeeft.
export function buildWeeklyProgress({
  date,
  availabilityByDate,
  rawActivities
}) {
  if (!(date instanceof Date) ||
      Number.isNaN(date.getTime())) {
    throw new Error('Ongeldige peildatum.');
  }

  if (!availabilityByDate ||
      typeof availabilityByDate !== 'object') {
    throw new Error('Beschikbaarheidsgegevens ontbreken.');
  }

  if (!Array.isArray(rawActivities)) {
    throw new Error('Activiteiten moeten een array zijn.');
  }

  const weekDates = getWeekDates(date);
  const todayKey = toLocalDateKey(date);

  const activities = rawActivities.map(normalizeActivity);

  // Geen dubbeltelling wanneer de API per ongeluk
  // dezelfde activiteit meer dan eens teruggeeft.
  const uniqueActivities = [
    ...new Map(
      activities.map(activity => [activity.id, activity])
    ).values()
  ];

  const activitiesByDate = new Map();

  for (const activity of uniqueActivities) {
    if (
        !weekDates.includes(activity.date) ||
        activity.date > todayKey
    ) {
        continue;
    }

    if (!activitiesByDate.has(activity.date)) {
      activitiesByDate.set(activity.date, []);
    }

    activitiesByDate.get(activity.date).push(activity);
  }

  const days = weekDates.map((dayKey, index) => {
    const availability = availabilityByDate[dayKey];

    if (!availability) {
      throw new Error(
        `Beschikbaarheid ontbreekt voor ${dayKey}.`
      );
    }

    const availableMinutes =
      Number(availability.available_minutes);

    if (!Number.isFinite(availableMinutes) ||
        availableMinutes < 0) {
      throw new Error(
        `Ongeldige beschikbaarheid op ${dayKey}.`
      );
    }

    const dayActivities =
      activitiesByDate.get(dayKey) ?? [];

    const completedMinutes = dayActivities.reduce(
      (sum, activity) =>
        sum + (activity.durationMinutes ?? 0),
      0
    );

    const trainingLoad = dayActivities.reduce(
      (sum, activity) =>
        sum + (activity.trainingLoad ?? 0),
      0
    );

    const missingDurationCount = dayActivities.filter(
      activity => activity.durationMinutes === null
    ).length;

    return {
      date: dayKey,
      weekdayIndex: index,
      isFuture: dayKey > todayKey,
      availableMinutes,
      completedMinutes,
      trainingLoad,
      activityCount: dayActivities.length,
      missingDurationCount,
      activities: dayActivities
    };
  });

  const totalAvailableMinutes = days.reduce(
    (sum, day) => sum + day.availableMinutes,
    0
  );

  const totalCompletedMinutes = days.reduce(
    (sum, day) => sum + day.completedMinutes,
    0
  );

  const elapsedDays = days.filter(day => !day.isFuture);

  const elapsedAvailableMinutes = elapsedDays.reduce(
    (sum, day) => sum + day.availableMinutes,
    0
  );

  const elapsedCompletedMinutes = elapsedDays.reduce(
    (sum, day) => sum + day.completedMinutes,
    0
  );

  const totalTrainingLoad = days.reduce(
    (sum, day) => sum + day.trainingLoad,
    0
  );

  const totalActivityCount = days.reduce(
    (sum, day) => sum + day.activityCount,
    0
  );

  const missingDurationCount = days.reduce(
    (sum, day) => sum + day.missingDurationCount,
    0
  );

  return {
    weekStart: weekDates[0],
    weekEnd: weekDates[6],
    days,
    totalAvailableMinutes,
    totalCompletedMinutes,
    elapsedAvailableMinutes,
    elapsedCompletedMinutes,
    totalTrainingLoad,
    totalActivityCount,
    missingDurationCount,
    weekProgressPercent:
      totalAvailableMinutes > 0
        ? Math.round(
            100 * totalCompletedMinutes /
            totalAvailableMinutes
          )
        : null,
    elapsedUtilizationPercent:
      elapsedAvailableMinutes > 0
        ? Math.round(
            100 * elapsedCompletedMinutes /
            elapsedAvailableMinutes
          )
        : null
  };
}
