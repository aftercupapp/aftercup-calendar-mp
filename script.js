let events = [];
let dreams = [];
let currentDate = new Date();
currentDate.setHours(0, 0, 0, 0);
let currentMiniCalDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
let currentPopupCalDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
let selectedColor = '#FFFFFF';
let currentEditId = null;
let currentBulkEditInfo = null;
let showPreAddedEvents = true;
let deferredPrompt;
let installPopupOverlay;
let autoSyncEnabled = JSON.parse(localStorage.getItem('autoSyncEnabled')) ?? true;

let quickJumpValue = "";
let quickJumpTimeout = null;

let isMobileMiniCalVisible = false;
function toggleMobileMiniCalendar() {}

let syncPrefs = {
    events: JSON.parse(localStorage.getItem('syncPrefs_events')) ?? true,
    dreams: JSON.parse(localStorage.getItem('syncPrefs_dreams')) ?? true,
    shifts: JSON.parse(localStorage.getItem('syncPrefs_shifts')) ?? true,
    settings: JSON.parse(localStorage.getItem('syncPrefs_settings')) ?? true
};

const monthNamesFull = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayNamesFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayNamesShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAILY_SUMMARY_TIMES_KEY = 'dailySummaryNotificationTimes';
const LAST_NOTIFIED_TIMES_KEY = 'dailySummaryLastNotifiedTimes';
const APP_LAST_RESET_DATE_KEY = 'appLastResetDate';

const API_URL = 'https://script.google.com/macros/s/AKfycbxHrk5gnCYw6iIWQ_DR1wh53Hpgnxvj80A1N-DcqRgfvzn12Ubk_9sx7hrikr3cVoxaKw/exec';

const syncInput = document.getElementById('sync-file-input');
if (syncInput) {
    syncInput.addEventListener('change', handleSyncFromFile);
}

let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let isSyncing = false;
let syncDebounceTimer = null;

let dailyNotificationTimes = [];

const shiftIconMap = {
    'highlight-yellow': 'wb_twilight',
    'highlight-orange': 'wb_sunny',
    'highlight-blue': 'dark_mode',
    'day-highlight-grey': 'coffee',
    'day-highlight-green': 'weekend',
    'day-highlight-light-red': 'medical_services'
};

function getLocalDateString(dateObj) {
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getActivePopupId() {
    const activeStandardPopup = document.querySelector('.popup.active, .search-popup.active');
    if (activeStandardPopup) {
        return activeStandardPopup.id;
    }
    if (document.getElementById('shift-planner-popup-main').style.display === 'flex') {
        return 'shift-planner-popup-main';
    }
    return null;
}

function closePopupAndGoBack() {
    const activePopupId = getActivePopupId();
    if (activePopupId) {
        hidePopups();
        if (window.history.state && window.history.state.popup) {
            history.back();
        }
    }
}

function getDaySuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}

function toggleAutoSync(el) {
    autoSyncEnabled = el.checked;
    localStorage.setItem('autoSyncEnabled', JSON.stringify(autoSyncEnabled));
}

function toggleSyncOption(key, el) {
    syncPrefs[key] = el.checked;
    localStorage.setItem(`syncPrefs_${key}`, JSON.stringify(syncPrefs[key]));
}

function getWeekNumber(dParam) {
    const d = new Date(Date.UTC(dParam.getFullYear(), dParam.getMonth(), dParam.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getContrastColor(hexcolor) {
    if (!hexcolor) return '#000000';
    if (hexcolor.slice(0, 1) === '#') hexcolor = hexcolor.slice(1);
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(char => char + char).join('');
    if (hexcolor.length < 6) hexcolor = hexcolor.padEnd(6, '0');

    const r = parseInt(hexcolor.substr(0, 2), 16) || 0;
    const g = parseInt(hexcolor.substr(2, 2), 16) || 0;
    const b = parseInt(hexcolor.substr(4, 2), 16) || 0;
    return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 140) ? '#000000' : '#FFFFFF';
}

function toggleNoteExpand(btn) {
    const noteContent = btn.previousElementSibling;
    if (window.event) window.event.stopPropagation();

    if (noteContent.classList.contains('expanded')) {
        noteContent.classList.remove('expanded');
        btn.textContent = 'Show more';
    } else {
        noteContent.classList.add('expanded');
        btn.textContent = 'Show less';
    }
}

function mergeEvents(fetched, stored) {
    const preAddedEventIds = new Set(fetched.map(event => event.id));
    const preAddedEvents = fetched.map(event => ({ ...event, preAdded: true }));
    const userOnlyEvents = stored
        .filter(event => !preAddedEventIds.has(event.id))
        .map(event => ({ ...event, preAdded: false }));
    return [...preAddedEvents, ...userOnlyEvents];
}

document.addEventListener('DOMContentLoaded', async () => {

    const todayStr = getLocalDateString(new Date());
    const lastResetDate = localStorage.getItem(APP_LAST_RESET_DATE_KEY);

    if (lastResetDate !== todayStr) {
        localStorage.removeItem(LAST_NOTIFIED_TIMES_KEY);
        localStorage.setItem(APP_LAST_RESET_DATE_KEY, todayStr);
    }

    const noteContentDiv = document.getElementById('new-note-content');
    if (noteContentDiv) {
        noteContentDiv.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase();
                if (e.shiftKey && key === 'x') {
                    e.preventDefault();
                    document.execCommand('strikethrough');
                } else if (key === 'b') {
                    e.preventDefault();
                    document.execCommand('bold');
                } else if (key === 'i') {
                    e.preventDefault();
                    document.execCommand('italic');
                } else if (key === 'u') {
                    e.preventDefault();
                    document.execCommand('underline');
                }
            }
        });
    }

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.className = savedTheme + '-theme';

    const preAddedToggle = document.getElementById('pre-added-toggle');
    showPreAddedEvents = JSON.parse(localStorage.getItem('showPreAddedEvents')) ?? true;
    if (preAddedToggle) {
        preAddedToggle.checked = showPreAddedEvents;
        preAddedToggle.addEventListener('change', function () {
            showPreAddedEvents = this.checked;
            localStorage.setItem('showPreAddedEvents', JSON.stringify(showPreAddedEvents));
            updateCalendar();
        });
    }

    document.getElementById('place-type').addEventListener('change', function () {
        const placeUrlInput = document.getElementById('place-url');
        const placePhysicalInput = document.getElementById('place-physical');
        placeUrlInput.style.display = 'none';
        placePhysicalInput.style.display = 'none';

        if (this.value === 'virtual') {
            placeUrlInput.style.display = 'block';
        } else if (this.value === 'physical') {
            placePhysicalInput.style.display = 'block';
        }
    });

    document.getElementById('event-type').addEventListener('change', toggleAddPopupFields);

    const userEvents = JSON.parse(localStorage.getItem('events')) || [];
    let fetchedEvents = [];

    try {
        const response = await fetch('events-update.json');
        if (response.ok) {
            fetchedEvents = await response.json();
        }
    } catch (error) {}

    events = mergeEvents(fetchedEvents, userEvents);
    dreams = JSON.parse(localStorage.getItem('dreams')) || [];

    saveEvents(true);

    dailyNotificationTimes = JSON.parse(localStorage.getItem(DAILY_SUMMARY_TIMES_KEY)) || [];
    await scheduleAutomaticNotifications();

    updateCalendar();
    setupMiniCalendarNav();
    setupPopupCalendarNav();
    document.getElementById('restore-file-input').addEventListener('change', handleRestoreFile);
    initShiftPlannerElements();

    const colorPicker = document.getElementById('color-picker');
    colorPicker.querySelectorAll('div').forEach(colorDiv => {
        const tick = document.createElement('span');
        tick.className = 'material-icons-outlined tick-icon';
        tick.textContent = 'check';
        tick.style.color = getContrastColor(colorDiv.style.backgroundColor);
        tick.style.display = 'none';
        colorDiv.appendChild(tick);
    });

    setColor(selectedColor);

    document.getElementById('overlay').addEventListener('click', closePopupAndGoBack);

    document.getElementById("sp-back-button").addEventListener("click", closePopupAndGoBack);

    if (currentUser) {
        updateAccountUI();
        if (autoSyncEnabled) {
            performSync('pull');
        }
    }

    window.addEventListener('popstate', (event) => {
        const activePopupId = getActivePopupId();

        if (activePopupId) {
            switch (activePopupId) {
                case 'shift-planner-popup-main':
                    closeShiftPlanner();
                    break;
                default:
                    hidePopups();
                    if (activePopupId === 'add-popup') {
                        currentEditId = null;
                        currentBulkEditInfo = null;
                        const addPopup = document.getElementById('add-popup');
                        addPopup.querySelector('h2').textContent = 'New entry';
                        addPopup.querySelector('button[onclick="handleAddOrUpdateEvent()"]').textContent = 'Add';
                    }
                    break;
            }
        }
    });

    setInterval(checkForegroundNotifications, 30000);

    installPopupOverlay = document.getElementById('install-popup-overlay');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installPopupOverlay) {
            installPopupOverlay.classList.add('shown');
        }
    });

    window.addEventListener('appinstalled', (evt) => {
        if (installPopupOverlay) {
            installPopupOverlay.classList.remove('shown');
        }
        deferredPrompt = null;
    });

    const installBtn = document.getElementById('popup-install-btn');
    const laterBtn = document.getElementById('popup-later-btn');

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) {
                return;
            }
            hideInstallPopup();
            deferredPrompt.prompt();
            const {
                outcome
            } = await deferredPrompt.userChoice;
            deferredPrompt = null;
        });
    }

    if (laterBtn) {
        laterBtn.addEventListener('click', hideInstallPopup);
    }

    document.addEventListener('keydown', (e) => {
        const activeElement = document.activeElement;
        const isTyping = activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable;

        if (isTyping) return;

        const key = e.key;
        const activePopupId = getActivePopupId();

        if (key === 'Backspace' || key === 'Escape') {
            if (activePopupId) {
                e.preventDefault();
                if (activePopupId === 'quick-jump-popup') {
                    quickJumpValue = "";
                    hidePopups();
                    return;
                }
                closePopupAndGoBack();
            }
            return;
        }

        if (/^[0-9]$/.test(key)) {
            if (!activePopupId || activePopupId === 'quick-jump-popup') {
                e.preventDefault();
                handleQuickJumpInput(key);
                return;
            }
        }

        if (activePopupId) return;

        const lowerKey = key.toLowerCase();
        switch (lowerKey) {
            case 't':
                e.preventDefault();
                switchToRelativeDay(1);
                break;
            case 'y':
                e.preventDefault();
                switchToRelativeDay(-1);
                break;
            case 'n':
                e.preventDefault();
                goToToday();
                break;
            case 'a':
                e.preventDefault();
                showTodaySummaryPopup();
                break;
            case 's':
                e.preventDefault();
                showAccountPopup();
                break;
            case 'h':
                e.preventDefault();
                openShiftPlanner();
                break;
            case 'p':
                e.preventDefault();
                showPocketPopup();
                break;
            case 'd':
                e.preventDefault();
                showDreamsPopup();
                break;
            case 'u':
                e.preventDefault();
                showUpcomingPopup();
                break;
            case 'i':
                e.preventDefault();
                showPastEventsPopup();
                break;
            case 'c':
                e.preventDefault();
                showDatePopup();
                break;
        }
    });
});

