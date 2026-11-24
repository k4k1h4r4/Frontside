-- Live feed wins
-- Battleship Keno winners, Arcade high scores and Keno Bingo winners appear in
-- public.live_feed_posts next to community posts, marked by a `kind` column.
--
--   kind IS NULL      community post (what browsers create)
--   'battleship-win'  written by the battleship Edge Function (service role)
--   'arcade-record'   written below when a score breaks a game's all-time top 5
--   'bingo-win'       written below when a Keno Bingo round has winners
--
-- Run once in the Supabase SQL editor. Safe to re-run.
-- A win post can never block saving a score or a Bingo result: each trigger
-- catches its own errors and only logs a warning.

-- 1. Mark rows as wins ---------------------------------------------------------
alter table public.live_feed_posts add column if not exists kind text;
grant select (kind) on public.live_feed_posts to anon, authenticated;

-- Browsers may keep posting messages, but can never mark a post as a win.
create or replace function public.live_feed_posts_guard_kind()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.kind := null;
  end if;
  return new;
end
$$;

drop trigger if exists live_feed_posts_guard_kind on public.live_feed_posts;
create trigger live_feed_posts_guard_kind
  before insert or update on public.live_feed_posts
  for each row execute function public.live_feed_posts_guard_kind();

-- 2. Keno Bingo winners --------------------------------------------------------
-- keno_bingo_results keeps one row that every player's browser overwrites when
-- a round ends. Post once per round: when a new round arrives with winners, or
-- when winners first appear for the current round.
create or replace function public.keno_bingo_post_winners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(new.winner_names), '') <> ''
     and (tg_op = 'INSERT'
          or old.race_id is distinct from new.race_id
          or coalesce(btrim(old.winner_names), '') = '') then
    insert into public.live_feed_posts (message, kind)
    values (
      left(format('BINGO! %s won Keno Bingo on Keno %s.',
                  btrim(new.winner_names),
                  coalesce(nullif(btrim(new.game_ref), ''), 'the latest game')), 280),
      'bingo-win');
  end if;
  return null;
exception when others then
  raise warning 'Live feed Bingo post skipped: %', sqlerrm;
  return null;
end
$$;

drop trigger if exists keno_bingo_post_winners on public.keno_bingo_results;
create trigger keno_bingo_post_winners
  after insert or update on public.keno_bingo_results
  for each row execute function public.keno_bingo_post_winners();

-- 3. Arcade top-5 scores -----------------------------------------------------
-- Posts when a saved score breaks into that game's all-time top 5, matching the
-- High Scores board: each name counts once by its best score (names ignore
-- capitalization and extra spaces), and the earlier score wins a tie. So a post
-- needs a new personal best that ranks in the top 5 (moving up counts too).
-- Only installed if arcade_scores has the expected columns.
do $outer$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'arcade_scores'
        and column_name in ('id', 'game', 'name', 'score')) = 4 then

    execute $fn$
      create or replace function public.arcade_post_high_score()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $$
      declare
        player text := lower(regexp_replace(btrim(new.name), '\s+', ' ', 'g'));
        personal_best numeric;
        ahead integer;
        title text;
        shown text;
      begin
        -- Not a new personal best: the board does not change.
        select max(score) into personal_best
        from public.arcade_scores
        where game = new.game and id <> new.id
          and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = player;
        if personal_best is not null and new.score <= personal_best then
          return null;
        end if;

        -- Other names whose best is at least this score stay ahead of it.
        select count(*) into ahead
        from (
          select max(score) as best
          from public.arcade_scores
          where game = new.game and id <> new.id
            and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) <> player
          group by lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        ) others
        where best >= new.score;
        if ahead >= 5 then
          return null;
        end if;

        title := case new.game
          when 'beer-pong' then 'Beer Pong'
          when 'perfect-pour' then 'Perfect Pour'
          when 'coaster-stacking' then 'Coaster Stacking'
          else initcap(replace(new.game, '-', ' '))
        end;
        shown := case when new.game = 'perfect-pour'
          then to_char(new.score, 'FM999999990.0')
          else to_char(new.score, 'FM999999990')
        end;

        insert into public.live_feed_posts (message, kind)
        values (
          left(case when ahead = 0
            then format('New %s high score! %s scored %s.', title,
                        regexp_replace(btrim(new.name), '\s+', ' ', 'g'), shown)
            else format('%s scored %s in %s, #%s all-time!',
                        regexp_replace(btrim(new.name), '\s+', ' ', 'g'), shown, title, ahead + 1)
          end, 280),
          'arcade-record');
        return null;
      exception when others then
        raise warning 'Live feed high-score post skipped: %', sqlerrm;
        return null;
      end
      $$
    $fn$;

    execute 'drop trigger if exists arcade_post_high_score on public.arcade_scores';
    execute 'create trigger arcade_post_high_score
               after insert on public.arcade_scores
               for each row execute function public.arcade_post_high_score()';
    raise notice 'Arcade top-5 posts enabled.';
  else
    raise warning 'Arcade top-5 posts NOT enabled: public.arcade_scores does not have id, game, name and score columns.';
  end if;
end
$outer$;
