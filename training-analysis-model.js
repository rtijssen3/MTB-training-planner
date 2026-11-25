// Derived training analysis on top of Intervals.icu activity details.
// Input is the sanitized `activity` returned by intervals-read/get-activity-details.
// No re-estimation of TSS/SS, no title guessing, no invented zones.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positiveOrZero = value => finite(value) && value >= 0 ? value : null;
const numberOrNull = value => finite(value) ? value : null;
const dateKey = raw => String(raw?.start_date_local ?? raw?.date ?? '').slice(0,10);
const canonicalId = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim().toUpperCase() : '';

export function analyzePowerZones(rawZones) {
  const seconds = Object.fromEntries(Array.from({length: 7}, (_, i) => [`Z${i+1}`, null]));
  if (!Array.isArray(rawZones)) return { status: 'missing', seconds, sweetSpotSeconds: null, sSeconds: null, coveredSeconds: null, issues: ['Geen vermogenszonegegevens'] };
  const issues = [];
  const seen = new Set();
  let sweetSpotSeconds = null;
  for (const item of rawZones) {
    if (!item || typeof item !== 'object') { issues.push('Ongeldig zone-item'); continue; }
    const id = canonicalId(item.id ?? item.zone);
    // Edge function sends {secs, seconds, time, value}; official duration is `secs`.
    const duration = positiveOrZero(item.secs);
    if (duration === null) { issues.push(`${id || 'Onbekende zone'}: secs ontbreekt of is ongeldig`); continue; }
    if (seen.has(id)) { issues.push(`Dubbele zone ${id}`); continue; }
    seen.add(id);
    if (/^Z[1-7]$/.test(id)) seconds[id] = duration;
    else if (id === 'SS') sweetSpotSeconds = duration;
    else issues.push(`Onbekende zone ${id || '(leeg)'}`);
  }
  const allSeven = Object.values(seconds).every(finite);
  const sSeconds = allSeven ? {
    S1: seconds.Z1 + seconds.Z2,
    S2: seconds.Z3 + seconds.Z4,
    S3: seconds.Z5 + seconds.Z6 + seconds.Z7
  } : null;
  // SS (Sweet Spot) overlaps the seven zones; NEVER add it to covered seconds.
  const coveredSeconds = allSeven ? Object.values(seconds).reduce((sum, value) => sum + value, 0) : null;
  return { status: issues.length ? 'invalid' : allSeven ? 'complete' : 'partial', seconds, sweetSpotSeconds, sSeconds, coveredSeconds, issues };
}

export function analyzeDetectedIntervals(rawIntervals) {
  if (!Array.isArray(rawIntervals)) return { status: 'missing', count: 0, records: [], totals: null, issues: ['Geen intervalgegevens'] };
  const records = [];
  const issues = [];
  for (let i = 0; i < rawIntervals.length; i++) {
    const item = rawIntervals[i];
    if (!item || typeof item !== 'object') { issues.push(`Interval ${i+1} ongeldig`); continue; }
    const durationSeconds = positiveOrZero(item.moving_time) ?? positiveOrZero(item.elapsed_time);
    const intensity = numberOrNull(item.intensity);
    const averageWatts = positiveOrZero(item.average_watts);
    const zone = item.zone == null ? null : String(item.zone);
    const type = typeof item.type === 'string' ? item.type : null;
    records.push({ durationSeconds, intensity, averageWatts, zone, type, load: positiveOrZero(item.training_load) });
    if (durationSeconds === null) issues.push(`Interval ${i+1} zonder duur`);
  }
  const measurable = records.filter(item => item.durationSeconds !== null);
  // Detected intervals can be overlapping, grouped or incomplete; sum is diagnostic only.
  const summedSeconds = measurable.reduce((sum, item) => sum + item.durationSeconds, 0);
  return { status: issues.length ? 'partial' : 'available', count: records.length, records, totals: { summedIntervalSeconds: summedSeconds, durationsKnown: measurable.length }, issues };
}

export function analyzeIntervalsActivity(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  return {
    id: a.id ?? null, date: dateKey(a),
    load: positiveOrZero(a.icu_training_load),
    strainScore: positiveOrZero(a.strain_score),
    strain: { aerobic: positiveOrZero(a.ss_cp), glycolytic: positiveOrZero(a.ss_w_prime), pcr: positiveOrZero(a.ss_p_max) },
    polarizationIndex: numberOrNull(a.polarization_index),
    reportedClass: typeof a.classification === 'string' ? a.classification : typeof a.icu_classification === 'string' ? a.icu_classification : typeof a.class === 'string' ? a.class : null,
    ftp: positiveOrZero(a.icu_ftp), intensity: numberOrNull(a.icu_intensity),
    movingSeconds: positiveOrZero(a.moving_time),
    zones: analyzePowerZones(a.icu_zone_times),
    intervals: analyzeDetectedIntervals(a.icu_intervals),
    intervalsTruncated: a.intervals_truncated === true
  };
}

