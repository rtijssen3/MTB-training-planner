
import {
    supabase
} from './supabase-client.js';

import {
    formatDate,
    formatDuration
} from './availability.js';

import {
    initializeAvailability,
    changeAvailability,
    resetAvailabilityDay,
    saveAllAvailability,
    discardAvailability
} from './availability-service.js';

import {
    CalendarView
} from './calendar-view.js';


// ====================================
// 1. ALGEMENE VARIABELEN
// ====================================

const weekdays = [
    'Maandag',
    'Dinsdag',
    'Woensdag',
    'Donderdag',
    'Vrijdag',
    'Zaterdag',
    'Zondag'
];

let currentUser = null;
let state = null;
let calendarView = null;
let availability = [];
let busy = false;
let weeklyDirty = false;

const loginSection =
    document.getElementById('login-section');

const dashboardSection =
    document.getElementById('dashboard-section');

const loginForm =
    document.getElementById('login-form');

const availabilityList =
    document.getElementById('availability-list');

const saveButton =
    document.getElementById('save-button');

const logoutButton =
    document.getElementById('logout-button');

const statusMessage =
    document.getElementById('status-message');


// ====================================
// 2. STATUS EN BLOKKERINGEN
// ====================================

function showStatus(message, type = '') {

    statusMessage.textContent = message;

    statusMessage.className = type;
}


function showError(error) {

    console.error(error);

    showStatus(
        error.message ?? String(error),
        'error'
    );
}


function updateControls() {

    const pending = state?.getPendingCount() ?? 0;

    const weeklyLocked = busy || pending > 0;

    availabilityList
        .querySelectorAll('input')
        .forEach(input => {
            input.disabled = weeklyLocked;
        });

    saveButton.disabled =
        weeklyLocked || !weeklyDirty;

    logoutButton.disabled = busy;

    if (calendarView) {

        const calendarLocked =
            busy || weeklyDirty;

        if (calendarView.busy !== calendarLocked) {

            calendarView.setBusy(calendarLocked);
        }
    }
}


function checkCurrentDate() {

    if (
        state &&
        state.today !== formatDate(new Date())
    ) {

        showStatus(
            'Er is een nieuwe dag begonnen. ' +
            'Vernieuw de pagina om verder te gaan.',
            'error'
        );

        return false;
    }

    return true;
}


// ====================================
// 3. AUTHENTICATIE
// ====================================

loginForm.addEventListener(
    'submit',
    async event => {

        event.preventDefault();

        const button =
            loginForm.querySelector('button');

        button.disabled = true;

        showStatus('Bezig met inloggen...');

        try {

            const { data, error } =
                await supabase.auth.signInWithPassword({

                    email:
                        document.getElementById(
                            'email'
                        ).value,

                    password:
                        document.getElementById(
                            'password'
                        ).value
                });

            if (error) throw error;

            loginForm.reset();

            await startDashboard(data.user);

        } catch (error) {

            showError(error);

        } finally {

            button.disabled = false;
        }
    }
);


// ====================================
// 4. DASHBOARD INITIALISEREN
// ====================================

async function startDashboard(user) {

    currentUser = user;

    loginSection.hidden = true;
    dashboardSection.hidden = false;

    document.getElementById(
        'user-email'
    ).textContent = user.email;

    busy = true;

    updateControls();

    showStatus('Kalender ophalen...');

    try {

        const result =
            await loadCalendar();

        loadStandardWeek();

        let message = 'Kalender geladen';

        if (result.restoredChanges > 0) {

            message =
                `${result.restoredChanges} ` +
                'conceptwijzigingen hersteld';
        }

        if (result.storageWarning) {

            message +=
                '. ' + result.storageWarning;
        }

        showStatus(message, 'success');

    } catch (error) {

        showError(error);

    } finally {

        busy = false;

        updateControls();
    }
}


