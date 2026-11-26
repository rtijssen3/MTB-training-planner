
import { supabase } from './supabase-client.js';

async function invokeIntervals(body) {
  const {
    data: sessionData,
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!sessionData.session) {
    throw new Error('Log eerst in op de MTB-planner.');
  }

  const { data, error } = await supabase.functions.invoke(
    'intervals-read',
    { body }
  );

  if (error) {
    let message = 'Verbinding met Intervals.icu mislukt.';

    if (error.context instanceof Response) {
      try {
        const response = await error.context.json();

        if (typeof response?.error === 'string') {
          message = response.error;
        }
      } catch {
        // Gebruik de algemene foutmelding.
      }
    }

    throw new Error(message);
  }

  return data;
}

// Bestaande functie uit les 24.
export async function testIntervalsConnection() {
  const data = await invokeIntervals({
    action: 'test-connection'
  });

  if (
    !data ||
    data.connected !== true ||
    data.provider !== 'intervals.icu'
  ) {
    throw new Error(
      'Onverwacht antwoord van de Edge Function.'
    );
  }

  return data;
}

// Nieuwe functie uit les 25.
export async function fetchIntervalsActivities(
  oldest,
  newest
) {
  const data = await invokeIntervals({
    action: 'list-activities',
    oldest,
    newest
  });

  if (
    !data ||
    data.provider !== 'intervals.icu' ||
    !Array.isArray(data.activities) ||
    data.oldest !== oldest ||
    data.newest !== newest
  ) {
    throw new Error(
      'Onverwacht activiteitenantwoord van de Edge Function.'
    );
  }

  return data.activities;
}

// Haal dagelijkse fitness-/belastingsgegevens op.
// Maximaal 31 kalenderdagen per verzoek,
// afgedwongen door de Edge Function.
export async function fetchIntervalsWellness(
  oldest,
  newest
) {
  const data = await invokeIntervals({
    action: 'list-wellness',
    oldest,
    newest
  });

  if (
    !data ||
    data.provider !== 'intervals.icu' ||
    data.oldest !== oldest ||
    data.newest !== newest ||
    !Array.isArray(data.wellness)
  ) {
    throw new Error(
      'Onverwacht wellnessantwoord van de Edge Function.'
    );
  }

  return data.wellness;
}

export async function exportIntervalsWorkout({date,title,description}){
 const data=await invokeIntervals({action:'export-workout',date,title,description});
 if(data?.exported!==true||data?.id==null)throw Error('Export niet bevestigd; controleer Intervals.icu voordat je opnieuw probeert.');return data;
}

export async function fetchSkillHistory(oldest,newest){
 const data=await invokeIntervals({action:'skill-history',oldest,newest});
 if(data?.provider!=='intervals.icu'||data.oldest!==oldest||data.newest!==newest||!Array.isArray(data.records))throw Error('Onverwacht vaardigheidsantwoord. Controleer de versie van de Supabase Edge Function.');
 return data.records;
}
