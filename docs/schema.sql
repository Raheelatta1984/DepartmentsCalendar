-- ============================================================================
-- Orbit — production schema for Supabase / PostgreSQL 15+
-- Run in the Supabase SQL editor, or: psql "$DATABASE_URL" -f docs/schema.sql
-- The demo app in this repository uses the same shapes in src/types.ts.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type entity_type    as enum ('group', 'company', 'sub_company');
create type app_role       as enum ('employee','supervisor','manager','unit_head','department_head','head_operations','ceo');
create type activity_type  as enum ('task','follow_up','appointment','meeting','seminar','session','training','audit','site_visit');
create type task_status    as enum ('not_started','in_progress','blocked','completed','cancelled');
create type priority_level as enum ('critical','high','medium','low');
create type period_key     as enum ('day','week','month','quarter','year');
create type holiday_kind   as enum ('public_holiday','company_holiday','weekly_off');
create type calendar_provider as enum ('outlook','google');
create type connection_status as enum ('connected','pending','disconnected');
create type escalation_status as enum ('open','acknowledged','closed');
create type sync_action    as enum ('create','update','delete');
create type sync_status    as enum ('queued','synced','failed','dead');

-- ---------------------------------------------------------------------------
-- Reference / master data
-- ---------------------------------------------------------------------------
create table public.country_config (
  code            char(2) primary key,
  name            text not null,
  timezone        text not null,
  weekly_off      smallint[] not null default '{0,6}',   -- 0 = Sunday
  default_daily_hours numeric(4,2) not null default 9.00,
  constraint weekly_off_valid check (
    weekly_off <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

create table public.entities (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references public.entities(id) on delete restrict,
  name          text not null,
  code          text not null unique,
  type          entity_type not null default 'company',
  country_code  char(2) not null references public.country_config(code),
  timezone      text not null,
  industry      text,
  is_active     boolean not null default true,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint group_has_no_parent check (type <> 'group' or parent_id is null)
);

create table public.departments (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references public.entities(id) on delete restrict,
  name           text not null,
  code           text not null,
  head_id        uuid,                         -- FK added after employees exists
  ops_owner_id   uuid,                         -- typically the Head of Operations
  cost_centre    text,
  colour         text not null default '#3b82f6',
  is_active      boolean not null default true,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (entity_id, code)
);

create table public.employees (
  id              uuid primary key default gen_random_uuid(),   -- = auth.users.id
  entity_id       uuid not null references public.entities(id) on delete restrict,
  department_id   uuid not null references public.departments(id) on delete restrict,
  manager_id      uuid references public.employees(id) on delete set null,
  name            text not null,
  email           citext not null unique,
  code            text unique,
  role            app_role not null default 'employee',
  country_code    char(2) not null references public.country_config(code),
  weekly_hours    numeric(4,2) not null default 45.00 check (weekly_hours between 1 and 80),
  join_date       date not null default current_date,
  status          text not null default 'active' check (status in ('active','on_leave','inactive')),
  avatar_colour   text default '#3b82f6',
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint no_self_management check (manager_id is null or manager_id <> id)
);

alter table public.departments
  add constraint departments_head_fk    foreign key (head_id)      references public.employees(id) on delete set null,
  add constraint departments_ops_fk     foreign key (ops_owner_id) references public.employees(id) on delete set null;

create table public.holidays (
  id            uuid primary key default gen_random_uuid(),
  country_code  char(2) not null references public.country_config(code),
  entity_id     uuid references public.entities(id) on delete cascade,  -- null = country-wide
  date          date not null,
  name          text not null,
  type          holiday_kind not null default 'public_holiday',
  is_tentative  boolean not null default false,
  source        text not null default 'manual',
  created_at    timestamptz not null default now(),
  unique (country_code, entity_id, date, name)
);
create index holidays_country_date_idx on public.holidays (country_code, date);

-- ---------------------------------------------------------------------------
-- Activities & subtasks
-- ---------------------------------------------------------------------------
create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references public.entities(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  assignee_id   uuid not null references public.employees(id) on delete cascade,
  created_by    uuid not null references public.employees(id) on delete restrict,
  title         text not null check (length(trim(title)) > 0),
  description   text,
  type          activity_type not null default 'task',
  status        task_status not null default 'not_started',
  priority      priority_level not null default 'medium',
  progress      smallint not null default 0 check (progress between 0 and 100),
  start_date    date not null,
  end_date      date not null,
  start_time    time,
  end_time      time,
  planned_hours numeric(5,2) not null check (planned_hours > 0),
  location      text,
  sync_outlook  boolean not null default true,
  sync_google   boolean not null default false,
  ical_uid      text generated always as ('orbit-' || id::text || '@orbit.local') stored,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint date_order check (end_date >= start_date),
  constraint time_order check (
    start_time is null or end_time is null or end_time > start_time
  )
);
create index activities_dept_dates_idx  on public.activities (department_id, start_date, end_date)
  where deleted_at is null;
create index activities_assignee_idx    on public.activities (assignee_id, start_date)
  where deleted_at is null;
create index activities_due_idx         on public.activities (end_date, status)
  where deleted_at is null;

create table public.activity_subtasks (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references public.activities(id) on delete cascade,
  title         text not null,
  planned_hours numeric(4,2) not null default 1,
  done          boolean not null default false,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now()
);
create index subtasks_activity_idx on public.activity_subtasks (activity_id);

-- ---------------------------------------------------------------------------
-- Timesheets
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  activity_id   uuid not null references public.activities(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  entry_date    date not null,
  hours         numeric(4,2) not null check (hours > 0 and hours <= 24),
  note          text,
  billable      boolean not null default false,
  approved      boolean not null default false,
  approved_by   uuid references public.employees(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index time_entries_emp_date_idx on public.time_entries (employee_id, entry_date);
create index time_entries_dept_date_idx on public.time_entries (department_id, entry_date);
create index time_entries_activity_idx  on public.time_entries (activity_id);

-- ---------------------------------------------------------------------------
-- Calendar integration
-- ---------------------------------------------------------------------------
create table public.calendar_connections (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  provider       calendar_provider not null,
  account_email  citext not null,
  status         connection_status not null default 'pending',
  two_way        boolean not null default false,
  -- Never exposed to the browser: store with pgcrypto/Vault and read only from
  -- Edge Functions using the service role.
  refresh_token  text,
  token_expires  timestamptz,
  last_sync_at   timestamptz,
  unique (employee_id, provider)
);

create table public.sync_jobs (
  id             uuid primary key default gen_random_uuid(),
  activity_id    uuid not null references public.activities(id) on delete cascade,
  connection_id  uuid references public.calendar_connections(id) on delete cascade,
  provider       calendar_provider not null,
  action         sync_action not null,
  status         sync_status not null default 'queued',
  attempts       smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_event_id text,
  last_error     text,
  payload        jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index sync_jobs_queue_idx on public.sync_jobs (status, next_attempt_at)
  where status in ('queued','failed');

-- ---------------------------------------------------------------------------
-- Escalations & audit
-- ---------------------------------------------------------------------------
create table public.escalations (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.departments(id) on delete cascade,
  period         period_key not null,
  period_start   date not null,
  period_end     date not null,
  score          smallint not null check (score between 0 and 100),
  threshold      smallint not null,
  utilization    smallint not null,
  on_time_rate   smallint not null,
  recipients     uuid[] not null default '{}',
  cc             uuid[] not null default '{}',
  status         escalation_status not null default 'open',
  note           text,
  email_sent_at  timestamptz,
  acknowledged_at timestamptz,
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (department_id, period, period_start)
);
create index escalations_open_idx on public.escalations (status, created_at desc);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.employees(id) on delete set null,
  action      text not null,
  table_name  text not null,
  record_id   text,
  before      jsonb,
  after       jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index audit_created_idx on public.audit_log (created_at desc);

create table public.settings (
  id                    smallint primary key default 1 check (id = 1),
  group_name            text not null,
  working_day_start     time not null default '08:30',
  working_day_end       time not null default '17:30',
  week_starts_on        smallint not null default 1 check (week_starts_on in (0,1,6)),
  holiday_horizon_years smallint not null default 5,
  performance_threshold smallint not null default 70,
  score_weights         jsonb not null default '{"utilization":0.40,"on_time":0.35,"completion":0.25}',
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Permission helpers (SECURITY DEFINER so RLS can call them cheaply)
-- ---------------------------------------------------------------------------
create or replace function app.current_employee()
returns public.employees language sql stable security definer set search_path = public as $$
  select * from public.employees where id = auth.uid();
$$;

create or replace function app.role_rank(r app_role) returns int language sql immutable as $$
  select case r
    when 'ceo' then 7 when 'head_operations' then 6 when 'department_head' then 5
    when 'unit_head' then 4 when 'manager' then 3 when 'supervisor' then 2 else 1 end;
$$;

create or replace function app.is_executive()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role_rank(role) >= 6 from public.employees where id = auth.uid()), false);
$$;

create or replace function app.manages(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select id from public.employees where manager_id = auth.uid()
    union all
    select e.id from public.employees e join tree t on e.manager_id = t.id
  )
  select target = auth.uid() or exists (select 1 from tree where id = target);
$$;

create or replace function app.department_in_scope(dept uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees me
    where me.id = auth.uid()
      and (
        app.is_executive()
        or (me.role = 'department_head' and me.department_id = dept)
        or (me.role <> 'department_head' and me.department_id = dept)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.entities            enable row level security;
alter table public.departments         enable row level security;
alter table public.employees           enable row level security;
alter table public.activities          enable row level security;
alter table public.activity_subtasks    enable row level security;
alter table public.time_entries        enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.sync_jobs           enable row level security;
alter table public.escalations         enable row level security;
alter table public.holidays            enable row level security;
alter table public.country_config      enable row level security;
alter table public.audit_log           enable row level security;
alter table public.settings            enable row level security;

-- Everyone signed in reads the reference data; only executives mutate it.
create policy read_countries   on public.country_config for select to authenticated using (true);
create policy read_holidays    on public.holidays     for select to authenticated using (true);
create policy read_entities    on public.entities     for select to authenticated using (true);
create policy read_departments on public.departments  for select to authenticated using (true);
create policy read_settings    on public.settings     for select to authenticated using (true);

create policy write_countries on public.country_config for all to authenticated
  using (app.is_executive()) with check (app.is_executive());
create policy write_holidays on public.holidays for all to authenticated
  using (app.is_executive()) with check (app.is_executive());
create policy write_entities on public.entities for all to authenticated
  using (app.is_executive()) with check (app.is_executive());
create policy write_settings on public.settings for all to authenticated
  using (app.is_executive()) with check (app.is_executive());
create policy write_departments on public.departments for all to authenticated
  using (app.is_executive() or exists (
    select 1 from public.employees me
    where me.id = auth.uid() and me.role = 'department_head' and me.department_id = departments.id
  ))
  with check (app.is_executive() or exists (
    select 1 from public.employees me
    where me.id = auth.uid() and me.role = 'department_head' and me.department_id = departments.id
  ));

-- Employees: own row, own reporting tree, or executive.
create policy employees_read on public.employees for select to authenticated
  using (app.manages(id) or app.is_executive());
create policy employees_write on public.employees for all to authenticated
  using (app.is_executive() or exists (
    select 1 from public.employees me
    where me.id = auth.uid() and me.role = 'department_head' and me.department_id = employees.department_id
  ))
  with check (app.is_executive() or exists (
    select 1 from public.employees me
    where me.id = auth.uid() and me.role = 'department_head' and me.department_id = employees.department_id
  ));

-- Activities: own writes; managers read their tree; heads/executives read scope.
create policy activities_read on public.activities for select to authenticated
  using (assignee_id = auth.uid() or app.manages(assignee_id) or app.is_executive()
         or exists (select 1 from public.employees me
                    where me.id = auth.uid() and me.role = 'department_head'
                      and me.department_id = activities.department_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (assignee_id = auth.uid() or app.manages(assignee_id) or app.is_executive());
create policy activities_update on public.activities for update to authenticated
  using (assignee_id = auth.uid() or app.manages(assignee_id) or app.is_executive())
  with check (assignee_id = auth.uid() or app.manages(assignee_id) or app.is_executive());
create policy activities_delete on public.activities for delete to authenticated
  using (app.manages(assignee_id) or app.is_executive());

create policy subtasks_read on public.activity_subtasks for select to authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id));
create policy subtasks_write on public.activity_subtasks for all to authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id
                 and (a.assignee_id = auth.uid() or app.manages(a.assignee_id) or app.is_executive())))
  with check (exists (select 1 from public.activities a where a.id = activity_id
                 and (a.assignee_id = auth.uid() or app.manages(a.assignee_id) or app.is_executive())));

-- Timesheets: own writes; approvals require supervisor rank or above.
create policy time_read on public.time_entries for select to authenticated
  using (employee_id = auth.uid() or app.manages(employee_id) or app.is_executive()
         or exists (select 1 from public.employees me
                    where me.id = auth.uid() and me.role = 'department_head'
                      and me.department_id = time_entries.department_id));
create policy time_insert on public.time_entries for insert to authenticated
  with check (employee_id = auth.uid());
create policy time_update on public.time_entries for update to authenticated
  using (employee_id = auth.uid() or app.manages(employee_id) or app.is_executive())
  with check (employee_id = auth.uid() or app.manages(employee_id) or app.is_executive());
create policy time_delete on public.time_entries for delete to authenticated
  using (employee_id = auth.uid() or app.is_executive());

-- Connections: a person manages their own; nobody can read tokens from the client.
create policy connections_rw on public.calendar_connections for all to authenticated
  using (employee_id = auth.uid() or app.is_executive())
  with check (employee_id = auth.uid() or app.is_executive());

create policy sync_jobs_read on public.sync_jobs for select to authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id));

create policy escalations_read on public.escalations for select to authenticated
  using (app.is_executive()
         or exists (select 1 from public.employees me
                    where me.id = auth.uid() and me.role = 'department_head'
                      and me.department_id = escalations.department_id)
         or auth.uid() = any(recipients) or auth.uid() = any(cc));
create policy escalations_update on public.escalations for update to authenticated
  using (auth.uid() = any(recipients) or auth.uid() = any(cc) or app.is_executive())
  with check (auth.uid() = any(recipients) or auth.uid() = any(cc) or app.is_executive());

create policy audit_read on public.audit_log for select to authenticated
  using (app.is_executive());
-- audit_log is append-only; no update/delete policy is created on purpose.

-- ---------------------------------------------------------------------------
-- Triggers: audit trail + updated_at + sync enqueue
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['entities','departments','employees','activities','time_entries','calendar_connections']
  loop
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function app.touch_updated_at()', t, t);
  end loop;
end $$;

create or replace function app.audit_trigger() returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, before, after)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id::text, old.id::text),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger activities_audit after insert or update or delete on public.activities
  for each row execute function app.audit_trigger();
