/**
 * Historical load guardrail for automatic mesocycle workout proposals.
 * This is a transparent scheduling heuristic, NOT an individual injury-risk
 * threshold or a prediction of recovery/fitness.
 *
 * Only four COMPLETED calendar weeks are used; a week with no activities
 * or an activity missing load disables the proposed-load cap. Do not infer
 * that an empty recorded week reflects normal availability.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const day = value => {
  if (typeof value !== 'string' || !ISO.test(value)) throw new Error('Datum moet YYYY-MM-DD zijn.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw new Error('Ongeldige kalenderdatum.');
  return parsed;
};
const shift = (value, days) => new Date(day(value).getTime() + days*DAY_MS).toISOString().slice(0,10);
const loadValue = activity => {
  const val = activity?.trainingLoad ?? activity?.icu_training_load ?? null;
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : null;
};

export function historyWindow(currentWeekStart) {
  if (day(currentWeekStart).getUTCDay() !== 1) throw new Error('Weekstart moet een maandag zijn.');
  return { oldest: shift(currentWeekStart,-28), newest: shift(currentWeekStart,-1) };
}

/**
 * @param {Object} options
 * @param {Array} options.activities normalized entries with .date and .trainingLoad
 * @param {string} options.currentWeekStart Monday of the currently ongoing week
 * @param {number} options.weekTarget saved mesocycle goal (never modified)
 * @param {string} options.phase e.g. Base/Build/Recovery
 * @param {number} options.maxIncreaseFraction default 15% (heuristic)
 */
export function assessPeriodizationLoad({activities, currentWeekStart, weekTarget, phase='', maxIncreaseFraction=.15}) {
  const {oldest,newest}=historyWindow(currentWeekStart);
  if (!Array.isArray(activities)) throw new Error('Activiteiten moeten een lijst zijn.');
  if (typeof weekTarget !== 'number' || !Number.isFinite(weekTarget) || weekTarget <= 0) throw new Error('Ongeldig mesocycledoel.');
  if (typeof maxIncreaseFraction !== 'number' || !Number.isFinite(maxIncreaseFraction) || maxIncreaseFraction < 0 || maxIncreaseFraction > 1)
    throw new Error('Ongeldige trendgrens.');
  const weeks=Array.from({length:4},(_,i)=>({start:shift(oldest,i*7),end:shift(oldest,i*7+6),load:0,activities:0,missingLoad:0}));
  const unique=new Map();
  for (const a of activities) {
    if (!a || typeof a.date !== 'string' || a.date < oldest || a.date > newest) continue;
    // One activity can be returned by multiple overlapping API calls. Do not double count.
    const id=a.id === null || a.id === undefined ? null : String(a.id);
    const key=id === null ? null : id;
    if (key === null) {
      // Without ID, a record cannot be deduplicated reliably. Treat as unsafe.
      return {status:'insufficient',reason:'Activiteit zonder uniek ID; historische load niet betrouwbaar.',
        weeks,averageLoad:null,proposalTarget:weekTarget,originalTarget:weekTarget,capApplied:false};
    }
    unique.set(key,a);
  }
  for (const a of unique.values()) {
    const index=Math.floor((day(a.date).getTime()-day(oldest).getTime())/(7*DAY_MS));
    if (index<0||index>3) continue;
    const w=weeks[index];w.activities++;
    const load=loadValue(a);
    if (load===null)w.missingLoad++;
    else w.load+=load;
  }
  const populated=weeks.filter(w=>w.activities>0).length;
  const missing=weeks.reduce((s,w)=>s+w.missingLoad,0);
  // Require all four completed weeks to contain recorded activities before
  // applying an automatic guardrail. Sparse histories are advice-only.
  if (missing>0 || populated<4) {
    const reason=missing>0?'Er zijn historische activiteiten zonder Load.':`Slechts ${populated} van de vier afgesloten weken bevatten geregistreerde activiteiten.`;
    return {status:'insufficient',reason,weeks,averageLoad:null,proposalTarget:weekTarget,originalTarget:weekTarget,capApplied:false};
  }
  const averageLoad=weeks.reduce((s,w)=>s+w.load,0)/4;
  if (averageLoad<=0) return {status:'insufficient',reason:'Historisch gemiddelde is nul.',weeks,averageLoad:null,proposalTarget:weekTarget,originalTarget:weekTarget,capApplied:false};
  // Recovery is already intentionally reduced; never force a higher number.
  const recovery=/recovery|herstel/i.test(String(phase));
  const cap=Math.round((averageLoad*(1+maxIncreaseFraction))+Number.EPSILON*averageLoad*10);
  const capApplied=!recovery && weekTarget>cap;
  const proposalTarget=capApplied?Math.max(1,cap):weekTarget;
  const risePct=Math.round((weekTarget/averageLoad-1)*100);
  return {
    status:capApplied?'capped':'within-range', reason:capApplied?
      `Weekdoel ${Math.round(weekTarget)} ligt ${risePct}% boven het gemiddelde van vier afgesloten weken (${Math.round(averageLoad)} Load). Het automatische voorstel wordt voorlopig begrensd op ${proposalTarget} Load; je mesocycledoel blijft ${Math.round(weekTarget)}.`:
      `Weekdoel ${Math.round(weekTarget)}; vierweeksgemiddelde ${Math.round(averageLoad)} Load. Geen aanvullende begrenzing toegepast.`,
    weeks,averageLoad,originalTarget:weekTarget,proposalTarget,capApplied,
    // Explicitly advisory: a planning limit is not a medical threshold.
    method:'four-completed-weeks-advisory-v1'
  };
}
