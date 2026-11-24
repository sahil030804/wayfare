-- Run in the existing Supabase project's SQL Editor. Safe to rerun.
begin;

alter table public.expenses add column if not exists location_lat numeric(7,4);
alter table public.expenses add column if not exists location_lng numeric(8,4);
do $migration$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.expenses'::regclass and conname = 'expense_location_pair') then
    alter table public.expenses add constraint expense_location_pair check (
      (location_lat is null and location_lng is null) or
      (location_lat is not null and location_lng is not null and
       location_lat between -90 and 90 and location_lng between -180 and 180)
    );
  end if;
end
$migration$;

drop policy if exists "trip peers profiles" on public.profiles;
drop function if exists public.save_expense(uuid,uuid,uuid,bigint,text,uuid[]);
drop function if exists public.set_expense_location(uuid,numeric,numeric);

create or replace function public.trip_upi_ids(p_trip uuid)
returns table (user_id uuid, upi_id text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_trip_member(p_trip) then raise exception 'Not a trip member'; end if;
  return query select m.user_id, p.upi_id from public.members m
    join public.profiles p on p.id = m.user_id where m.trip_id = p_trip;
end $$;

create or replace function public.regenerate_invite(p_member uuid, p_hash text) returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.members%rowtype;
begin
  select * into m from public.members where id=p_member for update;
  if m.id is null or m.user_id is not null or not public.is_trip_organizer(m.trip_id)
     or (select status from public.trips where id=m.trip_id) <> 'open' then raise exception 'Cannot renew invite'; end if;
  if p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invite'; end if;
  update public.members set invite_hash=p_hash where id=p_member;
  return p_member;
end $$;

create or replace function public.save_expense(p_trip uuid, p_expense uuid, p_payer uuid, p_amount bigint, p_remark text, p_participants uuid[], p_latitude numeric, p_longitude numeric) returns uuid language plpgsql security definer set search_path = '' as $$
declare e uuid; n integer; ix integer; participant uuid; actor uuid;
begin
  if not public.is_trip_member(p_trip) or (select status from public.trips where id=p_trip for update) <> 'open' then raise exception 'Trip is closed'; end if;
  if p_amount <= 0 or p_amount > 999999999999 or length(trim(p_remark)) not between 1 and 200 then raise exception 'Invalid expense'; end if;
  if not ((p_latitude is null and p_longitude is null) or
          (p_latitude is not null and p_longitude is not null and
           p_latitude between -90 and 90 and p_longitude between -180 and 180)) then raise exception 'Invalid location'; end if;
  if not exists(select 1 from public.members where id=p_payer and trip_id=p_trip and user_id is not null) then raise exception 'Invalid payer'; end if;
  select count(distinct x) into n from unnest(p_participants) x;
  if n = 0 or n <> cardinality(p_participants) or exists(select 1 from unnest(p_participants) x where not exists(select 1 from public.members where id=x and trip_id=p_trip and user_id is not null)) then raise exception 'All participants must join first'; end if;
  if p_expense is null then
    insert into public.expenses(trip_id,payer_member_id,amount_paise,remark,location_lat,location_lng,created_by) values(p_trip,p_payer,p_amount,trim(p_remark),p_latitude,p_longitude,auth.uid()) returning id into e;
  else
    select created_by into actor from public.expenses where id=p_expense and trip_id=p_trip for update;
    if actor is null or (actor <> auth.uid() and not public.is_trip_organizer(p_trip)) then raise exception 'Cannot edit expense'; end if;
    e := p_expense;
    update public.expenses set payer_member_id=p_payer,amount_paise=p_amount,remark=trim(p_remark),location_lat=p_latitude,location_lng=p_longitude where id=e;
    delete from public.expense_shares where expense_id=e;
  end if;
  ix := 0;
  for participant in select unnest(p_participants) order by 1 loop
    ix := ix + 1;
    insert into public.expense_shares(expense_id,member_id,amount_paise) values(e,participant,p_amount/n + case when ix <= p_amount % n then 1 else 0 end);
  end loop;
  return e;
end $$;

revoke all on function public.trip_upi_ids(uuid), public.regenerate_invite(uuid,text), public.save_expense(uuid,uuid,uuid,bigint,text,uuid[],numeric,numeric) from public;
grant execute on function public.trip_upi_ids(uuid), public.regenerate_invite(uuid,text), public.save_expense(uuid,uuid,uuid,bigint,text,uuid[],numeric,numeric) to authenticated;
notify pgrst, 'reload schema';
commit;
