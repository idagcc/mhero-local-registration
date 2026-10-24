# Verification record

Date: 22 October 2026. All test registrations and scores were created in isolated temporary databases, not the event database.

## Automated checks

Nine HTTP integration tests pass, covering:

1. Shared registration, normalized country/phone formats, duplicate prevention and limited visitor data responses.
2. Idempotent concurrent Start requests, one active match per station, station authorization, game acknowledgement and safe score retries.
3. Repeat plays, per-player best scores, equal-score rankings and separate game boards.
4. Two different participants, player slots and atomic two-player score submission.
5. Cancellation, invalid scores, cross-origin writes, single-use tablet pairing and game-key replacement.
6. Protected CSV exports, spreadsheet formula escaping and SQLite backup downloads.
7. Participant editing, venue-mode changes and tablet unpairing without losing registrations.
8. Persistence across server/database reopen and restoration from a downloaded database backup.
9. Independent venue databases and offline-game start prevention.

All application JavaScript passes syntax checks. Dependency installation audit reported no known vulnerabilities at installation time.

## Browser checks

Verified through the actual local web UI:

- Branding, game selection and first-time setup prompt.
- Tablet pairing with a one-use station code.
- Unknown phone transitions into registration while preserving the number.
- Registering a test participant, confirming their name and starting a match.
- Automatic simulator acknowledgement, score return and result display.
- Two-player venue: returning Player 1, new Player 2, one shared match and two scores.
- Leaderboard orders 1,350 above 1,200 and lists each participant once.
- Admin sign-in, counts, match history, registration search and editing.
- Country code remains visible at the start of native selector options.
- Desktop and portrait-tablet layouts visually inspected without horizontal page overflow at the observed preview sizes.

The browser's narrow viewport override did not apply consistently to background tabs; a 390px phone-sized view was not independently verified. Actual Samsung tablet/browser and event-router testing remains necessary.

## Package and remaining hardware checks

The offline package includes official Node.js 22.23.4 binaries for Apple silicon and Intel macOS. Downloaded archives were checked against Node's published SHA-256 list. The Apple silicon runtime executed locally; the Intel runtime is bundled but has not been exercised on an Intel Mac here.

The copied package was launched with a system-only PATH, without using the development machine's Node installation. Its health/config endpoints responded correctly with an uninitialized venue and all three stations. The nine integration tests also pass with the package's bundled Apple silicon runtime. Archive integrity, launcher execution permissions and exclusion of venue/test databases were verified.

No actual Unity/Unreal project or compiled game was supplied. The HTTP contract was exercised with a simulator. The Unity example and Unreal transport helper have not been compiled in the user's projects; developers must integrate the actual start-round, player-name HUD and score logic, and run the acceptance checks in GAME-INTEGRATION.md.

The production venue is intentionally uninitialized so the operator can choose the location mode and create their own credentials. There is no default production password and no seeded attendee or score data.

## Tablet simplification - 23 October 2026

The tablet now handles registration/sign-in, participant confirmation and Start game, then directs players to the main screen. Scores and leaderboard links are removed from tablet views. A completed match immediately returns to a blank registration form. A separate browser leaderboard remains available for the main screen.

The exact MHERO / Al Ghurair vector artwork from the supplied logo lockup replaces the previous text partner label in public and admin headers.

The nine HTTP integration tests and JavaScript syntax checks pass after the change. Browser checks on an isolated test venue confirmed new single-player registration, name confirmation, a real start request, game acknowledgement, the main-screen prompt and automatic reset without tablet scores. The shared two-player flow confirmed returning Player 1, new Player 2, one start command containing both names and automatic reset to Player 1. The separate main-screen leaderboard displayed both returned scores in descending order. Tablet portrait and main-screen layouts were visually inspected; the main-screen browser reported no errors or warnings.

These browser checks use a game simulator. The Unity/Unreal projects still need their developers to connect the provided interface to actual game actions and the screen UI.

## Mac source checkout - 24 October 2026

Added source-checkout setup instructions, a Node version file for nvm, LF line endings for Mac launchers, and a launcher preflight check for Node.js 22.13+ with built-in SQLite. Venue databases, environment files, installed dependencies and bundled runtimes are excluded from Git.

All nine HTTP integration tests and application JavaScript syntax checks pass. The launcher also passes zsh syntax validation.

A fresh temporary copy of the source installed its dependencies with `npm ci` and launched successfully on the development Mac using the installed Node runtime. The original folder also launched using the bundled Apple silicon runtime. Both launch checks used isolated temporary databases, started the executable launcher from a different working directory, and verified the health, configuration, admin, station and leaderboard endpoints. The source-copy check included spaces in the folder path. Intel hardware and actual games/tablets still require testing on the intended equipment.
