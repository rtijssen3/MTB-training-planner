
const WEEKDAYS = [
    'Zondag',
    'Maandag',
    'Dinsdag',
    'Woensdag',
    'Donderdag',
    'Vrijdag',
    'Zaterdag'
];

// 1. Formatteer een lokale datum

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

// 2. Genereer opeenvolgende kalenderdagen

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

// 3. Maak een gestandaardiseerd gegevensobject

export function normalizeAvailability(value) {

    return {
        available_minutes:
            value?.available_minutes ?? 0,

        fixed_workout:
            value?.fixed_workout?.trim() || null
    };
}

// 4. Vergelijk twee beschikbaarheidsobjecten

export function sameAvailability(a, b) {

    const first = normalizeAvailability(a);
    const second = normalizeAvailability(b);

    return (
        first.available_minutes ===
            second.available_minutes &&

        first.fixed_workout ===
            second.fixed_workout
    );
}

// 5. Bereken totale beschikbare minuten

export function totalMinutes(days) {

    return days.reduce(
        (total, day) =>
            total + day.available_minutes,
        0
    );
}

// 6. Formatteer minuten als uren en minuten

export function formatDuration(minutes) {

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    return `${hours}u ${remaining}m`;
}
