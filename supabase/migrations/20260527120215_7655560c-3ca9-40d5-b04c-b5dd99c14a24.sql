
-- Fix search_path on the two non-security-definer trigger functions
create or replace function public.handle_task_completion()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.status = 'DONE' and (old.status is distinct from 'DONE') then
    new.completed_at := now();
  elsif new.status <> 'DONE' and old.status = 'DONE' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.handle_dev_item_resolution()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.status in ('RESOLVED','WONT_FIX') and (old.status is distinct from new.status) then
    new.resolved_at := now();
  elsif new.status not in ('RESOLVED','WONT_FIX') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

-- Lock down EXECUTE on SECURITY DEFINER functions
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_dev_item_changes() from public, anon, authenticated;
