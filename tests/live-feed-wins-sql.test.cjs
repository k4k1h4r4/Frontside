// Run with @electric-sql/pglite available through NODE_PATH:
//   NODE_PATH=<folder with node_modules> node tests/live-feed-wins-sql.test.cjs
// Exercises supabase/migrations/202611240001_live_feed_wins.sql against stand-in
// tables shaped like the live ones, as the same roles browsers and the server use.
const {PGlite} = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');

const MIGRATION = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611240001_live_feed_wins.sql'), 'utf8');

async function setup({arcadeColumns = true} = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.live_feed_posts (
      id uuid primary key default gen_random_uuid(),
      message text not null check (char_length(message) between 1 and 280),
      created_at timestamptz not null default now());
    grant select, insert on public.live_feed_posts to anon, authenticated;
    grant all on public.live_feed_posts to service_role;
    create table public.keno_bingo_results (
      id int primary key, game_ref text, race_id bigint, players text,
      winner_names text, completed_at timestamptz);
    grant select, insert, update on public.keno_bingo_results to anon, authenticated;
    create table public.arcade_scores (
      id uuid primary key, game text not null, name text not null,
      name_key text default '', ${arcadeColumns ? 'score' : 'points'} numeric not null,
      created_at timestamptz not null default now());
  `);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // safe to re-run
  return db;
}
const posts = async (db, kind) =>
  (await db.query('select message, kind from public.live_feed_posts where kind is not distinct from $1 order by created_at, ctid', [kind])).rows;

(async () => {
  const db = await setup();
  try {
    // 1. Browsers cannot mark a post as a win; the server role can.
    await db.exec('set role anon');
    await db.query("insert into public.live_feed_posts (message, kind) values ('I won Battleship!', 'battleship-win')");
    await db.exec('set role authenticated');
    await db.query("insert into public.live_feed_posts (message, kind) values ('Me too', 'bingo-win')");
    await db.exec('set role service_role');
    await db.query("insert into public.live_feed_posts (message, kind) values ('Ann won Battleship Keno! (Live Keno · 2 ships)', 'battleship-win')");
    await db.exec('reset role');
    assert.deepEqual((await posts(db, null)).map(p => p.message), ['I won Battleship!', 'Me too']);
    assert.deepEqual((await posts(db, 'battleship-win')).map(p => p.message), ['Ann won Battleship Keno! (Live Keno · 2 ships)']);
    await db.exec('set role anon');
    await assert.rejects(() => db.query("update public.live_feed_posts set kind = 'bingo-win'"), /permission denied/);
    await db.exec('reset role');

    // 2. Keno Bingo: one post per round with winners, as several browsers save results.
    await db.exec('set role anon');
    const save = (race, ref, winners) => db.query(
      `insert into public.keno_bingo_results (id, game_ref, race_id, players, winner_names, completed_at)
       values (1, $1, $2, '[]', $3, now())
       on conflict (id) do update set game_ref = excluded.game_ref, race_id = excluded.race_id,
         players = excluded.players, winner_names = excluded.winner_names, completed_at = excluded.completed_at`,
      [ref, race, winners]);
    await save(84, 'Game #84', null);               // round without winners
    await save(85, 'Game #85', 'Lacie');            // winners: post
    await save(85, 'Game #85', 'Lacie');            // second browser, same round: no repeat
    await save(86, 'Game #86', null);               // next round, no winners
    await save(86, 'Game #86', 'Bo, Cy');           // winners appear for this round: post
    await save(87, 'Game #87', '   ');              // blank names: no post
    await db.exec('reset role');
    assert.deepEqual((await posts(db, 'bingo-win')).map(p => p.message),
      ['BINGO! Lacie won Keno Bingo on Keno Game #85.', 'BINGO! Bo, Cy won Keno Bingo on Keno Game #86.']);

    // 3. Arcade: scores that break into the all-time top 5 (one best per name).
    const score = (name, value, game = 'beer-pong') =>
      db.query('insert into public.arcade_scores (id, game, name, score) values ($1, $2, $3, $4)', [randomUUID(), game, name, value]);
    const arcade = async () => (await posts(db, 'arcade-record')).map(p => p.message);
    await score('Ann', 50);                                    // first score: #1
    for (const [n, s] of [['Bo', 40], ['Cy', 30], ['Di', 20], ['Ed', 10]]) await score(n, s);
    assert.deepEqual(await arcade(), [
      'New Beer Pong high score! Ann scored 50.',
      'Bo scored 40 in Beer Pong, #2 all-time!', 'Cy scored 30 in Beer Pong, #3 all-time!',
      'Di scored 20 in Beer Pong, #4 all-time!', 'Ed scored 10 in Beer Pong, #5 all-time!']);
    const before = (await arcade()).length;
    await score('Fay', 5);            // 6th place: no post
    await score('Gus', 10);           // ties #5: the earlier score stays ahead, no post
    await score('Bo', 35);            // not a personal best: no post
    await score('  ANN  ', 45);       // same name, lower: no post
    assert.equal((await arcade()).length, before);
    await score('fay', 25);           // Fay's new best enters at #4
    await score('ed', 60);            // Ed moves from #5 to #1
    await score('Hal', 41);           // a newcomer at #3
    assert.deepEqual((await arcade()).slice(before), [
      'fay scored 25 in Beer Pong, #4 all-time!',
      'New Beer Pong high score! ed scored 60.',
      'Hal scored 41 in Beer Pong, #3 all-time!']);
    await score('Ivy', 987.6, 'perfect-pour');
    assert.equal((await arcade()).at(-1), 'New Perfect Pour high score! Ivy scored 987.6.');
    await score('Jo', 7, 'coaster-stacking');
    assert.equal((await arcade()).at(-1), 'New Coaster Stacking high score! Jo scored 7.');

    // 4. A failed win post never blocks saving a score or a Bingo result.
    await db.exec("alter table public.live_feed_posts add constraint no_new_posts check (created_at < '2000-01-01')  not valid");
    const scoresBefore = Number((await db.query('select count(*) as n from public.arcade_scores')).rows[0].n);
    await score('Kim', 999);
    await db.exec('set role anon');
    await save(88, 'Game #88', 'Lee');
    await db.exec('reset role');
    assert.equal(Number((await db.query('select count(*) as n from public.arcade_scores')).rows[0].n), scoresBefore + 1);
    assert.equal((await db.query('select race_id from public.keno_bingo_results')).rows[0].race_id, 88);
    console.log('PASS: kind guard, Bingo once per round, Arcade all-time top 5 with ties and name matching, failures never block saves, safe re-run.');
  } finally { await db.close(); }

  // 5. Without the expected Arcade columns the script skips that part but still installs the rest.
  const other = await setup({arcadeColumns: false});
  try {
    const triggers = (await other.query("select tgname from pg_trigger where not tgisinternal order by tgname")).rows.map(r => r.tgname);
    assert.deepEqual(triggers, ['keno_bingo_post_winners', 'live_feed_posts_guard_kind']);
    console.log('PASS: Arcade part skipped cleanly when columns differ.');
  } finally { await other.close(); }
})().catch(e => { console.error(e); process.exit(1); });
