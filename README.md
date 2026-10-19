# Hack · Curling shot tracker

Four-player curling game entry, team performance charts, per-game dashboards, spreadsheet import, and YouTube shot review. React/TypeScript frontend, Node server, and optional PostgreSQL shared storage.

## Railway deployment and accounts

1. Connect Railway to `anaugler123/shot_tracker`, branch `main`. The included Dockerfile and `railway.toml` build and start the app.
2. Add a **PostgreSQL** service to the Railway project. In the **app service** variables, add a reference named `DATABASE_URL` pointing to the PostgreSQL service's `DATABASE_URL` (for a service named Postgres, Railway's reference is `${{Postgres.DATABASE_URL}}`). Prefer the private network connection when both services are in the same project. Keep this value on the server; never use a `VITE_` variable for credentials.
3. Add a long random `SETUP_TOKEN` in the app service's variables. Store it securely. This token allows creation of the **first coach account only**; do not put it in Git or send it in chat.
4. Deploy/redeploy the app. Startup applies pending SQL migrations automatically and `/healthz` verifies database connectivity. Generate a public HTTPS domain under **Settings → Networking**.
5. Open the site. Enter the setup token, name, email and a password of at least 12 characters to create the first coach. You may remove `SETUP_TOKEN` from Railway after the account is created. It cannot create more coaches once a user exists.
6. Use the team selector in the sidebar and **Manage teams** to rename the initial team or create another team. In **Team accounts**, coaches create single-use invitations for the selected team. Share the generated link with the intended person. It expires after 7 days. Existing users join another team with their existing password; new users create an account. No email is sent automatically.

**Coaches** can edit shared games, rename their teams, create teams, import data, and invite accounts. **Players** can view their teams' games, charts, and videos; API writes are denied. Membership and roles are per team, so a coach on one team may be a player on another. Passwords are salted and hashed with scrypt. Sessions use opaque, hashed database tokens and HttpOnly/SameSite cookies (Secure on Railway HTTPS). Invitations and first-account setup are transactional. Public self-registration is disabled. This version has no password-reset email or account-removal UI; keep access to a coach account.

Without `DATABASE_URL`, the app remains in local-device mode and requires no login. This is useful for local development or trying the interface. Data in that mode is not shared between browsers.

## SQL and migrations

- [db/migrations/001_initial.sql](db/migrations/001_initial.sql) defines users, sessions, invitations, games, shots and end scores, plus `player_performance` and `game_results` views.
- [db/migrations/002_teams.sql](db/migrations/002_teams.sql) adds teams and per-team memberships, sessions, invitations, games, shots and summaries. Existing accounts and games move into the initial team without resetting revisions or changing passwords. Game IDs, shot identities and revision checks are scoped to each team.
- Games retain metadata and a revision counter; individual shots and end scores are stored in relational tables with score/range constraints and foreign keys.
- [db/database.mjs](db/database.mjs) applies migrations under a transaction/advisory lock. Applied versions are recorded in `schema_migrations`. Repeated startup is safe. Future schema changes should be new numbered migrations, rather than edits to an applied migration.
- You can run the same migrations explicitly with `DATABASE_URL` set using `npm run db:migrate`.
- Database connection and certificate settings come from the PostgreSQL connection string and standard `pg` environment settings. TLS verification is not disabled. Use the appropriate Railway connection URL and trusted CA configuration for your database.

Enable PostgreSQL backups in Railway. Exporting JSON from the app is an additional device backup, not a substitute for database backups.

## Existing browser data, offline use, and sync

Existing browser games are preserved when accounts/database storage are enabled. Sign in as a coach on the **same browser and hostname** where the games were recorded, then use **Upload device games** if older games have not yet been uploaded. Browser data is scoped to the hostname: if you changed domains, export a backup from the old domain and restore it on the new one before uploading. Labeled example games are not uploaded automatically. Spreadsheet imports and newly created real games are queued for sharing.

Local saves and pending edits are stored together in one browser-storage envelope. Coaches can continue recording offline after signing in and loading the production app at least once. Pending edits sync when the connection returns; the header distinguishes local saving from database sync. Team records refresh while online. A second device must be signed in and online to receive changes.

Game-level revisions prevent silent overwrites. If another device changes the same game, both versions are retained and **Sync conflict** offers **Use database version** or **Keep and upload my version**. These choices select an entire game version; automatic field-by-field merging is not implemented. Changes received while an editor is open also require review rather than silently replacing its data. Another tab changing the device cache blocks stale saves until reload.