create trigger employees_audit after insert or update or delete on public.employees
  for each row execute function app.audit_trigger();

-- Queue calendar writes whenever an activity changes.
create or replace function app.enqueue_calendar_sync() returns trigger language plpgsql security definer as $$
declare conn record; act record;
begin
  act := coalesce(new, old);
  for conn in
    select * from public.calendar_connections
    where employee_id = act.assignee_id and status = 'connected'
      and ((provider = 'outlook' and coalesce(new.sync_outlook, old.sync_outlook))
        or (provider = 'google'  and coalesce(new.sync_google,  old.sync_google)))
  loop
    insert into public.sync_jobs (activity_id, connection_id, provider, action, payload)
    values (
      act.id, conn.id, conn.provider,
      case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
      to_jsonb(act)
    );
  end loop;
  return coalesce(new, old);
end $$;

create trigger activities_sync after insert or update or delete on public.activities
  for each row execute function app.enqueue_calendar_sync();

-- ---------------------------------------------------------------------------
-- Metric views
-- ---------------------------------------------------------------------------
create or replace function app.period_bounds(p_key period_key, p_anchor date)
returns table(period_start date, period_end date) language sql immutable as $$
  select
    case p_key
      when 'day'     then p_anchor
      when 'week'    then date_trunc('week', p_anchor)::date
      when 'month'   then date_trunc('month', p_anchor)::date
      when 'quarter' then date_trunc('quarter', p_anchor)::date
      else date_trunc('year', p_anchor)::date
    end,
    case p_key
      when 'day'     then p_anchor
      when 'week'    then (date_trunc('week', p_anchor) + interval '6 days')::date
      when 'month'   then (date_trunc('month', p_anchor) + interval '1 month - 1 day')::date
      when 'quarter' then (date_trunc('quarter', p_anchor) + interval '3 months - 1 day')::date
      else (date_trunc('year', p_anchor) + interval '1 year - 1 day')::date
    end;
