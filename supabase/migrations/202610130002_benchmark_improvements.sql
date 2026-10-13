-- FleetOps Workforce benchmark improvements
-- Adds server-verified breaks, reusable task playbooks, and assignment checklists.

alter table public.attendance_records
  add column break_minutes integer not null default 0 check (break_minutes >= 0);

alter table public.attendance_records drop column total_minutes;

alter table public.attendance_records
  add column total_minutes integer generated always as (
    case
      when clock_out is null then null
      else greatest(
        0,
        floor(extract(epoch from (clock_out - clock_in)) / 60)::integer - break_minutes
      )
    end
  ) stored;

create table public.attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance_records(id) on delete cascade,
  employee_id uuid not null references public.profiles(user_id) on delete cascade,
  started_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz,
  total_minutes integer generated always as (
    case
      when ended_at is null then null
      else greatest(0, floor(extract(epoch from (ended_at - started_at)) / 60)::integer)
    end
  ) stored,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index attendance_breaks_record_idx on public.attendance_breaks (attendance_id, started_at);
create index attendance_breaks_employee_idx on public.attendance_breaks (employee_id, started_at desc);
create unique index attendance_breaks_one_active_idx on public.attendance_breaks (employee_id) where ended_at is null;

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  description text not null,
  instructions text,
  acceptance_criteria text,
  priority public.task_priority not null default 'medium',
  default_due_hours integer not null default 24 check (default_due_hours between 1 and 8760),
  checklist text[] not null default '{}'::text[],
  active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_templates_active_title_idx on public.task_templates (active, title);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 240),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique(task_id, position)
);

create index task_checklist_items_task_idx on public.task_checklist_items (task_id, position);

create table public.assignment_checklist_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.task_assignments(id) on delete cascade,
  checklist_item_id uuid not null references public.task_checklist_items(id) on delete cascade,
  completed_at timestamptz,
  completed_by uuid references public.profiles(user_id) on delete set null,
  unique(assignment_id, checklist_item_id)
);

create index assignment_checklist_assignment_idx on public.assignment_checklist_items (assignment_id);

create trigger task_templates_updated before update on public.task_templates
for each row execute function public.set_updated_at();

create or replace function public.seed_assignment_checklist()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.assignment_checklist_items(assignment_id, checklist_item_id)
  select new.id, item.id
  from public.task_checklist_items item
  where item.task_id = new.task_id
  order by item.position;
  return new;
end;
$$;

create trigger seed_assignment_checklist_after_insert
after insert on public.task_assignments
for each row execute function public.seed_assignment_checklist();

create or replace function public.start_break()
returns public.attendance_breaks
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_attendance public.attendance_records;
  v_break public.attendance_breaks;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_attendance
  from public.attendance_records
  where employee_id = v_user and clock_out is null
  order by clock_in desc limit 1
  for update;
  if v_attendance.id is null then raise exception 'Clock in before starting a break'; end if;
  if exists(select 1 from public.attendance_breaks where employee_id = v_user and ended_at is null) then
    raise exception 'You already have an active break';
  end if;
  insert into public.attendance_breaks(attendance_id, employee_id)
  values(v_attendance.id, v_user)
  returning * into v_break;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id)
  values(v_user, 'break_started', 'attendance_break', v_break.id::text);
  return v_break;
end;
$$;

create or replace function public.end_break()
returns public.attendance_breaks
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_break public.attendance_breaks;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.attendance_breaks
  set ended_at = statement_timestamp()
  where id = (
    select id from public.attendance_breaks
    where employee_id = v_user and ended_at is null
    order by started_at desc limit 1
  )
  returning * into v_break;
  if v_break.id is null then raise exception 'No active break found'; end if;

  update public.attendance_records record
  set break_minutes = coalesce((
    select sum(coalesce(item.total_minutes, 0))::integer
    from public.attendance_breaks item
    where item.attendance_id = record.id
  ), 0)
  where record.id = v_break.attendance_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id)
  values(v_user, 'break_ended', 'attendance_break', v_break.id::text);
  return v_break;
end;
$$;

