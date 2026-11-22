
import { withSupabase } from 'npm:@supabase/server@1';

type ActionRequest = {
  action?: string;
  oldest?: string;
  newest?: string;
};

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

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(value + 'T00:00:00Z');

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
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

async function intervalsGet(
  path: string,
  apiKey: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    return await fetch(
      'https://intervals.icu/api/v1' + path,
      {
        method: 'GET',
        headers: {
          Authorization: 'Basic ' + btoa('API_KEY:' + apiKey),
          Accept: 'application/json'
        },
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  fetch: withSupabase(
    { auth: 'user' },
    async (req, ctx) => {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405);
      }

      const allowedUserId = Deno.env.get('ALLOWED_USER_ID');

      if (
        !allowedUserId ||
        !ctx.userClaims?.id ||
        ctx.userClaims.id !== allowedUserId
      ) {
        return errorResponse('Forbidden', 403);
      }

      const apiKey = Deno.env.get('INTERVALS_API_KEY');

      if (!apiKey) {
        return errorResponse('Integration not configured', 500);
      }

      let body: ActionRequest;

      try {
        body = await req.json();

        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body)
        ) {
          return errorResponse('Invalid request body', 400);
        }
      } catch {
        return errorResponse('Invalid JSON', 400);
      }

      if (
        body.action !== 'test-connection' &&
        body.action !== 'list-activities' &&
        body.action !== 'list-wellness'
      ) {
        return errorResponse('Unknown action', 400);
      }

      let path = '/athlete/0/profile';

      if (
        body.action === 'list-activities' ||
        body.action === 'list-wellness'
      ) {
        const dateError = validateRange(
          body.oldest,
          body.newest
        );

        if (dateError) {
          return errorResponse(dateError, 400);
        }

        const params = new URLSearchParams({
          oldest: body.oldest!,
          newest: body.newest!
        });

        const resource = body.action === 'list-wellness'
          ? 'wellness'
          : 'activities';

        path = `/athlete/0/${resource}?${params.toString()}`;
      }

      let response: Response;

      try {
        response = await intervalsGet(path, apiKey);
      } catch {
        return errorResponse(
          'Intervals.icu kon niet worden bereikt.',
          502
        );
      }

      if (response.status === 401 || response.status === 403) {
        return errorResponse(
          'Intervals.icu heeft de API-toegang geweigerd.',
          502
        );
      }

      if (response.status === 429) {
        return errorResponse(
          'Intervals.icu heeft tijdelijk te veel verzoeken ontvangen.',
          503
        );
      }

      if (!response.ok) {
        return errorResponse(
          'Intervals.icu gaf een fout bij het ophalen van gegevens.',
          502
        );
      }

      let result: unknown;

      try {
        result = await response.json();
      } catch {
        return errorResponse(
          'Intervals.icu stuurde ongeldige JSON.',
          502
        );
      }

      if (body.action === 'test-connection') {
        if (
          !result ||
          typeof result !== 'object' ||
          Array.isArray(result)
        ) {
          return errorResponse(
            'Ongeldig profielantwoord van Intervals.icu.',
            502
          );
        }

        return Response.json({
          connected: true,
          provider: 'intervals.icu'
        });
      }


      if (body.action === 'list-wellness') {
        if (!Array.isArray(result)) {
          return errorResponse(
            'Ongeldig wellnessantwoord van Intervals.icu.',
            502
          );
        }

        function finiteOrNull(value: unknown): number | null {
          return typeof value === 'number' &&
            Number.isFinite(value)
            ? value
            : null;
        }

        const wellness = result
          .filter((record) =>
            record &&
            typeof record === 'object' &&
            typeof record.id === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(record.id)
          )
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

      if (!Array.isArray(result)) {
        return errorResponse(
          'Ongeldig activiteitenantwoord van Intervals.icu.',
          502
        );
      }

      // Alleen de velden doorsturen die onze planner nodig heeft.
      // Geen volledige FIT-bestanden, locaties of ruwe sensordata.
      const activities = (result as RawActivity[])
        .filter((activity) =>
          activity &&
          (typeof activity.id === 'string' ||
            typeof activity.id === 'number') &&
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
    }
  )
};
