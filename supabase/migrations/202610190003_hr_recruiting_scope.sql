-- FleetOps HR Workforce: align safe default departments with the HR/recruiting scope.
-- Existing departments referenced by employee profiles are preserved.

insert into public.departments(name, description) values
  ('Human Resources', 'People operations, employee support, and policy administration'),
  ('Recruiting', 'Candidate sourcing, screening, and hiring coordination'),
  ('HR Compliance', 'Workforce documentation, audits, and policy compliance')
on conflict (name) do update set description = excluded.description;

delete from public.departments department
where department.name in ('Operations', 'Dispatch')
  and not exists (
    select 1
    from public.profiles profile
    where profile.department_id = department.id
  );
