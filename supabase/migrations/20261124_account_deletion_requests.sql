-- Apply once in Supabase SQL Editor before enabling account deletion requests.
-- Review pending requests regularly in the SQL Editor and complete the deletion.
create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','completed'))
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
create or replace function public.request_account_deletion()
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
