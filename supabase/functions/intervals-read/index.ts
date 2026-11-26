import {skillHistoryRecords} from './skill-history.js';
import { withSupabase } from 'npm:@supabase/server@1';

type ActionRequest = {
  action?: string;
  oldest?: string;
  newest?: string;
  activityId?: string | number;
  date?: string;
  title?: string;
  description?: string;
};

type JsonObject = Record<string, unknown>;

type RawActivity = {
  id?: string | number | null;
  start_date_local?: string | null;
  name?: string | null;
  type?: string | null;
  moving_time?: number | null;
  icu_training_load?: number | null;
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateRange(oldest: unknown, newest: unknown) {
  if (!validDate(oldest) || !validDate(newest)) {
    return 'Ongeldige datums. Gebruik YYYY-MM-DD.';
  }
  const start = Date.parse(oldest + 'T00:00:00Z');
  const end = Date.parse(newest + 'T00:00:00Z');
  const daysBetween = (end - start) / 86400000;
  if (daysBetween < 0 || daysBetween > 30) {
    return 'Kies een periode van maximaal 31 kalenderdagen.';
  }
  return null;
}

function validActivityId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return null;
  const id = String(value);
  // Strict whitelist: this ID becomes a path segment in an upstream URL.
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : null;
}

async function intervalsGet(path: string, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch('https://intervals.icu/api/v1' + path, {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + btoa('API_KEY:' + apiKey),
        Accept: 'application/json'
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Forward only derived training metrics. Never expose GPS, streams,
// notes, files, external account IDs or full raw activity objects.
function normalizeActivityDetail(raw: JsonObject) {
  const intervalCandidates = Array.isArray(raw.icu_intervals)
    ? raw.icu_intervals
    : [];
  const intervals = intervalCandidates
    .filter(isObject)
    .slice(0, 250)
    .map((interval) => ({
      type: stringOrNull(interval.type),
      moving_time: finiteOrNull(interval.moving_time),
      elapsed_time: finiteOrNull(interval.elapsed_time),
      start_time: finiteOrNull(interval.start_time),
      end_time: finiteOrNull(interval.end_time),
      average_watts: finiteOrNull(interval.average_watts),
      weighted_average_watts: finiteOrNull(interval.weighted_average_watts),
      intensity: finiteOrNull(interval.intensity),
      zone: finiteOrNull(interval.zone),
      training_load: finiteOrNull(interval.training_load)
    }));

  // ZoneTime objects have variable schemas. Keep ONLY keys needed to
  // inspect zone indices/duration; do not pretend the unit is minutes.
  const normalizeZoneTimes = (source: unknown) => {
    if (!Array.isArray(source)) return null;
    return source.filter(isObject).slice(0, 20).map((entry) => ({
      id: typeof entry.id === 'string' || typeof entry.id === 'number' ? entry.id : null,
      zone: typeof entry.zone === 'string' || typeof entry.zone === 'number' ? entry.zone : null,
      secs: finiteOrNull(entry.secs),
      seconds: finiteOrNull(entry.seconds),
      time: finiteOrNull(entry.time),
      value: finiteOrNull(entry.value)
    }));
  };

  return {
    id: raw.id ?? null,
    start_date_local: stringOrNull(raw.start_date_local),
    name: stringOrNull(raw.name),
    type: stringOrNull(raw.type),
    moving_time: finiteOrNull(raw.moving_time),
    icu_training_load: finiteOrNull(raw.icu_training_load),
    strain_score: finiteOrNull(raw.strain_score),
    ss_cp: finiteOrNull(raw.ss_cp),
    ss_w_prime: finiteOrNull(raw.ss_w_prime),
    ss_p_max: finiteOrNull(raw.ss_p_max),
    icu_zone_times: normalizeZoneTimes(raw.icu_zone_times),
    // Unlike power ZoneTime records, HR zone times are commonly int[]
    // (seconds in each configured HR zone). Preserve array indices.
    icu_hr_zone_times: Array.isArray(raw.icu_hr_zone_times)
      ? raw.icu_hr_zone_times.length <= 30 && raw.icu_hr_zone_times.every(
          (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
        )
        ? raw.icu_hr_zone_times
        : normalizeZoneTimes(raw.icu_hr_zone_times)
      : null,
    icu_hr_zones: Array.isArray(raw.icu_hr_zones)
      ? raw.icu_hr_zones.filter((v) => typeof v === 'number' && Number.isFinite(v)).slice(0, 30)
      : null,
    hr_load: finiteOrNull(raw.hr_load),
    hr_load_type: stringOrNull(raw.hr_load_type),
    power_load: finiteOrNull(raw.power_load),
    power_meter: typeof raw.power_meter === 'boolean' ? raw.power_meter : null,
    polarization_index: finiteOrNull(raw.polarization_index),
    classification: stringOrNull(raw.classification),
    icu_classification: stringOrNull(raw.icu_classification),
    class: stringOrNull(raw.class),
    icu_ftp: finiteOrNull(raw.icu_ftp),
    icu_intensity: finiteOrNull(raw.icu_intensity),
    icu_weighted_avg_watts: finiteOrNull(raw.icu_weighted_avg_watts),
    icu_intervals: intervals,
    // Diagnostic: names only, not raw values. Useful because API field
    // names evolve and Class/S1-S3 may not be part of this response.
    available_metric_keys: Object.keys(raw).filter((key) =>
      /strain|zone|class|polar|interval|intens|ftp|load|seiler|power/i.test(key)
    ).sort(),
    intervals_truncated: intervalCandidates.length > 250
  };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405);
    }

    const allowedUserId = Deno.env.get('ALLOWED_USER_ID');
    if (!allowedUserId || !ctx.userClaims?.id || ctx.userClaims.id !== allowedUserId) {
      return errorResponse('Forbidden', 403);
    }

    const apiKey = Deno.env.get('INTERVALS_API_KEY');
    if (!apiKey) {
      return errorResponse('Integration not configured', 500);
    }

    let body: ActionRequest;
    try {
      body = await req.json();
      if (!isObject(body)) return errorResponse('Invalid request body', 400);
    } catch {
      return errorResponse('Invalid JSON', 400);
    }

    if(body.action==='export-workout'){
      if(!validDate(body.date)||typeof body.title!=='string'||body.title.length<1||body.title.length>100||
        typeof body.description!=='string'||body.description.length>8000||
        !body.description.split('\n').every(line=>/^- [1-9][0-9]{0,4}[ms] (?:[0-9]|[1-9][0-9]|1[0-9]{2}|200)(?:\.[0-9]+)?%$/.test(line)))return errorResponse('Ongeldige workout.',400);
      const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      if(body.date<now)return errorResponse('Geen export van verstreken dagen.',400);
      const marker='mtb-planner-v1-'+body.date;
      const headers={Authorization:'Basic '+btoa('API_KEY:'+apiKey),'Content-Type':'application/json',Accept:'application/json'};
      try{
        const existing=await intervalsGet('/athlete/0/events?oldest='+body.date+'&newest='+body.date,apiKey);
        if(!existing.ok)return errorResponse('Bestaande kalender kon niet worden gecontroleerd.',502);
        const list=await existing.json();
        if(!Array.isArray(list))return errorResponse('Onverwacht kalenderantwoord.',502);
        if(list.some(e=>e?.external_id===marker||String(e?.name??'').startsWith('MTB Planner · ')))return errorResponse('Er staat al een workout van de planner op deze datum. Pas die aan in Intervals.icu; geen tweede export uitgevoerd.',409);
        const response=await fetch('https://intervals.icu/api/v1/athlete/0/events',{method:'POST',headers,body:JSON.stringify({category:'WORKOUT',type:'Ride',start_date_local:body.date+'T00:00:00',name:'MTB Planner · '+body.title,description:body.description,external_id:marker}),signal:AbortSignal.timeout(15000)});
        if(!response.ok)return errorResponse('Export niet bevestigd. Controleer Intervals.icu voordat je opnieuw probeert.',502);
        const created=await response.json();
        if(created?.id==null)return errorResponse('Export niet bevestigd. Controleer de kalender.',502);
        return Response.json({exported:true,id:created.id});
      }catch{return errorResponse('Export niet bevestigd. Controleer Intervals.icu voordat je opnieuw probeert.',502);}
    }
    if(body.action==='skill-history'){
      if(!validDate(body.oldest)||!validDate(body.newest))return errorResponse('Ongeldige referentieperiode.',400);
      const days=(Date.parse(body.newest)-Date.parse(body.oldest))/86400000;
      if(days<0||days>364)return errorResponse('Maximaal 365 kalenderdagen.',400);
      const params=new URLSearchParams({oldest:body.oldest,newest:body.newest});
      const curveParams=new URLSearchParams({oldest:body.oldest+'T00:00:00',newest:body.newest+'T23:59:59',secs:'5,15,30,60,300,1200'});
      try{
        const [activities,curves]=await Promise.all([intervalsGet('/athlete/0/activities?'+params,apiKey),intervalsGet('/athlete/0/activity-power-curves.json?'+curveParams,apiKey)]);
        if(!activities.ok||!curves.ok)return errorResponse('Vaardigheidsgegevens konden niet volledig worden opgehaald.',502);
        const records=skillHistoryRecords(await activities.json(),await curves.json(),body.oldest,body.newest);
        return Response.json({provider:'intervals.icu',oldest:body.oldest,newest:body.newest,records});
      }catch(e){return errorResponse('Vaardigheidsgegevens niet beschikbaar of API-formaat afwijkend.',502);}
    }
    const allowedActions = [
      'test-connection',
      'list-activities',
      'list-wellness',
      'get-activity-details'
    ];
    if (!allowedActions.includes(body.action ?? '')) {
      return errorResponse('Unknown action', 400);
    }

    let path = '/athlete/0/profile';
    if (body.action === 'list-activities' || body.action === 'list-wellness') {
      const dateError = validateRange(body.oldest, body.newest);
      if (dateError) return errorResponse(dateError, 400);
      const params = new URLSearchParams({ oldest: body.oldest!, newest: body.newest! });
      const resource = body.action === 'list-wellness' ? 'wellness' : 'activities';
      path = `/athlete/0/${resource}?${params.toString()}`;
    } else if (body.action === 'get-activity-details') {
      const id = validActivityId(body.activityId);
      if (!id) return errorResponse('Ongeldig activityId.', 400);
      path = `/activity/${encodeURIComponent(id)}?intervals=true`;
    }

    let response: Response;
    try {
      response = await intervalsGet(path, apiKey);
    } catch {
      return errorResponse('Intervals.icu kon niet worden bereikt.', 502);
    }

    if (response.status === 401 || response.status === 403) {
      return errorResponse('Intervals.icu heeft de API-toegang geweigerd.', 502);
    }
    if (response.status === 404 && body.action === 'get-activity-details') {
      return errorResponse('Activiteit niet gevonden.', 404);
    }
    if (response.status === 429) {
      return errorResponse('Intervals.icu heeft tijdelijk te veel verzoeken ontvangen.', 503);
    }
    if (!response.ok) {
      return errorResponse('Intervals.icu gaf een fout bij het ophalen van gegevens.', 502);
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      return errorResponse('Intervals.icu stuurde ongeldige JSON.', 502);
    }

    if (body.action === 'test-connection') {
      if (!isObject(result)) {
        return errorResponse('Ongeldig profielantwoord van Intervals.icu.', 502);
      }
      return Response.json({ connected: true, provider: 'intervals.icu' });
    }

    if (body.action === 'get-activity-details') {
      if (!isObject(result)) {
        return errorResponse('Ongeldig activiteitsdetailantwoord van Intervals.icu.', 502);
      }
      return Response.json({
        provider: 'intervals.icu',
        activity: normalizeActivityDetail(result)
      });
    }

    if (!Array.isArray(result)) {
      return errorResponse(
        body.action === 'list-wellness'
          ? 'Ongeldig wellnessantwoord van Intervals.icu.'
          : 'Ongeldig activiteitenantwoord van Intervals.icu.',
        502
      );
    }

    if (body.action === 'list-wellness') {
      const wellness = result
        .filter((record) => isObject(record) && validDate(record.id))
        .map((record) => ({
          date: record.id,
          ctl: finiteOrNull(record.ctl),
          atl: finiteOrNull(record.atl),
          rampRate: finiteOrNull(record.rampRate)
        }));
      return Response.json({
        provider: 'intervals.icu',
        oldest: body.oldest,
        newest: body.newest,
        wellness
      });
    }

    // Preserve existing response contract for the current dashboard/calendar.
    const activities = (result as RawActivity[])
      .filter((activity) =>
        isObject(activity) &&
        (typeof activity.id === 'string' || typeof activity.id === 'number') &&
        typeof activity.start_date_local === 'string'
      )
      .map((activity) => ({
        id: activity.id,
        start_date_local: activity.start_date_local,
        name: activity.name ?? 'Naamloze training',
        type: activity.type ?? 'Other',
        moving_time: activity.moving_time ?? null,
        icu_training_load: activity.icu_training_load ?? null
      }));

    return Response.json({
      provider: 'intervals.icu',
      oldest: body.oldest,
      newest: body.newest,
      activities
    });
  })
};