function handleQuickJumpInput(digit) {
    const now = new Date();
    const maxDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    let newValue = quickJumpValue + digit;
    let numericValue = parseInt(newValue, 10);

    if (numericValue > maxDays) {
        newValue = digit;
        numericValue = parseInt(digit, 10);
    }

    quickJumpValue = newValue;
    showQuickJumpPopup(quickJumpValue);

    if (quickJumpTimeout) clearTimeout(quickJumpTimeout);
    quickJumpTimeout = setTimeout(() => {
        const dayToJump = parseInt(quickJumpValue, 10);
        if (dayToJump >= 1 && dayToJump <= maxDays) {
            currentDate = new Date(now.getFullYear(), now.getMonth(), dayToJump);
            updateCalendar('anim-fade');
        }
        quickJumpValue = "";
        hidePopups();
    }, 2500);
}

function showQuickJumpPopup(val) {
    const popup = document.getElementById('quick-jump-popup');
    const valEl = document.getElementById('quick-jump-value');
    if (valEl) valEl.textContent = val;

    if (popup && !popup.classList.contains('active')) {
        hidePopups(true);
        popup.classList.add('active');
        const overlay = document.getElementById('overlay');
        overlay.style.display = 'block';
        overlay.style.zIndex = '1005';
    }
}

function toggleAddPopupFields() {
    const eventType = document.getElementById('event-type').value;

    const routineOptions = document.getElementById('routine-options');
    const noteContainer = document.getElementById('note-input-container');
    const titleInput = document.getElementById('new-event-input');
    const placeType = document.getElementById('place-type');
    const timeInput = document.getElementById('event-time');

    if (currentEditId !== null && !currentBulkEditInfo && eventType !== 'note') {
        if (routineOptions) routineOptions.style.display = 'none';
    }

    if (routineOptions) {
        routineOptions.style.display = (eventType === 'routine' && currentEditId === null) ? 'block' : 'none';
    }

    if (noteContainer) {
        if (eventType === 'note') {
            noteContainer.style.display = 'flex';
            titleInput.style.display = 'none';

            if (placeType) placeType.style.display = 'none';
            if (timeInput) timeInput.style.display = 'none';

            document.getElementById('place-url').style.display = 'none';
            document.getElementById('place-physical').style.display = 'none';
        } else {
            noteContainer.style.display = 'none';
            titleInput.style.display = 'block';

            if (placeType) placeType.style.display = 'block';
            if (timeInput) timeInput.style.display = 'block';
        }
    }
}

function hideInstallPopup() {
    if (installPopupOverlay) {
        installPopupOverlay.classList.remove('shown');
    }
}

function setupMiniCalendarNav() {
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentMiniCalDate.setMonth(currentMiniCalDate.getMonth() - 1);
        renderMiniMonthCalendar();
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentMiniCalDate.setMonth(currentMiniCalDate.getMonth() + 1);
        renderMiniMonthCalendar();
    });
}

function setupPopupCalendarNav() {
    document.getElementById('popup-prev-month-btn').addEventListener('click', () => {
        currentPopupCalDate.setMonth(currentPopupCalDate.getMonth() - 1);
        renderPopupCalendar();
    });
    document.getElementById('popup-next-month-btn').addEventListener('click', () => {
        currentPopupCalDate.setMonth(currentPopupCalDate.getMonth() + 1);
        renderPopupCalendar();
    });
}

function renderMiniMonthCalendar() {
    const grid = document.getElementById('mini-month-calendar-grid');
    const monthYearEl = document.getElementById('mini-month-year');
    if (!grid || !monthYearEl || window.innerWidth < 769) {
        if (grid && window.innerWidth < 769) grid.innerHTML = '';
    }
    const visibleEvents = getVisibleEvents();
    grid.innerHTML = '';
    monthYearEl.textContent = `${monthNamesFull[currentMiniCalDate.getMonth()]} ${currentMiniCalDate.getFullYear()}`;
    dayNamesShort.forEach(dayName => {
        const cell = document.createElement('div');
        cell.classList.add('day-header-cell');
        cell.textContent = dayName.slice(0, 3);
        grid.appendChild(cell);
    });
    const year = currentMiniCalDate.getFullYear();
    const month = currentMiniCalDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
    for (let i = 0; i < firstDayOfWeek; i++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell', 'day-other-month');
        grid.appendChild(cell);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const normalizedCurrentCalendarDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('day-cell');
        dayCell.textContent = day;
        const cellDate = new Date(year, month, day);
        const dateString = getLocalDateString(cellDate);
        dayCell.dataset.date = dateString;
        if (cellDate.getTime() === today.getTime()) dayCell.classList.add('today-mini');
        if (cellDate.getTime() === normalizedCurrentCalendarDate.getTime()) dayCell.classList.add('current-day-mini');
        if (visibleEvents.some(event => event.date === dateString)) dayCell.classList.add('has-event');
        dayCell.addEventListener('click', () => {
            currentDate = new Date(cellDate);
            updateCalendar();
        });
        grid.appendChild(dayCell);
    }
    const totalCells = firstDayOfWeek + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell', 'day-other-month');
        grid.appendChild(cell);
    }
}

function renderPopupCalendar() {
    const grid = document.getElementById('popup-calendar-grid');
    const monthYearEl = document.getElementById('popup-month-year');
    if (!grid || !monthYearEl) return;
    const visibleEvents = getVisibleEvents();
    grid.innerHTML = '';
    monthYearEl.textContent = `${monthNamesFull[currentPopupCalDate.getMonth()]} ${currentPopupCalDate.getFullYear()}`;
    dayNamesShort.forEach(dayName => {
        const cell = document.createElement('div');
        cell.classList.add('day-header-cell');
        cell.textContent = dayName.slice(0, 3);
        grid.appendChild(cell);
    });
    const year = currentPopupCalDate.getFullYear();
    const month = currentPopupCalDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
    for (let i = 0; i < firstDayOfWeek; i++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell', 'day-other-month');
        grid.appendChild(cell);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const normalizedMainCalendarDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('day-cell');
        dayCell.textContent = day;
        const cellDate = new Date(year, month, day);
        const dateString = getLocalDateString(cellDate);
        dayCell.dataset.date = dateString;
        if (cellDate.getTime() === today.getTime()) dayCell.classList.add('today-mini');
        if (cellDate.getTime() === normalizedMainCalendarDate.getTime()) {
            dayCell.classList.add('current-day-mini');
        }
        if (visibleEvents.some(event => event.date === dateString)) dayCell.classList.add('has-event');
        dayCell.addEventListener('click', () => {
            currentDate = new Date(cellDate);
            updateCalendar();
            closePopupAndGoBack();
        });
        grid.appendChild(dayCell);
    }
    const totalCells = firstDayOfWeek + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell', 'day-other-month');
        grid.appendChild(cell);
    }
}

function showDatePopup() {
    hidePopups(true);
    const overlay = document.getElementById('overlay');
    overlay.style.zIndex = '1005';
    overlay.style.display = 'block';

    const popup = document.getElementById('date-popup');
    popup.classList.add('active');
    popup.scrollTop = 0;

    currentPopupCalDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    renderPopupCalendar();

    document.getElementById('popup-date').value = getLocalDateString(currentDate);
    const preAddedToggle = document.getElementById('pre-added-toggle');
    if (preAddedToggle) preAddedToggle.checked = showPreAddedEvents;

    history.pushState({ popup: 'date-popup' }, '', null);
    hideActionButtons();
}

function showAddPopup() {
    hidePopups(true);
    const overlay = document.getElementById('overlay');
    overlay.style.zIndex = '1005';
    overlay.style.display = 'block';
    const addPopup = document.getElementById('add-popup');
    addPopup.classList.add('active');
    addPopup.scrollTop = 0;

    if (currentEditId === null) {
        addPopup.querySelector('h2').textContent = 'New entry';
        addPopup.querySelector('button[onclick="handleAddOrUpdateEvent()"]').textContent = 'Add';
        document.getElementById('event-date').value = getLocalDateString(currentDate);
        document.getElementById('event-time').value = '';

        document.getElementById('new-event-input').value = '';
        const noteContent = document.getElementById('new-note-content');
        if (noteContent) noteContent.innerHTML = '';

        document.getElementById('event-type').value = 'event';
        document.getElementById('event-importance').value = 'average';
        document.getElementById('place-type').value = 'none';
        document.getElementById('place-url').style.display = 'none';
        document.getElementById('place-physical').style.display = 'none';
        document.getElementById('place-url').value = '';
        document.getElementById('place-physical').value = '';
        setColor('#FFFFFF');
        document.getElementById('routine-frequency').value = '1';
        document.getElementById('routine-unit').value = 'week';
        document.getElementById('routine-end-date').value = '';
    } else {
        if (!currentBulkEditInfo) {
            addPopup.querySelector('h2').textContent = 'Edit Item';
        }
        addPopup.querySelector('button[onclick="handleAddOrUpdateEvent()"]').textContent = 'Save Changes';
    }

    toggleAddPopupFields();

    const isBulk = currentBulkEditInfo !== null;
    document.getElementById('event-type').disabled = isBulk;
    document.getElementById('event-date').disabled = isBulk;

    history.pushState({ popup: 'add-popup' }, '', null);
    hideActionButtons();
}

function showSearchPopup() {
    hidePopups(true);
    const overlay = document.getElementById('overlay');
    overlay.style.zIndex = '1005';
    overlay.style.display = 'block';
    const popup = document.getElementById('search-popup');
    popup.classList.add('active');
    popup.scrollTop = 0;
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    history.pushState({ popup: 'search-popup' }, '', null);
    hideActionButtons();
}

function showPocketPopup() {
    hidePopups(true);

    const overlay = document.getElementById('overlay');
    overlay.style.zIndex = '1005';
    overlay.style.display = 'block';

    const popup = document.getElementById('pocket-popup');
    popup.classList.add('active');

    const iframe = document.getElementById('pocket-iframe');
    if (iframe && !iframe.getAttribute('src')) {
        iframe.setAttribute('src', 'https://aftercup-2017.neocities.org/pocket');
    }

    history.pushState({ popup: 'pocket-popup' }, '', null);
    hideActionButtons();
}

