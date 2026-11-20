
import {
    formatDuration,
    getISOWeek,
    sameAvailability
} from './availability.js';


function parseDate(date) {

    return new Date(date + 'T12:00:00');
}


function displayDate(date, options) {

    return parseDate(date)
        .toLocaleDateString('nl-NL', options);
}


function createElement(tag, className, text) {

    const element = document.createElement(tag);

    element.className = className;

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}


export class CalendarView {

    constructor(state, callbacks) {

        this.state = state;
        this.callbacks = callbacks;

        this.selectedDate = state.today;
        this.busy = false;

        this.calendar =
            document.getElementById('calendar');

        this.editor =
            document.getElementById('day-editor');

        this.slider =
            document.getElementById('day-minutes');

        this.numberInput =
            document.getElementById(
                'day-minutes-number'
            );

        this.workoutInput =
            document.getElementById('day-workout');

        this.resetButton =
            document.getElementById(
                'reset-day-button'
            );

        this.saveButton =
            document.getElementById(
                'save-calendar-button'
            );

        this.discardButton =
            document.getElementById(
                'discard-calendar-button'
            );

        this.bindEvents();

        this.render();
    }


    // 1. Event listeners

    bindEvents() {

        this.slider.oninput = () => {

            this.changeDay({
                available_minutes:
                    Number(this.slider.value)
            });
        };

        this.numberInput.onchange = () => {

            const minutes =
                this.numberInput.valueAsNumber;

            if (
                !Number.isInteger(minutes) ||
                minutes < 0 ||
                minutes > 1440
            ) {

                this.callbacks.onError(
                    'Vul 0 tot 1440 minuten in.'
                );

                this.renderEditor();
                return;
            }

            this.changeDay({
                available_minutes: minutes
            });
        };

        this.workoutInput.oninput = () => {

            this.changeDay({
                fixed_workout:
                    this.workoutInput.value
            }, false);
        };

        this.resetButton.onclick = () => {

            if (this.busy) return;

            this.callbacks.onReset(
                this.selectedDate
            );
        };

        this.saveButton.onclick = () => {

            if (this.busy) return;

            this.callbacks.onSave();
        };

        this.discardButton.onclick = () => {

            if (this.busy) return;

            this.callbacks.onDiscard();
        };
    }


    // 2. Wijziging doorgeven

    changeDay(changes, syncEditor = true) {

        if (this.busy) return;

        if (
            !this.state.isEditable(this.selectedDate)
        ) return;

        this.callbacks.onChange(
            this.selectedDate,
            changes,
            syncEditor
        );
    }


    // 3. Kalenderdag selecteren

    selectDate(date) {

        if (this.busy) return;

        if (!this.state.isEditable(date)) return;

        this.selectedDate = date;

        this.render();
    }


    // 4. Kalender tekenen

    renderCalendar() {

        this.calendar.replaceChildren();

        const days = this.state.getCalendar();

        const totals = this.state.getTotals();

        for (let week = 0; week < 2; week++) {

            const weekDays = days.slice(
                week * 7,
                week * 7 + 7
            );

            const section = createElement(
                'section',
                'calendar-week'
            );

            const header = createElement(
                'div',
                'week-header'
            );

            const headerLeft =
                document.createElement('div');

            const weekNumber = getISOWeek(
                parseDate(weekDays[0].date)
            );

            const heading = createElement(
                'div',
                'week-heading',
                `${week === 0
                    ? 'Deze week'
                    : 'Volgende week'
                } – W${weekNumber}`
            );

            const firstDate = displayDate(
                weekDays[0].date,
                { day: 'numeric', month: 'short' }
            );

            const lastDate = displayDate(
                weekDays[6].date,
                { day: 'numeric', month: 'short' }
            );

            const period = createElement(
                'div',
                'week-period',
                `${firstDate} – ${lastDate}`
            );

            headerLeft.append(heading, period);

            const total = week === 0
                ? totals.week1
                : totals.week2;

            const standardTotal = weekDays.reduce(
                (sum, day) =>
                    sum + day.standard_minutes,
                0
            );

            const headerRight = createElement(
                'div',
                'week-total',
                formatDuration(total)
            );

            headerRight.appendChild(
                createElement(
                    'div',
                    'week-standard',
                    'Normaal: ' +
                        formatDuration(standardTotal)
                )
            );

            header.append(headerLeft, headerRight);

            const grid = createElement(
                'div',
                'week-grid'
            );

            for (const day of weekDays) {

                grid.appendChild(
                    this.createDayButton(day)
                );
            }

            section.append(header, grid);

            this.calendar.appendChild(section);
        }
    }


