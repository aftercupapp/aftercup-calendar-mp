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

    const API_URL = 'https://script.google.com/macros/s/AKfycbxwA06EVYQIcc3heOVvoxYslDoUoWayP7NCcvxf1pF4nZhYyrP5sfxQJbijhrYhWvY8Hw/exec';

    let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
    let isSyncing = false;
    let syncDebounceTimer = null;

    let dailyNotificationTimes = [];

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
            if(window.history.state && window.history.state.popup) {
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

    function generateSharedId() {
        return 'share_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
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
            preAddedToggle.addEventListener('change', function() {
                showPreAddedEvents = this.checked;
                localStorage.setItem('showPreAddedEvents', JSON.stringify(showPreAddedEvents));
                updateCalendar();
            });
        }

        document.getElementById('place-type').addEventListener('change', function() {
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
            // Keep fetching logic if needed, currently empty for local defaults
        } catch (error) {
            console.error(error);
        }
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
                            
                            // Reset share view
                            const sharedList = document.getElementById('shared-with-list');
                            if (sharedList) sharedList.style.display = 'none';
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
    });

    function toggleAddPopupFields() {
        const eventType = document.getElementById('event-type').value;

        const routineOptions = document.getElementById('routine-options');
        const noteContainer = document.getElementById('note-input-container');
        const titleInput = document.getElementById('new-event-input');
        const placeType = document.getElementById('place-type');
        const timeInput = document.getElementById('event-time');
        
        // Toggle End Date visibility wrapper if it exists
        const endDateWrapper = document.getElementById('end-date-wrapper');
        if (endDateWrapper) {
            endDateWrapper.style.display = (eventType === 'event') ? 'block' : 'none';
        }

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
            
            // Reset End Date/Time if they exist
            const endDateEl = document.getElementById('event-end-date');
            if (endDateEl) endDateEl.value = '';
            const endTimeEl = document.getElementById('event-end-time');
            if (endTimeEl) endTimeEl.value = '';

            document.getElementById('new-event-input').value = '';
            const noteContent = document.getElementById('new-note-content');
            if(noteContent) noteContent.innerHTML = '';

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

            // Reset Shared View
            const sharedList = document.getElementById('shared-with-list');
            if (sharedList) {
                sharedList.style.display = 'none';
                const sharedItems = document.getElementById('shared-with-items');
                if (sharedItems) sharedItems.innerHTML = '';
            }
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
            .filter(event => {
                
                if (event.date === currentDateString) return true;
                
                
                if (event.type === 'event' && event.endDate) {
                    return currentDateString >= event.date && currentDateString <= event.endDate;
                }
                return false;
            })
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
            eventsContainer.style.alignContent = 'center'; 
            return;
        }

        eventsContainer.style.alignContent = 'start';

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

                
                const timeString = event.time ? ` • ${event.time}` : '';

                eventItem.innerHTML = `
                    <div class="event-item-content-wrapper" style="align-items: flex-start; flex-direction: column; width: calc(100% - 40px);">
                        <div style="font-size: 12px; opacity: 0.7; margin-bottom: 4px; display: flex; align-items: center;">
                            <span class="material-icons-outlined" style="font-size: 14px; margin-right: 4px;">sticky_note_2</span> Note${timeString}
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
                
                
                if (event.shared && textDisplay.startsWith("[Shared] ")) {
                    textDisplay = textDisplay.substring(9);
                }

                const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
                textDisplay = textDisplay.replace(urlRegex, url => `<a href="${url}" target="_blank" style="color: inherit; text-decoration: underline;" onclick="event.stopPropagation();">${url}</a>`);

                let taskMarkerHTML = '';
                let textSpanClass = "event-text";
                if (event.type === 'task') {
                    textSpanClass += " task-text";
                    if (event.completed) textSpanClass += " completed-text";
                    // Compact HTML to ensure flex layout works correctly
                    taskMarkerHTML = `<label class="task-checkbox-label" onclick="event.stopPropagation();"><input type="checkbox" class="hidden-task-checkbox" ${event.completed ? 'checked' : ''} onchange="toggleTask(${event.id}, event)"><span class="custom-checkbox"><span class="material-icons-outlined check-icon">check_small</span></span></label>`;
                }

                let iconHTML = '';
                
                if (event.type === 'routine' || event.routineId) {
                    iconHTML += '<span class="material-symbols-outlined" style="font-size: 20px; margin-right: 5px; opacity: 0.7; vertical-align: middle;">sync</span>';
                }
                
                if (event.shared) {
                    iconHTML += '<span class="material-icons-outlined" style="font-size: 20px; margin-right: 5px; opacity: 0.7; vertical-align: middle;">share</span>';
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

                
                let timeDisplay = event.time || '';
                if (event.time && event.endTime) {
                    timeDisplay = `${event.time} - ${event.endTime}`;
                } else if (!event.time && event.endTime) {
                     timeDisplay = `Ends at ${event.endTime}`;
                }

                // Compact innerHTML assignment to ensure correct flex layout
                eventItem.innerHTML = `<div class="event-item-content-wrapper">${taskMarkerHTML}<span class="${textSpanClass}">${iconHTML}${textDisplay}</span></div><div class="event-footer"><div class="event-date">${timeDisplay}</div>${placeHTML}</div>${deleteButtonHTML}`;
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

                let textDisplay = event.text;
                if (event.shared && textDisplay.startsWith("[Shared] ")) {
                    textDisplay = textDisplay.substring(9);
                }
                eventEl.innerHTML = `<span class="event-text">${textDisplay}</span> <span class="event-time" style="float:right; opacity:0.7;">${event.time || ''}</span>`;
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
        
        const eventEndDateInputEl = document.getElementById('event-end-date');
        const eventEndDateInput = eventEndDateInputEl ? eventEndDateInputEl.value : null;
        
        const eventEndTimeInputEl = document.getElementById('event-end-time');
        const eventEndTimeInput = eventEndTimeInputEl ? eventEndTimeInputEl.value : null;

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
            console.error(!eventDateInput ? 'Please select a date.' : 'Please enter text.');
            return;
        }
        
        if (currentBulkEditInfo) {
            handleRoutineEdit(eventTime, eventText, eventColor, eventImportance, placeData);
            return; 
        }
        
        let updatedEventForSync = null;

        if (currentEditId !== null) {
            const eventIndex = events.findIndex(event => event.id === currentEditId);
            if (eventIndex > -1) {
                const originalEvent = events[eventIndex];
                if (originalEvent.preAdded) {
                    alert("Predefined events cannot be edited.");
                    return;
                }
                const existingSharedId = originalEvent.sharedEventId || null;

                events[eventIndex] = { ...originalEvent,
                    type: eventType,
                    date: eventDateInput,
                    endDate: (eventType === 'event') ? eventEndDateInput : null,
                    time: eventTime,
                    endTime: (eventType === 'event') ? eventEndTimeInput : null,
                    text: eventText, 
                    color: eventColor,
                    importance: eventImportance,
                    place: placeData,
                    sharedEventId: existingSharedId,
                    completed: eventType === 'task' ? (originalEvent.type === 'task' ? originalEvent.completed : false) : undefined,
                    lastModified: Date.now() 
                };
                updatedEventForSync = events[eventIndex];
            }
        } else { 
            const baseEvent = {
                id: Date.now(),
                sharedEventId: null,
                type: eventType,
                date: eventDateInput,
                endDate: (eventType === 'event') ? eventEndDateInput : null,
                time: eventTime,
                endTime: (eventType === 'event') ? eventEndTimeInput : null,
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
        if(eventEndDateInputEl) eventEndDateInputEl.value = '';
        if(eventEndTimeInputEl) eventEndTimeInputEl.value = '';
        
        const noteDiv = document.getElementById('new-note-content');
        if(noteDiv) noteDiv.innerHTML = '';

        currentEditId = null;
        history.back(); 
        updateCalendar();
        saveEvents();
        scheduleAutomaticNotifications();

        if (updatedEventForSync && updatedEventForSync.sharedWith && updatedEventForSync.sharedWith.length > 0 && currentUser) {
            if (!updatedEventForSync.sharedEventId) {
                 updatedEventForSync.sharedEventId = generateSharedId();
                 saveEvents();
            }
            updatedEventForSync.sharedWith.forEach(recipient => {
                apiRequest({
                    action: 'share_event',
                    sender: currentUser.email,
                    recipient: recipient,
                    eventData: updatedEventForSync
                }).catch(err => console.error("Auto-sync failed for " + recipient, err));
            });
        }
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
        const eventsToSync = [];

        events = events.map(event => {
            if (event.routineId === routineId && event.date >= startDate) {
                if (event.preAdded) return event;
                
                const sId = event.sharedEventId || (event.sharedWith && event.sharedWith.length > 0 ? generateSharedId() : null);

                const updated = {
                    ...event,
                    time: newTime,
                    text: newText,
                    color: newColor,
                    importance: newImportance,
                    place: newPlaceData,
                    sharedEventId: sId,
                    lastModified: Date.now() 
                };

                if (updated.sharedWith && updated.sharedWith.length > 0) {
                    eventsToSync.push(updated);
                }
                return updated;
            }
            return event;
        });

        currentEditId = null;
        currentBulkEditInfo = null;
        
        history.back();
        updateCalendar();
        saveEvents();

        if (eventsToSync.length > 0 && currentUser) {
            eventsToSync.forEach(evt => {
                evt.sharedWith.forEach(recipient => {
                    apiRequest({
                        action: 'share_event',
                        sender: currentUser.email,
                        recipient: recipient,
                        eventData: evt
                    }).catch(err => console.error(`Failed to auto-sync edit for ${evt.date}`, err));
                });
            });
        }
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
        
        const eventEndDateInputEl = document.getElementById('event-end-date');
        if(eventEndDateInputEl) eventEndDateInputEl.value = eventToEdit.endDate || '';
        
        const eventEndTimeInputEl = document.getElementById('event-end-time');
        if(eventEndTimeInputEl) eventEndTimeInputEl.value = eventToEdit.endTime || '';

        // Handle Share Button Logic if it exists in DOM (though not in current HTML, kept for compatibility)
        const shareBtn = document.getElementById('share-event-btn');
        if (shareBtn) {
            const canShare = (eventToEdit.type === 'event' || eventToEdit.type === 'note') && currentUser;
            shareBtn.style.display = canShare ? 'block' : 'none';
        }

        document.getElementById('event-time').value = eventToEdit.time || '';
        
        if (eventToEdit.type === 'note') {
            const noteDiv = document.getElementById('new-note-content');
            if(noteDiv) noteDiv.innerHTML = eventToEdit.text; 
            document.getElementById('new-event-input').value = '';
        } else {
            document.getElementById('new-event-input').value = eventToEdit.text;
            const noteDiv = document.getElementById('new-note-content');
            if(noteDiv) noteDiv.innerHTML = '';
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
                placePhysicalInput.value = eventToEdit.place.value;
                placeUrlInput.style.display = 'none';
                placePhysicalInput.style.display = 'block';
            }
        } else {
            placeTypeSelect.value = 'none';
            placeUrlInput.style.display = 'none';
            placePhysicalInput.style.display = 'none';
            placeUrlInput.value = '';
            placePhysicalInput.value = '';
        }

        // Shared With List Population
        const sharedListDiv = document.getElementById('shared-with-list');
        const sharedItemsDiv = document.getElementById('shared-with-items');
        if (sharedListDiv && sharedItemsDiv) {
            sharedItemsDiv.innerHTML = '';
            if (eventToEdit.sharedWith && eventToEdit.sharedWith.length > 0) {
                sharedListDiv.style.display = 'block';
                eventToEdit.sharedWith.forEach(email => {
                    const chip = document.createElement('div');
                    chip.className = 'shared-user-chip';
                    chip.innerHTML = `<span class="material-icons-outlined">person</span><span>${email}</span>`;
                    sharedItemsDiv.appendChild(chip);
                });
            } else {
                sharedListDiv.style.display = 'none';
            }
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
            if (eventToDelete.sharedWith && eventToDelete.sharedWith.length > 0) eventsToSync.push(eventToDelete);
        } else if (scope === 'future') {
            const { routineId, date } = eventToDelete;
            events.forEach(event => {
                if (event.routineId === routineId && event.date >= date) {
                    event.deleted = true;
                    event.lastModified = Date.now();
                    if (event.sharedWith && event.sharedWith.length > 0) eventsToSync.push(event);
                }
            });
        }

        updateCalendar();
        saveEvents();
        scheduleAutomaticNotifications();

        if (eventsToSync.length > 0 && currentUser) {
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
        e.stopPropagation();
        
        const eventToDelete = events.find(event => event.id === eventId);
        
        if (eventToDelete && eventToDelete.preAdded) {
             return;
        }

        if (eventToDelete && eventToDelete.routineId) {
            promptForRoutineDelete(eventToDelete);
        } else {
            if (eventToDelete) {
                eventToDelete.deleted = true;
                eventToDelete.lastModified = Date.now();
                updateCalendar();
                saveEvents();
                scheduleAutomaticNotifications();

                if (eventToDelete.sharedWith && eventToDelete.sharedWith.length > 0 && currentUser) {
                    const cleanEventData = { ...eventToDelete };
                    eventToDelete.sharedWith.forEach(recipient => {
                        apiRequest({
                            action: 'share_event',
                            sender: currentUser.email,
                            recipient: recipient,
                            eventData: cleanEventData 
                        });
                    });
                }
            }
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
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
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
        reader.onload = async function(e) {
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
                    
                    const existingPreAdded = events.filter(e => e.preAdded);
                    events = mergeEvents(existingPreAdded, restoredUserEvents);
                    saveEvents();
                    
                    if(restoredObject.dreams) {
                        dreams = restoredObject.dreams;
                        localStorage.setItem('dreams', JSON.stringify(dreams));
                    }
                    if(restoredObject.shiftPlannerData) {
                        localStorage.setItem("shifts", JSON.stringify(restoredObject.shiftPlannerData));
                    }
                    updateCalendar();
                }
                alert("Data restored successfully.");
            } catch (error) {
                console.error("Error restoring data: Invalid file.", error);
                alert("Error restoring data.");
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
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
                    currentDate = new Date(event.date.split('-').map(Number)[0], event.date.split('-').map(Number)[1] - 1, event.date.split('-').map(Number)[2]);
                    updateCalendar();
                    
                    const popup = document.getElementById('past-events-popup');
                    popup.classList.remove('active');
                    
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

    async function handleShareEvent() {
        if (!currentUser) {
            alert("You must be logged in to share events.");
            return;
        }
        if (currentEditId === null) return;

        let baseEvent = events.find(e => e.id === currentEditId);
        if (!baseEvent) return;

        const recipientEmail = prompt("Enter the email address of the registered user you want to share this event with:");
        if (!recipientEmail) return;

        if (!recipientEmail.includes('@') || !recipientEmail.includes('.')) {
            alert("Please enter a valid email address.");
            return;
        }

        const shareBtn = document.getElementById('share-event-btn');
        let originalText = '';
        if(shareBtn) {
            originalText = shareBtn.innerHTML;
            shareBtn.innerHTML = 'Sharing...';
            shareBtn.disabled = true;
        }

        try {
            let eventsToShare = [];

            if (baseEvent.routineId) {
                eventsToShare = events.filter(e => e.routineId === baseEvent.routineId);
                
                if (confirm(`This is a repeating event (${eventsToShare.length} instances). Share all of them?`)) {
                } else {
                    eventsToShare = [baseEvent];
                }
            } else {
                eventsToShare = [baseEvent];
            }

            let successCount = 0;

            for (let eventToShare of eventsToShare) {
                
                if (!eventToShare.sharedEventId) {
                    eventToShare.sharedEventId = generateSharedId();
                }

                if (!eventToShare.sharedWith) {
                    eventToShare.sharedWith = [];
                }
                if (!eventToShare.sharedWith.includes(recipientEmail)) {
                    eventToShare.sharedWith.push(recipientEmail);
                }

                const result = await apiRequest({
                    action: 'share_event',
                    sender: currentUser.email,
                    recipient: recipientEmail,
                    eventData: eventToShare
                });

                if (result.status === 'success') {
                    successCount++;
                }
            }

            saveEvents(); 

            if (successCount > 0) {
                alert(`Successfully shared ${successCount} event(s) with ${recipientEmail}.`);
            } else {
                alert("Failed to share event(s). Check console for details.");
            }

        } catch (error) {
            console.error("Share error:", error);
            alert("An error occurred while sharing.");
        } finally {
            if(shareBtn) {
                shareBtn.innerHTML = originalText;
                shareBtn.disabled = false;
            }
        }
    }

    function upsertSharedEvent(incomingEvent) {
        let existingIndex = -1;
        
        if (incomingEvent.sharedEventId) {
            existingIndex = events.findIndex(e => e.sharedEventId === incomingEvent.sharedEventId);
        }

        if (existingIndex === -1) {
             existingIndex = events.findIndex(e => e.id === incomingEvent.id);
        }

        if (existingIndex > -1) {
            const localEvent = events[existingIndex];
            
            if ((incomingEvent.lastModified || 0) < (localEvent.lastModified || 0)) {
                return; 
            }

            events[existingIndex] = {
                ...localEvent,      
                ...incomingEvent,   
                id: localEvent.id,  
                sharedEventId: incomingEvent.sharedEventId || localEvent.sharedEventId 
            };
            
            if (incomingEvent.deleted) {
                 events[existingIndex].deleted = true;
            }

        } else {
            if (!incomingEvent.deleted) {
                const newLocalEvent = {
                    ...incomingEvent,
                    id: Date.now() + Math.floor(Math.random() * 10000), 
                    sharedEventId: incomingEvent.sharedEventId 
                };
                events.push(newLocalEvent);
            }
        }

        saveEvents();
        updateCalendar();
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
            console.error(error);
            throw error;
        }
    }