create or replace function public.clock_out()
returns public.attendance_records
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_record public.attendance_records;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_record
  from public.attendance_records
  where employee_id = v_user and clock_out is null
  order by clock_in desc limit 1
  for update;
  if v_record.id is null then raise exception 'No active clock-in found'; end if;
  if exists(select 1 from public.attendance_breaks where employee_id = v_user and ended_at is null) then
    raise exception 'End your active break before clocking out';
  end if;
  update public.attendance_records
  set clock_out = v_now, state = 'checked_out'
  where id = v_record.id
  returning * into v_record;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id)
  values(v_user, 'clock_out', 'attendance', v_record.id::text);
  return v_record;
end;
$$;

create or replace function public.set_checklist_item(
  p_assignment_id uuid,
  p_checklist_item_id uuid,
  p_complete boolean
)
returns public.assignment_checklist_items
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_assignment public.task_assignments;
  v_item public.assignment_checklist_items;
  v_total integer;
  v_done integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_assignment from public.task_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then raise exception 'Assignment not found'; end if;
  if v_assignment.employee_id <> v_user then raise exception 'You cannot update this checklist'; end if;
  if v_assignment.status in ('submitted', 'completed') then raise exception 'This task is locked for review'; end if;

  update public.assignment_checklist_items
  set completed_at = case when p_complete then statement_timestamp() else null end,
      completed_by = case when p_complete then v_user else null end
  where assignment_id = p_assignment_id and checklist_item_id = p_checklist_item_id
  returning * into v_item;
  if v_item.id is null then raise exception 'Checklist item not found'; end if;

  select count(*), count(*) filter (where completed_at is not null)
  into v_total, v_done
  from public.assignment_checklist_items
  where assignment_id = p_assignment_id;

  update public.task_assignments
  set progress_percent = case when v_total = 0 then progress_percent else least(99, round(v_done * 100.0 / v_total)::integer) end,
      status = case when v_done > 0 and status = 'todo' then 'in_progress'::public.assignment_status else status end
  where id = p_assignment_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(v_user, case when p_complete then 'checklist_completed' else 'checklist_reopened' end, 'task_assignment', p_assignment_id::text, jsonb_build_object('checklist_item_id', p_checklist_item_id));
  return v_item;
end;
$$;

alter table public.attendance_breaks enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.assignment_checklist_items enable row level security;

create policy "attendance break self or admin read" on public.attendance_breaks
for select to authenticated using (employee_id = auth.uid() or public.is_admin());

create policy "admins manage task templates" on public.task_templates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "task checklist access" on public.task_checklist_items
for select to authenticated using (public.has_task_access(task_id));

create policy "admins manage task checklists" on public.task_checklist_items
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "assignment checklist access" on public.assignment_checklist_items
for select to authenticated using (
  public.is_admin() or exists(
    select 1 from public.task_assignments assignment
    where assignment.id = public.assignment_checklist_items.assignment_id
      and assignment.employee_id = auth.uid()
  )
);

-- Supabase functions are executable by PUBLIC unless explicitly revoked. Keep all
-- browser-callable security-definer workflows behind an authenticated JWT.
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.has_task_access(uuid, uuid) from public, anon;
revoke execute on function public.clock_in() from public, anon;
revoke execute on function public.clock_out() from public, anon;
revoke execute on function public.update_task_progress(uuid, public.assignment_status, integer, text) from public, anon;
revoke execute on function public.submit_task(uuid, text) from public, anon;
revoke execute on function public.review_submission(uuid, public.review_decision, text) from public, anon;
revoke execute on function public.decide_attendance_correction(uuid, boolean, text) from public, anon;
revoke execute on function public.enqueue_deadline_notifications() from public, anon;
revoke execute on function public.start_break() from public, anon;
revoke execute on function public.end_break() from public, anon;
revoke execute on function public.set_checklist_item(uuid, uuid, boolean) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.has_task_access(uuid, uuid) to authenticated;
grant execute on function public.start_break() to authenticated;
grant execute on function public.end_break() to authenticated;
grant execute on function public.set_checklist_item(uuid, uuid, boolean) to authenticated;

alter publication supabase_realtime add table public.attendance_breaks;
alter publication supabase_realtime add table public.assignment_checklist_items;
