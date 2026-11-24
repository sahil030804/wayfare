-- Run in the Supabase SQL editor for a new project.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  email text not null,
  upi_id text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,100}$')
);
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 100),
  organizer_id uuid not null references auth.users(id),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);
create table public.members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  user_id uuid references auth.users(id),
  invite_hash text unique,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  payer_member_id uuid not null references public.members(id),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 999999999999),
  remark text not null check (length(trim(remark)) between 1 and 200),
  location_lat numeric(7,4),
  location_lng numeric(8,4),
  constraint expense_location_pair check (
    (location_lat is null and location_lng is null) or
    (location_lat is not null and location_lng is not null and
     location_lat between -90 and 90 and location_lng between -180 and 180)
  ),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.members(id),
  amount_paise bigint not null check (amount_paise >= 0),
  primary key (expense_id, member_id)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  from_member_id uuid not null references public.members(id),
  to_member_id uuid not null references public.members(id),
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'sent' check (status in ('sent','confirmed','rejected')),
  created_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);
create index on public.members(trip_id);
create index on public.expenses(trip_id, created_at desc);
create index on public.payments(trip_id);

create function public.is_trip_member(t uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members where trip_id = t and user_id = (select auth.uid()))
$$;
create function public.is_trip_organizer(t uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.trips where id = t and organizer_id = (select auth.uid()))
$$;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.payments enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "member trips" on public.trips for select to authenticated using (public.is_trip_member(id));
create policy "trip members" on public.members for select to authenticated using (public.is_trip_member(trip_id));
create policy "trip expenses" on public.expenses for select to authenticated using (public.is_trip_member(trip_id));
create policy "trip shares" on public.expense_shares for select to authenticated using (
  exists(select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id))
);
create policy "trip payments" on public.payments for select to authenticated using (public.is_trip_member(trip_id));

