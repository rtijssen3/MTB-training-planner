
import {
    supabase
} from './supabase-client.js';


export async function testIntervalsConnection() {

    // Controleer eerst de lokale sessie.

    const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

    if (sessionError) {
        throw sessionError;
    }

    if (!sessionData.session) {

        throw new Error(
            'Log eerst in op de MTB-planner.'
        );
    }


    // Roep de beveiligde Edge Function aan.

    const { data, error } =
        await supabase.functions.invoke(
            'intervals-read',
            {
                body: {
                    action: 'test-connection'
                }
            }
        );


    // Supabase kan foutdetails in de
    // HTTP-response beschikbaar stellen.

    if (error) {

        let message =
            'Verbinding met Intervals.icu mislukt.';

        if (error.context instanceof Response) {

            try {

                const response =
                    await error.context.json();

                if (response?.error) {
                    message = response.error;
                }

            } catch {
                // Behoud standaardfoutmelding.
            }
        }

        throw new Error(message);
    }


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
