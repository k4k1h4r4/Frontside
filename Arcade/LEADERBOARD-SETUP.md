# Arcade leaderboards

1. Run `leaderboard.sql` in your Supabase project's SQL Editor. This creates one table (`public.arcade_scores`) and two RPC functions.
2. The project URL and publishable key are already configured in `leaderboard.js`. Update its `config` object if changing projects. Never use a secret/service-role key in browser files.
3. Publish the four updated HTML pages plus `leaderboard.js` and `leaderboard.css` together.

All UI, name storage, submission, and retry behavior lives in `leaderboard.js`; styling lives in `leaderboard.css`. Each game calls `ArcadeLeaderboard.complete(game, score)` once per completed run. The arcade page and game headers also offer a High Scores button.

The table retains completed runs so weekly best scores remain independent of all-time best scores. The database selects each normalized name's highest score *before* limiting each board to five names. Names ignore capitalization and repeated/leading/trailing whitespace. Two people using the same name share one leaderboard identity. Ties go to the score recorded first, then the run UUID for deterministic ordering. Scores use one decimal place for Perfect Pour and integers for the other games.

Weeks begin Sunday at midnight in `America/Denver`, ending at the next Sunday midnight. The SQL uses local calendar boundaries so daylight-saving changes are respected. Change the timezone in the single SQL function if desired.

The name is saved in localStorage, shared by all four pages on the same origin. Private browsing, clearing site data, or blocked browser storage may require entering it again. Scores that cannot be submitted are queued locally and retried every 30 seconds, on reconnect, and on the next arcade page load. UUIDs make retries idempotent. Queued runs are dated when the server first accepts them; a retry across a week boundary belongs to the new week. Closing the page before entering a name leaves that run pending until a name is saved on a later completed game. Without browser storage, pending runs and the name only survive in the current page.

The table has RLS enabled and no direct browser read/write permissions. Narrow RPC functions accept validated scores and expose only the Top 5 for each period. See [Supabase database function security](https://supabase.com/docs/guides/database/functions). This is a casual, name-based leaderboard: names are not authenticated, and browser-generated scores can be spoofed. Verified competition would require server-authoritative gameplay and player accounts.

Until credentials are configured and the SQL is applied, games remain playable and completed scores queue locally. The repository changes alone do not create the live Supabase table.