async function showTodaySummaryPopup() {
    hidePopups(true);
    const popup = document.getElementById('today-summary-popup');
    const overlay = document.getElementById('overlay');
    overlay.style.zIndex = '1005';
    overlay.style.display = 'block';
    popup.classList.add('active');
    popup.scrollTop = 0;
    hideActionButtons();

    history.pushState({ popup: 'today-summary-popup' }, '', null);

    const todayDateString = getLocalDateString(new Date());
    const summaryStatsEl = document.getElementById('today-summary-stats');
    const summaryContentEl = document.getElementById('today-summary-content');
    const summaryContentContainer = document.getElementById('today-summary-content-container');
    const aftercupPostsContentEl = document.getElementById('aftercup-posts-content');
    const aftercupPostsSectionEl = document.getElementById('aftercup-posts-section');
    const weatherInfoEl = document.getElementById('weather-info');

    weatherInfoEl.innerHTML = '<p>Checking weather...</p>';

    const todaysEvents = getVisibleEvents().filter(e => e.date === todayDateString && e.type !== 'note').sort((a, b) => (a.time || "23:59").localeCompare(b.time || "23:59"));
    const aftercupPosts = todaysEvents.filter(e => e.preAdded && e.link);
    const userAgendaItems = todaysEvents.filter(e => !e.preAdded);

    const weatherSummaryText = await getWeatherSummary();
    const finalSummaryText = generateSmarterSummary(todaysEvents, weatherSummaryText);
    summaryStatsEl.textContent = finalSummaryText;

    aftercupPostsContentEl.innerHTML = '';
    aftercupPostsSectionEl.style.display = 'block';

    if (aftercupPosts.length > 0) {
        aftercupPosts.forEach(post => {
            const postEl = document.createElement('div');
            postEl.className = 'summary-post-item';
            postEl.textContent = post.text;
            postEl.onclick = () => window.open(post.link, '_blank');
            aftercupPostsContentEl.appendChild(postEl);
        });
    } else {
        aftercupPostsContentEl.innerHTML = '<p style="opacity: 1; font-size: 15px; text-align: left; margin-top: 10px;">No Aftercup posts today.</p>';
    }

    if (userAgendaItems.length > 0) {
        summaryContentContainer.style.display = 'block';
        summaryContentEl.innerHTML = '<ul style="padding-left: 20px; list-style-type: disc;">' + userAgendaItems.map(e =>
            `<li>${e.importance === 'high' ? '❗ ' : ''}${e.time ? `<strong>${e.time}</strong> - ` : ''}${e.text} (${e.type})</li>`
        ).join('') + '</ul>';
    } else {
        summaryContentContainer.style.display = 'none';
        summaryContentEl.innerHTML = "";
    }

    populateSummaryNotificationTimeInputs();

    fetchWeather();
}

function showUpcomingPopup() {
    hidePopups(true);
    const overlay = document.getElementById('overlay');
    overlay.style.zIndex = '1005';
    overlay.style.display = 'block';
    const popup = document.getElementById('upcoming-popup');
    popup.classList.add('active');
    popup.scrollTop = 0;
    history.pushState({ popup: 'upcoming-popup' }, '', null);
    hideActionButtons();
    renderUpcomingEvents();
}

function showDreamsPopup() {
    hidePopups(true);
    const overlay = document.getElementById('overlay');
    overlay.style.zIndex = '1005';
    overlay.style.display = 'block';
    const popup = document.getElementById('dreams-popup');
    popup.classList.add('active');
    popup.scrollTop = 0;
    history.pushState({ popup: 'dreams-popup' }, '', null);
    hideActionButtons();
    renderDreams();
}

function hidePopups(isInternalCall = false) {
    document.querySelectorAll('.popup, .search-popup').forEach(popup => popup.classList.remove('active'));

    const isShiftPlannerOpen = document.getElementById('shift-planner-popup-main').style.display === 'flex';
    const overlay = document.getElementById('overlay');

    if (!isShiftPlannerOpen) {
        overlay.style.display = 'none';
        if (!isInternalCall) {
            showActionButtons();
        }
    }
}

function hideActionButtons() {
    document.getElementById('add-button').style.display = 'none';
    document.getElementById('search-button').style.display = 'none';
}

function showActionButtons() {
    document.getElementById('add-button').style.display = 'flex';
    document.getElementById('search-button').style.display = 'flex';
}

function switchToRelativeDay(offset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + offset);

    let animClass = 'anim-fade';

    if (targetDate.getTime() > currentDate.getTime()) {
        animClass = 'anim-enter-right';
    } else if (targetDate.getTime() < currentDate.getTime()) {
        animClass = 'anim-enter-left';
    }

    currentDate = targetDate;
    updateCalendar(animClass);
}

function updateCalendar(animationClass = null) {
    currentDate.setHours(0, 0, 0, 0);

    document.getElementById('header-day-name').textContent = dayNamesFull[currentDate.getDay()];
    document.getElementById('header-full-date').textContent = `${monthNamesFull[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
    document.getElementById('current-day-number').textContent = new Date().getDate();

    const dateInfoElDesktop = document.getElementById('desktop-date-info');
    if (dateInfoElDesktop) updateDateInfo(dateInfoElDesktop, currentDate);

    document.querySelectorAll('.nav-day').forEach(el => el.classList.remove('active-day'));
    const todayForLabels = new Date();
    todayForLabels.setHours(0, 0, 0, 0);
    const yesterdayForLabels = new Date(todayForLabels);
    yesterdayForLabels.setDate(todayForLabels.getDate() - 1);
    const tomorrowForLabels = new Date(todayForLabels);
    tomorrowForLabels.setDate(todayForLabels.getDate() + 1);

    if (currentDate.getTime() === todayForLabels.getTime()) document.getElementById('today').classList.add('active-day');
    else if (currentDate.getTime() === yesterdayForLabels.getTime()) document.getElementById('yesterday').classList.add('active-day');
    else if (currentDate.getTime() === tomorrowForLabels.getTime()) document.getElementById('tomorrow').classList.add('active-day');

    if (currentDate.getFullYear() !== currentMiniCalDate.getFullYear() || currentDate.getMonth() !== currentMiniCalDate.getMonth()) {
        currentMiniCalDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    }
    renderMiniMonthCalendar();

    renderEvents();

    const elementsToAnimate = [
        document.getElementById('events'),
        document.getElementById('header-left-section'),
        document.getElementById('header-right-section')
    ];

    elementsToAnimate.forEach(el => {
        if (el) {
            el.classList.remove('anim-enter-right', 'anim-enter-left', 'anim-fade');
            void el.offsetWidth;

            if (animationClass) {
                el.classList.add(animationClass);
            }
        }
    });

    const summaryBell = document.getElementById('today-summary-bell');
    summaryBell.style.display = (currentDate.getTime() === todayForLabels.getTime()) ? 'flex' : 'none';
}

function updateDateInfo(element, date) {
    if (!element) return;
    const startOfYear = Date.UTC(date.getFullYear(), 0, 1);
    const todayUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor((todayUTC - startOfYear) / oneDay) + 1;
    element.innerHTML = `
            <div class="info-row">
                <span class="info-label">Week:</span>
                <span class="info-value">${getWeekNumber(date)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Day of year:</span>
                <span class="info-value">${dayOfYear}${getDaySuffix(dayOfYear)}</span>
            </div>
        `;
}

function renderEvents() {
    const eventsContainer = document.getElementById('events');
    eventsContainer.innerHTML = '';
    const currentDateString = getLocalDateString(currentDate);
    const visibleEvents = getVisibleEvents();
    const importanceRank = { 'high': 1, 'average': 2, 'low': 3 };

    const sortedEvents = visibleEvents
        .filter(event => event.date === currentDateString)
        .sort((a, b) => {
            const rankA = importanceRank[a.importance] || 2;
            const rankB = importanceRank[b.importance] || 2;
            if (rankA !== rankB) {
                return rankA - rankB;
            }
            return (a.time || "23:59").localeCompare(b.time || "23:59");
        });

    if (sortedEvents.length === 0) {
        eventsContainer.innerHTML = `
                <div class="no-events-message">
                    <span class="material-icons-outlined" style="font-size: 50px; margin-bottom: 16px;">
                        event_available
                    </span><br>
                    Looks like a perfect day<br>for anything
                </div>
            `;
        return;
    }

    sortedEvents.forEach(event => {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-item item-glassy';
        if (event.completed) {
            eventItem.classList.add('completed');
        }
        if (event.color && event.color !== '#FFFFFF' && event.color !== '#000000') {
            if (!event.completed) {
                eventItem.style.setProperty('background-color', event.color, 'important');
                eventItem.style.color = getContrastColor(event.color);
                eventItem.classList.add('has-custom-color');
            }
        }

        let deleteButtonHTML = event.preAdded ? '' : `
                <button class="delete-btn" onclick="deleteEvent(${event.id}, event)">
                    <span class="material-icons-outlined">delete_outline</span>
                </button>`;

        if (event.type === 'note') {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = event.text;
            const textContent = tempDiv.textContent || tempDiv.innerText || "";
            const isLong = textContent.length > 10 || (textContent.match(/\n/g) || []).length > 2;

            eventItem.innerHTML = `
                    <div class="event-item-content-wrapper" style="align-items: flex-start; flex-direction: column; width: calc(100% - 40px);">
                        <div style="font-size: 12px; opacity: 0.7; margin-bottom: 4px; display: flex; align-items: center;">
                            <span class="material-icons-outlined" style="font-size: 14px; margin-right: 4px;">sticky_note_2</span> Note
                        </div>
                        <div class="event-note-preview">
                            ${event.text}
                        </div>
                        <button class="read-more-btn" onclick="toggleNoteExpand(this)" style="display: ${isLong ? 'block' : 'none'}">
                            Show more
                        </button>
                    </div>
                    ${deleteButtonHTML}
                `;
        }
        else {
            let textDisplay = event.text;
            const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
            textDisplay = textDisplay.replace(urlRegex, url => `<a href="${url}" target="_blank" style="color: inherit; text-decoration: underline;" onclick="event.stopPropagation();">${url}</a>`);

            let taskMarkerHTML = '';
            let textSpanClass = "event-text";
            if (event.type === 'task') {
                textSpanClass += " task-text";
                if (event.completed) textSpanClass += " completed-text";
                taskMarkerHTML = `
                        <label class="task-checkbox-label" onclick="event.stopPropagation();">
                            <input type="checkbox" class="hidden-task-checkbox" ${event.completed ? 'checked' : ''} onchange="toggleTask(${event.id}, event)">
                            <span class="custom-checkbox">
                                <span class="material-icons-outlined check-icon">check_small</span>
                            </span>
                        </label>
                    `;
            }

            let routineIcon = '';
            if (event.type === 'routine' || event.routineId) {
                routineIcon = '<span class="material-symbols-outlined" style="font-size: 16px; margin-right: 5px; opacity: 0.7; vertical-align: middle;">sync</span>';
            }

            let placeHTML = '';
            if (event.place && event.place.value) {
                let link = '', icon = '', title = '', displayText = event.place.value;
                if (event.place.type === 'virtual') {
                    link = event.place.value;
                    if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
                    icon = 'link'; title = 'Open meeting link';
                    try { displayText = new URL(link).hostname; } catch (e) { displayText = event.place.value; }
                } else if (event.place.type === 'physical') {
                    link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.place.value)}`;
                    icon = 'place'; title = 'Open in Google Maps';
                }
                if (link) {
                    placeHTML = `
                            <a href="${link}" target="_blank" class="event-place-link" title="${title}" onclick="event.stopPropagation();">
                                <span class="material-icons-outlined" style="font-size: 14px;">${icon}</span>
                                <span class="place-text" style="margin-left:4px;">${displayText}</span>
                            </a>`;
                }
            }

            eventItem.innerHTML = `
                    <div class="event-item-content-wrapper">
                        ${taskMarkerHTML}
                        <span class="${textSpanClass}">${routineIcon}${textDisplay}</span>
                    </div>
                    <div class="event-footer">
                        <div class="event-date">${event.time || ''}</div>
                        ${placeHTML}
                    </div>
                    ${deleteButtonHTML}
                `;
        }

        if (event.preAdded === true && event.link) {
            eventItem.style.cursor = 'pointer';
            eventItem.onclick = (e) => {
                if (e.target.closest('a, .delete-btn, .task-checkbox-label, .read-more-btn')) { return; }
                window.open(event.link, '_blank');
            };
        } else if (event.preAdded === false) {
            eventItem.addEventListener('click', (e) => {
                if (e.target.closest('a, .delete-btn, .task-checkbox-label, .read-more-btn')) { return; }
                if (window.getSelection().toString().length > 0) { return; }
                populatePopupForEdit(event.id);
            });
        } else {
            eventItem.style.cursor = 'default';
        }
        eventsContainer.appendChild(eventItem);
    });
}

