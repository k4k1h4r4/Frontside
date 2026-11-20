-- Apply after the original Battleship migration. Existing matches are preserved.
create or replace function public.battleship_commit(expected_version bigint, new_state jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare current_version bigint; item jsonb;
begin
  select version into current_version from battleship_private.state where id=true for update;
  if current_version<>expected_version then return false; end if;
  for item in
    select value from jsonb_array_elements(coalesce(new_state->'recent','[]'::jsonb))
    union all
    select result.value from jsonb_each(coalesce(new_state->'games','{}'::jsonb)) lane,
      lateral jsonb_array_elements(coalesce(lane.value->'recent','[]'::jsonb)) result
  loop
    insert into battleship_private.results(id,payload) values((item->>'id')::uuid,item) on conflict do nothing;
  end loop;
  update battleship_private.state set payload=new_state,version=version+1,updated_at=now() where id=true;
  return true;
end; $$;
revoke all on function public.battleship_commit(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.battleship_commit(bigint,jsonb) to service_role;
