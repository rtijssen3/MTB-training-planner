/**
 * Conservative planning guardrails based on Intervals.icu activity details.
 * Signals are NOT diagnoses of recovery or verified workout purposes.
 * No combination of HR-zone time with power-zone time; no addition of strain to TSS.
 */
import { evidenceForActivity } from './training-decision-model.js';

const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const shift = (date, n) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const uniq = arr => [...new Set(arr)].sort();

/**
 * @param {object} options
 * @param {Array<object>} options.reportActivities Sanitized activities from buildPrivacySafeReport()
 * @param {string[]} options.unknownDates Dates where detail request failed or is unavailable
 * @param {string} options.weekStart Monday YYYY-MM-DD
 * @param {string} options.today YYYY-MM-DD
 */
export function deriveAdaptiveWeekPolicy({reportActivities = [], unknownDates = [], weekStart, today}) {
  if (!iso(weekStart) || !iso(today)) throw new Error('Ongeldige week- of vandaag-datum.');
  if (!Array.isArray(reportActivities) || !Array.isArray(unknownDates)) throw new Error('Ongeldige activiteitsgegevens.');
  const end = shift(weekStart, 6);
  const inRange = date => iso(date) && date >= weekStart && date <= end && date <= today;
  const classes = [];
  const completedQualityKinds = new Set();
  for (const raw of reportActivities) {
    if (!inRange(raw?.date)) continue;
    const ev = evidenceForActivity(raw);
    const indicators = ev.indicators;
    const repeated = indicators.includes('repeated-vo2-like-intervals-observed') ||
      indicators.includes('repeated-threshold-like-intervals-observed');
    const explosive = indicators.includes('explosive-efforts-observed');
    const high = indicators.includes('substantial-high-zone-time');
    const moderate = indicators.includes('substantial-moderate-zone-time');
    // Repeated substantial efforts are stronger evidence of a quality session.
    // Brief sprints alone are NOT proof of a VO2max workout.
    if (indicators.includes('repeated-vo2-like-intervals-observed')) completedQualityKinds.add('vo2max');
    if (indicators.includes('repeated-threshold-like-intervals-observed')) completedQualityKinds.add('threshold');
    const classification = repeated ? 'quality-like'
      : (explosive || high || moderate) ? 'mixed-or-taxing'
      : ev.measurement === 'power' ? 'low-intensity-observed'
      : 'unknown';
    classes.push({date: raw.date, measurement: ev.measurement, classification,
      indicators: [...indicators], load: ev.load});
  }
  for (const date of unknownDates) {
    if (inRange(date)) classes.push({date, measurement:'unknown', classification:'unknown', indicators:[], load:null});
  }
  const qualityDates = uniq(classes.filter(c=>c.classification==='quality-like').map(c=>c.date));
  const uncertainDates = uniq(classes.filter(c => c.classification==='unknown' || c.classification==='mixed-or-taxing').map(c=>c.date));
  // One uncertainty-day consumes one of at most two quality-session slots;
  // this is intentionally a safety-oriented planning HEURISTIC.
  const maxNewQuality = Math.max(0, 2 - qualityDates.length - Math.min(2, uncertainDates.length));
  const blockedQualityDates = uniq([...qualityDates,...uncertainDates].flatMap(date=>[-1,0,1]
    .map(offset=>shift(date,offset)).filter(candidate=>candidate>=weekStart&&candidate<=end)));
  const remarks = [];
  const qualityTypes = completedQualityKinds.has('vo2max') && !completedQualityKinds.has('threshold')
    ? ['threshold','vo2max'] : uncertainDates.length ? ['threshold','vo2max'] : ['vo2max','threshold'];
  if (qualityDates.length) remarks.push(`${qualityDates.length} dag(en) met herhaalde threshold-/VO₂max-achtige vermogensintervallen herkend; geen gegarandeerde trainingsclassificatie.`);
  if (uncertainDates.length) remarks.push(`${uncertainDates.length} dag(en) met onvoldoende of gemengde intensiteit: conservatieve beperking van nieuwe intensieve trainingen.`);
  if (classes.some(c=>c.measurement==='heart-rate')) remarks.push('Hartslagtrainingen tellen mee voor Load; hartslagzones worden niet gelijkgesteld aan vermogenszones.');
  if (!classes.length) remarks.push('Deze week zijn geen uitgevoerde activiteiten geanalyseerd.');
  return {maxNewQuality,blockedQualityDates,qualityDates,uncertainDates,classes,remarks,qualityTypes};
}