function renderUpcomingEvents() {
    const timelineContainer = document.getElementById('upcoming-timeline');
    timelineContainer.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = getLocalDateString(today);

    const upcomingEvents = getVisibleEvents()
        .filter(event => event.date >= todayStr)
        .sort((a, b) => {
            if (a.date < b.date) return -1;
            if (a.date > b.date) return 1;
            const importanceRank = { 'high': 1, 'average': 2, 'low': 3 };
            const rankA = importanceRank[a.importance] || 2;
            const rankB = importanceRank[b.importance] || 2;
            if (rankA !== rankB) return rankA - rankB;
            return (a.time || "23:59").localeCompare(b.time || "23:59");
        });

    if (upcomingEvents.length === 0) {
        timelineContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">No upcoming events found.</p>';
        return;
    }

    const groupedEvents = upcomingEvents.reduce((acc, event) => {
        const date = event.date;
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(event);
        return acc;
    }, {});

    for (const dateStr in groupedEvents) {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'timeline-date-group';

        const dateEl = document.createElement('div');
        dateEl.className = 'timeline-date';
        dateEl.style.fontWeight = 'bold';
        dateEl.style.marginTop = '15px';
        dateEl.style.marginBottom = '5px';
        const [year, month, day] = dateStr.split('-').map(Number);
        const eventDateObj = new Date(year, month - 1, day);
        dateEl.textContent = eventDateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        dateGroup.appendChild(dateEl);

        groupedEvents[dateStr].forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = 'timeline-event item-glassy';
            eventEl.style.padding = '8px';
            eventEl.style.border = '1px solid var(--border-color)';
            eventEl.style.marginBottom = '5px';

            if (event.color && event.color !== '#FFFFFF' && event.color !== '#000000') {
                if (!event.completed) {
                    eventEl.style.setProperty('background-color', event.color, 'important');
                    const contrastColor = getContrastColor(event.color);
                    eventEl.style.color = contrastColor;
                }
            }

            eventEl.innerHTML = `<span class="event-text">${event.text}</span> <span class="event-time" style="float:right; opacity:0.7;">${event.time || ''}</span>`;
            dateGroup.appendChild(eventEl);
        });

        timelineContainer.appendChild(dateGroup);
    }
}

function createRoutineInstances(baseEvent, frequency, unit, endDate) {
    const newEvents = [];
    const routineId = baseEvent.id;
    let currentDate = new Date(baseEvent.date + 'T00:00:00');
    const finalDate = endDate ? new Date(endDate + 'T00:00:00') : null;

    newEvents.push({ ...baseEvent, routineId: routineId, type: 'routine' });

    let iterations = 0;
    while (true) {
        iterations++;
        if (iterations > 500) break;

        if (unit === 'day') {
            currentDate.setDate(currentDate.getDate() + frequency);
        } else if (unit === 'week') {
            currentDate.setDate(currentDate.getDate() + (frequency * 7));
        } else if (unit === 'month') {
            currentDate.setMonth(currentDate.getMonth() + frequency);
        }

        if (finalDate && currentDate > finalDate) {
            break;
        }

        const twoYearsFromNow = new Date();
        twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
        if (!finalDate && currentDate > twoYearsFromNow) {
            break;
        }

        newEvents.push({
            ...baseEvent,
            id: Date.now() + newEvents.length,
            date: getLocalDateString(currentDate),
            routineId: routineId,
            type: 'routine',
            completed: baseEvent.type === 'task' ? false : undefined,
            lastModified: Date.now()
        });
    }
    return newEvents;
}

function handleAddOrUpdateEvent() {
    const eventType = document.getElementById('event-type').value;
    const eventDateInput = document.getElementById('event-date').value;
    const eventTime = document.getElementById('event-time').value;
    const eventColor = selectedColor;
    const eventImportance = document.getElementById('event-importance').value;

    let eventText = '';
    if (eventType === 'note') {
        const noteDiv = document.getElementById('new-note-content');
        eventText = noteDiv ? noteDiv.innerHTML : '';
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = eventText;
        if (tempDiv.textContent.trim() === '') eventText = '';
    } else {
        eventText = document.getElementById('new-event-input').value.trim();
    }

    const placeType = document.getElementById('place-type').value;
    let placeData = null;
    if (placeType === 'virtual') {
        const url = document.getElementById('place-url').value.trim();
        if (url) placeData = { type: 'virtual', value: url };
    } else if (placeType === 'physical') {
        const address = document.getElementById('place-physical').value.trim();
        if (address) placeData = { type: 'physical', value: address };
    }

    if (!eventDateInput || !eventText) {
        return;
    }

    if (currentBulkEditInfo) {
        handleRoutineEdit(eventTime, eventText, eventColor, eventImportance, placeData);
        return;
    }

    if (currentEditId !== null) {
        const eventIndex = events.findIndex(event => event.id === currentEditId);
        if (eventIndex > -1) {
            const originalEvent = events[eventIndex];
            events[eventIndex] = { ...originalEvent,
                type: eventType,
                date: eventDateInput,
                time: eventTime,
                text: eventText,
                color: eventColor,
                importance: eventImportance,
                place: placeData,
                completed: eventType === 'task' ? (originalEvent.type === 'task' ? originalEvent.completed : false) : undefined,
                lastModified: Date.now()
            };
        }
    } else {
        const baseEvent = {
            id: Date.now(),
            type: eventType,
            date: eventDateInput,
            time: eventTime,
            text: eventText,
            color: eventColor,
            importance: eventImportance,
            place: placeData,
            completed: eventType === 'task' ? false : undefined,
            preAdded: false,
            lastModified: Date.now()
        };

        if (eventType === 'routine') {
            const frequency = parseInt(document.getElementById('routine-frequency').value, 10) || 1;
            const unit = document.getElementById('routine-unit').value;
            const endDate = document.getElementById('routine-end-date').value;

            const newRoutineEvents = createRoutineInstances(baseEvent, frequency, unit, endDate);
            events.push(...newRoutineEvents);
        } else {
            events.push(baseEvent);
        }
    }

    document.getElementById('new-event-input').value = '';
    const noteDiv = document.getElementById('new-note-content');
    if (noteDiv) noteDiv.innerHTML = '';

    currentEditId = null;
    history.back();
    updateCalendar();
    saveEvents();
    scheduleAutomaticNotifications();
}

function promptForRoutineEdit(eventToEdit) {
    const userChoice = window.prompt(
        "This is a recurring event. Do you want to edit:\n\n1. Only this event\n2. All future events\n\n(Type 1 or 2)"
    );

    if (userChoice === '1') {
        eventToEdit.routineId = null;
        currentEditId = eventToEdit.id;
        currentBulkEditInfo = null;
        showAddPopup();
    } else if (userChoice === '2') {
        currentEditId = eventToEdit.id;
        currentBulkEditInfo = {
            routineId: eventToEdit.routineId,
            startDate: eventToEdit.date,
        };
        const addPopup = document.getElementById('add-popup');
        addPopup.querySelector('h2').textContent = 'Bulk Edit Routine';
        showAddPopup();
    } else {
        currentEditId = null;
        currentBulkEditInfo = null;
    }
}

function handleRoutineEdit(newTime, newText, newColor, newImportance, newPlaceData) {
    if (!currentBulkEditInfo) return;

    const { routineId, startDate } = currentBulkEditInfo;

    events = events.map(event => {
        if (event.routineId === routineId && event.date >= startDate) {
            return {
                ...event,
                time: newTime,
                text: newText,
                color: newColor,
                importance: newImportance,
                place: newPlaceData,
                lastModified: Date.now()
            };
        }
        return event;
    });

    currentEditId = null;
    currentBulkEditInfo = null;

    history.back();
    updateCalendar();
    saveEvents();
}

function populatePopupForEdit(eventId) {
    const eventToEdit = events.find(event => event.id === eventId);
    if (!eventToEdit) return;

    if (eventToEdit.routineId) {
        promptForRoutineEdit(eventToEdit);
        if (currentBulkEditInfo) {
            document.getElementById('event-type').value = eventToEdit.type;
            document.getElementById('event-date').value = eventToEdit.date;
        }
    } else {
        currentEditId = eventId;
        currentBulkEditInfo = null;
        document.getElementById('event-type').value = eventToEdit.type;
        document.getElementById('event-date').value = eventToEdit.date;
        showAddPopup();
    }

    document.getElementById('event-time').value = eventToEdit.time || '';

    if (eventToEdit.type === 'note') {
        const noteDiv = document.getElementById('new-note-content');
        if (noteDiv) noteDiv.innerHTML = eventToEdit.text;
        document.getElementById('new-event-input').value = '';
    } else {
        document.getElementById('new-event-input').value = eventToEdit.text;
        const noteDiv = document.getElementById('new-note-content');
        if (noteDiv) noteDiv.innerHTML = '';
    }

    document.getElementById('event-importance').value = eventToEdit.importance || 'average';

    const placeTypeSelect = document.getElementById('place-type');
    const placeUrlInput = document.getElementById('place-url');
    const placePhysicalInput = document.getElementById('place-physical');

    if (eventToEdit.place && eventToEdit.place.type) {
        placeTypeSelect.value = eventToEdit.place.type;
        if (eventToEdit.place.type === 'virtual') {
            placeUrlInput.value = eventToEdit.place.value;
            placeUrlInput.style.display = 'block';
            placePhysicalInput.style.display = 'none';
        } else if (eventToEdit.place.type === 'physical') {
            placeUrlInput.style.display = 'none';
            placePhysicalInput.style.display = 'block';
            placePhysicalInput.value = eventToEdit.place.value;
        }
    } else {
        placeTypeSelect.value = 'none';
        placeUrlInput.style.display = 'none';
        placePhysicalInput.style.display = 'none';
        placeUrlInput.value = '';
        placePhysicalInput.value = '';
    }

    setColor(eventToEdit.color || '#FFFFFF');
    toggleAddPopupFields();
}

