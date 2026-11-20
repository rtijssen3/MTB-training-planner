
import {
    AvailabilityState
} from './availability-state.js';

import {
    loadAvailabilityData,
    saveAvailabilityChanges
} from './availability-api.js';


// 1. Kalender initialiseren

export async function initializeAvailability(
    userId,
    startDate = new Date()
) {

    const {
        weeklyAvailability,
        savedOverrides
    } = await loadAvailabilityData(
        userId,
        startDate
    );

    const state = new AvailabilityState(
        weeklyAvailability,
        savedOverrides,
        startDate
    );

    let restoredChanges = 0;
    let storageWarning = null;

    try {

        restoredChanges =
            state.restoreDraft(userId);

    } catch (error) {

        storageWarning =
            'Conceptopslag is niet beschikbaar';

        console.warn(storageWarning, error);
    }

    return {
        state,
        restoredChanges,
        storageWarning
    };
}


// 2. Tijdelijke wijziging verwerken

export function changeAvailability(
    state,
    userId,
    date,
    changes
) {

    state.updateDay(date, changes);

    return persistDraft(state, userId);
}


// 3. Standaardbeschikbaarheid herstellen

export function resetAvailabilityDay(
    state,
    userId,
    date
) {

    state.resetDay(date);

    return persistDraft(state, userId);
}


// 4. Alle wijzigingen definitief opslaan

export async function saveAllAvailability(
    state,
    userId,
    saveChanges = saveAvailabilityChanges
) {

    const changes = state.getSavePayload();

    if (changes.length === 0) {

        return {
            savedCount: 0,
            storageWarning: null
        };
    }

    // Wacht op bevestiging van Supabase.

    const savedCount =
        await saveChanges(changes);

    // Pas na succesvolle databaseopslag.

    state.confirmSaved();

    const storageWarning =
        persistDraft(state, userId);

    return {
        savedCount,
        storageWarning
    };
}


// 5. Tijdelijke wijzigingen annuleren

export function discardAvailability(
    state,
    userId
) {

    state.discardChanges();

    return persistDraft(state, userId);
}


// 6. SessionStorage bijwerken

function persistDraft(state, userId) {

    try {

        state.storeDraft(userId);

        return null;

    } catch (error) {

        console.warn(
            'Unable to store draft',
            error
        );

        return 'Conceptopslag is niet beschikbaar';
    }
}
