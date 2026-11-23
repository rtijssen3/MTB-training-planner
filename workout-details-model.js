// Les 36: gestructureerde vermogensworkouts.
// Berekening van load is een benadering, geen exacte TSS-berekening op NP.
export const SESSION_NAMES = Object.freeze({
  endurance: 'Duurtraining (Z2)',
  threshold: 'Threshold-intervallen',
  vo2max: 'VO₂max-intervallen'
});

function integer(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} moet een geheel getal tussen ${minimum} en ${maximum} zijn.`);
  }
  return value;
}
function step(label, minutes, percentFtp, kind = 'steady') {
  return { label, seconds: Math.round(minutes * 60), percentFtp, kind };
}

export function createStructuredWorkout({ type, durationMinutes, ftp }) {
  if (!SESSION_NAMES[type]) throw new Error('Onbekend trainingstype.');
  integer(durationMinutes, 'Trainingsduur', 15, 360);
  integer(ftp, 'FTP', 100, 600);
  const steps = [];
  const add = (label, minutes, percent, kind) => {
    if (minutes > 0) steps.push(step(label, minutes, percent, kind));
  };

  if (type === 'endurance') {
    const warm = Math.min(10, Math.floor(durationMinutes / 4));
    const cool = Math.min(5, Math.floor(durationMinutes / 5));
    add('Warming-up', warm, 55, 'warmup');
    add('Duur Z2', durationMinutes - warm - cool, 68, 'endurance');
    add('Cooling-down', cool, 50, 'cooldown');
  } else {
    // Intensieve sessies onder 45 minuten niet automatisch voorschrijven.
    if (durationMinutes < 45) {
      throw new Error('Threshold en VO₂max vereisen hier minimaal 45 minuten. Kies een langere sessie of duurtraining.');
    }
    const warm = 12;
    const cool = 8;
    const threshold = type === 'threshold';
    const workMinutes = threshold ? 8 : 3;
    const recoveryMinutes = threshold ? 3 : 3;
    const workPercent = threshold ? 100 : 115;
    const minimumReps = threshold ? 2 : 4;
    const desiredReps = threshold ? 3 : 5;
    const usable = durationMinutes - warm - cool;
    let reps = Math.min(desiredReps, Math.floor((usable + recoveryMinutes) / (workMinutes + recoveryMinutes)));
    if (reps < minimumReps) throw new Error('Te weinig minuten voor dit intervalprotocol.');
    const intervalsDuration = reps * workMinutes + (reps - 1) * recoveryMinutes;
    const extra = usable - intervalsDuration;
    add('Warming-up', warm, 55, 'warmup');
    add('Rustig duurwerk', extra, 65, 'endurance');
    for (let i = 0; i < reps; i++) {
      add(`Interval ${i + 1}/${reps}`, workMinutes, workPercent, 'work');
      if (i < reps - 1) add('Herstel', recoveryMinutes, 50, 'recovery');
    }
    add('Cooling-down', cool, 50, 'cooldown');
  }

  const totalSeconds = steps.reduce((sum, s) => sum + s.seconds, 0);
  if (totalSeconds !== durationMinutes * 60) throw new Error('Interne fout: trainingsduur klopt niet.');
  const withPower = steps.map(s => ({ ...s, watts: Math.round(ftp * s.percentFtp / 100) }));
  // Illustratieve segmentbelasting: sum(hours * fractieFTP² * 100).
  // Niet gelijk aan power-TSS: die gebruikt Normalized Power over de vermogenscurve.
  const proxyLoad = withPower.reduce((sum, s) =>
    sum + (s.seconds / 3600) * (s.percentFtp / 100) ** 2 * 100, 0);
  const hardMinutes = withPower.filter(s => s.kind === 'work')
    .reduce((sum, s) => sum + s.seconds / 60, 0);
  return {
    type, title: SESSION_NAMES[type], durationMinutes, ftp,
    steps: withPower, hardMinutes,
    estimatedSegmentLoad: Math.round(proxyLoad),
    caveat: 'Indicatieve segmentbelasting, geen exacte TSS of Normalized Power.'
  };
}

export function toIntervalsWorkoutText(workout) {
  if (!workout?.steps?.length) throw new Error('Geen workout om te exporteren.');
  return [
    `# ${workout.title} (${workout.durationMinutes} min)`,
    ...workout.steps.map(s => `- ${s.label} ${Math.round(s.seconds / 60)}m ${s.percentFtp}%`)
  ].join('\n');
}
