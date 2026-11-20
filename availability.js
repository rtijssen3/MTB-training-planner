
const WEEKDAYS = [
    'Zondag',
    'Maandag',
    'Dinsdag',
    'Woensdag',
    'Donderdag',
    'Vrijdag',
    'Zaterdag'
];

// Zet een lokale datum om naar YYYY-MM-DD.

export function formatDate(date) {
    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, '0');

    const day = String(
        date.getDate()
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

// Genereer een reeks opeenvolgende datums.

export function generateDays(
    startDate = new Date(),
    numberOfDays = 14
) {
    return Array.from(
        { length: numberOfDays },
        (_, index) => {

            const date = new Date(startDate);

            date.setDate(
                startDate.getDate() + index
            );

            return {
                date: formatDate(date),
                weekday: WEEKDAYS[date.getDay()]
            };
        }
    );
}

// Combineer normale beschikbaarheid
// met tijdelijke uitzonderingen.

export function buildAvailability(
    days,
    weeklyAvailability,
    overrides
) {
    return days.map(day => {

        const standard =
            weeklyAvailability.find(
                row => row.weekday === day.weekday
            );

        const override =
            overrides.find(
                row => row.date === day.date
            );

        const effective = override ?? standard;

        return {
            date: day.date,
            weekday: day.weekday,

            standardMinutes:
                standard?.available_minutes ?? 0,

            availableMinutes:
                effective?.available_minutes ?? 0,

            fixedWorkout:
                effective?.fixed_workout ?? null,

            isOverride: override !== undefined
        };
    });
}

// Bereken de totale beschikbaarheid.

export function totalMinutes(days) {
    return days.reduce(
        (total, day) =>
            total + day.availableMinutes,
        0
    );
}