async function loadCalendar() {

    const result =
        await initializeAvailability(
            currentUser.id
        );

    state = result.state;

    calendarView = new CalendarView(
        state,
        {
            onChange: handleCalendarChange,
            onReset: handleCalendarReset,
            onSave: handleCalendarSave,
            onDiscard: handleCalendarDiscard,
            onError: showStatus
        }
    );

    updateControls();

    return result;
}


// ====================================
// 5. KALENDER WIJZIGEN
// ====================================

function handleCalendarChange(
    date,
    changes,
    syncEditor = true
) {

    if (busy || weeklyDirty) return;

    if (!checkCurrentDate()) return;

    try {

        const warning = changeAvailability(
            state,
            currentUser.id,
            date,
            changes
        );

        calendarView.render(syncEditor);

        updateControls();

        showStatus(
            warning ??
            (
                state.getPendingCount() > 0
                    ? 'Niet-opgeslagen wijzigingen'
                    : 'Geen openstaande wijzigingen'
            )
        );

    } catch (error) {

        showError(error);

        calendarView.render();
    }
}


function handleCalendarReset(date) {

    if (busy || weeklyDirty) return;

    if (!checkCurrentDate()) return;

    try {

        const warning = resetAvailabilityDay(
            state,
            currentUser.id,
            date
        );

        calendarView.render();

        updateControls();

        showStatus(
            warning ??
            'Kalender bijgewerkt'
        );

    } catch (error) {

        showError(error);
    }
}


// ====================================
// 6. KALENDER OPSLAAN
// ====================================

async function handleCalendarSave() {

    if (busy || weeklyDirty) return;

    if (!checkCurrentDate()) return;

    busy = true;

    updateControls();

    showStatus('Wijzigingen opslaan...');

    try {

        const result =
            await saveAllAvailability(
                state,
                currentUser.id
            );

        let message =
            `${result.savedCount} ` +
            'dagwijzigingen opgeslagen';

        if (result.storageWarning) {

            message +=
                '. ' + result.storageWarning;
        }

        showStatus(message, 'success');

    } catch (error) {

        // Bij een fout blijven de wijzigingen
        // in AvailabilityState bewaard.

        showError(error);

    } finally {

        busy = false;

        calendarView.render();

        updateControls();
    }
}


// ====================================
// 7. KALENDER ANNULEREN
// ====================================

function handleCalendarDiscard() {

    if (busy) return;

    const warning = discardAvailability(
        state,
        currentUser.id
    );

    calendarView.render();

    updateControls();

    showStatus(
        warning ??
        'Conceptwijzigingen geannuleerd'
    );
}


// ====================================
// 8. STANDAARDWEEK LADEN
// ====================================

function loadStandardWeek() {

    availability = weekdays.map(weekday => {

        const existing =
            state.weeklyAvailability.get(weekday);

        return {

            user_id: currentUser.id,

            weekday,

            available_minutes:
                existing?.available_minutes ?? 0,

            fixed_workout:
                existing?.fixed_workout ?? null
        };
    });

    weeklyDirty = false;

    renderStandardWeek();

    updateControls();
}


function renderStandardWeek() {

    availabilityList.replaceChildren();

    availability.forEach((day, index) => {

        const row =
            document.createElement('div');

        row.className = 'day-row';

        const label =
            document.createElement('label');

        label.textContent = day.weekday;

        label.htmlFor = `minutes-${index}`;

        const input =
            document.createElement('input');

        input.id = `minutes-${index}`;
        input.type = 'number';
        input.min = '0';
        input.max = '1440';
        input.step = '1';
        input.value = day.available_minutes;

        input.addEventListener('input', () => {

            availability[index].available_minutes =
                input.valueAsNumber;

            weeklyDirty = availability.some(row => {

                const original =
                    state.weeklyAvailability.get(
                        row.weekday
                    );

                return row.available_minutes !==
                    (original?.available_minutes ?? 0);
            });

            updateTotalHours();

            updateControls();

            showStatus(
                weeklyDirty
                    ? 'Standaardweek: niet opgeslagen'
                    : 'Geen openstaande wijzigingen'
            );
        });

        row.append(label, input);

        if (day.fixed_workout) {

            const fixed =
                document.createElement('div');

            fixed.className = 'fixed-workout';

            fixed.textContent = day.fixed_workout;

            row.appendChild(fixed);
        }

        availabilityList.appendChild(row);
    });

    updateTotalHours();
}


