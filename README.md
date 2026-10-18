# KAI Money Manager — installable PWA

A static, mobile-first personal finance app. Records are stored locally in the browser with IndexedDB. There is no paid AI API, analytics service, bank connection, or account login.

## Features implemented

- Income and expense entries: create, edit, delete, category, amount, and date.
- Local persistence with IndexedDB.
- Dashboard totals and current-month income/spending chart.
- Current-month spending by category.
- Monthly budget planner with remaining-budget/over-budget calculation.
- Savings goals with target amount and optional target date.
- Separate savings-goal contribution ledger and contribution history.
- Calculator.
- JSON export and import backup.
- Delete-all-data control with confirmation.
- Service worker app-shell cache for offline launch after the first successful load.
- PWA manifest and app icon.

## Important limits

- The app is not deployed by this ZIP. To install as a PWA on iPhone, serve it from an HTTPS website.
- All data is local to the browser profile/device. It does not sync between iPhone and PC.
- Safari/browser data deletion can erase the database. Export JSON backups regularly.
- The contribution ledger is separate from income/expense records. It does not automatically subtract contributions from the recorded net balance, because moving money into savings is not necessarily an expense.
- The dashboard's overall income/expense totals are lifetime totals; the chart and planner use the selected/current month as labelled.
- No live GPT assistant is included. Simple rule-based budget messages are generated locally.
- SVG PWA icons are supported by modern browsers, but if an install prompt or icon is not accepted by a target browser, provide PNG icons and update the manifest.

## Run on Windows PC for testing

1. Install Python 3 from https://www.python.org/downloads/windows/ if not already installed. During setup, select **Add Python to PATH**.
2. Extract the ZIP to a folder, e.g. `C:\KAI-Money-Manager`.
3. Open that folder in File Explorer.
4. Click the address bar, type `cmd`, and press Enter.
5. Run:

   ```bat
   py -m http.server 8000
   ```

6. On the PC, open `http://localhost:8000`.
7. Test adding/editing/deleting entries, goals, contributions, backup export/import, then refresh. IndexedDB records should remain in that browser.

Keep the command window open while testing. Press `Ctrl+C` to stop the server.

## Install on iPhone: recommended static HTTPS hosting

A Progressive Web App needs HTTPS for service workers and Home Screen behavior. `localhost` on your Windows PC is not the same as localhost on the iPhone. The easiest route is static hosting such as GitHub Pages.

1. Create/sign in to a GitHub account.
2. Create a new repository, e.g. `kai-money-manager`. If you want to keep the source private, use a private repository only if your hosting plan supports Pages for it; otherwise, remember that source files on a public repository are visible to everyone. The finance records are not in the source repository; they remain in the browser's IndexedDB.
3. Upload the contents of this ZIP (the files inside the folder, not the ZIP itself) to the repository root.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**, select the `main` branch and `/(root)`, then save.
6. Wait for GitHub Pages to show the published HTTPS URL, typically `https://YOUR-USERNAME.github.io/kai-money-manager/`.
7. Open that exact HTTPS URL in Safari on your iPhone and wait for it to load fully once while online.
8. In Safari, tap **Share** → **Add to Home Screen**. If shown, enable **Open as Web App**, then tap **Add**.
9. Launch KAI Money from the Home Screen. Add a test entry, export a backup, and test airplane mode after the first load. Keep a backup before entering important data.

The hosting provider serves the app code, but this app does not upload financial entries. A static host does not itself give you cloud sync.

## Security / privacy notes

- Avoid using the app on a shared device or shared browser profile.
- Export backups to a location you control; a downloaded JSON file contains your financial records and should be treated as sensitive.
- Do not assume browser storage is a substitute for backups.
- For stronger app updates, increment `CACHE_NAME` in `sw.js` when publishing a new version so the service worker refreshes the cached app shell.
- Test the app with non-sensitive sample data before relying on it.
