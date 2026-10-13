-- FleetOps Workforce: database, authorization, storage, and server-timestamped workflows
-- Run this migration in a new Supabase project before starting the application.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'employee');
create type public.account_status as enum ('active', 'inactive');
create type public.attendance_state as enum ('working', 'checked_out');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.assignment_status as enum ('todo', 'in_progress', 'submitted', 'completed');
create type public.review_decision as enum ('approved', 'rejected', 'revision_requested');
create type public.correction_status as enum ('pending', 'approved', 'rejected');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  description text,
  created_at timestamptz not null default now()
);

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  timezone text not null default 'Asia/Tashkent',
  start_time time not null,
  end_time time not null,
  grace_minutes integer not null default 10 check (grace_minutes between 0 and 180),
  work_days smallint[] not null default array[1,2,3,4,5]::smallint[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time <> start_time)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'employee',
  status public.account_status not null default 'active',
  full_name text not null check (char_length(full_name) between 2 and 120),
  job_title text not null default 'Employee',
  department_id uuid references public.departments(id) on delete set null,
  work_schedule_id uuid references public.work_schedules(id) on delete set null,
  email text not null,
  phone text,
  employment_start_date date not null default current_date,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_idx on public.profiles (lower(email));
create index profiles_department_status_idx on public.profiles (department_id, status);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(user_id) on delete cascade,
  work_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  state public.attendance_state not null default 'working',
  late_minutes integer not null default 0 check (late_minutes >= 0),
  total_minutes integer generated always as (
    case when clock_out is null then null else greatest(0, floor(extract(epoch from (clock_out - clock_in)) / 60)::integer) end
  ) stored,
  source text not null default 'employee' check (source in ('employee', 'admin_correction')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, work_date),
  check (clock_out is null or clock_out >= clock_in),
  check ((state = 'working' and clock_out is null) or (state = 'checked_out' and clock_out is not null))
);

create index attendance_employee_date_idx on public.attendance_records (employee_id, work_date desc);
create index attendance_date_state_idx on public.attendance_records (work_date, state);

create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references public.attendance_records(id) on delete set null,
  employee_id uuid not null references public.profiles(user_id) on delete cascade,
  work_date date not null,
  requested_clock_in timestamptz,
  requested_clock_out timestamptz,
  reason text not null check (char_length(reason) between 10 and 1000),
  status public.correction_status not null default 'pending',
  admin_note text,
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (requested_clock_in is not null or requested_clock_out is not null),
  check (requested_clock_out is null or requested_clock_in is null or requested_clock_out >= requested_clock_in)
);

create index corrections_employee_status_idx on public.attendance_corrections (employee_id, status, created_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  description text not null,
  instructions text,
  acceptance_criteria text,
  priority public.task_priority not null default 'medium',
  deadline timestamptz not null,
  created_by uuid not null default auth.uid() references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index tasks_deadline_priority_idx on public.tasks (deadline, priority);
create index tasks_created_at_idx on public.tasks (created_at desc);

create table public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  employee_id uuid not null references public.profiles(user_id) on delete cascade,
  status public.assignment_status not null default 'todo',
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  last_employee_comment text,
  last_manager_feedback text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id, employee_id)
);

create index assignments_employee_status_idx on public.task_assignments (employee_id, status, updated_at desc);
create index assignments_task_status_idx on public.task_assignments (task_id, status);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  mime_type text not null,
  uploaded_by uuid not null default auth.uid() references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create table public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.task_assignments(id) on delete cascade,
  version integer not null,
  comment text not null check (char_length(comment) between 2 and 3000),
  submitted_by uuid not null references public.profiles(user_id),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(assignment_id, version)
);

create index submissions_assignment_idx on public.task_submissions (assignment_id, version desc);

create table public.submission_attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 104857600),
  mime_type text not null,
  uploaded_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  assignment_id uuid references public.task_assignments(id) on delete cascade,
  author_id uuid not null references public.profiles(user_id),
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(user_id),
  decision public.review_decision not null,
  feedback text not null check (char_length(feedback) between 2 and 3000),
  created_at timestamptz not null default now()
);

create index task_reviews_submission_idx on public.task_reviews (submission_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, read_at, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schedules_updated before update on public.work_schedules for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger attendance_updated before update on public.attendance_records for each row execute function public.set_updated_at();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger assignments_updated before update on public.task_assignments for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, email, job_title)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Employee'), '@', 1)),
    coalesce(new.email, new.id::text || '@invalid.local'),
    coalesce(nullif(new.raw_user_meta_data ->> 'job_title', ''), 'Employee')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.user_id = check_user and p.role = 'admin' and p.status = 'active');
$$;

