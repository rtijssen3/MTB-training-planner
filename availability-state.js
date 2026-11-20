
import {
    generateDays,
    normalizeAvailability,
    sameAvailability,
    totalMinutes,
    formatDate
} from './availability.js';


export class AvailabilityState {

    // ====================================
    // 1. INITIALISATIE
    // ====================================

    constructor(
        weeklyAvailability,
        savedOverrides = [],
        startDate = new Date(),
        today = startDate
    ) {

        this.today = formatDate(today);

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

        this.revision = null;
    }


    // ====================================
    // 2. NORMALE BESCHIKBAARHEID OPHALEN
    // ====================================

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


    // ====================================
    // 3. OPGESLAGEN BESCHIKBAARHEID OPHALEN
    // ====================================

    getSaved(date) {

        return normalizeAvailability(
            this.savedOverrides.get(date)
                ?? this.getStandard(date)
        );
    }


    // ====================================
    // 4. EFFECTIEVE BESCHIKBAARHEID OPHALEN
    // ====================================

    getEffective(date) {

        return normalizeAvailability(
            this.pendingChanges.get(date)
                ?? this.getSaved(date)
        );
    }


    // ====================================
    // 5. CONTROLEREN OF DAG BEWERKBAAR IS
    // ====================================

    isEditable(date) {

        const exists = this.days.some(
            day => day.date === date
        );

        return exists && date >= this.today;
    }


    // ====================================
    // 6. TIJDELIJKE WIJZIGING VERWERKEN
    // ====================================

    updateDay(date, changes) {

        // Verstreken dagen blokkeren

        if (!this.isEditable(date)) {

            throw new Error(
                'Deze dag kan niet meer worden aangepast'
            );
        }

        // Nieuwe beschikbaarheid samenstellen

        const updated = normalizeAvailability({
            ...this.getEffective(date),
            ...changes
        });

        const minutes = updated.available_minutes;

        // Invoer valideren

        if (
            !Number.isInteger(minutes) ||
            minutes < 0 ||
            minutes > 1440
        ) {

            throw new Error(
                'Invalid available minutes'
            );
        }

        // Vergelijken met opgeslagen waarde

        if (
            sameAvailability(
                updated,
                this.getSaved(date)
            )
        ) {

            // Geen verschil meer met database

            this.pendingChanges.delete(date);

        } else {

            // Tijdelijke wijziging bewaren

            this.pendingChanges.set(
                date,
                updated
            );
        }
    }


    // ====================================
    // 7. STANDAARDBESCHIKBAARHEID HERSTELLEN
    // ====================================

    resetDay(date) {

        this.updateDay(
            date,
            this.getStandard(date)
        );
    }


    // ====================================
    // 8. STATUS VAN EEN DAG BEPALEN
    // ====================================

    getDayStatus(date) {

        if (this.pendingChanges.has(date)) {
            return 'pending';
        }

        if (this.savedOverrides.has(date)) {
            return 'override';
        }

        return 'standard';
    }


    // ====================================
    // 9. ALLE KALENDERDAGEN OPHALEN
    // ====================================

    getCalendar() {

        return this.days.map(day => ({

            date: day.date,

            weekday: day.weekday,

            ...this.getEffective(day.date),

            standard_minutes:
                this.getStandard(day.date)
                    .available_minutes,

            status:
                this.getDayStatus(day.date),

            isEditable:
                this.isEditable(day.date),

            isToday:
                day.date === this.today,

            isPast:
                day.date < this.today

        }));
    }


    // ====================================
    // 10. TOTALEN PER KALENDERWEEK
    // ====================================

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


    // ====================================
    // 11. AANTAL OPENSTAANDE WIJZIGINGEN
    // ====================================

    getPendingCount() {

        return this.pendingChanges.size;
    }


    // ====================================
    // 12. API-VERZOEK VOORBEREIDEN
    // ====================================

    getSavePayload() {

        return Array.from(
            this.pendingChanges,
            ([date, value]) => {

                // Als de standaardbeschikbaarheid
                // wordt hersteld, verwijderen we
                // de bestaande override.

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

                // Anders voegen we een override
                // toe of werken we deze bij.

                return {
                    date,
                    action: 'upsert',
                    ...value
                };
            }
        );
    }


    // ====================================
    // 13. WIJZIGINGEN LOKAAL BEVESTIGEN
    // ====================================

    // Deze methode alleen aanroepen na
    // succesvolle opslag in Supabase.

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


    // ====================================
    // 14. TIJDELIJKE WIJZIGINGEN ANNULEREN
    // ====================================

    discardChanges() {

        this.pendingChanges.clear();
    }


    // ====================================
    // 15. TIJDELIJKE WIJZIGINGEN BEWAREN
    // ====================================

    storeDraft(userId) {

        const key =
            `availability-draft:${userId}`;

        // Geen wijzigingen meer?
        // Verwijder dan de conceptopslag.

        if (this.pendingChanges.size === 0) {

            sessionStorage.removeItem(key);

            return;
        }

        // Bewaar zowel de nieuwe waarde als
        // de oorspronkelijke databasewaarde.

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


    // ====================================
    // 16. TIJDELIJKE WIJZIGINGEN HERSTELLEN
    // ====================================

    restoreDraft(userId) {

        const key =
            `availability-draft:${userId}`;

        const stored =
            sessionStorage.getItem(key);

        if (!stored) return 0;

        let draft;
        let restored = 0;

        // JSON uitlezen

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

        // Alle conceptwijzigingen controleren

        for (const entry of draft) {

            if (
                !entry ||
                typeof entry !== 'object'
            ) {

                continue;
            }

            const {
                date,
                value,
                baseline
            } = entry;


            // Controleer of de datum nog
            // binnen de huidige kalender valt.

            const exists = this.days.some(
                day => day.date === date
            );


            // Negeer datums buiten de kalender
            // en dagen die inmiddels verstreken zijn.

            if (!exists || !this.isEditable(date)) {

                continue;
            }


            // Controleer of de opgeslagen
            // conceptgegevens geldig zijn.

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


            // Conflictcontrole:
            // herstel alleen wanneer de opgeslagen
            // uitgangssituatie niet is gewijzigd.

            if (
                !sameAvailability(
                    baseline,
                    this.getSaved(date)
                )
            ) {

                continue;
            }


            // Geldige conceptwijziging herstellen.

            this.updateDay(date, value);

            restored++;
        }


        // SessionStorage bijwerken.
        // Verlopen en ongeldige wijzigingen
        // worden hiermee verwijderd.

        this.storeDraft(userId);

        return restored;
    }


    // ====================================
    // 17. TIJDELIJKE OPSLAG VERWIJDEREN
    // ====================================

    clearDraft(userId) {

        const key =
            `availability-draft:${userId}`;

        sessionStorage.removeItem(key);
    }
}
