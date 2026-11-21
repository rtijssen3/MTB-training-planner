
import {
  withSupabase
} from 'npm:@supabase/server@1';


// ========================================
// 1. CORS
// ========================================

// CORS bepaalt welke browsers antwoorden
// mogen lezen. Het is GEEN authenticatie.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};


// ========================================
// 2. BEVEILIGDE REQUEST HANDLER
// ========================================

const authenticatedHandler = withSupabase(
  { auth: 'user' },

  async (req, ctx) => {

    // Alleen POST accepteren.

    if (req.method !== 'POST') {

      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 }
      );
    }


    // ====================================
    // 3. GEBRUIKERSIDENTITEIT CONTROLEREN
    // ====================================

    const userId = ctx.userClaims?.id;

    const allowedUserId =
      Deno.env.get('ALLOWED_USER_ID');

    if (!allowedUserId || userId !== allowedUserId) {

      return Response.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }


    // ====================================
    // 4. API-KEY OPHALEN
    // ====================================

    const apiKey =
      Deno.env.get('INTERVALS_API_KEY');

    if (!apiKey) {

      return Response.json(
        { error: 'Integration not configured' },
        { status: 500 }
      );
    }


    // ====================================
    // 5. ALLEEN PROFIEL-TEST TOESTAAN
    // ====================================

    let body: unknown;

    try {

      body = await req.json();

    } catch {

      return Response.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !('action' in body) ||
      body.action !== 'test-connection'
    ) {

      return Response.json(
        { error: 'Unsupported action' },
        { status: 400 }
      );
    }


    // ====================================
    // 6. INTERVALS.ICU AANROEPEN
    // ====================================

    // Username is letterlijk API_KEY.
    // Het wachtwoord is de echte API-key.

    const credentials = btoa(
      `API_KEY:${apiKey}`
    );

    let response: Response;

    try {

      response = await fetch(
        'https://intervals.icu/api/v1/athlete/0/profile',
        {
          method: 'GET',

          headers: {
            'Authorization':
              `Basic ${credentials}`,

            'Accept': 'application/json'
          },

          signal: AbortSignal.timeout(10000)
        }
      );

    } catch {

      return Response.json(
        { error: 'Intervals.icu unreachable' },
        { status: 502 }
      );
    }


    // ====================================
    // 7. FOUTEN AFHANDELEN
    // ====================================

    if (!response.ok) {

      if (
        response.status === 401 ||
        response.status === 403
      ) {

        return Response.json(
          {
            error: 'Intervals authentication failed',
            upstream_status: response.status
          },
          { status: 502 }
        );
      }

      if (response.status === 429) {

        return Response.json(
          { error: 'Intervals rate limit reached' },
          { status: 429 }
        );
      }

      return Response.json(
        {
          error: 'Intervals request failed',
          upstream_status: response.status
        },
        { status: 502 }
      );
    }


    // Controleer dat de API geldige JSON
    // met een atleetobject teruggeeft.

    let profile: unknown;

    try {

      profile = await response.json();

    } catch {

      return Response.json(
        { error: 'Invalid upstream response' },
        { status: 502 }
      );
    }

    if (
      !profile ||
      typeof profile !== 'object' ||
      Array.isArray(profile)
    ) {

      return Response.json(
        { error: 'Unexpected profile format' },
        { status: 502 }
      );
    }


    // ====================================
    // 8. VEILIG ANTWOORD TERUGSTUREN
    // ====================================

    // Stuur niet de volledige profieldata
    // en nooit de geheime API-key terug.

    return Response.json({
      connected: true,
      provider: 'intervals.icu'
    });

  }
);


// ========================================
// 9. CORS + FUNCTION ENTRYPOINT
// ========================================

export default {

  async fetch(req: Request): Promise<Response> {

    // Preflight-request van de browser.

    if (req.method === 'OPTIONS') {

      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const response =
      await authenticatedHandler(req);

    // Voeg CORS-headers toe aan het antwoord.

    const headers = new Headers(response.headers);

    for (const [key, value] of
      Object.entries(corsHeaders)) {

      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers
    });
  }

};
