-- Run after enabling Cron and pg_net, and configuring the Vault secret described in README.md.
-- Live jobs poll the Keno API every 5 seconds; RNG advances on its own 30-second cadence.
-- Checking Live Keno never creates a draw: only completed API draws are applied.
-- The Vault secret must match the Edge Function BATTLESHIP_CRON_SECRET.
select cron.schedule(
  'battleship-sync-' || game_mode,
  case when game_mode='rng' then '30 seconds' else '5 seconds' end,
  format($job$
    select net.http_post(
      url := 'https://znqnnaslskjewfxcswxw.supabase.co/functions/v1/battleship',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-battleship-cron', (select decrypted_secret from vault.decrypted_secrets where name='battleship_cron_secret')
      ),
      body := %L::jsonb,
      timeout_milliseconds := 25000
    );
  $job$, jsonb_build_object('action','sync','gameMode',game_mode)::text)
)
from unnest(array['live-1','live-2','rng']) as modes(game_mode);
