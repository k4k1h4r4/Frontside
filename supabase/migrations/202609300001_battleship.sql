-- Run once in the Supabase SQL editor. Browser roles cannot mutate game state.
create schema if not exists battleship_private;
revoke all on schema battleship_private from public, anon, authenticated;
create table if not exists battleship_private.state (
  id boolean primary key default true check (id),
  version bigint not null default 0,
  payload jsonb not null default '{"active":null,"lobby":null,"recent":[],"last":null}',
  updated_at timestamptz not null default now()
);
insert into battleship_private.state(id) values(true) on conflict do nothing;
create table if not exists battleship_private.results (
  id uuid primary key, payload jsonb not null, saved_at timestamptz not null default now()
);
alter table battleship_private.state enable row level security;
alter table battleship_private.results enable row level security;

create or replace function public.battleship_read()
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('version',version,'state',payload,'updatedAt',updated_at) from battleship_private.state where id=true;
$$;
create or replace function public.battleship_commit(expected_version bigint, new_state jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare current_version bigint; item jsonb;
begin
  select version into current_version from battleship_private.state where id=true for update;
  if current_version<>expected_version then return false; end if;
  for item in select value from jsonb_array_elements(new_state->'recent') loop
    insert into battleship_private.results(id,payload) values((item->>'id')::uuid,item) on conflict do nothing;
  end loop;
  update battleship_private.state set payload=new_state,version=version+1,updated_at=now() where id=true;
  return true;
end; $$;
create or replace function public.battleship_result(match_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select payload from battleship_private.results where id=match_id;
$$;
revoke all on function public.battleship_read() from public,anon,authenticated;
revoke all on function public.battleship_commit(bigint,jsonb) from public,anon,authenticated;
revoke all on function public.battleship_result(uuid) from public,anon,authenticated;
grant execute on function public.battleship_read() to service_role;
grant execute on function public.battleship_commit(bigint,jsonb) to service_role;
grant execute on function public.battleship_result(uuid) to service_role;
