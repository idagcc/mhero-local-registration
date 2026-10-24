# Event setup and daily operation

## 1. Host Mac

Copy the complete app folder onto the Mac that will hold the venue's registrations. Double-click **Start MHERO.command** and leave the window running. The same Mac may also run a game.

If you cloned the source repository, first follow [Test from a Git checkout on a Mac](../README.md#test-from-a-git-checkout-on-a-mac) to install Node and dependencies. The complete offline package already includes both.

The start window prints:

```text
Host Mac: http://localhost:3000
Admin: http://localhost:3000/admin
Tablet / game URL: http://192.168.x.x:3000
```

Use the actual address it prints, not the sample address. If multiple network addresses appear, use the one on your event router. Reserve this host address in the router so it does not change each day. The router must allow devices to communicate; guest/client isolation prevents this. Permit incoming connections for the Node runtime when prompted by the Mac firewall; do not turn the firewall off globally.

Create the venue and admin credentials on the host Mac at `http://localhost:3000/admin`. First-time setup is restricted to the host Mac. After setup, the admin URL also works from other devices on the local network, with credentials.

## 2. Venue modes

| Mode | Enabled stations | Players per match |
| --- | --- | --- |
| Three stations | Drive to Dominate, Own the Road, Unleash the Power | One |
| One station | Drive to Dominate | Two |

Both use the exact same app. At the second venue, start a fresh extracted copy and select the one-station mode. Data stays separate. Changing mode later preserves history, and requires active matches to be finished or cancelled first.

## 3. Pair Samsung tablets

In Chrome on each tablet, open the host Mac's network address and choose the assigned game. From Admin → Stations, click **Pair tablet** for that same station. Enter the displayed eight-character code on the tablet.

Codes expire after ten minutes and can be used once. The tablet remains paired through browser restarts for up to 90 days unless its cookies are cleared or staff unpair it. Use a normal Chrome session, not Incognito. Bookmark the station URL or add it to the home screen. Pairing a different station replaces the previous station assignment for that browser.

| Station | Path |
| --- | --- |
| Drive to Dominate | `/station/drive` |
| Own the Road | `/station/road` |
| Unleash the Power | `/station/power` |
| Two-player Drive to Dominate | `/station/duo` |

For example: `http://192.168.x.x:3000/station/drive` using the actual host address.

The layout adapts to portrait and landscape. Use up-to-date Chrome. Keep tablets charged, set appropriate display sleep settings, and use Android's screen pinning/kiosk configuration if required by your event operations.

## 4. Connect each game

Admin → Stations → **Create game key**. Save the key when it is displayed; it cannot be read back later. Give the developer the key and host URL. Each station has a separate key. Replacing a key invalidates the previous one and is blocked while that station has an active match.

The developer follows [GAME-INTEGRATION.md](GAME-INTEGRATION.md). Open the integrated game on its assigned Mac before admitting players. The tablet shows **Game connected** once the game is polling. Start remains disabled while it is offline.

There is no inbound game-side port to configure: games make HTTP requests to the host. Tablet and game traffic share port 3000.

## 5. Visitor flow

1. New players select **I'm new here**, then enter name, email, country and phone. UAE +971 is the default; change it in admin settings if needed.
2. Returning players enter their phone using the same country/number. A registration is shared across all three games at that venue.
3. For a two-player match, add Player 1 and Player 2 on the same tablet. They must have distinct registered phone numbers.
4. Press **Start game**. The game receives player IDs, names and slots and begins one match.
5. The tablet confirms the connection and directs players to the main screen. It returns to registration as soon as the match finishes. Scores and leaderboards are shown on the main screen only.

### Main-screen leaderboard

Open the appropriate leaderboard in a browser on the Mac connected to the main screen. Use browser full-screen mode for the event. These pages are separate from the tablet registration flow:

| Game | Main-screen path |
| --- | --- |
| Drive to Dominate (including the two-player venue) | `/leaderboard/drive` |
| Own the Road | `/leaderboard/road` |
| Unleash the Power | `/leaderboard/power` |

Use the host address, for example `http://192.168.x.x:3000/leaderboard/drive`. Admin also has **Open screen leaderboard**. A separate browser leaderboard does not automatically replace a full-screen Unity/Unreal game. If the leaderboard should appear inside the game or on its attract/results screen, the developer uses the leaderboard API described in GAME-INTEGRATION.md.

Registration input is cleared after two minutes without interaction. No phone or email is shown on public leaderboards. One active match is allowed per station. Multiple plays are welcome; the best score is used for rankings, and all attempts remain in the export. For tied scores, players share a rank; the earlier best score is listed first.

## 6. Admin and exports

Use `/admin` and your credentials. Admin sessions last 12 hours. The admin panel supports:

- Counts of registrations, completed matches and active matches.
- Search and edit registration details. Phone numbers remain unique.
- Recent play history and a full CSV export, with one row per player per match.
- Pairing and unpairing tablets, creating/replacing game keys, and cancelling stuck matches.
- Venue setup, default country, admin password changes and database download.

All times in the admin interface and “Today” leaderboard use Dubai time. Export timestamps are ISO UTC. CSV cells that could be interpreted as formulas are prefixed with an apostrophe; this also preserves international phone numbers as text.

## 7. Daily backup and shutdown

Download a database backup from Settings & backup at the end of each event day. The downloaded snapshot is safe to copy while the server is running. Store backups securely; they contain attendee details and authentication records.

To stop, press Control+C in the start window. Avoid moving the active database files or force-quitting while saving scores. Restart using the same folder to preserve registrations and scores.

To restore:

1. Stop the app completely.
2. Rename the existing `data` folder to a dated archive so it can be recovered.
3. Create a fresh `data` folder and copy the downloaded backup into it as `mhero.sqlite`.
4. Start the app. Existing admin credentials and game keys are restored with the database.
5. Re-pair tablets or replace keys if the restored backup is being moved to different devices. Keep an isolated venue separate from another venue's data.

## Troubleshooting

**Tablet cannot open the app:** confirm the host app is running; both devices are on the same router; the network address is correct; the host firewall permits the app; router client isolation is off. Use the IP address, not `localhost`, on the tablet.

**Start is disabled:** the game connector has not polled recently. Check the game's host URL, key and network. The game build must contain the integration and be open.

**Starting takes too long:** the start request is saved, but the game has not acknowledged it. Check the game; staff can cancel the match before trying again. Repeated button presses do not create duplicate matches.

**Game stops mid-match:** the connector should report a failure, or staff should cancel the match. Never fabricate a score to clear the station.

**Score did not appear:** the game should retry the exact same result for the same match ID after a connection interruption. The Unity example persists unsent results. Do not create a new match to retry old scores.

**Port already in use:** another app instance may already be running. Use its window instead. Only one instance should serve a venue database.

**Password forgotten:** there is no public reset endpoint or universal password. Preserve the database and contact your technical administrator for a controlled local reset.

**macOS asks for local network access:** grant access to the reviewed game/runtime as required for your venue network. Actual firewall, router, engine and tablet behaviour must be checked on the event hardware before opening.
