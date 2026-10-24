# MHERO game connection contract · v1

This API connects the registration tablets to the existing Unity and Unreal games. It does not supply or alter the games themselves. The game must already be running in an idle/attract screen. The connector sets the received names on the HUD and starts a round when the tablet requests it.

## Connection

- Base URL: `http://HOST_MAC_IP:3000/api/game`.
- All game requests use `Authorization: Bearer STATION_GAME_KEY`.
- POST requests use `Content-Type: application/json`.
- Create the station key in Admin → Stations. Never embed it in a browser URL or client-side registration app. Keep real keys out of source control.
- Poll every second, with one request in flight at a time and a 5-second request timeout. A station is considered online when it polled within 12 seconds.
- Only one game instance should use a station's key. The same key is not a multi-worker queue; two game processes could both consume the same match.
- `drive`, `road`, `power` are single-player station IDs. `duo` is the two-player Drive to Dominate station. Both driving stations use game ID `drive`.

## 1. Poll for the current match

`POST /poll` with `{}`. The response is:

```json
{
  "stationId": "duo",
  "pollAfterMs": 1000,
  "match": {
    "id": "server-generated-match-uuid",
    "stationId": "duo",
    "gameId": "drive",
    "status": "pending",
    "createdAt": "2026-10-22T12:00:00.000Z",
    "startedAt": null,
    "finishedAt": null,
    "error": null,
    "players": [
      {"id": "participant-uuid-1", "slot": 1, "name": "Player One", "score": null},
      {"id": "participant-uuid-2", "slot": 2, "name": "Player Two", "score": null}
    ]
  }
}
```

`match` is `null` when the station is idle. A pending or running match is returned on every poll until finished or cancelled. The stable match ID is the deduplication key; **do not launch a new round on every poll**. A single-player match has one player. Sort/use players by `slot`; use IDs for scores, not names. Names can contain Unicode and must be treated as plain text, never rich-text markup or code. No participant email or phone is sent to the game.

## 2. Acknowledge and start once

Prepare the player HUD and remember the match ID, then call:

`POST /matches/MATCH_ID/start` with `{}`.

A 200 response returns `{ "match": ... }` with `status: "running"`. Only after a successful acknowledgement should the connector trigger the game's start-round action. Repeating `/start` for the same running match is safe; it does not create another attempt. Repeating it must not restart gameplay locally.

If the acknowledgement response is lost, retain your candidate ID and retry. A poll may now show `running`; if it is your prepared candidate, finish the acknowledgement/recovery sequence. A process that restarts and finds an unknown running match must either resume its saved gameplay state or fail that match; never silently replay it as a fresh round.

## 3. Submit final scores

`POST /matches/MATCH_ID/results`:

```json
{
  "results": [
    {"participantId": "participant-uuid-1", "score": 1250},
    {"participantId": "participant-uuid-2", "score": 1490}
  ]
}
```

Submit exactly one finite number for each match participant. Scores may be fractional, from 0 through 1,000,000,000,000. Both players' scores must be submitted in one request for a two-player match. The engine defines how points are earned; **higher wins for every game**.

The server saves all scores and completes the match atomically. Public leaderboards update within four seconds. Only each player's highest completed score is ranked; every attempt is retained. Equal scores share a rank. Earlier achievement determines display order within a tie.

Persist the exact match ID and result payload on disk before sending. Retry that exact payload on connection failures, timeouts and 5xx errors. Identical retries after completion return 200. Changed scores after completion return 409. Never generate a new match ID or recompute a different result just to retry delivery.

## 4. Cancellation and failure

Continue polling during gameplay. `GET /matches/MATCH_ID` returns the status of a known match if needed.

If the active match disappears from `/poll`, inspect its status or stop the round and return to idle. A match cancelled by staff will reject later results. If a different match arrives while your old round is still active, stop the old round before preparing the new one.

To report a game failure, use `POST /matches/MATCH_ID/fail` with:

```json
{"message":"Controller disconnected. Please ask a team member for help."}
```

This frees the station without awarding points. Staff can also cancel a pending or running match from Admin → Stations. Pending/running matches are intentionally not timed out automatically: the games can have different durations, and a temporary network interruption must not discard a valid score.

## Status and errors

| HTTP | Meaning | Action |
| --- | --- | --- |
| 200 | Accepted or an identical successful retry | Continue |
| 400 | Invalid score, missing player or malformed input | Fix the payload; do not discard pending evidence |
| 401 | Wrong/replaced key or disabled station | Ask staff to configure the correct key/mode |
| 403 | Match belongs to another station | Check station assignment |
| 404 | Unknown match/endpoint | Check IDs and URL |
| 409 | Invalid state or conflicting saved results | Inspect match status; do not silently change the score |
| 5xx / timeout | Temporary server/network problem | Retry with the same match ID and payload |

