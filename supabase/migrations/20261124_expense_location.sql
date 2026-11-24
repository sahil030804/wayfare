-- Run once in the Supabase SQL Editor for projects that already have schema.sql.
begin;

alter table public.expenses add column if not exists location_lat numeric(7,4);
alter table public.expenses add column if not exists location_lng numeric(8,4);

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass and conname = 'expense_location_pair'
  ) then
    alter table public.expenses add constraint expense_location_pair check (
      (location_lat is null and location_lng is null) or
      (location_lat is not null and location_lng is not null and
       location_lat between -90 and 90 and location_lng between -180 and 180)
    );
  end if;
end
$migration$;

create or replace function public.set_expense_location(p_expense uuid, p_latitude numeric, p_longitude numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where id = p_expense for update;
  if e.id is null or not public.is_trip_member(e.trip_id)
     or (e.created_by <> auth.uid() and not public.is_trip_organizer(e.trip_id))
     or (select status from public.trips where id = e.trip_id) <> 'open' then
    raise exception 'Cannot change expense location';
  end if;
  if not ((p_latitude is null and p_longitude is null) or
          (p_latitude is not null and p_longitude is not null and
           p_latitude between -90 and 90 and p_longitude between -180 and 180)) then
    raise exception 'Invalid location';
  end if;
  update public.expenses set location_lat = p_latitude, location_lng = p_longitude where id = p_expense;
end $$;

revoke all on function public.set_expense_location(uuid,numeric,numeric) from public;
grant execute on function public.set_expense_location(uuid,numeric,numeric) to authenticated;
notify pgrst, 'reload schema';

commit;
