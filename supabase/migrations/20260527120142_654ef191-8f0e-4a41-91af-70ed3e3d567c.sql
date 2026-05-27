
-- ============ EXTENSIONS ============
create extension if not exists moddatetime schema extensions;

-- ============ ROLE ENUM + USER ROLES ============
create type public.app_role as enum ('admin', 'developer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users view own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);
create policy "Admins view all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles" on public.user_roles
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============ PROFILES (users table per spec) ============
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  telegram_chat_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.users to authenticated;
grant all on public.users to service_role;
alter table public.users enable row level security;

create policy "Users view own profile" on public.users
  for select to authenticated using (auth.uid() = id);
create policy "Admins view all profiles" on public.users
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Users update own profile" on public.users
  for update to authenticated using (auth.uid() = id);
create policy "Admins update all profiles" on public.users
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete profiles" on public.users
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create trigger users_moddatetime
  before update on public.users
  for each row execute procedure extensions.moddatetime(updated_at);

-- Auto-create profile + default developer role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from public.users;

  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict do nothing;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'developer')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ LEADS ============
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  business_name text,
  phone text,
  email text,
  source text check (source in ('REFERRAL','OUTREACH','INBOUND','EVENT','OTHER')),
  stage text not null default 'PROSPECT' check (stage in ('PROSPECT','CONTACTED','DEMO_SCHEDULED','DEMO_DONE','NEGOTIATION','WON','LOST','ON_HOLD')),
  next_action text,
  next_action_date date,
  monthly_value_nis numeric,
  lost_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.leads (user_id);
create index on public.leads (stage);
create index on public.leads (next_action_date);

grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;

create policy "Admins manage leads" on public.leads
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin') and auth.uid() = user_id);

create trigger leads_moddatetime before update on public.leads
  for each row execute procedure extensions.moddatetime(updated_at);

-- ============ TASKS ============
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  domain text not null check (domain in ('SALES','PRODUCT','OPS','STRATEGY')),
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','BLOCKED','DONE','ARCHIVED')),
  due_date date,
  notes text,
  lead_id uuid references public.leads(id) on delete set null,
  ai_rank smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on public.tasks (user_id);
create index on public.tasks (status);
create index on public.tasks (domain);
create index on public.tasks (priority);
create index on public.tasks (due_date);

grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;

create policy "Admins manage tasks" on public.tasks
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin') and auth.uid() = user_id);

create trigger tasks_moddatetime before update on public.tasks
  for each row execute procedure extensions.moddatetime(updated_at);

-- Auto-stamp completed_at on DONE
create or replace function public.handle_task_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'DONE' and (old.status is distinct from 'DONE') then
    new.completed_at := now();
  elsif new.status <> 'DONE' and old.status = 'DONE' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger tasks_completion before update on public.tasks
  for each row execute procedure public.handle_task_completion();

-- ============ LEAD CONTACTS ============
create table public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_date date not null default current_date,
  method text not null check (method in ('WHATSAPP','CALL','IN_PERSON','EMAIL','OTHER')),
  summary text,
  created_at timestamptz not null default now()
);
create index on public.lead_contacts (lead_id);

grant select, insert, update, delete on public.lead_contacts to authenticated;
grant all on public.lead_contacts to service_role;
alter table public.lead_contacts enable row level security;

create policy "Admins manage lead contacts" on public.lead_contacts
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin') and auth.uid() = user_id);

