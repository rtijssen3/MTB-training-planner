
import { supabase } from './supabase-client.js';

// 1. Algemene variabelen

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
let availability = [];

// 2. HTML-elementen ophalen

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

// 3. Statusmelding tonen

function showStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.className = type;
}

// 4. Inloggen

loginForm.addEventListener('submit', async (event) => {

    event.preventDefault();

    const email =
        document.getElementById('email').value;

    const password =
        document.getElementById('password').value;

    showStatus('Bezig met inloggen...');

    const { data, error } =
        await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

    if (error) {
        showStatus(error.message, 'error');
        return;
    }

    loginForm.reset();

    await startDashboard(data.user);
});

// 5. Dashboard openen

async function startDashboard(user) {

    currentUser = user;

    loginSection.hidden = true;
    dashboardSection.hidden = false;

    document.getElementById('user-email')
        .textContent = user.email;

    await loadAvailability();
}

// 6. Beschikbaarheid ophalen

async function loadAvailability() {

    saveButton.disabled = true;
    showStatus('Beschikbaarheid ophalen...');

    const { data, error } = await supabase
        .from('weekly_availability')
        .select('*')
        .eq('user_id', currentUser.id);

    if (error) {
        showStatus(error.message, 'error');
        return;
    }

    availability = weekdays.map(day => {

        const existing = data.find(
            row => row.weekday === day
        );

        return existing || {
            user_id: currentUser.id,
            weekday: day,
            available_minutes: 0,
            fixed_workout: null
        };
    });

    renderAvailability();

    saveButton.disabled = false;

    showStatus(
        'Beschikbaarheid geladen',
        'success'
    );
}

// 7. Beschikbaarheid weergeven

function renderAvailability() {

    availabilityList.replaceChildren();

    availability.forEach((day, index) => {

        const row = document.createElement('div');
        row.className = 'day-row';

        const label = document.createElement('label');
        label.textContent = day.weekday;
        label.htmlFor = `minutes-${index}`;

        const input = document.createElement('input');

        input.id = `minutes-${index}`;
        input.type = 'number';
        input.min = '0';
        input.max = '1440';
        input.step = '1';
        input.required = true;
        input.value = day.available_minutes;

        input.addEventListener('input', () => {

            availability[index].available_minutes =
                input.valueAsNumber;

            updateTotalHours();
            showStatus('Niet-opgeslagen wijzigingen');
        });

        row.append(label, input);

        if (day.fixed_workout) {

            const fixed = document.createElement('div');

            fixed.className = 'fixed-workout';
            fixed.textContent = day.fixed_workout;

            row.appendChild(fixed);
        }

        availabilityList.appendChild(row);
    });

    updateTotalHours();
}

// 8. Totale trainingstijd berekenen

function updateTotalHours() {

    const total = availability.reduce(
        (sum, day) =>
            sum + day.available_minutes,
        0
    );

    const hours = Math.floor(total / 60);
    const minutes = total % 60;

    document.getElementById('total-hours')
        .textContent = Number.isFinite(total)
            ? `${hours} uur ${minutes} min per week`
            : 'Controleer je invoer';
}

// 9. Beschikbaarheid opslaan

saveButton.addEventListener('click', async () => {

    if (!currentUser) return;

    const invalid = availability.some(day =>
        !Number.isInteger(day.available_minutes) ||
        day.available_minutes < 0 ||
        day.available_minutes > 1440
    );

    if (invalid) {
        showStatus(
            'Vul geldige minuten in (0-1440).',
            'error'
        );
        return;
    }

    saveButton.disabled = true;
    showStatus('Bezig met opslaan...');

    const rows = availability.map(day => ({
        user_id: currentUser.id,
        weekday: day.weekday,
        available_minutes: day.available_minutes,
        fixed_workout: day.fixed_workout
    }));

    const { error } = await supabase
        .from('weekly_availability')
        .upsert(rows, {
            onConflict: 'user_id,weekday'
        });

    saveButton.disabled = false;

    if (error) {
        showStatus(error.message, 'error');
        return;
    }

    showStatus(
        'Beschikbaarheid opgeslagen!',
        'success'
    );
});

// 10. Uitloggen

logoutButton.addEventListener('click', async () => {

    const { error } =
        await supabase.auth.signOut();

    if (error) {
        showStatus(error.message, 'error');
        return;
    }

    currentUser = null;
    availability = [];

    availabilityList.replaceChildren();

    dashboardSection.hidden = true;
    loginSection.hidden = false;

    showStatus('Je bent uitgelogd.');
});

// 11. Bestaande sessie controleren

async function initialize() {

    const { data, error } =
        await supabase.auth.getSession();

    if (error) {
        showStatus(error.message, 'error');
        return;
    }

    if (data.session) {
        await startDashboard(data.session.user);
    }
}

initialize();
