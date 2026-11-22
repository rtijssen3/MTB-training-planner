
import { normalizeActivity } from './intervals-model.js';

// Valideer een handmatig ingevoerd weekdoel.
// null betekent: nog geen doel ingesteld.
export function validateTargetLoad(value) {
  if (value === null || value === '') {
    return null;
  }

  const target = Number(value);

  if (
    !Number.isInteger(target) ||
    target < 1 ||
    target > 3000
  ) {
    throw new Error(
      'Vul een geheel weekdoel in tussen 1 en 3000.'
    );
  }

  return target;
}

// Berekent de voortgang zonder iets op te slaan
// of een externe API aan te roepen.
export function calculateLoadProgress({
  targetLoad,
  rawActivities,
  weekStart,
  weekEnd,
  today
}) {
  const target = validateTargetLoad(targetLoad);

  if (!Array.isArray(rawActivities)) {
    throw new Error('Activiteiten moeten een array zijn.');
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  for (const date of [weekStart, weekEnd, today]) {
    if (
      typeof date !== 'string' ||
      !datePattern.test(date)
    ) {
      throw new Error('Ongeldige kalenderdatum.');
    }
  }

  if (weekStart > weekEnd) {
    throw new Error('Ongeldige weekperiode.');
  }

  const normalized = rawActivities.map(
    normalizeActivity
  );

  // Eenzelfde activiteit mag slechts eenmaal
  // meetellen in de trainingsbelasting.
  const unique = [
    ...new Map(
      normalized.map(activity => [
        activity.id,
        activity
      ])
    ).values()
  ];

  const completed = unique.filter(activity =>
    activity.date >= weekStart &&
    activity.date <= weekEnd &&
    activity.date <= today
  );

  const completedLoad = completed.reduce(
    (sum, activity) =>
      sum + (activity.trainingLoad ?? 0),
    0
  );

  const missingLoadCount = completed.filter(
    activity => activity.trainingLoad === null
  ).length;

  const progressPercent =
    target === null
      ? null
      : Math.round(
          (completedLoad / target) * 100
        );

  return {
    targetLoad: target,
    completedLoad,
    progressPercent,
    activityCount: completed.length,
    missingLoadCount,
    remainingLoad:
      target === null
        ? null
        : Math.max(0, target - completedLoad),
    exceededTarget:
      target !== null && completedLoad > target
  };
}

// Een puur illustratieve 4-weekse opbouw.
// Geen automatisch trainingsadvies.
export function previewFourWeekBlock(baseTarget) {
  const base = validateTargetLoad(baseTarget);

  if (base === null) {
    throw new Error(
      'Stel eerst een basisweekdoel in.'
    );
  }

  const multipliers = [1, 1.05, 1.10, 0.70];

  return multipliers.map((factor, index) => ({
    week: index + 1,
    phase: index === 3 ? 'Herstel' : 'Opbouw',
    targetLoad: Math.round(base * factor)
  }));
}