export function summarizeIntervalsPeriod(rawActivities) {
  if (!Array.isArray(rawActivities)) throw new TypeError('Activiteiten moeten een array zijn');
  const unique = new Map();
  for (let i = 0; i < rawActivities.length; i++) {
    const parsed = analyzeIntervalsActivity(rawActivities[i]);
    const key = parsed.id == null ? `missing-id-${i}` : String(parsed.id);
    unique.set(key, parsed);
  }
  const activities = [...unique.values()].sort((a,b) => a.date.localeCompare(b.date));
  const sumKnown = fn => {
    let value = 0, known = 0;
    for (const a of activities) { const v = fn(a); if (v !== null) { value += v; known++; } }
    return { value, known, missing: activities.length-known, complete: known===activities.length && activities.length>0 };
  };
  const load = sumKnown(a => a.load);
  const strain = {
    score: sumKnown(a=>a.strainScore),
    aerobic: sumKnown(a=>a.strain.aerobic),
    glycolytic: sumKnown(a=>a.strain.glycolytic),
    pcr: sumKnown(a=>a.strain.pcr)
  };
  const verified = activities.filter(a => a.zones.status === 'complete');
  const byZone = Object.fromEntries(Array.from({length:7},(_,i)=>[`Z${i+1}`, verified.reduce((s,a)=>s+a.zones.seconds[`Z${i+1}`],0)]));
  const sSeconds = {
    S1: byZone.Z1 + byZone.Z2,
    S2: byZone.Z3 + byZone.Z4,
    S3: byZone.Z5 + byZone.Z6 + byZone.Z7
  };
  return {
    count: activities.length, activities, load, strain,
    powerZones: { seconds: byZone, sSeconds, covered: verified.length, missingOrInvalid: activities.length-verified.length, complete: verified.length===activities.length && activities.length>0 },
    intervals: { available: activities.filter(a=>a.intervals.status!=='missing').length, truncated: activities.filter(a=>a.intervalsTruncated).length },
    notes: ['S1–S3 zijn afgeleid uit Z1–Z7 en worden niet erbij opgeteld.', 'SS is Sweet Spot en overlapt de zeven vermogenszones.', 'Intervalduur kan overlappen en wordt niet als totale zone- of workoutduur gebruikt.', 'Weekclass en week-PI worden niet berekend uit gemiddelden van activiteiten.']
  };
}

export function buildPrivacySafeReport(rawActivities, {start=null,end=null}={}) {
  const s = summarizeIntervalsPeriod(rawActivities);
  const mins = n => n == null ? null : Math.round(n / 60 * 10) / 10;
  return {
    period: { start, end }, activityCount: s.count,
    coverage: { load: s.load.known, strainScore: s.strain.score.known, strainComponents: { aerobic:s.strain.aerobic.known,glycolytic:s.strain.glycolytic.known,pcr:s.strain.pcr.known }, powerZones:s.powerZones.covered, intervals:s.intervals.available },
    load: s.load,
    strain: s.strain,
    powerZones: { complete:s.powerZones.complete, covered:s.powerZones.covered, missingOrInvalid:s.powerZones.missingOrInvalid,
      zMinutes: Object.fromEntries(Object.entries(s.powerZones.seconds).map(([key,sec])=>[key,mins(sec)])),
      sMinutes: Object.fromEntries(Object.entries(s.powerZones.sSeconds).map(([key,sec])=>[key,mins(sec)])) },
    // The user explicitly opts in to copying aggregate numerical data.
    activities: s.activities.map(a=>({ date:a.date, load:a.load, strainScore:a.strainScore, strain:a.strain,
      polarizationIndex:a.polarizationIndex, class:a.reportedClass, intensity:a.intensity,
      zonesStatus:a.zones.status, zMinutes: Object.fromEntries(Object.entries(a.zones.seconds).map(([key,sec])=>[key,mins(sec)])),
      sweetSpotMinutes:mins(a.zones.sweetSpotSeconds), intervalCount:a.intervals.count,
      intervalSummary: a.intervals.records.slice(0,30).map(item=>({durationMin:mins(item.durationSeconds),intensity:item.intensity,zone:item.zone,watts:item.averageWatts,type:item.type})),
      intervalsTruncated:a.intervalsTruncated }))
  };
}
