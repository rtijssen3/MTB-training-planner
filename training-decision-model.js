/**
 * Evidence-based planning signals from the sanitized Intervals.icu activity analysis.
 * Works with buildPrivacySafeReport() output, not raw FIT/stream data.
 * No metric here is treated as a measured adaptation or recovery diagnosis.
 * A detected interval is NOT automatically a prescribed training interval.
 */
const number = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
const nonnegative = x => number(x) !== null && x >= 0 ? x : null;
const minutes = x => nonnegative(x);
const dateValid = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x+'T00:00:00Z'));
const sum = xs => xs.reduce((s,x)=>s+x,0);
const round = x => Math.round(x * 10)/10;

export function evidenceForActivity(a) {
  if (!a || typeof a !== 'object') throw new TypeError('Activity object required');
  const zones = a.zMinutes && typeof a.zMinutes === 'object' ? a.zMinutes : {};
  const zonesComplete = a.zonesStatus === 'complete' && Array.from({length:7}, (_,i)=>minutes(zones[`Z${i+1}`]) !== null).every(Boolean);
  const z = i => minutes(zones[`Z${i}`]);
  const z3z4 = zonesComplete ? round(z(3)+z(4)) : null;
  const z5z7 = zonesComplete ? round(z(5)+z(6)+z(7)) : null;
  const hrMinutes = Array.isArray(a.hrZoneMinutes) && a.hrZoneMinutes.length > 0 &&
    a.hrZoneMinutes.every(x => minutes(x) !== null) ? a.hrZoneMinutes : null;
  const measurement = zonesComplete ? 'power' : hrMinutes ? 'heart-rate' : 'load-only';
  const items = Array.isArray(a.intervalSummary) ? a.intervalSummary : [];
  // Intervals marked as %FTP are meaningful only for activities with power zones.
  // An HR-only interval `intensity` cannot be interpreted as %FTP.
  const valid = measurement === 'power' ? items.filter(i => minutes(i?.durationMin) !== null && number(i?.intensity) !== null) : [];
  // The upstream sanitized interval intensity is a percentage of FTP.
  const sprintLike = valid.filter(i => i.intensity >= 150 && i.durationMin > 0 && i.durationMin <= 1);
  const sustainedVo2 = valid.filter(i => i.intensity >= 105 && i.intensity <= 140 && i.durationMin >= 2 && i.durationMin <= 8);
  const sustainedThreshold = valid.filter(i => i.intensity >= 90 && i.intensity <= 105 && i.durationMin >= 6);
  // An intervalSummary may be truncated; absence of intervals proves nothing.
  const intervalCoverage = a.intervalsTruncated === true ? 'truncated' : items.length > 0 ? 'available' : 'missing';
  const indicators = [];
  if (sprintLike.length) indicators.push('explosive-efforts-observed');
  if (sustainedVo2.length >= 2) indicators.push('repeated-vo2-like-intervals-observed');
  if (sustainedThreshold.length >= 2) indicators.push('repeated-threshold-like-intervals-observed');
  if (zonesComplete && z5z7 >= 12) indicators.push('substantial-high-zone-time');
  if (zonesComplete && z3z4 >= 20) indicators.push('substantial-moderate-zone-time');
  return {
    date: a.date ?? null,
    load: nonnegative(a.load),
    strainScore: nonnegative(a.strainScore),
    strain: {
      aerobic:nonnegative(a.strain?.aerobic),
      glycolytic:nonnegative(a.strain?.glycolytic),
      pcr:nonnegative(a.strain?.pcr)
    },
    measurement,
    hrZoneEvidence: hrMinutes ? 'complete' : 'missing-or-incomplete',
    hrZoneMinutes: hrMinutes,
    hrLoad: nonnegative(a.hrLoad),
    // HR-zone distribution is informational until HR-zone boundaries / sport settings
    // are known. Never silently equate HR Z4 to power Z4 or label as VO2.
    zoneEvidence: zonesComplete ? 'complete' : 'missing-or-incomplete',
    zoneMinutes: { moderate:z3z4, high:z5z7 },
    intervalEvidence: intervalCoverage,
    intervalSummaryCount: items.length,
    effortCount: { sprintLike:sprintLike.length, vo2Like:sustainedVo2.length, thresholdLike:sustainedThreshold.length },
    indicators,
    // Signals indicate physiological context, not certified completed sessions.
    certifiedWorkoutType: null
  };
}