create or replace function public.has_task_access(check_task uuid, check_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin(check_user) or exists(
    select 1 from public.task_assignments a
    where a.task_id = check_task and a.employee_id = check_user
  );
$$;

create or replace function public.clock_in()
returns public.attendance_records
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_date date := timezone('Asia/Tashkent', v_now)::date;
  v_schedule public.work_schedules;
  v_late integer := 0;
  v_record public.attendance_records;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where user_id = v_user and status = 'active') then
    raise exception 'Account is inactive or not provisioned';
  end if;
  if exists(select 1 from public.attendance_records where employee_id = v_user and work_date = v_date) then
    raise exception 'You have already clocked in today';
  end if;

  select s.* into v_schedule from public.profiles p left join public.work_schedules s on s.id = p.work_schedule_id where p.user_id = v_user;
  if v_schedule.id is not null then
    v_late := greatest(0, floor(extract(epoch from (
      timezone(v_schedule.timezone, v_now)::time - (v_schedule.start_time + make_interval(mins => v_schedule.grace_minutes))
    )) / 60)::integer);
  end if;

  insert into public.attendance_records(employee_id, work_date, clock_in, late_minutes)
  values(v_user, v_date, v_now, v_late)
  returning * into v_record;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id) values(v_user, 'clock_in', 'attendance', v_record.id::text);
  return v_record;
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
  v_date date := timezone('Asia/Tashkent', v_now)::date;
  v_record public.attendance_records;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.attendance_records
  set clock_out = v_now, state = 'checked_out'
  where employee_id = v_user and work_date = v_date and clock_out is null
  returning * into v_record;
  if v_record.id is null then raise exception 'No active clock-in found for today'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id) values(v_user, 'clock_out', 'attendance', v_record.id::text);
  return v_record;
end;
$$;

create or replace function public.update_task_progress(p_assignment_id uuid, p_status public.assignment_status, p_progress integer, p_comment text default null)
returns public.task_assignments
language plpgsql
security definer set search_path = public
as $$
declare v_row public.task_assignments;
begin
  if p_status not in ('todo', 'in_progress') then raise exception 'Use submission workflow for submitted or completed tasks'; end if;
  if p_progress < 0 or p_progress > 99 then raise exception 'Progress must be between 0 and 99 before completion'; end if;
  update public.task_assignments
  set status = p_status, progress_percent = p_progress,
      last_employee_comment = coalesce(nullif(trim(p_comment), ''), last_employee_comment)
  where id = p_assignment_id and employee_id = auth.uid() and status <> 'completed'
  returning * into v_row;
  if v_row.id is null then raise exception 'Assignment not found or not editable'; end if;
  if nullif(trim(p_comment), '') is not null then
    insert into public.task_comments(task_id, assignment_id, author_id, body)
    values(v_row.task_id, v_row.id, auth.uid(), trim(p_comment));
  end if;
  return v_row;
end;
$$;

create or replace function public.submit_task(p_assignment_id uuid, p_comment text)
returns public.task_submissions
language plpgsql
security definer set search_path = public
as $$
declare v_assignment public.task_assignments; v_submission public.task_submissions; v_version integer;
begin
  select * into v_assignment from public.task_assignments
  where id = p_assignment_id and employee_id = auth.uid() and status in ('todo', 'in_progress') for update;
  if v_assignment.id is null then raise exception 'Assignment not found or cannot be submitted'; end if;
  if char_length(trim(coalesce(p_comment, ''))) < 2 then raise exception 'Please add a submission note'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.task_submissions where assignment_id = p_assignment_id;
  insert into public.task_submissions(assignment_id, version, comment, submitted_by)
  values(p_assignment_id, v_version, trim(p_comment), auth.uid()) returning * into v_submission;
  update public.task_assignments set status = 'submitted', progress_percent = 100, submitted_at = statement_timestamp(), last_employee_comment = trim(p_comment)
  where id = p_assignment_id;
  insert into public.task_comments(task_id, assignment_id, author_id, body)
  values(v_assignment.task_id, v_assignment.id, auth.uid(), trim(p_comment));
  insert into public.notifications(user_id, kind, title, body, link)
  select p.user_id, 'task_submitted', 'Task ready for review', t.title || ' was submitted.', '/?view=tasks'
  from public.profiles p join public.tasks t on t.id = v_assignment.task_id where p.role = 'admin' and p.status = 'active';
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'submit', 'task_submission', v_submission.id::text, jsonb_build_object('version', v_version));
  return v_submission;
end;
$$;