    // 5. Eén kalenderdag tekenen

    createDayButton(day) {

        const button = createElement(
            'button',
            `calendar-day ${day.status}`
        );

        button.type = 'button';

        if (day.isPast) {
            button.classList.add('past');
        }

        if (day.isToday) {
            button.classList.add('today');
        }

        if (day.date === this.selectedDate) {
            button.classList.add('selected');
        }

        button.disabled =
            this.busy || !day.isEditable;

        button.setAttribute(
            'aria-pressed',
            String(day.date === this.selectedDate)
        );

        const shortDate = displayDate(
            day.date,
            { day: 'numeric', month: 'numeric' }
        );

        let indicator = '';

        if (day.isPast) {

            indicator = '🔒';

        } else if (day.isToday) {

            indicator = 'Vandaag';

        } else if (day.fixed_workout) {

            indicator = '🚴';
        }

        button.append(

            createElement(
                'span', 'day-name',
                day.weekday.slice(0, 2)
            ),

            createElement(
                'span', 'day-date', shortDate
            ),

            createElement(
                'span', 'day-value',
                day.available_minutes
            ),

            createElement(
                'span', 'day-unit', 'min'
            ),

            createElement(
                'span', 'day-indicator', indicator
            )
        );

        button.setAttribute(
            'aria-label',
            `${day.weekday} ${shortDate}, ` +
            `${day.available_minutes} minuten, ` +
            `${day.isPast ? 'verstreken' : day.status}`
        );

        button.onclick = () =>
            this.selectDate(day.date);

        return button;
    }


    // 6. Editor voor geselecteerde dag

    renderEditor(syncInputs = true) {

        const date = this.selectedDate;

        const effective =
            this.state.getEffective(date);

        const standard =
            this.state.getStandard(date);

        document.getElementById(
            'selected-date'
        ).textContent = displayDate(
            date,
            {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
            }
        );

        document.getElementById(
            'standard-availability'
        ).textContent =
            'Normale beschikbaarheid: ' +
            formatDuration(
                standard.available_minutes
            );

        document.getElementById(
            'minutes-output'
        ).textContent =
            formatDuration(
                effective.available_minutes
            );

        if (syncInputs) {

            this.slider.value = Math.min(
                effective.available_minutes,
                300
            );

            this.numberInput.value =
                effective.available_minutes;

            this.workoutInput.value =
                effective.fixed_workout ?? '';
        }

        const locked =
            this.busy ||
            !this.state.isEditable(date);

        this.slider.disabled = locked;

        this.numberInput.disabled = locked;

        this.workoutInput.disabled = locked;

        this.resetButton.disabled =
            locked ||
            sameAvailability(effective, standard);
    }


    // 7. Opslagknoppen bijwerken

    renderActions() {

        const count =
            this.state.getPendingCount();

        document.getElementById(
            'pending-count'
        ).textContent =
            count === 0
                ? 'Geen openstaande wijzigingen'
                : `${count} gewijzigde dag` +
                    (count === 1 ? '' : 'en');

        this.saveButton.textContent =
            this.busy
                ? 'Bezig met verwerken...'
                : `Alle wijzigingen opslaan (${count})`;

        this.saveButton.disabled =
            this.busy || count === 0;

        this.discardButton.disabled =
            this.busy || count === 0;
    }


    // 8. Volledige weergave bijwerken

    render(syncEditor = true) {

        this.renderCalendar();

        this.renderEditor(syncEditor);

        this.renderActions();
    }


    // 9. Interface tijdelijk blokkeren

    setBusy(busy) {

        this.busy = busy;

        this.render();
    }
}
