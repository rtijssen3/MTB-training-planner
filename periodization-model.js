// Les 34: puur rekenmodel voor een concept-trainingsblok.
// Loadpunten zijn niet automatisch identiek aan fiets-TSS.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dateKey(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('Ongeldige datum.');
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nextMonday(today) {
  if (!(today instanceof Date) || !Number.isFinite(today.getTime())) {
    throw new Error('Ongeldige datum.');
  }
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntil = (8 - ((day.getDay() + 6) % 7 + 1)) % 7 || 7;
  day.setDate(day.getDate() + daysUntil);
  return day;
}

export function shiftDate(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function validLoad(value) {
  // We onderscheiden een ontbrekende waarde van nul.
  if (value === '' || value === null || value === undefined) {
    throw new Error('Vul een belastingdoel in.');
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 3000) {
    throw new Error('Belastingdoel moet een geheel getal van 1 t/m 3000 zijn.');
  }
  return n;
}

export function createDraft({ today, baseLoad, buildPercent = 0, recoveryPercent = 70 }) {
  const base = validLoad(baseLoad);
  const step = Number(buildPercent);
  const recovery = Number(recoveryPercent);
  if (!Number.isFinite(step) || step < 0 || step > 15) {
    throw new Error('Opbouwpercentage moet tussen 0 en 15 liggen.');
  }
  if (!Number.isFinite(recovery) || recovery < 40 || recovery > 100) {
    throw new Error('Herstelweek moet tussen 40% en 100% liggen.');
  }
  const monday = nextMonday(today);
  const factors = [1, 1 + step / 100, 1 + 2 * step / 100, recovery / 100];
  const targets = factors.map(factor => Math.round(base * factor));
  const weeks = targets.map((targetLoad, index) => ({
    week: index + 1,
    start: dateKey(shiftDate(monday, index * 7)),
    end: dateKey(shiftDate(monday, index * 7 + 6)),
    phase: index === 3 ? 'Herstel' : 'Opbouw',
    targetLoad
  }));
  return { start: dateKey(monday), weeks, model: 'manual-draft-v1' };
}

export function validateDraft(draft) {
  if (!draft || !Array.isArray(draft.weeks) || draft.weeks.length !== 4 ||
      typeof draft.start !== 'string' || !DATE_RE.test(draft.start)) {
    throw new Error('Het conceptblok is ongeldig.');
  }
  const first = draft.weeks[0];
  if (first.start !== draft.start) throw new Error('Onjuiste startdatum in trainingsblok.');
  const starts = new Set();
  const valid = draft.weeks.map((week, index) => {
    if (!week || !DATE_RE.test(week.start ?? '') || !DATE_RE.test(week.end ?? '') ||
        week.week !== index + 1 || starts.has(week.start)) {
      throw new Error(`Ongeldige gegevens in week ${index + 1}.`);
    }
    starts.add(week.start);
    const startDate = new Date(`${week.start}T12:00:00`);
    if (!Number.isFinite(startDate.getTime()) || dateKey(startDate) !== week.start ||
        dateKey(shiftDate(startDate, 6)) !== week.end ||
        (index > 0 && dateKey(shiftDate(new Date(`${draft.start}T12:00:00`), index * 7)) !== week.start)) {
      throw new Error(`De kalenderdatums in week ${index + 1} kloppen niet.`);
    }
    return { ...week, targetLoad: validLoad(week.targetLoad) };
  });
  return { start: draft.start, model: 'manual-draft-v1', weeks: valid };
}

export function assessDraft(draft, recentFourWeekAverage, historyQuality = {}) {
  const plan = validateDraft(draft);
  const avg = Number(recentFourWeekAverage);
  const notes = [];
  if (historyQuality.emptyWeeks > 0) notes.push('Historie bevat weken zonder activiteiten: controleer of je gegevens compleet zijn.');
  if (historyQuality.totalMissingLoad > 0) notes.push('Niet alle historische activiteiten hebben een loadwaarde.');
  if (!(avg > 0) || !Number.isFinite(avg)) {
    notes.push('Geen bruikbaar historisch gemiddelde; beoordeel de doelen handmatig.');
  } else {
    const difference = ((plan.weeks[0].targetLoad / avg) - 1) * 100;
    if (difference > 10) notes.push('De eerste week ligt meer dan 10% boven je recente gemiddelde. Controleer herstel en belastinghistorie.');
    if (difference < -30) notes.push('De eerste week ligt ruim onder je recente gemiddelde. Mogelijk bewust vanwege herstel of omstandigheden.');
  }
  const totalLoad = plan.weeks.reduce((s, w) => s + w.targetLoad, 0);
  return { totalLoad, averageLoad: Math.round(totalLoad / 4), notes };
}