Clearing browser data removes unsynced work. Export backups regularly. JSON restore adds missing games without overwriting existing corrections. The sidebar team selector limits games, dashboards, invitations and sync to the selected team. Cached games and pending offline edits from other teams are retained separately; switching teams never uploads them into the selected team. JSON exports contain only the selected team's games. Restoring into a team explicitly assigns the imported games to that team.

## Game entry and dashboards

- Games are grouped by event, with event filters and newest/oldest/name sorting.
- One **Dashboard** sidebar tab provides **Season**, **Event**, and **Game** levels. Season and event views show shooting by game, player shooting, deficiencies and shot types, plus tables that drill into events and games. Sample sizes accompany percentages.
- Seasons run July 1–June 30. Choose a season, all seasons, or a custom date range; undated games can be included explicitly when filtering dates. Date and event filters are remembered per team in the current browser session.
- The game level shows result, scoreboard/hammer, shooting by end, player comparison, shot types, and flagged/noted shots linked to video review. A game card or scoring toolbar opens that game directly.
- Live scoring keeps turn/target, draw or hit, execution, independent 0–5 score, deficiency, notes, review flags and timestamps. Corrections are available through the shot log. Unscored picks/burnt rocks/throw-throughs stay unscored.
- After a new eighth shot of an end, the app prompts for the end score. Choose the scoring team and points, or **Blank end**; no “not played” checkbox is required. Save advances to the next end. Numeric entry is also available. **Clear score** removes an incorrectly entered score. Null scores remain distinct from a played 0–0 blank.
- 8- and 10-end games, plus one extra end, are supported. Finishing a game opens its dashboard. Hammer carries through blank ends. Scoreboard analysis counts recorded positions (leading, or tied with hammer), without extrapolating hypothetical unplayed ends as the workbook does.

## Imports and video

The supplied NextGen Classic sample contains five games and 306 numeric scores. It is labeled example data; one malformed date remains unset. Remove the bundled sample before sharing outside the team if its contents should not be public: frontend assets themselves are not access-controlled, while database APIs require authentication.

Workbook import supports the supplied Details, Game 1–15 and Scoreboard Analysis template. Preview dates, player assignments, completed ends and starting hammer before saving. Duplicate imports are skipped. Per-game raw scoreboard entries take priority over cached formulas, because ExcelJS can omit zero-valued formula caches. Missing scores are never converted into zero-shot scores. Spreadsheet formulas and document instructions are not executed. Files are parsed in the browser; only confirmed game records are synced.

Video review keeps one YouTube player loaded beside the shot list. Use **Capture time, save & next**, manual `m:ss`/`h:mm:ss`, player/end/flag/missing-timestamp filters, and 0–15 second pre-roll. Notes/review flags are editable by coaches. Unsaved edits prompt before switching shots. YouTube playback needs internet and depends on the stream's embedding permissions. API integration is browser-tested with a mocked player; real stream availability is external.

## Local development

Use Node.js 24 (`.nvmrc`).

```sh
npm ci
npm run dev
```

In the cloud workspace, use `npm ci --cache /workspace/.npm` if the home directory is read-only. The Vite server proxies `/api` to the Node server on port 3000. To work with PostgreSQL, set `DATABASE_URL` and `SETUP_TOKEN` in the server environment and run `npm start` in another terminal. Do not commit environment files.

Production startup:

```sh
npm run build
npm start
```

The Node server listens on `0.0.0.0` using `PORT` (default 3000). Assets and service worker are generated by Vite. Offline app startup requires a successful first production visit and cache completion; it is not enabled in Vite development mode. iPad offline use requires an accessible HTTPS deployment. `/api` responses are network-only and are not service-worker cached.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Set `CHROMIUM_PATH=/usr/bin/chromium` when a compatible system browser is available. Set `NEXTGEN_WORKBOOK` to the uploaded NextGen workbook path to include the real workbook browser test. Otherwise that test is explicitly skipped.

For database/API and full coach/player browser checks, set **`TEST_DATABASE_URL` to a dedicated scratch PostgreSQL database**. Tests create uniquely named schemas and remove those schemas afterward; they do not truncate existing application tables. Without the variable, database-specific tests are explicitly skipped. Integration coverage includes fresh and existing-data migrations, account setup, invitations for new and existing accounts, per-team role enforcement and data isolation (including identical game IDs), team renaming/switching, session logout, input validation, concurrent revision conflicts, SQL summaries, offline browser edits, and sharing between separate coach/player browser contexts.

Other tests cover importer edge cases, zero/missing scores, shot order, hammer, percentages, timestamps, video URL handling/player lifecycle, backups, end transitions, dashboards, event grouping and tablet layout. ExcelJS's UUID dependency is overridden to the patched compatible v11 release. Original workbooks and credentials are not committed.
