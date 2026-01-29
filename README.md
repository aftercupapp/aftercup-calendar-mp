# Aftercup Calendar (Minimal Phone Edition)

A distraction-free, high-contrast calendar application specifically designed for the **Minimal Phone** and other e-paper devices. Aftercup Calendar combines essential productivity tools with a unique integration of the Aftercup coffee blog, wrapped in a QWERTY-optimized interface.

---

## 📱 Screenshots

| Home View | New Entry | Aftercup Brief |
| :---: | :---: | :---: |
| ![Home Screen](https://i.postimg.cc/L80thkY5/Screenshot_20260129_161951.png) | ![New Entry](https://i.postimg.cc/Z5D80PBR/Screenshot_20260129_162007.png) | ![Briefing](https://i.postimg.cc/bwFxd0Dv/Screenshot_20260129_162025.png) |

| Calendar Menu | Account Settings | Keyboard Shortcuts |
| :---: | :---: | :---: |
| ![Menu](https://i.postimg.cc/bwFxd0Dd/Screenshot_20260129_162036.png) | ![Account](https://i.postimg.cc/K8sP47kg/Screenshot_20260129_162044.png) | ![Shortcuts](https://i.postimg.cc/sg0Y1PQV/Screenshot_20260129_190926.png) |

| Search | Upcoming View | Shift Planner |
| :---: | :---: | :---: |
| ![Search](https://i.postimg.cc/XYDfXKG7/Screenshot_20260129_162206.png) | ![Upcoming](https://i.postimg.cc/P5FWNbpf/Screenshot_20260129_162148.png) | ![Shift planner](https://i.postimg.cc/4xF6nv7f/Screenshot_20260129_192009.png) |

---

## ✨ Key Features

### 📅 Core functionality
The app serves as a central hub for your daily life, supporting multiple entry types:
* **Events:** Standard time-based appointments with physical or virtual location support.
* **Tasks:** To-do items with interactive checkboxes and completion states.
* **Notes:** Rich text entries supporting **Bold**, *Italic*, <u>Underline</u>, and ~~Strikethrough~~. Notes feature a smart "show more" toggle to keep the daily view clean.
* **Routines:** A powerful recurring engine that allows for entries to repeat every $X$ days, weeks, or months with optional end dates.

### ☕ Aftercup integration
Built-in support for the (hungarian) Aftercup coffee blog (can be toggled in/out in settings):
* **Blog Entries:** View the latest coffee culture posts directly in your timeline.
* **Aftercup Brief:** A dedicated daily summary popup combining your scheduled agenda, geolocation-based weather reports, and blog updates.

### 💭 Dream journal
A private space to record your dreams. Associate entries with specific years to track your subconscious journey over time.

---

## ⌨️ QWERTY keyboard support

Designed for devices with physical keyboards. Control the entire app without touching the screen:

| Key | Action |
| :--- | :--- |
| <kbd>T</kbd> / <kbd>Y</kbd> / <kbd>N</kbd> | Jump to **T**omorrow, **Y**esterday, or **N**ow (Today) |
| <kbd>C</kbd> | Open **C**alendar date picker |
| <kbd>H</kbd> | Access the Shift **H**eader (Planner) |
| <kbd>P</kbd> / <kbd>D</kbd> / <kbd>U</kbd> / <kbd>I</kbd> | Quick access: **P**ocket, **D**reams, **U**pcoming, and **I**nbox (History) |
| <kbd>A</kbd> / <kbd>S</kbd> | Open **A**ftercup brief or Account **S**ettings |
| <kbd>⌫</kbd> | Close active popups or return to homescreen |

> **🔢 Quick Jump to Day:** Simply type a number (<kbd>1</kbd>-<kbd>3</kbd><kbd>1</kbd>) on the home screen. A mini popup appears for two-digit entry. After 2.5 seconds, the calendar automatically jumps to that day.

---

## 🛠️ Professional tools

* **Symbol-based Shift Planner:** Track work cycles using high-visibility icons for morning, afternoon, night, resting, holiday, and sick pay.
* **Print Week Overview:** Generate a clean, printer-friendly summary of your current week.
* **Cloud Sync & Backup:** Securely backup to the cloud (Aftercup Account) or perform manual local exports/restores via `.json` files for total data sovereignty.

---

## 🚀 Technical Details

* **Version:** `v0.1.1` (MP01 build)
* **Platform:** Optimized for Android/Web (Minimal Phone hardware)
* **Storage:** `LocalStorage` persistence with optional cloud sync via Google Apps Script API.
* **Notifications:** Service Worker-based daily summary with Weather API integration.

---

## 📥 Installation

1. Download the latest **APK** from the release badge below.
2. Install on your **Minimal Phone**.
3. *(Optional)* Log in to enable automatic cloud synchronization across devices.

[![Download](https://img.shields.io/badge/↓_Download-v0.1-000000?style=for-the-badge&logoColor=white&labelColor=black&color=white)](https://dl.dropbox.com/scl/fi/msh96pbswouo12808aoks/0.1.apk?rlkey=pou4rtfszm7he5ek85v9rz7ro&st=e92k96d2)

[![Normal version on Google Play](https://img.shields.io/badge/Get_it_on-Google_Play-000000?style=for-the-badge&logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.aftercup.calendar&hl=en)