create function public.trip_upi_ids(p_trip uuid)
returns table (user_id uuid, upi_id text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_trip_member(p_trip) then raise exception 'Not a trip member'; end if;
  return query select m.user_id, p.upi_id from public.members m
    join public.profiles p on p.id = m.user_id where m.trip_id = p_trip;
end $$;

create function public.create_trip(p_title text, p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if auth.uid() is null or length(trim(p_title)) not between 1 and 100 or length(trim(p_name)) not between 1 and 80 then raise exception 'Invalid trip'; end if;
  insert into public.trips(title, organizer_id) values (trim(p_title), auth.uid()) returning id into t;
  insert into public.members(trip_id, name, user_id) values (t, trim(p_name), auth.uid());
  return t;
end $$;

create function public.add_friend(p_trip uuid, p_name text, p_hash text) returns uuid language plpgsql security definer set search_path = '' as $$
declare m uuid;
begin
  if not public.is_trip_organizer(p_trip) or (select status from public.trips where id=p_trip) <> 'open' then raise exception 'Not allowed'; end if;
  if length(trim(p_name)) not between 1 and 80 or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invite'; end if;
  insert into public.members(trip_id,name,invite_hash) values(p_trip,trim(p_name),p_hash) returning id into m;
  return m;
end $$;

-- Organizers connect an existing account directly. p_member links a legacy
-- pending placeholder to that account without changing its expense history.
create function public.connect_friend(p_trip uuid, p_email text, p_member uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_id uuid; target_name text; member_id uuid; trip_status text;
begin
  if auth.uid() is null or not public.is_trip_organizer(p_trip) then raise exception 'Only the organizer can add friends'; end if;
  select status into trip_status from public.trips where id=p_trip for update;
  if trip_status <> 'open' then raise exception 'Trip is closed'; end if;
  if length(trim(p_email)) > 254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email'; end if;
  select u.id, p.display_name into target_id, target_name
    from auth.users u join public.profiles p on p.id=u.id
    where lower(u.email)=lower(trim(p_email)) and u.email_confirmed_at is not null
    limit 1;
  if target_id is null then raise exception 'Friend must sign in and complete their profile first'; end if;
  if exists(select 1 from public.members where trip_id=p_trip and user_id=target_id) then raise exception 'Friend is already on this trip'; end if;
  if p_member is null then
    insert into public.members(trip_id,name,user_id) values(p_trip,target_name,target_id) returning id into member_id;
  else
    select id into member_id from public.members where id=p_member and trip_id=p_trip and user_id is null for update;
    if member_id is null then raise exception 'Pending friend not found'; end if;
    update public.members set name=target_name,user_id=target_id,invite_hash=null where id=member_id;
  end if;
  return member_id;
end $$;

create function public.regenerate_invite(p_member uuid, p_hash text) returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.members%rowtype;
begin
  select * into m from public.members where id=p_member for update;
  if m.id is null or m.user_id is not null or not public.is_trip_organizer(m.trip_id)
     or (select status from public.trips where id=m.trip_id) <> 'open' then raise exception 'Cannot renew invite'; end if;
  if p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invite'; end if;
  update public.members set invite_hash=p_hash where id=p_member;
  return p_member;
end $$;

create function public.claim_invite(p_token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid; m uuid;
begin
  if auth.uid() is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invite'; end if;
  select id, trip_id into m,t from public.members where invite_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and user_id is null for update;
  if m is null then raise exception 'Invite already used or invalid'; end if;
  if (select status from public.trips where id=t) <> 'open' then raise exception 'Trip is closed'; end if;
  if exists(select 1 from public.members where trip_id=t and user_id=auth.uid()) then raise exception 'Already a member'; end if;
  update public.members set user_id=auth.uid(),invite_hash=null where id=m;
  return t;
end $$;

create function public.save_expense(p_trip uuid, p_expense uuid, p_payer uuid, p_amount bigint, p_remark text, p_participants uuid[], p_latitude numeric, p_longitude numeric) returns uuid language plpgsql security definer set search_path = '' as $$
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

create function public.delete_expense(p_expense uuid) returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where id=p_expense for update;
  if e.id is null or not public.is_trip_member(e.trip_id) or (e.created_by <> auth.uid() and not public.is_trip_organizer(e.trip_id)) or (select status from public.trips where id=e.trip_id) <> 'open' then raise exception 'Cannot delete expense'; end if;
  delete from public.expenses where id=p_expense;
end $$;

create function public.close_trip(p_trip uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_trip_organizer(p_trip) then raise exception 'Only organizer can close'; end if;
  update public.trips set status='closed' where id=p_trip and status='open';
end $$;

create function public.send_payment(p_trip uuid, p_from uuid, p_to uuid, p_amount bigint) returns uuid language plpgsql security definer set search_path = '' as $$
declare p uuid; debtor_balance bigint; creditor_balance bigint;
begin
  if (select status from public.trips where id=p_trip) <> 'closed' or p_amount <= 0 or p_from=p_to then raise exception 'Invalid payment'; end if;
  if not exists(select 1 from public.members where id=p_from and trip_id=p_trip and user_id=auth.uid()) or not exists(select 1 from public.members where id=p_to and trip_id=p_trip and user_id is not null) then raise exception 'Not allowed'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_trip::text, 0));
  with ledger as (
    select payer_member_id as member_id, amount_paise as delta from public.expenses where trip_id=p_trip
    union all select s.member_id, -s.amount_paise from public.expense_shares s join public.expenses e on e.id=s.expense_id where e.trip_id=p_trip
    union all select from_member_id, amount_paise from public.payments where trip_id=p_trip and status in ('sent','confirmed')
    union all select to_member_id, -amount_paise from public.payments where trip_id=p_trip and status in ('sent','confirmed')
  ) select coalesce(sum(delta) filter(where member_id=p_from),0), coalesce(sum(delta) filter(where member_id=p_to),0) into debtor_balance, creditor_balance from ledger;
  if debtor_balance > -p_amount or creditor_balance < p_amount then raise exception 'Payment exceeds current debt'; end if;
  if exists(select 1 from public.payments where trip_id=p_trip and from_member_id=p_from and to_member_id=p_to and status='sent') then raise exception 'Payment already awaiting confirmation'; end if;
  insert into public.payments(trip_id,from_member_id,to_member_id,amount_paise) values(p_trip,p_from,p_to,p_amount) returning id into p;
  return p;
end $$;

create function public.resolve_payment(p_payment uuid, p_confirm boolean) returns void language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id=p_payment for update;
  if p.id is null or p.status <> 'sent' or not exists(select 1 from public.members where id=p.to_member_id and user_id=auth.uid()) then raise exception 'Cannot resolve payment'; end if;
  update public.payments set status=case when p_confirm then 'confirmed' else 'rejected' end where id=p_payment;
end $$;

revoke all on function public.is_trip_member(uuid), public.is_trip_organizer(uuid) from public;
grant execute on function public.is_trip_member(uuid), public.is_trip_organizer(uuid) to authenticated;
revoke all on function public.trip_upi_ids(uuid), public.create_trip(text,text), public.add_friend(uuid,text,text), public.connect_friend(uuid,text,uuid), public.regenerate_invite(uuid,text), public.claim_invite(text), public.save_expense(uuid,uuid,uuid,bigint,text,uuid[],numeric,numeric), public.delete_expense(uuid), public.close_trip(uuid), public.send_payment(uuid,uuid,uuid,bigint), public.resolve_payment(uuid,boolean) from public;
grant execute on function public.trip_upi_ids(uuid), public.create_trip(text,text), public.add_friend(uuid,text,text), public.connect_friend(uuid,text,uuid), public.regenerate_invite(uuid,text), public.claim_invite(text), public.save_expense(uuid,uuid,uuid,bigint,text,uuid[],numeric,numeric), public.delete_expense(uuid), public.close_trip(uuid), public.send_payment(uuid,uuid,uuid,bigint), public.resolve_payment(uuid,boolean) to authenticated;


-- Account deletion requests are reviewed and fulfilled by the operator.
create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','completed'))
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
create function public.request_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
declare requester uuid;
begin
  requester := auth.uid();
  if requester is null then raise exception 'Sign in first'; end if;
  insert into public.account_deletion_requests (user_id, email)
  select id, email from auth.users where id = requester
  on conflict (user_id) do update set requested_at = now(), status = 'pending', email = excluded.email;
end $$;
revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

notify pgrst, 'reload schema';