export function reviewCompletedTraining(report, {start, end}={}) {
  if (!report || !Array.isArray(report.activities)) throw new TypeError('Report with activities[] required');
  const selected = report.activities.filter(a => (!start || a.date >= start) && (!end || a.date <= end));
  const evidence = selected.map(evidenceForActivity);
  const loadComplete = evidence.every(x => x.load !== null);
  const totalLoad = loadComplete ? sum(evidence.map(x=>x.load)) : null;
  const withZones = evidence.filter(x=>x.zoneEvidence==='complete');
  const withStrain = evidence.filter(x=>x.strainScore!==null);
  const flags = [];
  if (withZones.length < selected.length) flags.push('power-zone-coverage-incomplete');
  if (evidence.some(x => x.measurement === 'load-only')) flags.push('intensity-coverage-incomplete');
  if (evidence.some(x => x.measurement === 'heart-rate')) flags.push('heart-rate-intensity-not-equivalent-to-power');
  if (withStrain.length < selected.length) flags.push('strain-coverage-incomplete');
  if (!loadComplete) flags.push('load-coverage-incomplete');
  if (evidence.some(x=>x.intervalEvidence==='truncated')) flags.push('intervals-truncated');
  return {
    activityCount: selected.length,
    totalLoad,
    loadComplete,
    coverage: { powerZones:withZones.length, heartRateZones:evidence.filter(x=>x.hrZoneEvidence==='complete').length, loadOnly:evidence.filter(x=>x.measurement==='load-only').length, strain:withStrain.length, activities:selected.length },
    indicators: [...new Set(evidence.flatMap(x=>x.indicators))],
    zoneMinutes: {
      moderateObserved: round(sum(withZones.map(x=>x.zoneMinutes.moderate))),
      highObserved: round(sum(withZones.map(x=>x.zoneMinutes.high)))
    },
    evidence,
    flags
  };
}

export function reviewWeekPlanning(report, {weekStart, today, targetLoad}={}) {
  if (!dateValid(weekStart) || !dateValid(today)) throw new Error('weekStart and today must be YYYY-MM-DD');
  const end = new Date(Date.parse(weekStart+'T00:00:00Z') + 6*86400000).toISOString().slice(0,10);
  const review = reviewCompletedTraining(report, {start:weekStart,end:today < end ? today : end});
  const target = nonnegative(targetLoad);
  // Missing load or target cannot be interpreted as zero.
  const remainingLoad = target !== null && review.totalLoad !== null ? Math.max(0, round(target - review.totalLoad)) : null;
  const notices = [...review.flags];
  if (review.indicators.includes('explosive-efforts-observed')) notices.push('short-maximal-efforts-occurred-consider-recovery');
  if (review.indicators.includes('repeated-vo2-like-intervals-observed')) notices.push('vo2-like-efforts-already-observed');
  if (review.indicators.includes('repeated-threshold-like-intervals-observed')) notices.push('threshold-like-efforts-already-observed');
  if (remainingLoad===0 && target !== null) notices.push('week-target-reached');
  if (remainingLoad===null) notices.push('remaining-load-unknown');
  return {
    ...review, weekStart, weekEnd:end, targetLoad:target,
    remainingLoad, notices,
    // Deliberately no automatic workout prescription until workload distribution,
    // planned sessions, available time and recovery constraints are also available.
    automatedWorkoutRecommendation: null
  };
}