function promptForRoutineDelete(eventToDelete) {
    const userChoice = window.prompt(
        "This is a recurring event. Do you want to delete:\n\n1. Only this event\n2. All future events\n\n(Type 1 or 2)"
    );

    if (userChoice === '1') {
        handleRoutineDelete(eventToDelete.id, 'single');
    } else if (userChoice === '2') {
        handleRoutineDelete(eventToDelete.id, 'future');
    }
}

function handleRoutineDelete(eventId, scope) {
    const eventToDelete = events.find(event => event.id === eventId);
    if (!eventToDelete) return;

    const eventsToSync = []; 

    if (scope === 'single') {
        eventToDelete.deleted = true;
        eventToDelete.lastModified = Date.now();
        if (eventToDelete.sharedWith) eventsToSync.push(eventToDelete);
    } else if (scope === 'future') {
        const { routineId, date } = eventToDelete;
        events.forEach(event => {
            if (event.routineId === routineId && event.date >= date) {
                event.deleted = true;
                event.lastModified = Date.now();
                if (event.sharedWith) eventsToSync.push(event);
            }
        });
    }

    updateCalendar();
    saveEvents();
    scheduleAutomaticNotifications();

    if (eventsToSync.length > 0 && currentUser && typeof apiRequest === 'function') {
        eventsToSync.forEach(evt => {
            const cleanEventData = { ...evt };
            evt.sharedWith.forEach(recipient => {
                apiRequest({
                    action: 'share_event',
                    sender: currentUser.email,
                    recipient: recipient,
                    eventData: cleanEventData
                });
            });
        });
    }
}

function deleteEvent(eventId, e) {
    if (e) e.stopPropagation();

    const eventToDelete = events.find(event => event.id === eventId);
    
    if (eventToDelete && eventToDelete.routineId) {
        promptForRoutineDelete(eventToDelete);
        return;
    } 

    if (eventToDelete) {
        eventToDelete.deleted = true;
        eventToDelete.lastModified = Date.now();
        
        updateCalendar();
        saveEvents();
        
        if (typeof apiRequest === 'function' && eventToDelete.sharedWith && eventToDelete.sharedWith.length > 0 && currentUser) {
             const cleanEventData = { ...eventToDelete };
             eventToDelete.sharedWith.forEach(recipient => {
                apiRequest({
                    action: 'share_event',
                    sender: currentUser.email,
                    recipient: recipient,
                    eventData: cleanEventData
                }).catch(err => console.error(err));
             });
        }
        
        scheduleAutomaticNotifications();
    }
}

function toggleTask(eventId, e) {
    e.stopPropagation();
    const eventIndex = events.findIndex(ev => ev.id === eventId);
    if (eventIndex > -1) {
        events[eventIndex].completed = !events[eventIndex].completed;
        events[eventIndex].lastModified = Date.now();
        saveEvents();
        renderEvents();
    }
}

function goToToday() {
    currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    updateCalendar();
}

function gotoDate() {
    const dateInput = document.getElementById('popup-date').value;
    if (dateInput) {
        const parts = dateInput.split('-');
        currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
        updateCalendar();
        history.back();
    }
}

function setColor(color) {
    selectedColor = color;

    const normalizeColor = (colorStr) => {
        if (!colorStr) return '';
        if (colorStr.startsWith('#')) {
            if (colorStr.length === 4) {
                return `#${colorStr[1]}${colorStr[1]}${colorStr[2]}${colorStr[2]}${colorStr[3]}${colorStr[3]}`.toLowerCase();
            }
            return colorStr.toLowerCase();
        }
        const rgbMatch = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            const [, r, g, b] = rgbMatch;
            const toHex = (c) => ('0' + parseInt(c).toString(16)).slice(-2);
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
        }
        return colorStr.toLowerCase();
    };

    const normalizedSelectedColor = normalizeColor(color);

    document.querySelectorAll('.color-picker div').forEach(div => {
        const divBgColor = normalizeColor(div.style.backgroundColor || '');

        if (divBgColor && divBgColor === normalizedSelectedColor) {
            div.style.border = `2px solid var(--text-color)`;
            div.style.transform = 'scale(1.15)';
            div.classList.add('selected');
        } else {
            div.style.border = '2px solid transparent';
            div.style.transform = 'scale(1)';
            div.classList.remove('selected');
        }
    });
}

function setDarkMode() { changeTheme('dark'); }
function setLightMode() { changeTheme('light'); }
function setPinkMode() { changeTheme('pink'); }
function setPastelGreenMode() { changeTheme('pastel-green'); }
function setCoffeeMode() { changeTheme('coffee'); }
function setLightBlueMode() { changeTheme('light-blue'); }
function setPastelVioletMode() { changeTheme('pastel-violet'); }
function setCherrySodaMode() { changeTheme('cherry-soda'); }

function changeTheme(themeName) {
    document.body.className = '';
    document.body.classList.add(themeName + '-theme');
    localStorage.setItem('theme', themeName);
    setColor(selectedColor);
    updateCalendar();
}

function saveEvents(skipSync = false) {
    const userEvents = events.filter(event => !event.preAdded);
    localStorage.setItem('events', JSON.stringify(userEvents));

    if (currentUser && !skipSync) {
        triggerAutoSync();
    }
}

function triggerAutoSync() {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    updateSyncStatus('Waiting to sync...');
    syncDebounceTimer = setTimeout(() => {
        performSync('push');
    }, 2000);
}

function getVisibleEvents() {
    let allEvents = events.filter(e => !e.deleted);
    if (showPreAddedEvents) {
        return allEvents;
    }
    return allEvents.filter(event => !event.preAdded);
}

function searchEvents() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    if (!query) return;
    const filteredEvents = getVisibleEvents().filter(event =>
        event.text.toLowerCase().includes(query) ||
        (event.date && event.date.includes(query))
    );
    if (filteredEvents.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No entries found</div>';
        return;
    }
    filteredEvents.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(event => {
        const resultItem = document.createElement('div');
        resultItem.className = 'event-item item-glassy';
        resultItem.innerHTML = `<div>${event.text}</div><div class="event-date">${event.date} ${event.time || ''}</div>`;
        resultItem.onclick = () => {
            const [year, month, day] = event.date.split('-').map(Number);
            currentDate = new Date(year, month - 1, day);
            updateCalendar();
            history.back();
        };
        resultsContainer.appendChild(resultItem);
    });
}

function backupEventsData() {
    const data = getBackupData();
    data.dataType = "AftercupCalendarFullBackup";

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `aftercup_calendar_user_backup_${Date.now()}.json`;
    a.click();
}

function triggerRestore() {
    if (window.confirm("Restoring will overwrite current user-created data. Are you sure?")) {
        document.getElementById('restore-file-input').click();
    }
}

async function handleRestoreFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const restoredObject = JSON.parse(e.target.result);
            if (restoredObject.dataType === "AftercupCalendarFullBackup" || restoredObject.settings) {
                await applyBackupData(restoredObject);
            } else {
                let restoredUserEvents = [];
                if (Array.isArray(restoredObject.calendarEvents)) {
                    restoredUserEvents = restoredObject.calendarEvents;
                } else if (Array.isArray(restoredObject)) {
                    restoredUserEvents = restoredObject;
                }
                let fetchedEvents = [];
                try {
                    const response = await fetch('events-update.json');
                    if (response.ok) fetchedEvents = await response.json();
                } catch (e) { }
                events = mergeEvents(fetchedEvents, restoredUserEvents);
                saveEvents();
                if (restoredObject.dreams) {
                    dreams = restoredObject.dreams;
                    localStorage.setItem('dreams', JSON.stringify(dreams));
                }
                if (restoredObject.shiftPlannerData) {
                    localStorage.setItem("shifts", JSON.stringify(restoredObject.shiftPlannerData));
                }
                updateCalendar();
            }
        } catch (error) {
            console.error("Error restoring data", error);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

async function handleSyncFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            // 1. Use existing logic to merge file data into current state
            await applyBackupData(importedData);

            // 2. Save explicitly to LocalStorage
            saveEvents(true); // Save Events (skip auto-sync trigger for a moment)
            
            if (importedData.dreams) {
                localStorage.setItem('dreams', JSON.stringify(dreams));
            }

            // 3. Force Push to Google Sheets
            if (currentUser) {
                updateSyncStatus('Uploading merged data...');
                await performSync('push');
                alert("Merged and uploaded to cloud!");
            } else {
                alert("Merged locally (Not logged in, so not uploaded).");
            }

        } catch (error) {
            console.error(error);
            alert("Failed to sync file.");
        } finally {
            event.target.value = ''; // Reset input
        }
    };
    reader.readAsText(file);
}

function renderDreams() {
    const dreamsContainer = document.getElementById('dreams-container');
    const dreamsList = document.getElementById('dreams-list');
    dreamsList.innerHTML = '';

    if (dreams.length === 0) {
        dreamsContainer.classList.add('is-empty');
        dreamsList.innerHTML = '<p style="text-align: center; opacity: 0.6;">Let‘s begin your dream journal together</p>';
        return;
    }

    dreamsContainer.classList.remove('is-empty');

    const sortedDreams = [...dreams].sort((a, b) => {
        const yearA = a.year || 9999;
        const yearB = b.year || 9999;
        if (yearA !== yearB) {
            return yearA - yearB;
        }
        return a.id - b.id;
    });

    sortedDreams.forEach(dream => {
        const dreamItem = document.createElement('div');
        dreamItem.className = 'dream-item item-glassy';
        const dreamContent = `<strong>${dream.year || 'Future'}:</strong> ${dream.text}`;
        dreamItem.innerHTML = `
                <span>${dreamContent}</span>
                <button class="delete-dream-btn icon-btn" onclick="deleteDream(${dream.id}, event)">
                    <span class="material-icons-outlined">close</span>
                </button>
            `;
        dreamsList.appendChild(dreamItem);
    });
}

function addDream() {
    const textInput = document.getElementById('new-dream-input');
    const yearInput = document.getElementById('new-dream-year');
    const text = textInput.value.trim();
    const year = yearInput.value.trim();

    if (text) {
        dreams.push({
            id: Date.now(),
            text: text,
            year: year || null
        });
        textInput.value = '';
        yearInput.value = '';
        saveDreams();
        renderDreams();
    }
}

function deleteDream(id, e) {
    e.stopPropagation();
    dreams = dreams.filter(dream => dream.id !== id);
    saveDreams();
    renderDreams();
}

function saveDreams() {
    localStorage.setItem('dreams', JSON.stringify(dreams));
    if (currentUser) triggerAutoSync();
}

let spCalendarGridEl, spMonthTitleEl, spCurrentDate = new Date(), spSelectedDayCell = null;

function initShiftPlannerElements() {
    spCalendarGridEl = document.getElementById("sp-calendar-grid");
    spMonthTitleEl = document.getElementById("sp-month-title");
    document.getElementById("sp-prev-month").addEventListener("click", () => { spCurrentDate.setMonth(spCurrentDate.getMonth() - 1); spRenderCalendar(); });
    document.getElementById("sp-next-month").addEventListener("click", () => { spCurrentDate.setMonth(spCurrentDate.getMonth() + 1); spRenderCalendar(); });
}