State transitions are `pending → running → completed`, or `pending/running → failed/cancelled`. Finished matches cannot be restarted or rescored by the game API.

## Unity implementation

`integrations/MHeroConnector.cs` is a persistent MonoBehaviour example using [UnityWebRequest](https://docs.unity.com/en-us/engine/6000.0/script-reference/unityengine/networking/unitywebrequest). It polls, acknowledges starts, retries results from a disk outbox and raises events. Configure the local URL/key at deployment time. Allow local HTTP in the project's network settings when required by your Unity version.

Subscribe before the first poll:

```csharp
connector.MatchReady += match => {
    // Use plain text on the HUD; disable rich text for attendee names.
    playerOneLabel.text = match.players[0].name;
    if (match.players.Length == 2)
        playerTwoLabel.text = match.players[1].name;
    StartYourRound();
};
connector.MatchCancelled += StopRoundAndReturnToIdle;
connector.ResultsSaved += ShowAttractScreen;

// When the game finishes, in slot order:
connector.SubmitScores(playerOneScore);                  // single player
// OR connector.SubmitScores(playerOneScore, playerTwoScore); // two player
```

Keep exactly one connector alive across scene changes. Wire cancellation and errors into your gameplay state. Handle outbox write failures visibly; do not close the round as “saved” unless `ResultsSaved` fires. The example has not been compiled inside your unprovided Unity project; adapt and validate it in your actual build.

## Unreal implementation

`integrations/MHeroHttp.h` is a small transport helper using [FHttpModule](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/HTTP/FHttpModule). Add `HTTP`, `Json` and `JsonUtilities` to the game module's Build.cs dependencies. Use a GameInstance subsystem so the connector survives map loads.

Implement this state machine in C++ or your existing Blueprint HTTP layer:

1. Timer every second → `Post(ServerUrl, GameKey, "/poll", EmptyJson, Callback)`.
2. Parse `match` and each `players` object. Cache `id`, player IDs, slots and names.
3. New pending match → prepare HUD → `/start` → after 200, broadcast a Blueprint `OnMatchReady` event once.
4. Game completion → construct `results` JSON for both slots → save an outbox with Unreal SaveGame/file storage → `/results`.
5. Clear the outbox only after 200; retry it across reconnections/restarts. Handle cancellation and 409 explicitly.
6. Restore/resume a known active match after a game restart, or `/fail` it. Never start an unknown running match from scratch.

Use weak UObject references in asynchronous callbacks and keep callbacks on the appropriate game thread for your engine version. The helper is provided for integration, not as a compiled plugin. Scene/Blueprint wiring, score calculation, persistence and actual engine build tests remain with the game developer.

## Local simulator

For rehearsal only, use a separate database (set `MHERO_DATA_DIR`) and create a test station key. Set `MHERO_SERVER` and `MHERO_GAME_KEY` in the simulator's environment, then run:

```sh
node integrations/simulator.js --confirm-test
```

It prints received player names, acknowledges each match and sends synthetic scores after about eight seconds. It is a protocol test, not a Unity/Unreal game. Never point it at a live event database. Stop it before connecting the real game.

## Acceptance test on each actual game

- Fresh registration → name appears correctly → Start begins one round.
- Returning player with formatted/international phone → same participant.
- Two-player match → correct slot/name pairing; both scores saved together.
- Double tap Start or retry requests → one match, one round, one result.
- Disconnect/reconnect Wi-Fi during play and score submission → same match recovers without duplicate points.
- Cancel from admin → game stops and does not submit accepted results afterward.
- Restart game mid-round → resume from saved state or fail clearly, never silently replay.
- Restart host → registrations and previous scores persist; connector reconnects.
- Finish with scores of zero and equal scores → correct ranking.

## Main-screen results and leaderboard

The tablet now handles registration and the Start command only. While a match runs it directs players to the main screen. A successful results submission clears the tablet for the next player; no score or leaderboard is displayed on the tablet.

Show participant names, live gameplay and final scores in the Unity/Unreal game UI. Continue to submit results through the existing authenticated endpoint so admin history and rankings remain current.

For an in-game leaderboard, request `GET /api/leaderboard/drive?period=all` (or `road` / `power`) from the host. `period=today` uses Dubai time. This read-only public endpoint returns `{gameId, period, entries: [{rank, name, score, achievedAt}]}` and contains no contact details. Poll at most once every four seconds while the board is visible. Render names as plain text, preserve the supplied rank, and use the score's actual numeric value.

Alternatively, open `/leaderboard/drive`, `/leaderboard/road` or `/leaderboard/power` in a full-screen browser on the screen Mac. The operator controls switching between that browser and the game; the registration app does not switch operating-system windows automatically.
