// Les 37: gestructureerde vermogensworkouts met protocolkeuze.
// Backwards compatible met createStructuredWorkout uit les 36.
import { resolveWorkoutProtocol } from './workout-load-model.js';

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

export function createStructuredWorkout({ type, durationMinutes, ftp, protocol = 'classic', phase = 'Opbouw' }) {
  if (!SESSION_NAMES[type]) throw new Error('Onbekend trainingstype.');
  integer(durationMinutes, 'Trainingsduur', 15, 360);
  integer(ftp, 'FTP', 100, 600);
  if (!['Opbouw', 'Herstel'].includes(phase)) throw new Error('Onbekende trainingsfase.');
  resolveWorkoutProtocol(type, protocol);
  if (phase === 'Herstel' && type !== 'endurance') {
    throw new Error('In dit herstelweekconcept stellen we geen threshold/VO₂max voor. Kies een duurtraining of wijzig het periodiseringsconcept.');
  }
  const steps = [];
  const add = (label, minutes, percent, kind) => {
    if (minutes > 0) steps.push(step(label, minutes, percent, kind));
  };

  if (type === 'endurance') {
    const warm = Math.min(10, Math.floor(durationMinutes / 4));
    const cool = Math.min(5, Math.floor(durationMinutes / 5));
    add('Warming-up', warm, 55, 'warmup');
    add('Duur Z2', durationMinutes - warm - cool, phase === 'Herstel' ? 60 : 68, 'endurance');
    add('Cooling-down', cool, 50, 'cooldown');
  } else {
    if (durationMinutes < 45) {
      throw new Error('Threshold en VO₂max vereisen hier minimaal 45 minuten.');
    }
    const threshold = type === 'threshold';
    const long = protocol === 'long';
    const warm = 12;
    const cool = 8;
    const workMinutes = threshold ? (long ? 12 : 8) : (long ? 4 : 3);
    const recoveryMinutes = long ? 4 : 3;
    const workPercent = threshold ? 100 : (long ? 110 : 115);
    const minimumReps = threshold ? 2 : 4;
    const desiredReps = threshold ? (long ? 2 : 3) : (long ? 4 : 5);
    const usable = durationMinutes - warm - cool;
    const reps = Math.min(desiredReps, Math.floor((usable + recoveryMinutes) / (workMinutes + recoveryMinutes)));
    if (reps < minimumReps) {
      throw new Error(`Te weinig tijd voor ${desiredReps} × ${workMinutes} minuten. Kies een langere sessie of een ander protocol.`);
    }
    const intervalsDuration = reps * workMinutes + (reps - 1) * recoveryMinutes;
    const extra = usable - intervalsDuration;
    // Bij lange sessies niet al het duurwerk vóór de intervallen zetten.
    // Maximaal 20 minuten rustig werk vóór de eerste herhaling.
    const before = Math.min(20, extra);
    const after = extra - before;
    add('Warming-up', warm, 55, 'warmup');
    add('Rustig duurwerk', before, 65, 'endurance');
    for (let i = 0; i < reps; i++) {
      add(`Interval ${i + 1}/${reps}`, workMinutes, workPercent, 'work');
      if (i < reps - 1) add('Herstel', recoveryMinutes, 50, 'recovery');
    }
    add('Duur na intervallen', after, 65, 'endurance');
    add('Cooling-down', cool, 50, 'cooldown');
  }

  const totalSeconds = steps.reduce((sum, s) => sum + s.seconds, 0);
  if (totalSeconds !== durationMinutes * 60) throw new Error('Interne fout: trainingsduur klopt niet.');
  const withPower = steps.map(s => ({ ...s, watts: Math.round(ftp * s.percentFtp / 100) }));
  // Legacy schatting behouden zodat tests en eventuele andere modules blijven werken.
  const proxyLoad = withPower.reduce((sum, s) =>
    sum + (s.seconds / 3600) * (s.percentFtp / 100) ** 2 * 100, 0);
  const hardMinutes = withPower.filter(s => s.kind === 'work')
    .reduce((sum, s) => sum + s.seconds / 60, 0);
  return {
    type, title: SESSION_NAMES[type], durationMinutes, ftp, protocol, phase,
    steps: withPower, hardMinutes,
    estimatedSegmentLoad: Math.round(proxyLoad),
    caveat: 'Segmentbelasting en gemodelleerde NP-TSS zijn schattingen; werkelijke TSS wordt uit gemeten vermogen bepaald.'
  };
}

export function toIntervalsWorkoutText(workout) {
  if (!workout?.steps?.length) throw new Error('Geen workout om te exporteren.');
  return [
    `# ${workout.title} (${workout.durationMinutes} min)`,
    ...workout.steps.map(s => `- ${s.label} ${Math.round(s.seconds / 60)}m ${s.percentFtp}%`)
  ].join('\n');
}
