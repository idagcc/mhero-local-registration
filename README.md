# MHERO local registration

A local venue app for Samsung Android tablets and Mac game stations. One Mac hosts the database and web app. All devices connect to the same router; internet is not required during operation. Each location is independent.

## Start on a Mac

1. Extract the offline package into a writable folder, such as Documents/MHERO. Keep the whole folder together.
2. Double-click **Start MHERO.command**. Leave its window open. The launcher prevents idle sleep while the server runs.
3. On this Mac, open **http://localhost:3000/admin**. Create your admin username and password. There is no shared default password.
4. Choose **Three stations** for Drive to Dominate, Own the Road, and Unleash the Power; choose **One station** for the two-player Drive to Dominate venue.
5. Follow [the event setup guide](docs/SETUP.md) to connect the tablets and games.

If macOS blocks the downloaded launcher, use your organisation's normal software approval process; the files can also be run from Terminal after review. Do not disable Gatekeeper globally.

The offline package includes Node for both Apple silicon and Intel Macs (macOS 11 or newer) and all application dependencies. The source checkout uses a locally installed Node.js 22.13+ and `npm ci` once before `npm start`.

## Test from a Git checkout on a Mac

1. Clone the repository into a writable folder on the host Mac and open Terminal in that folder.
2. Install Node.js 22.13 or newer. If you use nvm, run `nvm install` and `nvm use`; the included `.nvmrc` selects the version used by the offline package.
3. Run `npm ci` while connected to the internet, then `npm test` and `npm run check`.
4. Double-click **Start MHERO.command** to start the server and prevent idle sleep. Alternatively, run `npm start` and keep the Mac awake through its power settings.
5. Open **http://localhost:3000/admin** on the host Mac to create the test venue and admin account. Use the network address printed at startup on other devices.

The repository contains source and local assets. The offline runtime, installed dependencies, generated packages and venue databases are excluded from Git. Install dependencies before disconnecting from the internet. Git preserves the launcher's executable permission; if you download a source ZIP instead, run `chmod +x "Start MHERO.command"` in the extracted folder before using it.

For a separate rehearsal database, start with `MHERO_DATA_DIR="$HOME/Documents/MHERO-test-data" npm start`. Restart with the same folder to retain test registrations. The game projects still need their Unity/Unreal integration before testing actual gameplay.

## What is included

- Name, email and country-aware phone registration; international phone numbers are normalized to one identity.
- Returning-player lookup by phone, with shared registration across all enabled stations at a venue.
- Tablet pairing to the assigned station; one-player and sequential two-player registration. Tablets handle registration, sign-in and Start game, then direct players to the main screen.
- Actual start requests, participant IDs/names and score submission through a station-authenticated game API.
- Separate main-screen leaderboards for the three games, outside the tablet flow. Highest score wins; only each player's best score is listed. Every attempt is retained. Ties share a rank.
- Admin login at `/admin`, registration search/edit, station status, pairing, game keys, match cancellation, CSV exports and database backup.
- All-time or today leaderboards, using Dubai time for the daily boundary.
- Local brand assets from the supplied Ember Velocity guideline and the official MHERO / Al Ghurair logo lockup. No CDN fonts, analytics or external network calls during operation.

## Game integration is required

The Unity/Unreal developers must wire the connector to their game’s start-round action, player-name display, completion and score calculation. The app cannot modify unprovided game builds. Open each game before the event and keep it on an idle/attract screen; pressing Start on the tablet then triggers a round through the connector. This app does not remotely launch a closed `.app` executable.

Start developers with the [short Unity and Unreal guide](docs/DEVELOPER-QUICKSTART.md). Give them [GAME-INTEGRATION.md](docs/GAME-INTEGRATION.md), the host address, and the station's private game key for implementation. Unity example: `integrations/MHeroConnector.cs`. Unreal transport helper: `integrations/MHeroHttp.h`. These engine examples need compilation and scene/Blueprint wiring in the actual game projects. The HTTP workflow is tested independently with a simulator.

## Data and operation

- Live database: `data/mhero.sqlite`, plus SQLite `-wal` and `-shm` files while running.
- Download backups from Admin → Settings & backup. See the setup guide for restore instructions.
- Run a fresh copy at the second location. Do not copy a live data folder between isolated venues.
- Phone-only sign-in is an event convenience, not identity verification. Staff should handle profile corrections in the admin panel.
- Private router network only. The default service uses local HTTP and should not be port-forwarded to the internet. For HTTPS or an untrusted network, deploy behind a properly configured TLS reverse proxy.

## Developer commands

```sh
npm ci
npm start
npm test
npm run check
```

`PORT` overrides 3000. `MHERO_DATA_DIR` selects a different database folder; use this for isolated testing. A test simulator writes synthetic scores only when explicitly started with `--confirm-test`; never use it with live event data.

## Project map

- `server.js`, `lib/app.js`: local server, SQLite storage, authentication and API.
- `public/`: responsive visitor screens, admin workspace and local assets.
- `integrations/`: engine examples and test game simulator.
- `docs/`: venue setup, game API contract, design notes and verification evidence.
- `test/`: end-to-end HTTP integration tests against temporary databases.

## Runtime references

The storage layer uses [Node's built-in SQLite API](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html). Country codes and validation use [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js). The engine examples follow [UnityWebRequest](https://docs.unity.com/en-us/engine/6000.0/script-reference/unityengine/networking/unitywebrequest) and [Unreal FHttpModule](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/HTTP/FHttpModule).
