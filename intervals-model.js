

export function normalizeActivity(activity) {

    if (
        !activity ||
        typeof activity !== 'object' ||
        !activity.id ||
        typeof activity.start_date_local !== 'string'
    ) {
        throw new Error('Ongeldige activiteit');
    }

    const seconds = activity.moving_time;

    const durationMinutes =
        typeof seconds === 'number' &&
        Number.isFinite(seconds) &&
        seconds >= 0
            ? Math.round(seconds / 60)
            : null;

    const load = activity.icu_training_load;

    return {
        id: String(activity.id),

        date:
            activity.start_date_local.slice(0, 10),

        name:
            activity.name ?? 'Naamloze training',

        sport:
            activity.type ?? 'Other',

        durationMinutes,

        trainingLoad:
            typeof load === 'number' &&
            Number.isFinite(load)
                ? load
                : null
    };
}


export function totalActivityMinutes(activities) {

    return activities.reduce(
        (sum, activity) =>
            sum + (activity.durationMinutes ?? 0),
        0
    );
}