create or replace function public.review_submission(p_submission_id uuid, p_decision public.review_decision, p_feedback text)
returns public.task_reviews
language plpgsql
security definer set search_path = public
as $$
declare v_submission public.task_submissions; v_assignment public.task_assignments; v_task public.tasks; v_review public.task_reviews;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if char_length(trim(coalesce(p_feedback, ''))) < 2 then raise exception 'Feedback is required'; end if;
  select * into v_submission from public.task_submissions where id = p_submission_id for update;
  if v_submission.id is null then raise exception 'Submission not found'; end if;
  select * into v_assignment from public.task_assignments where id = v_submission.assignment_id for update;
  if v_assignment.status <> 'submitted' then raise exception 'This assignment is no longer awaiting review'; end if;
  select * into v_task from public.tasks where id = v_assignment.task_id;
  insert into public.task_reviews(submission_id, reviewer_id, decision, feedback)
  values(p_submission_id, auth.uid(), p_decision, trim(p_feedback)) returning * into v_review;
  update public.task_submissions set reviewed_at = statement_timestamp() where id = p_submission_id;
  if p_decision = 'approved' then
    update public.task_assignments set status = 'completed', completed_at = statement_timestamp(), progress_percent = 100, last_manager_feedback = trim(p_feedback) where id = v_assignment.id;
  else
    update public.task_assignments set status = 'in_progress', submitted_at = null, progress_percent = 90, last_manager_feedback = trim(p_feedback) where id = v_assignment.id;
  end if;
  insert into public.notifications(user_id, kind, title, body, link)
  values(v_assignment.employee_id, 'task_review', case when p_decision = 'approved' then 'Task approved' else 'Revision requested' end,
    v_task.title || ': ' || trim(p_feedback), '/?view=tasks');
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), p_decision::text, 'task_submission', p_submission_id::text, jsonb_build_object('assignment_id', v_assignment.id));
  return v_review;
end;
$$;

create or replace function public.decide_attendance_correction(p_request_id uuid, p_approve boolean, p_note text)
returns public.attendance_corrections
language plpgsql
security definer set search_path = public
as $$
declare v_req public.attendance_corrections; v_row public.attendance_corrections;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_req from public.attendance_corrections where id = p_request_id and status = 'pending' for update;
  if v_req.id is null then raise exception 'Pending request not found'; end if;
  if p_approve then
    insert into public.attendance_records(employee_id, work_date, clock_in, clock_out, state, source)
    values(v_req.employee_id, v_req.work_date, coalesce(v_req.requested_clock_in, v_req.requested_clock_out), v_req.requested_clock_out,
      case when v_req.requested_clock_out is null then 'working'::public.attendance_state else 'checked_out'::public.attendance_state end, 'admin_correction')
    on conflict (employee_id, work_date) do update set
      clock_in = coalesce(v_req.requested_clock_in, public.attendance_records.clock_in),
      clock_out = coalesce(v_req.requested_clock_out, public.attendance_records.clock_out),
      state = case when coalesce(v_req.requested_clock_out, public.attendance_records.clock_out) is null then 'working'::public.attendance_state else 'checked_out'::public.attendance_state end,
      source = 'admin_correction';
  end if;
  update public.attendance_corrections set status = case when p_approve then 'approved' else 'rejected' end::public.correction_status,
    admin_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = statement_timestamp()
  where id = p_request_id returning * into v_row;
  insert into public.notifications(user_id, kind, title, body, link)
  values(v_req.employee_id, 'attendance_correction', 'Attendance request ' || case when p_approve then 'approved' else 'rejected' end,
    coalesce(nullif(trim(p_note), ''), 'Your attendance correction request was reviewed.'), '/?view=attendance');
  return v_row;
end;
$$;

create or replace function public.notify_task_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, kind, title, body, link)
  select new.employee_id, 'task_assigned', 'New task assigned', t.title || ' · due ' || to_char(timezone('Asia/Tashkent', t.deadline), 'Mon DD, YYYY HH24:MI'), '/?view=tasks'
  from public.tasks t where t.id = new.task_id;
  return new;
end;
$$;
create trigger assignment_notification after insert on public.task_assignments for each row execute function public.notify_task_assignment();

create or replace function public.enqueue_deadline_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is not null and not public.is_admin() and auth.role() <> 'service_role' then raise exception 'Admin access required'; end if;
  insert into public.notifications(user_id, kind, title, body, link)
  select a.employee_id, 'deadline_approaching', 'Deadline approaching', t.title || ' is due within 24 hours.', '/?view=tasks'
  from public.task_assignments a join public.tasks t on t.id = a.task_id
  where a.status not in ('completed', 'submitted') and t.deadline between now() and now() + interval '24 hours'
    and not exists(select 1 from public.notifications n where n.user_id = a.employee_id and n.kind = 'deadline_approaching' and n.link = '/?view=tasks' and n.created_at > now() - interval '20 hours' and n.body like t.title || '%');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), lower(tg_op), tg_table_name, coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'user_id'),
    jsonb_build_object('changed_at', now()));
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_row_change();
create trigger audit_tasks after insert or update or delete on public.tasks for each row execute function public.audit_row_change();
create trigger audit_assignments after insert or update or delete on public.task_assignments for each row execute function public.audit_row_change();
create trigger audit_corrections after update on public.attendance_corrections for each row execute function public.audit_row_change();