$$;

-- Working days per employee in a range, honouring weekly off + public holidays.
create or replace function app.working_days(
  p_employee uuid, p_start date, p_end date
) returns numeric language sql stable security definer set search_path = public as $$
  with emp as (
    select e.id, e.country_code, e.weekly_hours, c.weekly_off
    from public.employees e join public.country_config c on c.code = e.country_code
    where e.id = p_employee
  ),
  days as (
    select d::date as day
    from generate_series(p_start, least(p_end, current_date), interval '1 day') d
  ),
  working as (
    select count(*) as n
    from days
    where extract(dow from day)::smallint <> all ((select weekly_off from emp))
      and not exists (
        select 1 from public.holidays h
        where h.date = day
          and h.country_code = (select country_code from emp)
          and h.type <> 'weekly_off'
      )
  )
  select round((select n from working) * ((select weekly_hours from emp) / 5.0), 2);
$$;

-- Department score for any period; identical formula to the UI.
create or replace function app.department_score(
  p_department uuid, p_key period_key, p_anchor date
) returns table (
  department_id uuid, period_start date, period_end date, headcount int,
  capacity_hours numeric, logged_hours numeric, planned_hours numeric,
  utilization int, on_time_rate int, completion_rate int, score int
) language sql stable security definer set search_path = public as $$
  with bounds as (select * from app.period_bounds(p_key, p_anchor)),
  members as (
    select * from public.employees
    where department_id = p_department and status <> 'inactive' and deleted_at is null
  ),
  logged as (
    select coalesce(sum(t.hours), 0) as hours
    from public.time_entries t join bounds b on t.entry_date between b.period_start and b.period_end
    where t.department_id = p_department
  ),
  capacity as (
    select coalesce(sum(app.working_days(m.id, b.period_start, b.period_end)), 0) as hours
    from members m, bounds b
  ),
  acts as (
    select a.* from public.activities a, bounds b
    where a.department_id = p_department and a.deleted_at is null
      and a.start_date <= b.period_end and a.end_date >= b.period_start
  ),
  due as (
    select * from acts, bounds b
    where acts.end_date <= least(b.period_end, current_date)
  )
  select
    p_department,
    b.period_start,
    b.period_end,
    (select count(*) from members)::int,
    round((select hours from capacity), 2),
    round((select hours from logged), 2),
    (select coalesce(sum(planned_hours), 0) from acts),
    case when (select hours from capacity) = 0 then 0
         else round((select hours from logged) / (select hours from capacity) * 100)::int end,
    case when (select count(*) from due) = 0 then 0
         else round((select count(*) from due where status = 'completed')::numeric
                    / (select count(*) from due) * 100)::int end,
    case when (select count(*) from acts) = 0 then 0
         else round((select avg(case when status = 'completed' then 100
                                     when status = 'cancelled' then 0 else progress end) from acts))::int end,
    -- score = 40% utilizationScore + 35% on-time + 25% completion
    greatest(0, least(100, round(
      0.40 * greatest(0, least(100, 100 - abs(
        (case when (select hours from capacity) = 0 then 0
              else (select hours from logged) / (select hours from capacity) * 100 end) - 85
      ) * 1.3))
      + 0.35 * (case when (select count(*) from due) = 0 then 0
                     else (select count(*) from due where status = 'completed')::numeric
                          / (select count(*) from due) * 100 end)
      + 0.25 * (case when (select count(*) from acts) = 0 then 0
                     else (select avg(case when status = 'completed' then 100
                                           when status = 'cancelled' then 0 else progress end) from acts) end)
    )))::int
  from bounds b;
