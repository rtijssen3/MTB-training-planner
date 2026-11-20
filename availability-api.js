
import { supabase } from './supabase-client.js';

import {
    generateDays
} from './availability.js';


// ====================================
// 1. NORMALE WEEK OPHALEN
// ====================================

export async function fetchWeeklyAvailability(userId) {

    const { data, error } = await supabase
        .from('weekly_availability')
        .select(
            'weekday, available_minutes, fixed_workout'
        )
        .eq('user_id', userId);

    if (error) {
        throw error;
    }

    return data ?? [];
}


// ====================================
// 2. AFWIJKINGEN OPHALEN
// ====================================

export async function fetchOverrides(
    userId,
    startDate,
    endDate
) {

    const { data, error } = await supabase
        .from('availability_overrides')
        .select(
            'date, available_minutes, fixed_workout'
        )
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

    if (error) {
        throw error;
    }

    return data ?? [];
}


// ====================================
// 3. HISTORISCHE BESCHIKBAARHEID
//    OPHALEN
// ====================================

export async function fetchHistory(
    userId,
    startDate,
    endDate
) {

    const { data, error } = await supabase
        .from('availability_history')
        .select(
            'date, available_minutes, fixed_workout'
        )
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

    if (error) {
        throw error;
    }

    return data ?? [];
}


// ====================================
// 4. VERSTREKEN DAGEN BEVRIEZEN
// ====================================

export async function freezePastAvailability() {

    const { error } = await supabase.rpc(
        'freeze_past_availability'
    );

    if (error) {
        throw error;
    }
}


// ====================================
// 5. ALLE KALENDERGEGEVENS OPHALEN
// ====================================


export async function loadAvailabilityData(
    userId,
    startDate = new Date()
) {

    await freezePastAvailability();

    const days = generateDays(startDate, 14);

    const firstDate = days[0].date;
    const lastDate = days[13].date;

    // Maximaal drie pogingen om een
    // consistente dataset op te halen.

    for (let attempt = 0; attempt < 3; attempt++) {

        const revisionBefore =
            await fetchRevision();

        const [
            weeklyAvailability,
            savedOverrides,
            history
        ] = await Promise.all([

            fetchWeeklyAvailability(userId),

            fetchOverrides(
                userId,
                firstDate,
                lastDate
            ),

            fetchHistory(
                userId,
                firstDate,
                lastDate
            )
        ]);

        const revisionAfter =
            await fetchRevision();

        // Is er tussentijds iets gewijzigd?
        // Dan proberen we opnieuw.

        if (revisionBefore !== revisionAfter) {

            continue;
        }

        const combinedOverrides = new Map(
            savedOverrides.map(row => [
                row.date,
                row
            ])
        );

        for (const row of history) {

            combinedOverrides.set(
                row.date,
                row
            );
        }

        return {

            weeklyAvailability,

            savedOverrides:
                Array.from(
                    combinedOverrides.values()
                ),

            revision: revisionAfter
        };
    }

    throw new Error(
        'De beschikbaarheid wordt momenteel ' +
        'gewijzigd op een ander apparaat. ' +
        'Probeer opnieuw.'
    );
}


// ====================================
// 6. ALLE WIJZIGINGEN OPSLAAN
// ====================================

export async function saveAvailabilityChanges(
    changes,
    client = supabase
) {

    if (!Array.isArray(changes)) {

        throw new Error(
            'Changes must be an array'
        );
    }

    if (changes.length === 0) {
        return 0;
    }

    if (changes.length > 14) {

        throw new Error(
            'Maximum 14 changes allowed'
        );
    }

    const { data, error } = await client
        .rpc('save_availability_changes', {

            p_changes: changes

        });

    if (error) {
        throw error;
    }

    if (data !== changes.length) {

        throw new Error(
            'Unexpected number of saved changes'
        );
    }

    return data;
}


// ====================================
// 7. ACTUELE REVISIE OPHALEN
// ====================================

export async function fetchRevision() {

    const { data, error } =
        await supabase.rpc(
            'get_availability_revision'
        );

    if (error) throw error;

    return data;
}


// ====================================
// 8. KALENDER OPSLAAN MET CONTROLE
// ====================================

export async function saveCalendarChecked(
    changes,
    expectedRevision
) {

    if (!Array.isArray(changes)) {

        throw new Error(
            'Changes must be an array'
        );
    }

    if (changes.length === 0) {

        return {
            saved_count: 0,
            revision: expectedRevision
        };
    }

    const { data, error } =
        await supabase.rpc(
            'save_calendar_checked',
            {
                p_changes: changes,
                p_expected_revision:
                    expectedRevision
            }
        );

    if (error) throw error;

    if (
        !data ||
        data.saved_count !== changes.length
    ) {

        throw new Error(
            'Unexpected saved count'
        );
    }

    return data;
}


// ====================================
// 9. STANDAARDWEEK OPSLAAN MET CONTROLE
// ====================================

export async function saveWeeklyChecked(
    rows,
    expectedRevision
) {

    const { data, error } =
        await supabase.rpc(
            'save_weekly_checked',
            {
                p_rows: rows,
                p_expected_revision:
                    expectedRevision
            }
        );

    if (error) throw error;

    return data;
}