alter table public.departments enable row level security;
alter table public.work_schedules enable row level security;
alter table public.profiles enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_submissions enable row level security;
alter table public.submission_attachments enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated read departments" on public.departments for select to authenticated using (true);
create policy "admins manage departments" on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated read schedules" on public.work_schedules for select to authenticated using (true);
create policy "admins manage schedules" on public.work_schedules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "profile self or admin read" on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "attendance self or admin read" on public.attendance_records for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "correction self or admin read" on public.attendance_corrections for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "employees request corrections" on public.attendance_corrections for insert to authenticated with check (employee_id = auth.uid() and status = 'pending');
create policy "task access" on public.tasks for select to authenticated using (public.has_task_access(id));
create policy "admins manage tasks" on public.tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "assignment access" on public.task_assignments for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "admins manage assignments" on public.task_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "task attachment access" on public.task_attachments for select to authenticated using (public.has_task_access(task_id));
create policy "admins manage task attachments" on public.task_attachments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "submission access" on public.task_submissions for select to authenticated using (public.is_admin() or exists(select 1 from public.task_assignments a where a.id = assignment_id and a.employee_id = auth.uid()));
create policy "submission attachment access" on public.submission_attachments for select to authenticated using (public.is_admin() or exists(select 1 from public.task_submissions s join public.task_assignments a on a.id = s.assignment_id where s.id = submission_id and a.employee_id = auth.uid()));
create policy "employees add own submission files" on public.submission_attachments for insert to authenticated with check (uploaded_by = auth.uid() and exists(select 1 from public.task_submissions s join public.task_assignments a on a.id = s.assignment_id where s.id = submission_id and a.employee_id = auth.uid()));
create policy "comment access" on public.task_comments for select to authenticated using (public.has_task_access(task_id));
create policy "participants add comments" on public.task_comments for insert to authenticated with check (author_id = auth.uid() and public.has_task_access(task_id));
create policy "review access" on public.task_reviews for select to authenticated using (public.is_admin() or exists(select 1 from public.task_submissions s join public.task_assignments a on a.id = s.assignment_id where s.id = submission_id and a.employee_id = auth.uid()));
create policy "notifications owner access" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications owner mark read" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins read audit" on public.audit_logs for select to authenticated using (public.is_admin());

grant execute on function public.clock_in() to authenticated;
grant execute on function public.clock_out() to authenticated;
grant execute on function public.update_task_progress(uuid, public.assignment_status, integer, text) to authenticated;
grant execute on function public.submit_task(uuid, text) to authenticated;
grant execute on function public.review_submission(uuid, public.review_decision, text) to authenticated;
grant execute on function public.decide_attendance_correction(uuid, boolean, text) to authenticated;
grant execute on function public.enqueue_deadline_notifications() to authenticated, service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('task-references', 'task-references', false, 26214400, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','video/mp4','application/zip','application/x-zip-compressed']),
  ('task-submissions', 'task-submissions', false, 104857600, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','video/mp4','application/zip','application/x-zip-compressed'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar owner or admin read" on storage.objects for select to authenticated using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "avatar owner write" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "admin avatar write" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and public.is_admin());
create policy "reference authorized read" on storage.objects for select to authenticated using (bucket_id = 'task-references' and public.has_task_access(((storage.foldername(name))[1])::uuid));
create policy "admin reference write" on storage.objects for insert to authenticated with check (bucket_id = 'task-references' and public.is_admin());
create policy "submission authorized read" on storage.objects for select to authenticated using (bucket_id = 'task-submissions' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy "employee submission write" on storage.objects for insert to authenticated with check (bucket_id = 'task-submissions' and (storage.foldername(name))[1] = auth.uid()::text);

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.task_assignments;

-- Safe starting records only (not fake employees).
insert into public.departments(name, description) values
  ('Operations', 'Logistics operations and coordination'),
  ('Dispatch', 'Shipment dispatch and tracking'),
  ('Human Resources', 'People operations and compliance')
on conflict (name) do nothing;

insert into public.work_schedules(name, timezone, start_time, end_time, grace_minutes)
values ('Standard Office', 'Asia/Tashkent', '09:00', '18:00', 10)
on conflict (name) do nothing;
