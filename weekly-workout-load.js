// Les 38 - Pure analyse van een opgeslagen trainingsweek.
// Belastingen zijn schattingen op basis van de *voorgeschreven* vermogensblokken.
import { createStructuredWorkout } from './workout-details-model.js';
import { estimateWorkoutTss, resolveWorkoutProtocol } from './workout-load-model.js';

const TYPES = ['endurance', 'threshold', 'vo2max'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function weekDates(start) {
  if (typeof start !== 'string' || !DATE_RE.test(start)) throw new Error('Ongeldige startdatum.');
  const d = new Date(`${start}T12:00:00`);
  if (!Number.isFinite(d.getTime()) || dateKey(d) !== start || d.getDay() !== 1) {
    throw new Error('De trainingsweek moet op een geldige maandag beginnen.');
  }
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d); day.setDate(day.getDate() + i); return dateKey(day);
  });
}
function availableMinutes(source, day) {
  const entry = source?.[day];
  const value = typeof entry === 'number' ? entry : entry?.available_minutes;
  if (!Number.isInteger(value) || value < 0 || value > 1440) {
    throw new Error(`Beschikbaarheid ontbreekt of is ongeldig op ${day}.`);
  }
  return value;
}

export function analyzeStructuredWeek({ week, sessions, availabilityByDate, ftp, protocols = {} }) {
  if (!week || !Number.isInteger(week.targetLoad) || week.targetLoad < 1 || week.targetLoad > 3000 ||
      !['Opbouw', 'Herstel'].includes(week.phase)) throw new Error('Ongeldige periodiseringsweek.');
  if (!Number.isInteger(ftp) || ftp < 100 || ftp > 600) throw new Error('FTP moet tussen 100 en 600 watt liggen.');
  if (!Array.isArray(sessions)) throw new Error('Trainingssessies ontbreken.');
  const dates = weekDates(week.start);
  if (week.end && week.end !== dates[6]) throw new Error('Einddatum van trainingsweek klopt niet.');
  const seen = new Set();
  const warnings = [];
  const rows = [];
  const breakdown = Object.fromEntries(TYPES.map(type => [type, { sessions: 0, minutes: 0, tss: 0, hardMinutes: 0 }]));
  let duration = 0;
  let estimatedTss = 0;
  let unmodeled = 0;
  const intenseDays = [];

  for (const session of [...sessions].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    if (!session || !dates.includes(session.date) || seen.has(session.date)) {
      throw new Error('Iedere trainingssessie moet een unieke dag in deze week hebben.');
    }
    seen.add(session.date);
    if (!TYPES.includes(session.type) || !Number.isInteger(session.durationMinutes) ||
        session.durationMinutes < 15 || session.durationMinutes > 360) {
      throw new Error(`Ongeldig trainingstype of duur op ${session.date}.`);
    }
    const capacity = availableMinutes(availabilityByDate, session.date);
    if (session.durationMinutes > capacity) {
      throw new Error(`Training op ${session.date} overschrijdt ${capacity} beschikbare minuten.`);
    }
    const protocol = protocols[session.date] ?? 'classic';
    resolveWorkoutProtocol(session.type, protocol);
    const row = { date: session.date, type: session.type, durationMinutes: session.durationMinutes,
      availableMinutes: capacity, protocol, estimatedTss: null, hardMinutes: null, problem: null };
    duration += session.durationMinutes;
    breakdown[session.type].sessions++;
    breakdown[session.type].minutes += session.durationMinutes;
    if (session.type !== 'endurance') intenseDays.push(dates.indexOf(session.date));
    try {
      const workout = createStructuredWorkout({ type: session.type, durationMinutes: session.durationMinutes,
        ftp, protocol, phase: week.phase });
      const result = estimateWorkoutTss(workout);
      row.estimatedTss = result.estimatedTss;
      row.hardMinutes = workout.hardMinutes;
      estimatedTss += row.estimatedTss;
      breakdown[session.type].tss += row.estimatedTss;
      breakdown[session.type].hardMinutes += row.hardMinutes;
    } catch (error) {
      // Een niet modelleerbare sessie heeft ONBEKENDE load, niet 0.
      row.problem = error.message;
      unmodeled++;
      warnings.push(`${session.date}: ${row.problem}`);
    }
    rows.push(row);
  }
  let available = 0;
  for (const day of dates) available += availableMinutes(availabilityByDate, day);
  if (intenseDays.length > 2) warnings.push('Meer dan twee intensieve trainingen in deze week.');
  for (let i = 1; i < intenseDays.length; i++) {
    if (intenseDays[i] - intenseDays[i - 1] === 1) {
      warnings.push('Intensieve trainingen staan op opeenvolgende dagen.'); break;
    }
  }
  if (week.phase === 'Herstel' && intenseDays.length) {
    warnings.push('Een herstelweek bevat intensieve trainingen.');
  }
  const complete = unmodeled === 0;
  const weekTss = complete ? estimatedTss : null;
  const delta = complete ? estimatedTss - week.targetLoad : null;
  const percent = complete ? Math.round(estimatedTss / week.targetLoad * 100) : null;
  if (complete && delta < -week.targetLoad * .15) warnings.push('Geschatte weekbelasting ligt meer dan 15% onder het doel. Verhoog niet automatisch de intensiteit.');
  if (complete && delta > week.targetLoad * .10) warnings.push('Geschatte weekbelasting ligt meer dan 10% boven het doel.');
  if (!sessions.length) warnings.push('Geen trainingssessies in het opgeslagen concept.');
  return { weekStart: dates[0], weekEnd: dates[6], phase: week.phase, targetLoad: week.targetLoad,
    estimatedTss: weekTss, delta, percent, complete, unmodeled,
    totalMinutes: duration, availableMinutes: available, rows, breakdown, warnings,
    methods: 'NP30 over voorgeschreven blokvermogens; geen gemeten TSS', ftp };
}
