
import { supabase } from './supabase-client.js';

import {
    generateDays
} from './availability.js';


// 1. Normale week ophalen

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


// 2. Afwijkingen ophalen

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


// 3. Alle kalendergegevens ophalen

export async function loadAvailabilityData(
    userId,
    startDate = new Date()
) {

    const days = generateDays(startDate, 14);

    const firstDate = days[0].date;
    const lastDate = days[13].date;

    const [
        weeklyAvailability,
        savedOverrides
    ] = await Promise.all([

        fetchWeeklyAvailability(userId),

        fetchOverrides(
            userId,
            firstDate,
            lastDate
        )
    ]);

    return {
        weeklyAvailability,
        savedOverrides
    };
}


// 4. Alle wijzigingen tegelijk opslaan

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
