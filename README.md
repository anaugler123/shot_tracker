# Hack · Curling shot tracker

A first prototype for a four-player curling team. Built with React, TypeScript and Vite, with spreadsheet parsing on the device and a production service worker for offline use.

## Run

Use Node.js 24 (the version verified in the cloud environment). In this cloud workspace, add `--cache /workspace/.npm` to `npm ci` because the home directory is read-only.

```sh
npm ci
npm run dev
```

For production behavior, including offline startup:

```sh
npm run build
npm run preview
```

Open the development server using your host's supported preview mechanism. An iPad needs an accessible HTTPS deployment to install/cache the app; a laptop's loopback origin also supports service workers. Offline startup is available after the first successful visit and precache completion in the production build. Development mode does not install the service worker. YouTube playback requires internet access.

## What you can try

- Filter games by event and sort event groups by newest, oldest, or event name. Games are grouped under event headings.
- Browse five example games from the supplied **NextGen Classic April 2026** tracker, containing 306 numeric shot scores. Example data is labeled and can be hidden. One malformed date remains unset rather than silently corrected.
- Create an 8- or 10-end game, choose the four players and starting hammer, and record shots with automatic progression through the lineup. One extra end is supported.
- Choose turn/target, draw or hit type, execution, independent 0–5 score, and deficiency. Open **Review flag, notes & video** for optional details and unscored picks/burnt rocks/throw-throughs.
- Tap a shot in the end log to correct it. Zero scores are included in percentages; missing/unscored shots are excluded.
- Tap an end number to update the scoreboard. Explicitly distinguish a played blank end (0–0) from an unplayed/unknown end. Only one team may score in an end. Hammer carries through blank ends.
- Import `.xlsx` workbooks using the supplied tracker template. Preview dates, player names, starting hammer and completed ends before committing. Reimports skip existing games; sample versions are replaced. Imports are processed locally and do not upload the workbook.
- Filter team-wide player insights by player, event, draw/hit and turn/target. Open a matching shot in video review.
- Attach a YouTube video or livestream URL. The player stays loaded while selecting shots in the adjacent list. Use **Capture time, save & next** to timestamp successive shots without typing, or enter an `m:ss` / `h:mm:ss` bookmark manually. Filter by player, end, review flag, or missing timestamp. Previous/next controls follow the filtered list. Pre-roll is adjustable from 0–15 seconds. Shot notes and review flags are editable; switching shots prompts to save or discard unsaved edits. YouTube playback depends on stream availability and embedding permissions. Tests mock the YouTube API to verify capture, seeking, and player persistence without a live stream.
- Export and restore JSON backups. Restore adds missing games and preserves existing corrections.

## Prototype boundaries

Data is stored in this browser's local storage. Clearing browser data removes it; export backups regularly. There are **no accounts, cloud backup, cross-device synchronization, player invitations, or multi-coach collaboration** yet. Another tab changing storage blocks stale saves until reload. Storage failures are surfaced without accepting unsaved changes.

The scoreboard analysis uses **recorded score positions**: the initial state and consecutive completed ends. Advantage means leading, or tied with hammer. It shows the 70% target but does **not** reproduce the workbook's extrapolation of early finishes into hypothetical remaining ends. Missing scoreboard entries stay unknown. Inspect completed ends during import: padded trailing zeroes can be ambiguous.

Spreadsheet support is scoped to this template's Details, Game 1–15 and Scoreboard Analysis layouts. Per-game raw scoreboard entries take priority over cached formulas. ExcelJS can omit zero-valued cached formula results, so those caches alone cannot establish that an end was a played blank. Unknown category labels are retained and flagged for review. Formula expressions and embedded workbook instructions are never executed.

The example contains team data from the supplied workbook. Remove `src/sample.json` and change the first-run seed before sharing a deployment outside the team. A future release should move team data behind authenticated access.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

If Chromium is already installed, avoid a browser download:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

To include the real workbook import browser test, set `NEXTGEN_WORKBOOK` to the absolute path of `NextGen Classic April 2026.xlsx`. That test is explicitly skipped when the file is unavailable; synthetic importer tests run without personal spreadsheets.

Tests cover spreadsheet parsing, numeric zeroes, missing scores, 10-end scoreboards, hammer progression, shot order, percentages, video URL validation, timestamps, backup validation, browser scoring/correction/persistence, offline scoring/reload, tablet layout, video bookmark persistence, and backup restoration.

ExcelJS's UUID dependency is overridden to the patched compatible v11 release; its importer is loaded separately from the main interface and precached for offline use. Original `.xlsx` uploads are not committed.

## Deploy on Railway

1. Create a Railway project, choose **Deploy from GitHub repo**, and select `anaugler123/shot_tracker`, branch `main`.
2. Railway detects the included Dockerfile and `railway.toml`. The build installs the locked dependencies and creates the production app. `npm start` serves it on `0.0.0.0` using Railway's `PORT` variable; `/healthz` is the health check.
3. In the service's **Settings → Networking**, generate a public domain. Open the resulting HTTPS address on your laptop or iPad. No application secrets or database are required for this prototype.

Local production startup without Docker: `npm ci && npm run build && npm start`. Use `PORT=8080 npm start` to choose a port on macOS/Linux.

The production server serves cached versioned assets and revalidates the HTML/service worker so updates can reach installed clients. Railway hosts the interface; team records still live in each browser independently. The supplied example team data is included in the frontend and is visible to anyone who can open the deployed site. This prototype has no authentication.