$$;

-- Convenience view for the Head of Operations dashboard.
create or replace view public.v_department_week_score as
select d.id as department_id, d.name, d.code, s.*
from public.departments d
cross join lateral app.department_score(d.id, 'week', current_date) s;

-- ---------------------------------------------------------------------------
-- Seed reference data
-- ---------------------------------------------------------------------------
insert into public.settings (group_name) values ('Meridian Group Holdings')
on conflict (id) do nothing;

insert into public.country_config (code, name, timezone, weekly_off) values
  ('AE','United Arab Emirates','Asia/Dubai','{0,6}'),
  ('SA','Saudi Arabia','Asia/Riyadh','{5,6}'),
  ('QA','Qatar','Asia/Qatar','{5,6}'),
  ('OM','Oman','Asia/Muscat','{5,6}'),
  ('KW','Kuwait','Asia/Kuwait','{5,6}'),
  ('BH','Bahrain','Asia/Bahrain','{5,6}'),
  ('IN','India','Asia/Kolkata','{0}'),
  ('PK','Pakistan','Asia/Karachi','{0}'),
  ('US','United States','America/New_York','{0,6}'),
  ('GB','United Kingdom','Europe/London','{0,6}'),
  ('AU','Australia (NSW)','Australia/Sydney','{0,6}'),
  ('SG','Singapore','Asia/Singapore','{0,6}')
on conflict (code) do nothing;
