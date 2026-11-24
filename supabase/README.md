# Battleship deployment

The site and Supabase backend must be released together. Deploy the backend first.

1. For a new project, run `migrations/202609300001_battleship.sql` in the Supabase SQL editor. Existing Battleship projects already have this schema.
2. Run `migrations/202611180001_battleship_modes.sql`. It preserves the original live two-ship matches and archives results from all modes.
3. Run `migrations/202611240001_live_feed_wins.sql`. It adds a `kind` column to `live_feed_posts` and posts Arcade all-time top-5 scores and Keno Bingo winners to the Live feed. Run it before deploying the function, which posts Battleship winners there. It reports whether the Arcade part was installed.
4. Deploy the function: `supabase functions deploy battleship --project-ref znqnnaslskjewfxcswxw`. The included config disables gateway JWT verification because the function validates player sessions itself.
5. Enable anonymous sign-ins if they are not already enabled.
6. Set a strong, random `BATTLESHIP_CRON_SECRET` Edge Function secret. Store the same value in Supabase Vault under `battleship_cron_secret`. Never commit the secret.
7. Enable Supabase Cron and pg_net, then run `schedule-battleship.sql` once. It creates or updates three independent named jobs: live-1 and live-2 poll every 5 seconds; RNG syncs every 30 seconds. Remove any older Battleship sync job to avoid duplicate traffic. Inspect Cron run history and pg_net responses after setup.
8. Publish the frontend through the existing GitHub Pages workflow.

See the official [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart) and [scheduled Edge Functions guide](https://supabase.com/docs/guides/functions/schedule-functions) for Cron and Vault setup.

## Behavior

- `live-1`: live Keno; eliminated when one ship sinks.
- `live-2`: live Keno; eliminated when two ships sink (default and legacy mode).
- `rng`: server-generated, unbiased 20-of-80 draws exactly 30 seconds apart from the battle start; eliminated only after all five ships sink. All clients share persisted draws.
- Every entry requires five valid, non-overlapping ships of lengths 5/4/3/3/2.
- Each mode has its own active match and upcoming lobby. The Recent Results table combines the latest 20 completed matches across all modes, showing game type, Mountain-time completion date, live game range or simulated draw count, and winner names. Older matches without gameMode are Live Keno-2 Ship. At least two captains are required. Live lobbies start on the next eligible Keno draw.
- RNG lobbies start a shared 60-second countdown when the second fleet is locked. Additional captains may join until the deadline without resetting it. Locked captains can add 60 seconds with the lobby button; each click extends the same shared deadline. Duplicate requests and version-conflict retries do not add time twice. Spectators cannot extend the countdown.
- If an RNG match is already active, the upcoming lobby gets its full 60-second countdown after that match finishes. If stale-player cleanup drops the lobby below two captains, its countdown is canceled; the next second captain starts a fresh minute.
- The first simulated draw occurs at the countdown deadline. Later draw timestamps are exactly 30 seconds apart; missed ticks are replayed once. Browser polling can display a draw a few seconds after its scheduled time. A queued lobby never consumes the remainder of the deciding draw.
- The client checks the server mode and rules version before enabling fleet entry. Deploy the backend first: the legacy server ignores gameMode and can otherwise present a live five-minute Keno match under an RNG label.
- Captains may participate in different modes independently. Within each mode, a captain with an active fleet cannot also enter its upcoming lobby.
- Lobby entries older than one hour from `joinedAt` are removed on every sync/status/join. Legacy entries without a join time fall back to lobby creation time. Active matches and archived results are preserved. Missing/invalid times are treated as stale.
- The Live Keno cron jobs only poll for actual completed API draws; their 5-second interval never generates or repeats a draw. The RNG job processes simulated draws on its separate 30-second cadence. Re-running `schedule-battleship.sql` updates the existing named jobs in place and does not require a function redeployment.
- Status requests also synchronize state, so pages recover missed ticks. Cron keeps draws and cleanup running when no browser is open. A failed live feed does not block RNG entries or draws.
- State commits use a version check; conflicting requests retry and only the winning state is persisted. Simultaneous final eliminations share a win.

## Checks

```sh
node --check battleship/live.js
node --test tests/battleship-engine.test.mjs tests/battleship-client.test.cjs
deno check supabase/functions/battleship/index.ts
deno test --allow-env tests/battleship-api.test.ts
```

The SQL migration and scheduled job need a Supabase environment for deployment verification. Local tests mock database and Keno responses; they do not change production.
