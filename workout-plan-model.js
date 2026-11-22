// Les 35 – Een conceptweek vertalen naar workouts.
// Alle belastingen zijn SCHATTINGEN. IF is voor de hele sessie,
// inclusief warming-up, herstelpauzes en cooling-down.
import { dateKey, shiftDate } from './periodization-model.js';

export const WORKOUT_TYPES = Object.freeze({
  endurance: { label: 'Duur (Z2)', ifEstimate: 0.65, category: 'endurance' },
  threshold: { label: 'Threshold', ifEstimate: 0.83, category: 'intensity' },
  vo2max: { label: 'VO₂max', ifEstimate: 0.88, category: 'intensity' }
});

const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function integer(value, label, min = 0, max = 1440) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} moet een geheel getal zijn tussen ${min} en ${max}.`);
  }
  return value;
}

function checkWeek(week) {
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week.start)) {
    throw new Error('Kies een geldige week uit het periodiseringsconcept.');
  }
  integer(week.targetLoad, 'Weekdoel', 1, 3000);
  if (!['Opbouw', 'Herstel'].includes(week.phase)) {
    throw new Error('De trainingsfase wordt niet herkend.');
  }
  const monday = new Date(`${week.start}T12:00:00`);
  if (!Number.isFinite(monday.getTime()) || dateKey(monday) !== week.start || monday.getDay() !== 1) {
    throw new Error('De week moet op maandag beginnen.');
  }
  return Array.from({ length: 7 }, (_, i) => dateKey(shiftDate(monday, i)));
}

function available(availabilityByDate, date) {
  const entry = availabilityByDate?.[date];
  const value = typeof entry === 'number' ? entry : entry?.available_minutes;
  return integer(value, `Beschikbaarheid voor ${date}`);
}

export function estimateLoad(type, durationMinutes) {
  const template = WORKOUT_TYPES[type];
  if (!template) throw new Error('Onbekend trainingstype.');
  integer(durationMinutes, 'Trainingsduur', 0, 1440);
  // TSS ≈ uren × IF² × 100, voor een HELE fietssessie.
  return Math.round(durationMinutes / 60 * template.ifEstimate ** 2 * 100);
}

export function evaluateWorkoutPlan({ week, availabilityByDate, sessions }) {
  const dates = checkWeek(week);
  if (!Array.isArray(sessions)) throw new Error('Sessies moeten een lijst zijn.');
  const byDate = new Map();
  const warnings = [];

  for (const session of sessions) {
    if (!session || !dates.includes(session.date) || byDate.has(session.date)) {
      throw new Error('Iedere sessie moet op één unieke dag binnen deze week staan.');
    }
    if (!WORKOUT_TYPES[session.type]) throw new Error('Onbekend trainingstype.');
    integer(session.durationMinutes, 'Trainingsduur', 15, 360);
    if (session.durationMinutes % 15 !== 0) {
      throw new Error('Gebruik stappen van 15 minuten.');
    }
    const capacity = available(availabilityByDate, session.date);
    if (session.durationMinutes > capacity) {
      throw new Error(`Training op ${session.date} overschrijdt de beschikbare ${capacity} minuten.`);
    }
    byDate.set(session.date, {
      date: session.date,
      type: session.type,
      durationMinutes: session.durationMinutes,
      availableMinutes: capacity,
      estimatedLoad: estimateLoad(session.type, session.durationMinutes)
    });
  }

  const days = dates.map((date, index) => ({
    date, dayName: DAY_NAMES[index], availableMinutes: available(availabilityByDate, date),
    session: byDate.get(date) ?? null
  }));
  const totalLoad = days.reduce((sum, d) => sum + (d.session?.estimatedLoad ?? 0), 0);
  const totalMinutes = days.reduce((sum, d) => sum + (d.session?.durationMinutes ?? 0), 0);
  const availableMinutes = days.reduce((sum, d) => sum + d.availableMinutes, 0);
  const intensityIndices = days.flatMap((d, i) => d.session && WORKOUT_TYPES[d.session.type].category === 'intensity' ? [i] : []);
  if (intensityIndices.length > 2) warnings.push('Meer dan twee intensieve sessies: beoordeel of herstel voldoende is.');
  for (let i = 1; i < intensityIndices.length; i++) {
    if (intensityIndices[i] - intensityIndices[i-1] < 2) {
      warnings.push('Intensieve sessies staan op opeenvolgende dagen.');
      break;
    }
  }
  if (week.phase === 'Herstel' && intensityIndices.length > 0) {
    warnings.push('Herstelweek bevat een intensieve sessie: controleer of dit bewust is.');
  }
  const delta = week.targetLoad - totalLoad;
  if (delta > week.targetLoad * .15) warnings.push('Het concept blijft ruim onder het weekdoel. Forceer de belasting niet als de tijd ontbreekt.');
  if (delta < -week.targetLoad * .10) warnings.push('Het concept overschrijdt het weekdoel met meer dan 10%.');
  return { week, days, sessions: [...byDate.values()].sort((a,b) => a.date.localeCompare(b.date)), totalLoad, totalMinutes, availableMinutes,
    targetLoad: week.targetLoad, delta, completionPercent: Math.round(totalLoad / week.targetLoad * 100),
    intensitySessions: intensityIndices.length, warnings };
}

export function proposeWorkoutWeek({ week, availabilityByDate }) {
  const dates = checkWeek(week);
  const caps = dates.map(date => available(availabilityByDate, date));
  const isRecovery = week.phase === 'Herstel';
  const sessions = new Map();

  // Twee kwaliteitsprikkels in opbouwweken, bij voldoende ruimte.
  // Dinsdag en donderdag hebben voorkeur; nooit twee opeenvolgende dagen.
  if (!isRecovery) {
    const preferred = [1, 3, 2, 5, 0, 4, 6];
    const chosen = [];
    for (const index of preferred) {
      if (caps[index] < 60 || chosen.some(other => Math.abs(other - index) < 2)) continue;
      chosen.push(index);
      if (chosen.length === 2) break;
    }
    if (chosen[0] !== undefined) sessions.set(chosen[0], { date: dates[chosen[0]], type: 'vo2max', durationMinutes: 60 });
    if (chosen[1] !== undefined) sessions.set(chosen[1], { date: dates[chosen[1]], type: 'threshold', durationMinutes: 60 });
  }

  // Vul overige beschikbare dagen eerst conservatief met duurtraining.
  // Zondag eerst voor een eventuele groepsrit; dat is GEEN harde intensiteitsaanname.
  const enduranceOrder = [6, 2, 5, 1, 3, 0, 4];
  for (const index of enduranceOrder) {
    if (sessions.has(index) || caps[index] < 45) continue;
    const minutes = Math.min(60, Math.floor(caps[index] / 15) * 15);
    if (minutes < 45) continue;
    sessions.set(index, { date: dates[index], type: 'endurance', durationMinutes: minutes });
  }

  // Vergroot eerst bestaande duursessies, nooit de intensiteit om een getal te halen.
  // Stop zodra een stap van 15 minuten het doel niet dichterbij brengt.
  for (let step = 0; step < 150; step++) {
    const current = [...sessions.values()].reduce((sum, s) => sum + estimateLoad(s.type, s.durationMinutes), 0);
    let choice = null;
    for (const index of enduranceOrder) {
      const s = sessions.get(index);
      if (!s || s.type !== 'endurance' || s.durationMinutes + 15 > Math.min(caps[index], 360)) continue;
      const additional = estimateLoad('endurance', s.durationMinutes + 15) - estimateLoad('endurance', s.durationMinutes);
      const newLoad = current + additional;
      if (Math.abs(week.targetLoad - newLoad) >= Math.abs(week.targetLoad - current)) continue;
      const candidate = { index, distance: Math.abs(week.targetLoad - newLoad) };
      if (!choice || candidate.distance < choice.distance) choice = candidate;
    }
    if (!choice) break;
    sessions.get(choice.index).durationMinutes += 15;
  }

  return evaluateWorkoutPlan({ week, availabilityByDate, sessions: [...sessions.values()] });
}
