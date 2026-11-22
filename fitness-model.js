
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function finiteOrNull(value) {
  return typeof value === 'number' &&
    Number.isFinite(value)
    ? value
    : null;
}

function isValidDateKey(value) {
  if (
    typeof value !== 'string' ||
    !DATE_PATTERN.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

// Zet één dagrecord om naar het interne formaat.
export function normalizeFitnessDay(record) {
  if (
    !record ||
    !isValidDateKey(record.date)
  ) {
    throw new Error('Ongeldig fitnessdagrecord.');
  }

  const ctl = finiteOrNull(record.ctl);
  const atl = finiteOrNull(record.atl);

  return {
    date: record.date,
    ctl,
    atl,
    rampRate: finiteOrNull(record.rampRate),

    // Alleen berekenen wanneer beide
    // bronwaarden daadwerkelijk aanwezig zijn.
    tsb:
      ctl !== null && atl !== null
        ? ctl - atl
        : null
  };
}

// Analyseer een reeks dagelijkse records.
export function analyzeFitnessData(rawRecords) {
  if (!Array.isArray(rawRecords)) {
    throw new Error(
      'Fitnessgegevens moeten een array zijn.'
    );
  }

  const normalized = rawRecords.map(
    normalizeFitnessDay
  );

  // Eén record per datum; nieuwste versie
  // krijgt voorrang bij dubbele datums.
  const unique = [
    ...new Map(
      normalized.map(day => [day.date, day])
    ).values()
  ];

  const days = unique.sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  const daysWithFitness = days.filter(
    day => day.ctl !== null && day.atl !== null
  );

  const latest = daysWithFitness.length > 0
    ? daysWithFitness[daysWithFitness.length - 1]
    : null;

  const first = daysWithFitness.length > 0
    ? daysWithFitness[0]
    : null;

  const ctlChange =
    first !== null && latest !== null
      ? latest.ctl - first.ctl
      : null;

  const missingFitnessDays =
    days.length - daysWithFitness.length;

  return {
    days,
    latest,
    first,
    ctlChange,
    missingFitnessDays,
    hasData: latest !== null
  };
}