-- ============ DEV ITEMS ============
create table public.dev_items (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  type text not null check (type in ('BUG','FEATURE','MILESTONE','TECH_DEBT')),
  title text not null,
  description text,
  severity text check (severity in ('S1','S2','S3')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','BLOCKED','RESOLVED','WONT_FIX')),
  github_issue_url text,
  target_date date,
  is_milestone boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.dev_items (status);
create index on public.dev_items (assigned_to);

grant select, insert, update, delete on public.dev_items to authenticated;
grant all on public.dev_items to service_role;
alter table public.dev_items enable row level security;

create policy "Admins manage dev items" on public.dev_items
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Developers read own dev items" on public.dev_items
  for select to authenticated
  using (public.has_role(auth.uid(), 'developer') and assigned_to = auth.uid());

create policy "Developers update own dev items" on public.dev_items
  for update to authenticated
  using (public.has_role(auth.uid(), 'developer') and assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

create trigger dev_items_moddatetime before update on public.dev_items
  for each row execute procedure extensions.moddatetime(updated_at);

create or replace function public.handle_dev_item_resolution()
returns trigger language plpgsql as $$
begin
  if new.status in ('RESOLVED','WONT_FIX') and (old.status is distinct from new.status) then
    new.resolved_at := now();
  elsif new.status not in ('RESOLVED','WONT_FIX') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;
create trigger dev_items_resolution before update on public.dev_items
  for each row execute procedure public.handle_dev_item_resolution();

-- ============ DEV ITEM UPDATES (audit log) ============
create table public.dev_item_updates (
  id uuid primary key default gen_random_uuid(),
  dev_item_id uuid not null references public.dev_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field_changed text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index on public.dev_item_updates (dev_item_id);

grant select, insert on public.dev_item_updates to authenticated;
grant all on public.dev_item_updates to service_role;
alter table public.dev_item_updates enable row level security;

create policy "Admins view all dev updates" on public.dev_item_updates
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Developers view own dev updates" on public.dev_item_updates
  for select to authenticated
  using (exists (select 1 from public.dev_items d where d.id = dev_item_id and d.assigned_to = auth.uid()));
create policy "System inserts dev updates" on public.dev_item_updates
  for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.log_dev_item_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return new; end if;
  if new.status is distinct from old.status then
    insert into public.dev_item_updates (dev_item_id, user_id, field_changed, old_value, new_value)
    values (new.id, uid, 'status', old.status, new.status);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.dev_item_updates (dev_item_id, user_id, field_changed, old_value, new_value)
    values (new.id, uid, 'assigned_to', old.assigned_to::text, new.assigned_to::text);
  end if;
  if new.severity is distinct from old.severity then
    insert into public.dev_item_updates (dev_item_id, user_id, field_changed, old_value, new_value)
    values (new.id, uid, 'severity', old.severity, new.severity);
  end if;
  if new.target_date is distinct from old.target_date then
    insert into public.dev_item_updates (dev_item_id, user_id, field_changed, old_value, new_value)
    values (new.id, uid, 'target_date', old.target_date::text, new.target_date::text);
  end if;
  if new.notes is distinct from old.notes then
    insert into public.dev_item_updates (dev_item_id, user_id, field_changed, old_value, new_value)
    values (new.id, uid, 'notes', left(coalesce(old.notes,''),200), left(coalesce(new.notes,''),200));
  end if;
  return new;
end;
$$;
create trigger dev_items_audit after update on public.dev_items
  for each row execute procedure public.log_dev_item_changes();

-- ============ BRIEFINGS ============
create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('DAILY','WEEKLY')),
  content jsonb not null,
  tasks_snapshot jsonb,
  leads_snapshot jsonb,
  dev_snapshot jsonb,
  context_snapshot jsonb,
  generated_at timestamptz not null default now()
);
create index on public.briefings (user_id, generated_at desc);

grant select, insert, delete on public.briefings to authenticated;
grant all on public.briefings to service_role;
alter table public.briefings enable row level security;

create policy "Admins manage briefings" on public.briefings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin') and auth.uid() = user_id);

-- ============ BUSINESS CONTEXT ============
create table public.business_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

grant select, insert, update, delete on public.business_context to authenticated;
grant all on public.business_context to service_role;
alter table public.business_context enable row level security;

create policy "Admins manage context" on public.business_context
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin') and auth.uid() = user_id);

create trigger ctx_moddatetime before update on public.business_context
  for each row execute procedure extensions.moddatetime(updated_at);

-- ============ TELEGRAM LOG ============
create table public.telegram_log (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint,
  direction text check (direction in ('IN','OUT')),
  message text,
  parsed_command text,
  created_at timestamptz not null default now()
);

grant select, insert on public.telegram_log to authenticated;
grant all on public.telegram_log to service_role;
alter table public.telegram_log enable row level security;

create policy "Admins view telegram log" on public.telegram_log
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
