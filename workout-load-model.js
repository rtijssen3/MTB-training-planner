// Les 37: schatting van power-based TSS uit een *voorgeschreven*
// blokkenworkout. Geen gemeten vermogensdata en geen garantie op
// gelijkheid met TrainingPeaks / Intervals.icu.
// Methode: per seconde doelvermogen; 30 s voortschrijdend gemiddelde;
// vierde macht gemiddeld; vierde wortel = benaderde NP.

function checkSteps(workout) {
  if (!workout || !Array.isArray(workout.steps) || workout.steps.length === 0) {
    throw new Error('Workout bevat geen stappen.');
  }
  if (!Number.isFinite(workout.ftp) || workout.ftp <= 0) {
    throw new Error('Ongeldige FTP.');
  }
  let total = 0;
  for (const step of workout.steps) {
    if (!Number.isInteger(step.seconds) || step.seconds < 1 ||
        !Number.isFinite(step.percentFtp) || step.percentFtp < 0 || step.percentFtp > 200) {
      throw new Error('Ongeldig trainingsblok.');
    }
    total += step.seconds;
  }
  if (total < 30 || total > 24 * 3600) {
    throw new Error('Workoutduur moet minimaal 30 seconden zijn.');
  }
  return total;
}

export function estimateWorkoutTss(workout) {
  const totalSeconds = checkSteps(workout);
  const window = new Float64Array(30);
  let writeIndex = 0;
  let rollingSum = 0;
  let elapsed = 0;
  let powerSum = 0;
  let fourthPowerSum = 0;
  let completeWindows = 0;

  for (const step of workout.steps) {
    // Vermogen is het voorgeschreven %FTP; niet een gemeten waarde.
    const targetWatts = workout.ftp * step.percentFtp / 100;
    for (let second = 0; second < step.seconds; second++) {
      if (elapsed >= 30) rollingSum -= window[writeIndex];
      window[writeIndex] = targetWatts;
      rollingSum += targetWatts;
      writeIndex = (writeIndex + 1) % 30;
      elapsed++;
      powerSum += targetWatts;
      if (elapsed >= 30) {
        const rollingAverage = rollingSum / 30;
        fourthPowerSum += rollingAverage ** 4;
        completeWindows++;
      }
    }
  }

  const np = (fourthPowerSum / completeWindows) ** 0.25;
  const intensityFactor = np / workout.ftp;
  const tss = (totalSeconds / 3600) * intensityFactor ** 2 * 100;
  const avgWatts = powerSum / totalSeconds;
  const hardSeconds = workout.steps
    .filter(step => step.kind === 'work')
    .reduce((sum, step) => sum + step.seconds, 0);

  return {
    seconds: totalSeconds,
    avgWatts,
    normalizedPowerWatts: np,
    intensityFactor,
    estimatedTss: tss,
    hardMinutes: hardSeconds / 60,
    method: 'target-power-np30-model',
    assumption: 'Ideale blokvermogens, iedere seconde exact gereden; geen vermogensruis of coasting.'
  };
}

export const WORKOUT_PROTOCOLS = Object.freeze({
  endurance: [
    { id: 'classic', label: 'Constante Z2' }
  ],
  threshold: [
    { id: 'classic', label: '3 × 8 minuten @ 100% FTP' },
    { id: 'long', label: '2 × 12 minuten @ 100% FTP' }
  ],
  vo2max: [
    { id: 'classic', label: '5 × 3 minuten @ 115% FTP' },
    { id: 'long', label: '4 × 4 minuten @ 110% FTP' }
  ]
});

export function resolveWorkoutProtocol(type, protocol = 'classic') {
  const option = WORKOUT_PROTOCOLS[type]?.find(p => p.id === protocol);
  if (!option) throw new Error('Dit intervalprotocol past niet bij het trainingstype.');
  return option;
}