function openShiftPlanner() {
    hidePopups(true);
    document.getElementById('shift-planner-popup-main').style.display = 'flex';
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('overlay').style.zIndex = '1005';

    history.pushState({ popup: 'shift-planner-popup-main' }, '', null);
    hideActionButtons();
    spCurrentDate = new Date();
    spRenderCalendar();
}

function closeShiftPlanner() {
    document.getElementById('shift-planner-popup-main').style.display = 'none';
    const anyStandardPopupActive = document.querySelector('.popup.active, .search-popup.active');
    if (!anyStandardPopupActive) {
        document.getElementById('overlay').style.display = 'none';
        showActionButtons();
    }
}

function spRenderCalendar() {
    if (!spCalendarGridEl || !spMonthTitleEl) return;
    const year = spCurrentDate.getFullYear(),
        month = spCurrentDate.getMonth();
    spMonthTitleEl.textContent = spCurrentDate.toLocaleString("en-US", {
        month: "long",
        year: "numeric"
    });
    spCalendarGridEl.innerHTML = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(name => `<div class="sp-day sp-day-name">${name}</div>`).join('');
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const adjustedFirstDay = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const savedShifts = JSON.parse(localStorage.getItem("shifts")) || {};
    for (let i = 0; i < adjustedFirstDay; i++) spCalendarGridEl.insertAdjacentHTML('beforeend', '<div class="sp-day"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
        const shiftKey = `${year}-${month + 1}-${day}`;
        const shiftType = savedShifts[shiftKey] || '';
        const dayCell = document.createElement("div");
        dayCell.className = `sp-day`;

        let iconHTML = '';
        if (shiftType && shiftIconMap[shiftType]) {
            iconHTML = `<span class="material-symbols-outlined sp-shift-icon">${shiftIconMap[shiftType]}</span>`;
        }

        dayCell.innerHTML = `
                <div class="sp-day-number">${day}</div>
                ${iconHTML}
            `;

        dayCell.addEventListener("click", () => {
            spSelectedDayCell = dayCell;
            spShowShiftPopup(year, month, day);
        });
        spCalendarGridEl.appendChild(dayCell);
    }
}

function spShowShiftPopup(year, month, day) {
    document.querySelectorAll(".sp-select-popup, .sp-select-overlay").forEach(el => el.remove());

    const savedShifts = JSON.parse(localStorage.getItem("shifts")) || {};
    const shiftKey = `${year}-${month + 1}-${day}`;
    const currentShift = savedShifts[shiftKey] || "";

    const overlay = document.createElement("div");
    overlay.className = "sp-select-overlay";
    overlay.style.display = 'block';
    document.body.appendChild(overlay);

    const popup = document.createElement("div");
    popup.className = "sp-select-popup";
    popup.innerHTML = `
            <h3>Select Shift for ${day}/${month + 1}/${year}</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <label class="sp-radio-label"><input type="radio" name="sp-shift" value="highlight-yellow" ${currentShift === "highlight-yellow" ? "checked" : ""}> <span class="material-symbols-outlined">wb_twilight</span> Morning</label>
                <label class="sp-radio-label"><input type="radio" name="sp-shift" value="highlight-orange" ${currentShift === "highlight-orange" ? "checked" : ""}> <span class="material-symbols-outlined">wb_sunny</span> Afternoon</label>
                <label class="sp-radio-label"><input type="radio" name="sp-shift" value="highlight-blue" ${currentShift === "highlight-blue" ? "checked" : ""}> <span class="material-symbols-outlined">dark_mode</span> Night</label>
                <label class="sp-radio-label"><input type="radio" name="sp-shift" value="day-highlight-grey" ${currentShift === "day-highlight-grey" ? "checked" : ""}> <span class="material-symbols-outlined">coffee</span> Resting Day</label>
                <label class="sp-radio-label"><input type="radio" name="sp-shift" value="day-highlight-green" ${currentShift === "day-highlight-green" ? "checked" : ""}> <span class="material-symbols-outlined">weekend</span> Holiday</label>
                <label class="sp-radio-label"><input type="radio" name="sp-shift" value="day-highlight-light-red" ${currentShift === "day-highlight-light-red" ? "checked" : ""}> <span class="material-symbols-outlined">medical_services</span> Sick Pay</label>
                <hr class="sp-divider-line" style="width:100%; border:none; border-top: 1px solid var(--border-color); opacity: 0.3; margin: 5px 0;">
                <label class="sp-radio-label"><input type="radio" name="sp-shift" value="delete"> Delete</label>
            </div>
            <button id="sp-select-close-btn" class="popup-btn" style="margin-top: 15px;">Close</button>`;
    document.body.appendChild(popup);

    const closeSpSelectPopup = () => {
        popup.remove();
        overlay.remove();
    };

    overlay.addEventListener("click", closeSpSelectPopup);
    document.getElementById('sp-select-close-btn').addEventListener("click", closeSpSelectPopup);

    popup.querySelectorAll('input[name="sp-shift"]').forEach(radio => {
        radio.addEventListener("change", () => {
            const className = radio.value;
            if (className && className !== "delete") {
                savedShifts[shiftKey] = className;
            } else {
                delete savedShifts[shiftKey];
            }
            localStorage.setItem("shifts", JSON.stringify(savedShifts));
            closeSpSelectPopup();
            spRenderCalendar();
            if (currentUser) triggerAutoSync();
        });
    });
}

function populateSummaryNotificationTimeInputs() {
    const container = document.getElementById('summary-notification-times-container');
    container.innerHTML = '';
    const savedTimes = JSON.parse(localStorage.getItem(DAILY_SUMMARY_TIMES_KEY)) || [];
    if (savedTimes.length > 0) {
        savedTimes.forEach(time => addSummaryNotificationTimeInput(time));
    } else {
        addSummaryNotificationTimeInput('');
    }
}

function addSummaryNotificationTimeInput(timeValue = '') {
    const container = document.getElementById('summary-notification-times-container');
    const inputDiv = document.createElement('div');
    inputDiv.style.cssText = 'display:flex; align-items:center; margin-bottom:8px;';
    inputDiv.innerHTML = `
            <input type="time" class="summary-notification-time-input popup-input-style" value="${timeValue}" style="margin-bottom:0;">
            <button onclick="this.parentElement.remove()" style="margin-left:10px; background:transparent; border:none; color:inherit; cursor:pointer; padding:5px; line-height:1;">
                <span class="material-icons-outlined" style="font-size:18px; vertical-align:middle;">remove_circle_outline</span>
            </button>
        `;
    container.appendChild(inputDiv);
}

async function saveSummaryNotificationSettings() {
    const newTimes = [...new Set(Array.from(document.querySelectorAll('.summary-notification-time-input')).map(i => i.value).filter(Boolean))].sort();

    if (!("Notification" in window)) {
        localStorage.setItem(DAILY_SUMMARY_TIMES_KEY, JSON.stringify(newTimes));
        dailyNotificationTimes = newTimes;
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        localStorage.setItem(DAILY_SUMMARY_TIMES_KEY, JSON.stringify(newTimes));
        dailyNotificationTimes = newTimes;
        return;
    }

    await updateAndScheduleNotifications(newTimes);
    closePopupAndGoBack();
    if (currentUser) triggerAutoSync();
}

function updateAndScheduleNotifications(times) {
    localStorage.setItem(DAILY_SUMMARY_TIMES_KEY, JSON.stringify(times));
    dailyNotificationTimes = times;
    localStorage.removeItem(LAST_NOTIFIED_TIMES_KEY);

    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') {
        return;
    }

    navigator.serviceWorker.ready.then(registration => {
        if (registration.active) {
            registration.active.postMessage({
                type: 'schedule-summary-notifications',
                times: times
            });
        }
    });
}

async function scheduleAutomaticNotifications() {
    if (dailyNotificationTimes && dailyNotificationTimes.length > 0) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'schedule-summary-notifications',
                times: dailyNotificationTimes
            });
        }
        return;
    }

    const todayStr = getLocalDateString(new Date());
    let automaticTime;
    const firstEvent = getVisibleEvents()
        .filter(e => e.date === todayStr && e.time)
        .sort((a, b) => a.time.localeCompare(b.time))[0];
    if (firstEvent) {
        const [hours, minutes] = firstEvent.time.split(':').map(Number);
        const eventDate = new Date();
        eventDate.setHours(hours, minutes, 0, 0);
        eventDate.setMinutes(eventDate.getMinutes() - 30);
        const notifyHours = eventDate.getHours().toString().padStart(2, '0');
        const notifyMinutes = eventDate.getMinutes().toString().padStart(2, '0');
        automaticTime = `${notifyHours}:${notifyMinutes}`;
    } else {
        automaticTime = "08:00";
    }

    await updateAndScheduleNotifications([automaticTime]);
}

async function checkForegroundNotifications() {
    if (document.hidden || dailyNotificationTimes.length === 0 || Notification.permission !== 'granted') {
        return;
    }

    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 5);
    const todayDateStr = getLocalDateString(now);

    let lastNotified = JSON.parse(localStorage.getItem(LAST_NOTIFIED_TIMES_KEY)) || {};

    for (const timeStr of dailyNotificationTimes) {
        if (timeStr === currentTimeStr && lastNotified[timeStr] !== todayDateStr) {
            const todaysEvents = getVisibleEvents().filter(e => e.date === todayDateStr);
            const weatherSummary = await getWeatherSummary();
            const body = generateSmarterSummary(todaysEvents, weatherSummary);

            new Notification('Aftercup Brief', {
                body,
                icon: '/icons/icon-192x192.png',
                tag: 'daily-summary'
            });

            lastNotified[timeStr] = todayDateStr;
            localStorage.setItem(LAST_NOTIFIED_TIMES_KEY, JSON.stringify(lastNotified));
        }
    }
}

function getWeatherSummary() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve("");
            return;
        }
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
            try {
                const response = await fetch(apiUrl);
                if (!response.ok) {
                    resolve("");
                    return;
                }
                const data = await response.json();
                const temp = Math.round(data.current.temperature_2m);
                const description = getWeatherDescription(data.current.weather_code).toLowerCase();

                let tempDesc = "mild";
                if (temp >= 25) tempDesc = "hot";
                else if (temp >= 18) tempDesc = "warm";
                else if (temp <= 5) tempDesc = "cold";
                else if (temp <= 12) tempDesc = "cool";

                resolve(` For the weather, expect a ${tempDesc} day with ${description}.`);

            } catch (error) {
                resolve("");
            }
        }, () => {
            resolve("");
        }, { timeout: 10000 });
    });
}

