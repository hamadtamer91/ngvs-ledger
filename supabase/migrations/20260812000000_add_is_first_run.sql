-- Enables the first-run Admin setup screen.
create or replace function public.is_first_run() returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (select 1 from public.profiles)
$$;

grant execute on function public.is_first_run() to anon, authenticated;
