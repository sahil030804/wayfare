-- Run once in the SQL Editor for projects created before account-based friends.
create or replace function public.connect_friend(p_trip uuid, p_email text, p_member uuid default null)
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

revoke all on function public.connect_friend(uuid,text,uuid) from public;
grant execute on function public.connect_friend(uuid,text,uuid) to authenticated;
notify pgrst, 'reload schema';
