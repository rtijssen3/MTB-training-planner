
import {
    generateDays,
    normalizeAvailability,
    sameAvailability,
    totalMinutes
} from './availability.js';

export class AvailabilityState {

    // 1. Initialisatie

    constructor(
        weeklyAvailability,
        savedOverrides = [],
        startDate = new Date()
    ) {

        this.days = generateDays(startDate, 14);

        this.weeklyAvailability = new Map(
            weeklyAvailability.map(row => [
                row.weekday,
                normalizeAvailability(row)
            ])
        );

        this.savedOverrides = new Map(
            savedOverrides.map(row => [
                row.date,
                normalizeAvailability(row)
            ])
        );

        this.pendingChanges = new Map();
    }

    // 2. Normale beschikbaarheid ophalen

    getStandard(date) {

        const day = this.days.find(
            day => day.date === date
        );

        if (!day) {
            throw new Error('Unknown date');
        }

        return normalizeAvailability(
            this.weeklyAvailability.get(day.weekday)
        );
    }

    // 3. Opgeslagen beschikbaarheid ophalen

    getSaved(date) {

        return normalizeAvailability(
            this.savedOverrides.get(date)
                ?? this.getStandard(date)
        );
    }

    // 4. Effectieve beschikbaarheid ophalen

    getEffective(date) {

        return normalizeAvailability(
            this.pendingChanges.get(date)
                ?? this.getSaved(date)
        );
    }

    // 5. Tijdelijke wijziging verwerken

    updateDay(date, changes) {

        const updated = normalizeAvailability({
            ...this.getEffective(date),
            ...changes
        });

        const minutes = updated.available_minutes;

        if (
            !Number.isInteger(minutes) ||
            minutes < 0 ||
            minutes > 1440
        ) {
            throw new Error(
                'Invalid available minutes'
            );
        }

        if (
            sameAvailability(
                updated,
                this.getSaved(date)
            )
        ) {

            this.pendingChanges.delete(date);

        } else {

            this.pendingChanges.set(
                date,
                updated
            );
        }
    }

    // 6. Standaardbeschikbaarheid herstellen

    resetDay(date) {

        this.updateDay(
            date,
            this.getStandard(date)
        );
    }

    // 7. Status van een dag bepalen

    getDayStatus(date) {

        if (this.pendingChanges.has(date)) {
            return 'pending';
        }

        if (this.savedOverrides.has(date)) {
            return 'override';
        }

        return 'standard';
    }

    // 8. Alle kalenderdagen ophalen

    getCalendar() {

        return this.days.map(day => ({

            date: day.date,
            weekday: day.weekday,

            ...this.getEffective(day.date),

            standard_minutes:
                this.getStandard(day.date)
                    .available_minutes,

            status:
                this.getDayStatus(day.date)
        }));
    }

    // 9. Totalen per periode van 7 dagen

    getTotals() {

        const calendar = this.getCalendar();

        return {
            week1: totalMinutes(
                calendar.slice(0, 7)
            ),

            week2: totalMinutes(
                calendar.slice(7, 14)
            )
        };
    }

    // 10. Aantal openstaande wijzigingen

    getPendingCount() {

        return this.pendingChanges.size;
    }

    // 11. API-verzoek voorbereiden

    getSavePayload() {

        return Array.from(
            this.pendingChanges,
            ([date, value]) => {

                if (
                    sameAvailability(
                        value,
                        this.getStandard(date)
                    )
                ) {

                    return {
                        date,
                        action: 'delete'
                    };
                }

                return {
                    date,
                    action: 'upsert',
                    ...value
                };
            }
        );
    }

    // 12. Wijzigingen lokaal bevestigen
    // Alleen aanroepen na succesvolle RPC

    confirmSaved() {

        for (
            const [date, value]
            of this.pendingChanges
        ) {

            if (
                sameAvailability(
                    value,
                    this.getStandard(date)
                )
            ) {

                this.savedOverrides.delete(date);

            } else {

                this.savedOverrides.set(
                    date,
                    { ...value }
                );
            }
        }

        this.pendingChanges.clear();
    }

    // 13. Tijdelijke wijzigingen annuleren

    discardChanges() {

        this.pendingChanges.clear();
    }

    // 14. Tijdelijke wijzigingen bewaren

    storeDraft(userId) {

        const key =
            `availability-draft:${userId}`;

        if (this.pendingChanges.size === 0) {

            sessionStorage.removeItem(key);
            return;
        }

        const draft = Array.from(
            this.pendingChanges,
            ([date, value]) => ({
                date,
                value,
                baseline: this.getSaved(date)
            })
        );

        sessionStorage.setItem(
            key,
            JSON.stringify(draft)
        );
    }

    // 15. Tijdelijke wijzigingen herstellen

    restoreDraft(userId) {

        const key =
            `availability-draft:${userId}`;

        const stored =
            sessionStorage.getItem(key);

        if (!stored) return 0;

        let draft;
        let restored = 0;

        try {

            draft = JSON.parse(stored);

        } catch {

            sessionStorage.removeItem(key);
            return 0;
        }

        if (!Array.isArray(draft)) {
            sessionStorage.removeItem(key);
            return 0;
        }

        for (const entry of draft) {

            if (
                !entry ||
                typeof entry !== 'object'
            ) {
                continue;
            }

            const { date, value, baseline } = entry;

            const exists = this.days.some(
                day => day.date === date
            );

            if (!exists) continue;

            if (
                !value ||
                !baseline ||
                !Number.isInteger(
                    value.available_minutes
                ) ||
                value.available_minutes < 0 ||
                value.available_minutes > 1440 ||
                (
                    value.fixed_workout !== null &&
                    typeof value.fixed_workout
                        !== 'string'
                )
            ) {
                continue;
            }

            // Herstel alleen als de opgeslagen
            // uitgangssituatie niet is gewijzigd.

            if (
                !sameAvailability(
                    baseline,
                    this.getSaved(date)
                )
            ) {
                continue;
            }

            this.updateDay(date, value);
            restored++;
        }

        this.storeDraft(userId);

        return restored;
    }

    // 16. Tijdelijke opslag verwijderen

    clearDraft(userId) {

        const key =
            `availability-draft:${userId}`;

        sessionStorage.removeItem(key);
    }

}