function generateSmarterSummary(todaysEvents, weatherSummary = '') {
    const total = todaysEvents.length;
    if (total === 0) {
        let emptyDayMessage = "Your schedule is clear for today. Looks like a perfect day for anything.";
        if (weatherSummary) {
            emptyDayMessage = `Your schedule is clear today.${weatherSummary}`;
        }
        return emptyDayMessage;
    }

    const counts = { event: 0, task: 0, note: 0, high: 0, routine: 0 };
    todaysEvents.forEach(e => {
        counts[e.type] = (counts[e.type] || 0) + 1;
        if (e.importance === 'high') counts.high++;
    });

    let summaryParts = [];
    if (counts.event > 0) summaryParts.push(`${counts.event} event${counts.event > 1 ? 's' : ''}`);
    if (counts.task > 0) summaryParts.push(`${counts.task} task${counts.task > 1 ? 's' : ''}`);
    if (counts.note > 0) summaryParts.push(`${counts.note} note${counts.note > 1 ? 's' : ''}`);
    if (counts.routine > 0) summaryParts.push(`${counts.routine} routine${counts.routine > 1 ? 's' : ''}`);

    let baseSummary;
    if (total === 1) {
        baseSummary = `You have one ${todaysEvents[0].type} on your schedule today.`;
    } else if (total > 1 && total <= 4) {
        baseSummary = `You have a few things on your schedule today: ${summaryParts.join(', ')}.`;
    } else {
        baseSummary = `It looks like a busy day ahead with ${total} items: ${summaryParts.join(', ')}.`;
    }

    if (counts.high > 0) {
        if (counts.high === 1) {
            baseSummary += ` 1 of them is important.`;
        } else {
            baseSummary += ` ${counts.high} of them are important.`;
        }
    }

    return baseSummary + (weatherSummary || '');
}

function fetchWeather() {
    const weatherInfoEl = document.getElementById('weather-info');
    if (!navigator.geolocation) {
        weatherInfoEl.innerHTML = '<p>Geolocation is not supported by your Calendar.</p>';
        return;
    }

    navigator.geolocation.getCurrentPosition(async position => {
        const { latitude, longitude } = position.coords;
        const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error('Weather data not available.');
            const data = await response.json();

            const weatherCode = data.current.weather_code;
            const temp = Math.round(data.current.temperature_2m);
            const maxTemp = Math.round(data.daily.temperature_2m_max[0]);
            const minTemp = Math.round(data.daily.temperature_2m_min[0]);

            weatherInfoEl.innerHTML = `
                    <div class="weather-main" style="display:flex; align-items:center; gap:10px;">
                        <span class="material-symbols-outlined" style="font-size:30px;">${getWeatherIcon(weatherCode)}</span>
                        <div>
                            <div class="weather-temp" style="font-size:1.2rem; font-weight:bold;">${temp}°C</div>
                            <div class="weather-desc" style="opacity:0.7;">${getWeatherDescription(weatherCode)}</div>
                        </div>
                    </div>
                    <div class="weather-details" style="display:flex; gap:15px; margin-top:5px; font-size:0.9rem;">
                        <div>High: ${maxTemp}°C</div>
                        <div>Low: ${minTemp}°C</div>
                    </div>
                `;
        } catch (error) {
            weatherInfoEl.innerHTML = '<p>Could not retrieve weather information.</p>';
        }
    }, () => {
        weatherInfoEl.innerHTML = '<p>Unable to retrieve location for weather.</p>';
    }, { timeout: 10000 });
}

function getWeatherIcon(code) {
    const icons = {
        0: 'sunny', 1: 'partly_cloudy_day', 2: 'cloud', 3: 'cloudy',
        45: 'foggy', 48: 'foggy', 51: 'grain', 53: 'grain', 55: 'grain',
        61: 'rainy', 63: 'rainy', 65: 'rainy', 66: 'sleet', 67: 'sleet',
        71: 'weather_snowy', 73: 'weather_snowy', 75: 'weather_snowy', 80: 'rainy', 81: 'rainy', 82: 'rainy',
        95: 'thunderstorm', 96: 'thunderstorm', 99: 'thunderstorm',
    };
    return icons[code] || 'cloud';
}

function getWeatherDescription(code) {
    const descriptions = {
        0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
        61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Light freezing rain', 67: 'Heavy freezing rain',
        71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Slight rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
        95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
    };
    return descriptions[code] || 'Cloudy';
}

function showAccountPopup() {
    hidePopups(true);
    const popup = document.getElementById('account-popup');
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('overlay').style.zIndex = '1005';
    popup.classList.add('active');
    updateAccountUI();
    history.pushState({ popup: 'account-popup' }, '', null);
    hideActionButtons();
}

function updateAccountUI() {
    const loginView = document.getElementById('auth-forms');
    const loggedInView = document.getElementById('logged-in-view');
    const syncStatus = document.getElementById('sync-status');
    const autoSyncToggle = document.getElementById('auto-sync-toggle');

    const syncEventsToggle = document.getElementById('sync-events-toggle');
    const syncDreamsToggle = document.getElementById('sync-dreams-toggle');
    const syncShiftsToggle = document.getElementById('sync-shifts-toggle');
    const syncSettingsToggle = document.getElementById('sync-settings-toggle');

    if (syncStatus) {
        syncStatus.textContent = '';
        syncStatus.style.color = 'inherit';
    }

    if (currentUser) {
        loginView.style.display = 'none';
        loggedInView.style.display = 'block';

        const pfpDisplay = document.getElementById('pfp-display');
        if (pfpDisplay) {
            if (currentUser.pfp && currentUser.pfp.trim() !== "") {
                pfpDisplay.innerHTML = `<img src="${currentUser.pfp}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 5px rgba(0,0,0,0.2); display: block; margin: 0 auto;">`;
            } else {
                pfpDisplay.innerHTML = `<span class="material-icons-outlined" style="font-size: 55px; opacity: 0.8;">account_circle</span>`;
            }
        }

        document.getElementById('current-username').textContent = currentUser.username;
        document.getElementById('current-email').textContent = currentUser.email;

        if (autoSyncToggle) autoSyncToggle.checked = autoSyncEnabled;
        if (syncEventsToggle) syncEventsToggle.checked = syncPrefs.events;
        if (syncDreamsToggle) syncDreamsToggle.checked = syncPrefs.dreams;
        if (syncShiftsToggle) syncShiftsToggle.checked = syncPrefs.shifts;
        if (syncSettingsToggle) syncSettingsToggle.checked = syncPrefs.settings;

        if (!isSyncing && syncStatus) updateSyncStatus('Ready to sync');
    } else {
        loginView.style.display = 'block';
        loggedInView.style.display = 'none';
        toggleAuthMode('login');
    }
}

function toggleAuthMode(mode) {
    document.getElementById('login-form-container').style.display = (mode === 'login') ? 'block' : 'none';
    document.getElementById('register-form-container').style.display = (mode === 'register') ? 'block' : 'none';
}

function updateSyncStatus(msg, isError = false) {
    const el = document.getElementById('sync-status');
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? '#ff6b6b' : 'inherit';
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!email || !password) return alert("Please fill in all fields");

    updateSyncStatus('Logging in...');
    try {
        const result = await apiRequest({ action: 'login', email, password });
        if (result.status === 'success') {
            currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateAccountUI();
            updateSyncStatus('Syncing: Downloading...');
            await performSync('pull');
            updateSyncStatus('Syncing: Uploading...');
            await performSync('push');
            updateSyncStatus('Sync Complete (Merged)');
        } else {
            updateSyncStatus('Login failed', true);
        }
    } catch (e) {
        updateSyncStatus('Connection Error', true);
    }
}

