/**
 * Mesocycle phase emphasis for automatic workout suggestions.
 * Scheduling preferences, NOT a claim that a training stimulus or recovery is verified.
 * The saved week target, historic-load guardrail, and already completed activities
 * remain authoritative in their own separate roles.
 */
export const PHASE_FOCUS = Object.freeze({
  Base: Object.freeze({focus:'Aerobe basis',maxQuality:1,qualityTypes:['threshold','vo2max'],description:'Duur heeft voorrang; maximaal één aanvullende kwaliteitstraining.'}),
  Build: Object.freeze({focus:'Gerichte opbouw',maxQuality:2,qualityTypes:['vo2max','threshold'],description:'Maximaal twee gespreide kwaliteitstrainingen, als herstel en tijd dit toelaten.'}),
  Peak: Object.freeze({focus:'Frisheid en behoud van intensiteit',maxQuality:1,qualityTypes:['vo2max','threshold'],description:'Beperk de hoeveelheid intensief werk; geen extra intensiteit om Load te vullen.'}),
  Recovery: Object.freeze({focus:'Herstel',maxQuality:0,qualityTypes:['threshold','vo2max'],description:'Geen nieuw intensief werk in automatisch voorstel.'})
});

const TYPES = new Set(['vo2max','threshold']);

/**
 * @param {{week:{phase:string,basePhase?:string},adaptivePolicy?:{maxNewQuality?:number,qualityTypes?:string[],blockedQualityDates?:string[]}|null}} args
 * @returns {{phase:string,focus:string,maxQualitySessions:number,qualityTypes:string[],blockedQualityDates:string[],remarks:string[]}}
 */
export function derivePhaseWorkoutPolicy({week,adaptivePolicy=null}={}) {
  if(!week || typeof week.phase!=='string' || !PHASE_FOCUS[week.phase]) {
    throw new Error('Onbekende mesocyclefase; automatisch voorstel is niet verantwoord.');
  }
  const config=PHASE_FOCUS[week.phase];
  const maxByCompleted=adaptivePolicy?.maxNewQuality;
  if(maxByCompleted!==undefined && (!Number.isInteger(maxByCompleted)||maxByCompleted<0||maxByCompleted>2)) {
    throw new Error('Ongeldig maximum gebaseerd op uitgevoerde activiteiten.');
  }
  const maxQualitySessions=Math.min(config.maxQuality,maxByCompleted??2);
  const desired=adaptivePolicy?.qualityTypes;
  const qualityTypes=Array.isArray(desired)&&desired.length===2&&desired.every(t=>TYPES.has(t))&&new Set(desired).size===2
    ? [...desired] : [...config.qualityTypes];
  const blocked=adaptivePolicy?.blockedQualityDates ?? [];
  if(!Array.isArray(blocked)||blocked.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    throw new Error('Ongeldige dagen voor herstelbeperkingen.');
  }
  const remarks=[`${week.phase} · ${config.focus}. ${config.description}`];
  if(maxByCompleted!==undefined && maxByCompleted<config.maxQuality) remarks.push('De uitgevoerde trainingen beperken het aantal resterende kwaliteitssessies verder.');
  if(week.phase==='Peak') remarks.push('Peak is geen persoonlijk taperadvies: controleer je wedstrijddatum en vermoeidheid.');
  return {phase:week.phase,focus:config.focus,maxQualitySessions,qualityTypes,
    blockedQualityDates:[...new Set(blocked)].sort(),remarks};
}
