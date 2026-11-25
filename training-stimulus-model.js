// Voorzichtige classificatie van uitgevoerde sessies op basis van hun naam.
// Een trainingstitel is GEEN bewijs van de fysiologische intensiteitsverdeling.
import { parseDate, addDays, dateKey, weekDates } from './planner-model.js';

const QUALITY = /(?:\bvo\s*2\s*max\b|\bvo2\b|\bthreshold\b|\bdrempel\b|\bftp\s*(?:test|interval|workout)\b|\banaerob(?:ic|e)?\b|\bsprint(?:s|intervals?)?\b|\bhiit\b|\bwedstrijd\b|\brace\b|\bcriterium\b|\binterval(?:s|training)?\b)/i;
const EASY = /(?:\bz2\b|\bzone\s*2\b|\bduur(?:training|rit)?\b|\bendurance\b|\brecovery\b|\bherstel(?:rit|training)?\b|\beasy\b)/i;

export function classifyTrainingStimulus(activity) {
  const title = String(activity?.name ?? '').trim();
  if (QUALITY.test(title)) return { category:'quality', reason:'Trainingstitel wijst op intensief werk', confidence:'title' };
  if (EASY.test(title)) return { category:'endurance', reason:'Trainingstitel wijst op duur/herstel', confidence:'title' };
  return { category:'unknown', reason:'Intensiteit kan niet betrouwbaar uit de titel worden afgeleid', confidence:'unknown' };
}

// Houd de dataset strikt tot de actuele trainingsweek en reeds voltooide dagen.
export function analyzeCompletedStimulus(activities, weekStart, todayKey) {
  if (!Array.isArray(activities)) throw new Error('Activiteiten moeten een lijst zijn.');
  const days = weekDates(weekStart);
  const unique = new Map();
  for (const a of activities) {
    if (!a || typeof a.date !== 'string' || a.date < days[0] || a.date > days[6] || a.date > todayKey) continue;
    const id = a.id == null ? `zonder-id:${unique.size}` : String(a.id);
    unique.set(id, a);
  }
  const actual = [...unique.values()].map(a=>({
    id:a.id, date:a.date, name:String(a.name||''), trainingLoad:a.trainingLoad,
    ...classifyTrainingStimulus(a)
  }));
  const qualityDates = [...new Set(actual.filter(a=>a.category==='quality').map(a=>a.date))].sort();
  const unknownDates = [...new Set(actual.filter(a=>a.category==='unknown').map(a=>a.date))].sort();
  const blockedQualityDates = new Set();
  // Een dag tussen twee sessies: geen twee kwalitatieve prikkels op aangrenzende dagen.
  for (const day of [...qualityDates, ...unknownDates]) {
    const d = parseDate(day);
    for (const offset of [-1,0,1]) {
      const key = dateKey(addDays(d,offset));
      if (days.includes(key)) blockedQualityDates.add(key);
    }
  }
  const qualityCount = qualityDates.length;
  const unknownCount = actual.filter(a=>a.category==='unknown').length;
  // Onbekend wordt NIET als een aangetoonde zware training geteld.
  // Wel beperken we uit voorzorg de resterende automatische kwaliteitsprikkels.
  const maxNewQuality = Math.max(0, Math.min(2-qualityCount, unknownCount>0 ? 1 : 2));
  return { actual, qualityCount, unknownCount, qualityDates, unknownDates,
    blockedQualityDates:[...blockedQualityDates].sort(), maxNewQuality };
}