async function handleRegister() {
    const email = document.getElementById('reg-email').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    if (!email || !password || !username) return alert("Please fill in all fields");

    updateSyncStatus('Creating account...');
    try {
        const result = await apiRequest({ action: 'register', email, username, password });
        if (result.status === 'success') {
            currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateAccountUI();
            performSync('push');
        } else {
            updateSyncStatus('Registration failed', true);
        }
    } catch (e) {
        updateSyncStatus('Registration Error', true);
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    events = events.filter(e => e.preAdded);
    dreams = [];
    localStorage.removeItem('events');
    localStorage.removeItem('dreams');
    localStorage.removeItem('shifts');
    updateCalendar();
    updateAccountUI();
}

function forceSync() {
    performSync('pull');
}

function getBackupData() {
    const backup = {
        timestamp: Date.now(),
        dataType: "AftercupCalendarFullBackup"
    };

    if (syncPrefs.events) {
        backup.events = events.filter(e => !e.preAdded);
    }
    if (syncPrefs.dreams) {
        backup.dreams = dreams;
    }
    if (syncPrefs.shifts) {
        backup.shifts = JSON.parse(localStorage.getItem("shifts") || "{}");
    }
    if (syncPrefs.settings) {
        backup.settings = {
            theme: localStorage.getItem('theme'),
            showPreAdded: showPreAddedEvents,
            notifications: dailyNotificationTimes
        };
    }
    return backup;
}

async function applyBackupData(backup) {
    if (!backup || Object.keys(backup).length === 0) return;

    if (syncPrefs.events && backup.events && Array.isArray(backup.events)) {
        const localUserEvents = JSON.parse(localStorage.getItem('events')) || [];
        const cloudEvents = backup.events;
        
        let mergedEvents = [...localUserEvents];

        cloudEvents.forEach(cloudEvt => {
            let matchIndex = -1;

            if (cloudEvt.sharedEventId) {
                matchIndex = mergedEvents.findIndex(e => e.sharedEventId === cloudEvt.sharedEventId);
            }
            if (matchIndex === -1) {
                matchIndex = mergedEvents.findIndex(e => e.id === cloudEvt.id);
            }

            if (matchIndex > -1) {
                const localEvt = mergedEvents[matchIndex];
                const localTime = localEvt.lastModified || 0;
                const cloudTime = cloudEvt.lastModified || 0;

                if (cloudTime > localTime) {
                    mergedEvents[matchIndex] = {
                        ...localEvt,
                        ...cloudEvt,
                        id: localEvt.id,
                        sharedEventId: cloudEvt.sharedEventId 
                    };
                }
            } else {
                mergedEvents.push(cloudEvt);
            }
        });
        
        localStorage.setItem('events', JSON.stringify(mergedEvents));
        
        let fetchedEvents = [];
        try {
            const response = await fetch('events-update.json');
            if (response.ok) fetchedEvents = await response.json();
        } catch (e) {}
        events = mergeEvents(fetchedEvents, mergedEvents);
        
        updateCalendar();
    }
    
    if (syncPrefs.dreams && backup.dreams && Array.isArray(backup.dreams)) {
        const localDreams = JSON.parse(localStorage.getItem('dreams')) || [];
        const cloudDreams = backup.dreams;
        const dreamMap = new Map();
        cloudDreams.forEach(d => dreamMap.set(d.id, d));
        localDreams.forEach(d => dreamMap.set(d.id, d));
        dreams = Array.from(dreamMap.values());
        localStorage.setItem('dreams', JSON.stringify(dreams));
        if (document.getElementById('dreams-popup') && document.getElementById('dreams-popup').classList.contains('active')) renderDreams();
    }

    if (syncPrefs.shifts && backup.shifts) {
        const localShifts = JSON.parse(localStorage.getItem("shifts")) || {};
        const mergedShifts = { ...backup.shifts, ...localShifts };
        localStorage.setItem('shifts', JSON.stringify(mergedShifts));
        if (typeof spRenderCalendar === 'function') spRenderCalendar();
    }

    if (syncPrefs.settings && backup.settings) {
        if (backup.settings.theme) changeTheme(backup.settings.theme);
        if (backup.settings.showPreAdded !== undefined) {
            showPreAddedEvents = backup.settings.showPreAdded;
            localStorage.setItem('showPreAddedEvents', JSON.stringify(showPreAddedEvents));
            const toggle = document.getElementById('pre-added-toggle');
            if (toggle) toggle.checked = showPreAddedEvents;
        }
        if (backup.settings.notifications) {
            dailyNotificationTimes = [...new Set([...dailyNotificationTimes, ...backup.settings.notifications])].sort();
            localStorage.setItem(DAILY_SUMMARY_TIMES_KEY, JSON.stringify(dailyNotificationTimes));
        }
    }
}

async function performSync(direction) {
    if (!currentUser || isSyncing) return;
    isSyncing = true;
    updateSyncStatus('Syncing...');
    try {
        if (direction === 'pull') {
            const result = await apiRequest({ action: 'backup_download', email: currentUser.email });
            if (result.status === 'success') {
                await applyBackupData(result.backup);
                updateSyncStatus('Sync complete (Pulled)');
            } else {
                updateSyncStatus(`Sync error: ${result.message || 'Pull failed'}`, true);
            }
        }
        if (direction === 'push') {
            const backupData = getBackupData();
            const result = await apiRequest({ action: 'backup_upload', email: currentUser.email, backup: backupData });
            if (result.status === 'success') {
                updateSyncStatus('Sync complete (Saved)');
            } else {
                updateSyncStatus(`Sync error: ${result.message || 'Save failed'}`, true);
            }
        }
    } catch (e) {
        updateSyncStatus('Sync Failed', true);
    } finally {
        isSyncing = false;
    }
}

function showPastEventsPopup() {
    const popups = document.querySelectorAll('.popup:not(#past-events-popup), .search-popup');
    popups.forEach(p => p.classList.remove('active'));
    const overlay = document.getElementById('overlay');
    overlay.style.zIndex = '1019';
    overlay.style.display = 'block';
    const popup = document.getElementById('past-events-popup');
    popup.classList.add('active');
    history.pushState({ popup: 'past-events-popup' }, '', null);
    hideActionButtons();
    document.getElementById('past-events-loader').style.display = 'block';
    document.getElementById('past-events-container').style.display = 'none';
    setTimeout(() => { renderPastEvents(); }, 50);
}

function renderPastEvents() {
    const container = document.getElementById('past-events-container');
    const loader = document.getElementById('past-events-loader');
    container.innerHTML = '';
    const todayStr = getLocalDateString(new Date());
    const pastEvents = getVisibleEvents()
        .filter(event => event.date < todayStr)
        .sort((a, b) => {
            if (a.date > b.date) return -1;
            if (a.date < b.date) return 1;
            return (a.time || "23:59").localeCompare(b.time || "23:59");
        });

    if (pastEvents.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.6; width: 100%; margin-top: 50px;">No past history found.</p>';
    } else {
        pastEvents.forEach(event => {
            const card = document.createElement('div');
            card.className = 'past-event-card item-glassy';
            card.style.borderBottom = '1px solid var(--border-color)';
            card.style.padding = '10px';
            card.style.display = 'flex';
            card.style.gap = '10px';

            if (event.color && event.color !== '#FFFFFF' && event.color !== '#000000') {
                card.style.setProperty('background-color', event.color, 'important');
                card.style.color = getContrastColor(event.color);
            }

            const [y, m, d] = event.date.split('-');
            const dateObj = new Date(y, m - 1, d);
            const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

            card.innerHTML = `
                    <div class="past-date" style="font-weight:bold; min-width:80px;">${dateStr}</div>
                    <div style="flex-grow: 1; overflow: hidden; text-overflow: ellipsis;">${event.text}</div>
                    ${event.time ? `<div style="font-size: 11px; opacity: 0.8; margin-top: 5px; text-align: right;">${event.time}</div>` : ''}
                `;

            card.onclick = () => {
                const parts = event.date.split('-').map(Number);
                currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
                updateCalendar();
                document.getElementById('past-events-popup').classList.remove('active');
                if (isMobileMiniCalVisible) {
                    toggleMobileMiniCalendar();
                } else {
                    document.getElementById('overlay').style.display = 'none';
                    showActionButtons();
                }
            };
            container.appendChild(card);
        });
    }
    loader.style.display = 'none';
    container.style.display = 'block';
}

function truncateTextByWords(text, maxLength) {
    if (text.length <= maxLength) return text;

    let truncated = text.slice(0, maxLength);

    // Remove partial last word
    truncated = truncated.replace(/\s+\S*$/, '');

    return truncated + '...';
}

function truncateTextByWords(text, maxLength) {
    if (text.length <= maxLength) return text;

    let truncated = text.slice(0, maxLength);
    truncated = truncated.replace(/\s+\S*$/, '');
    return truncated + '...';
}

function printCurrentWeek() {

    const today = new Date(currentDate);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    const sunday = new Date(new Date(monday).setDate(monday.getDate() + 6));

    const style = `
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=JetBrains+Mono:wght@400&display=swap');

        @page {
            size: A4 portrait;
            margin: 0;
        }

        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background: #fff;
        }

        body {
            font-family: 'Inter', sans-serif;
            display: flex;
            flex-direction: column;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .toolbar {
            height: 40px;
            background: #f0f0f0;
            border-bottom: 1px solid #ccc;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
        }

        .btn {
            padding: 6px 15px;
            border: 1px solid #000;
            background: #fff;
            font-weight: 600;
            font-size: 11px;
            cursor: pointer;
        }

        .btn:hover { background:#000; color:#fff; }

        .btn-close { color:#d32f2f; border-color:#d32f2f; }
        .btn-close:hover { background:#d32f2f; color:#fff; }

        .page-header {
            text-align: center;
            padding: 10px 0 5px;
        }

        .main-title {
            font-size: 16px;
            font-weight: 800;
            margin: 0;
        }

        .date-range {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            opacity: .6;
        }

        .brand-tag {
            font-size: 9px;
            opacity: .5;
        }

        .page-container {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: repeat(4, 1fr);
            gap: 4px;
            padding: 5px 10mm 10mm;
            box-sizing: border-box;
        }

        @media print {
            .toolbar { display:none !important; }

            body {
                height:auto;
                display:block;
            }

            .page-container {
                height:auto;
                min-height:100%;
                padding: 0 5mm 5mm;
                grid-auto-rows:1fr;
            }

            .page-header {
                margin-top:5mm;
                margin-bottom:2mm;
            }
        }

        .grid-cell {
            border:2px solid #000;
            padding:4px;
            display:flex;
            flex-direction:column;
            overflow:hidden;
        }

        .notes-cell {
            border:2px dashed #ccc;
            color:#ccc;
            display:flex;
            align-items:center;
            justify-content:center;
            font-family:'JetBrains Mono', monospace;
            font-size:11px;
        }

        .day-header {
            display:flex;
            justify-content:space-between;
            border-bottom:2px solid #eee;
            padding-bottom:3px;
            margin-bottom:3px;
        }

        .day-name {
            font-weight:700;
            font-size:12px;
        }

        .day-date {
            font-family:'JetBrains Mono', monospace;
            font-size:10px;
        }

        .events-container {
            flex-grow:1;
            overflow:hidden;
        }

        .event-row {
            display:flex;
            font-size:9px;
            border-bottom:1px dotted #e0e0e0;
            padding:1px 0;
            gap:5px;
        }

        .event-time {
            width:35px;
            text-align:right;
            font-family:'JetBrains Mono', monospace;
            font-weight:bold;
            flex-shrink:0;
        }

        .event-text {
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            flex-grow:1;
        }

        .priority-high { color:#d32f2f; font-weight:600; }
        .completed { text-decoration:line-through; opacity:.5; }
        .type-note { font-style:italic; color:#666; }

        .empty-msg {
            text-align:center;
            font-size:9px;
            color:#aaa;
            font-style:italic;
        }
    </style>
    `;

    let htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body>`;

    htmlContent += `
        <div class="toolbar">
            <button class="btn" onclick="window.print()">Print</button>
            <button class="btn btn-close" onclick="window.close()">Close</button>
        </div>

        <div class="page-header">
            <h1 class="main-title">Week ${getWeekNumber(monday)}</h1>
            <div class="date-range">${monday.toLocaleDateString()} — ${sunday.toLocaleDateString()}</div>
            <div class="brand-tag">Aftercup Calendar for Minimal Phone</div>
        </div>

        <div class="page-container">
    `;

    for (let i = 0; i < 7; i++) {

        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = getLocalDateString(d);

        const dayEvents = getVisibleEvents()
            .filter(e => e.date === dateStr)
            .sort((a, b) => {
                if (a.type === 'note' && b.type !== 'note') return 1;
                if (a.type !== 'note' && b.type === 'note') return -1;
                return (a.time || "23:59").localeCompare(b.time || "23:59");
            });

        htmlContent += `
        <div class="grid-cell">
            <div class="day-header">
                <span class="day-name">${dayNamesFull[d.getDay()]}</span>
                <span class="day-date">${d.getDate()}/${d.getMonth()+1}</span>
            </div>
            <div class="events-container">
        `;

        if (!dayEvents.length) {

            htmlContent += `<div class="empty-msg">No entries</div>`;

        } else {

            let hiddenNotesCount = 0;

            dayEvents.forEach(e => {

                if (e.type === 'note' && e.text.length > 300) {
                    hiddenNotesCount++;
                    return;
                }

                let timeDisplay = e.time || '';
                let extraClass = '';
                let icon = '•';

                if (e.importance === 'high') { extraClass += ' priority-high'; icon = '!'; }
                if (e.type === 'task') icon = e.completed ? '☒' : '☐';
                if (e.completed) extraClass += ' completed';

                let displayText = e.text;

                if (e.type === 'note') {
                    displayText = truncateTextByWords(displayText, 300);
                    extraClass += ' type-note';
                    timeDisplay = 'NOTE';
                }

                if (e.place && e.place.value) {
                    let loc = e.place.value;
                    if (e.place.type === 'virtual') {
                        try { loc = new URL(loc).hostname; } catch {}
                    }
                    displayText += ` (@${loc})`;
                }

                htmlContent += `
                    <div class="event-row ${extraClass}">
                        <div class="event-time">${timeDisplay || icon}</div>
                        <div class="event-text">${displayText}</div>
                    </div>
                `;
            });

            if (hiddenNotesCount > 0) {
                htmlContent += `
                    <div class="event-row type-note">
                        <div class="event-time">NOTE</div>
                        <div class="event-text">+${hiddenNotesCount} note${hiddenNotesCount > 1 ? 's' : ''}</div>
                    </div>
                `;
            }
        }

        htmlContent += `</div></div>`;
    }

    htmlContent += `<div class="grid-cell notes-cell">Notes</div>`;
    htmlContent += `</div></body></html>`;

    const printWindow = window.open('', '_blank');

    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
    }

    closePopupAndGoBack();
}

async function apiRequest(payload) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        return JSON.parse(text);
    } catch (error) {
        throw error;
    }
}