function updateTotalHours() {

    const total = availability.reduce(
        (sum, day) =>
            sum + day.available_minutes,
        0
    );

    document.getElementById(
        'total-hours'
    ).textContent =
        Number.isFinite(total)
            ? formatDuration(total) + ' per week'
            : 'Controleer de invoer';
}


// ====================================
// 9. STANDAARDWEEK OPSLAAN
// ====================================

saveButton.addEventListener(
    'click',
    async () => {

        if (busy || !weeklyDirty) return;

        if (state.getPendingCount() > 0) return;

        if (!checkCurrentDate()) return;

        const invalid = availability.some(day =>
            !Number.isInteger(
                day.available_minutes
            ) ||
            day.available_minutes < 0 ||
            day.available_minutes > 1440
        );

        if (invalid) {

            showStatus(
                'Vul geldige minuten in.',
                'error'
            );

            return;
        }

        busy = true;

        updateControls();

        let stored = false;
        let reloadFailed = false;

        try {

            const { error } = await supabase
                .from('weekly_availability')
                .upsert(
                    availability,
                    {
                        onConflict:
                            'user_id,weekday'
                    }
                );

            if (error) throw error;

            stored = true;

            // Kalender opnieuw opbouwen met
            // de bijgewerkte standaardweek.

            await loadCalendar();

            loadStandardWeek();

            showStatus(
                'Standaardweek opgeslagen',
                'success'
            );

        } catch (error) {

            if (stored) {

                reloadFailed = true;
                weeklyDirty = false;

                showStatus(
                    'Standaardweek opgeslagen, ' +
                    'maar kalender kon niet worden ' +
                    'vernieuwd. Herlaad de pagina.',
                    'error'
                );

            } else {

                showError(error);
            }

        } finally {

            busy = reloadFailed;

            updateControls();
        }
    }
);


// ====================================
// 10. UITLOGGEN
// ====================================

logoutButton.addEventListener(
    'click',
    async () => {

        if (busy) return;

        const pending =
            state?.getPendingCount() ?? 0;

        if (pending > 0 || weeklyDirty) {

            const confirmed = window.confirm(
                'Je hebt niet-opgeslagen wijzigingen. ' +
                'Wil je deze weggooien en uitloggen?'
            );

            if (!confirmed) return;
        }

        busy = true;

        updateControls();

        try {

            const { error } =
                await supabase.auth.signOut();

            if (error) throw error;

            try {

                state?.clearDraft(currentUser.id);

            } catch (error) {

                console.warn(error);
            }

            currentUser = null;
            state = null;
            calendarView = null;
            availability = [];
            weeklyDirty = false;

            availabilityList.replaceChildren();

            document.getElementById(
                'calendar'
            ).replaceChildren();

            dashboardSection.hidden = true;

            loginSection.hidden = false;

            showStatus('Je bent uitgelogd.');

        } catch (error) {

            showError(error);

        } finally {

            busy = false;

            updateControls();
        }
    }
);


// ====================================
// 11. WAARSCHUWING BIJ AFSLUITEN
// ====================================

window.addEventListener(
    'beforeunload',
    event => {

        if (
            busy ||
            weeklyDirty ||
            (state?.getPendingCount() ?? 0) > 0
        ) {

            event.preventDefault();

            event.returnValue = '';
        }
    }
);


// ====================================
// 12. APPLICATIE STARTEN
// ====================================

async function initialize() {

    try {

        const { data, error } =
            await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {

            await startDashboard(
                data.session.user
            );
        }

    } catch (error) {

        showError(error);
    }
}

initialize();
