# MHERO · Unity and Unreal quick guide

## How the devices share data

We use **SQLite**, stored in `data/mhero.sqlite` on the host Mac. The Node.js/Express server reads and writes this database for every tablet, game and leaderboard screen.

**Tablet → host Mac/API + SQLite ← Unity or Unreal game**

Connect all devices to the same venue router and the same host address. Internet is not required. Keep the host Mac and server running. Devices refresh through API requests; the games check for a match about once a second, and the browser leaderboards refresh every four seconds.

Each venue currently has its own database. **There is no cloud sync or automatic sync between venues.** A disconnected device cannot reach the shared data until it reconnects. Games should save unsent scores locally and retry them.

## 1. Get two settings from the event operator

- **Server URL:** the address printed when the host app starts, such as `http://192.168.1.100:3000`. Use the actual address; `localhost` only works on the host Mac itself.
- **Station game key:** created in **Admin → Stations → Create game key**. Use one key and one running game instance per station. Keep real keys out of source control.

The operator also pairs the registration tablet to that station. The game must already be open on its waiting screen before a player presses Start.

## 2. Connect the game

### Unity

1. Copy [MHeroConnector.cs](../integrations/MHeroConnector.cs) into your Unity project.
2. Add it to one persistent GameObject. Keep exactly one instance across scene changes.
3. Set `ServerUrl` and `GameKey`. Allow local HTTP in the project settings where required.
4. Subscribe to its events before its first poll:

| Event/action | Connect it to |
| --- | --- |
| `MatchReady` | Read `match.players`, show names as plain text, then start your round once. Use `slot` to identify Player 1/2. |
| Round ends | Call `SubmitScores(score)` or `SubmitScores(playerOneScore, playerTwoScore)` in slot order. |
| `ResultsSaved` | Return to the waiting screen after the server confirms saving. |
| `MatchCancelled` | Stop the current round and return to the waiting screen. |

The example polls, acknowledges starts and saves pending scores to disk for retries. Your team wires the actual gameplay, HUD and visible error handling.

### Unreal

1. Copy [MHeroHttp.h](../integrations/MHeroHttp.h) into your C++ project.
2. Add `HTTP`, `Json` and `JsonUtilities` to your module's `Build.cs` dependencies.
3. Keep the connector in a GameInstance subsystem so it survives map changes.
4. Implement the request flow below, broadcasting events to your Blueprint/gameplay logic. Save pending results using SaveGame or file storage before sending.

The Unreal file is an HTTP helper. Your team implements polling, match tracking, result persistence, retries and gameplay events. Both engine examples need compilation and testing in your actual projects.

## 3. Request flow for both engines

Use the server URL followed by `/api/game`. Send these headers on every game request:

```text
Authorization: Bearer YOUR_STATION_GAME_KEY
Content-Type: application/json
```

| Step | Request | What to do |
| --- | --- | --- |
| Wait for player | `POST /poll` with `{}` | Check once a second, one request at a time, with a five-second timeout. `match: null` means idle. |
| Start | `POST /matches/MATCH_ID/start` with `{}` | For a new pending match, remember its ID and players. Start gameplay once, after HTTP 200. |
| Finish | `POST /matches/MATCH_ID/results` | Send the scores using the participant IDs received in the match. |
| Game failure | `POST /matches/MATCH_ID/fail` | Send `{"message":"Controller disconnected"}` to free the station without awarding points. |

Example results body for one player:

```json
{
  "results": [
    { "participantId": "ID_FROM_MATCH", "score": 1250 }
  ]
}
```

For two players, include both participant IDs and scores in the same `results` array. Higher scores win. Scores must be finite numbers from 0 to 1,000,000,000,000.

Keep polling during gameplay and handle staff cancellation. Repeated polls return the same active match: **never restart a round just because its match appears again.** After a game restart, resume a saved running round or report failure; do not replay an unknown running match.

Save the exact match ID and scores to disk before submission. Retry the same payload after timeouts, connection failures or server errors. Clear it only after HTTP 200. A 400/401/403/404/409 response needs investigation; a 409 can mean cancellation or conflicting results. Preserve rejected score evidence for staff.

## 4. Show the leaderboard and test

For an in-game leaderboard, request `GET /api/leaderboard/drive?period=all` from the server URL. Replace `drive` with `road` or `power` as needed; the two-player station also uses `drive`. Refresh at most once every four seconds while visible. Display the returned `entries` using `rank`, `name` and `score`.

Before delivery, test: register → tablet Start → correct names → one round → scores saved → leaderboard updated. Also test two players where applicable, Wi-Fi reconnection, staff cancellation and a game restart. Use a separate test database for rehearsals.

Full request/response examples and error handling: [GAME-INTEGRATION.md](GAME-INTEGRATION.md). Venue setup: [SETUP.md](SETUP.md).
