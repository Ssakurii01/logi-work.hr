# FleetOps Workforce

A secure, responsive employee management, attendance, task tracking, submission review, and reporting application for logistics teams. The frontend is Next-compatible Vinext/React; Supabase provides PostgreSQL, Auth, Row Level Security, private Storage, and Realtime.

## What is included

- Manager and employee portals with permission-aware navigation
- Admin employee provisioning, profile editing, scheduling, and deactivation
- Server-timestamped clock-in/clock-out in `Asia/Tashkent`
- Duplicate clock-in and invalid clock-out prevention inside PostgreSQL functions
- Attendance history, late-arrival calculation, corrections, CSV, and real XLSX exports
- Multi-employee tasks, deadlines, priorities, reference files, progress, and comments
- Versioned task submissions with multiple private attachments and manager reviews
- Approve, reject, and request-revision workflows with preserved history
- Realtime assignment and notification refreshes
- Transparent reports that explicitly require human review
- Audit log, indexes, constraints, private buckets, and complete RLS policies
- Polished desktop, tablet, and mobile interface with empty/loading/error states

No production employee demo records are seeded. The migration creates only neutral departments and one standard schedule.

## 1. Configure Supabase

1. Create a new Supabase project and save the database password in a password manager.
2. In **SQL Editor**, run the complete migration at `supabase/migrations/202610130001_fleetops.sql`. With the Supabase CLI, the equivalent is:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. In **Authentication → URL Configuration**, add the production URL and your local URL (normally `http://localhost:5173`) to the redirect allowlist.
4. In **Authentication → Providers → Email**, keep email/password enabled. For a company-managed account flow, disable public email sign-up; employee accounts are created by managers through the server-only Admin API.
5. Confirm these private buckets exist under **Storage**: `avatars`, `task-references`, and `task-submissions`. The migration creates them and their RLS policies.

All timestamps are stored as PostgreSQL `timestamptz` values (UTC internally). Work dates, schedule comparisons, and the interface use `Asia/Tashkent`.

## 2. Create the first admin

The first administrator is intentionally bootstrapped out-of-band so nobody can promote themselves through the public app.

1. Apply the database migration first.
2. In **Supabase → Authentication → Users**, choose **Add user → Create new user**. Enter the manager email and a strong temporary password, and mark the email confirmed.
3. Open **SQL Editor** and run the following, replacing the values:

   ```sql
   update public.profiles
   set
     role = 'admin',
     status = 'active',
     full_name = 'FIRST ADMIN NAME',
     job_title = 'HR Manager',
     employment_start_date = current_date,
     work_schedule_id = (select id from public.work_schedules where name = 'Standard Office')
   where lower(email) = lower('ADMIN@COMPANY.COM');
   ```

4. Verify exactly one row was promoted:

   ```sql
   select user_id, email, full_name, role, status
   from public.profiles
   where role = 'admin';
   ```

After signing in, that administrator can create employee accounts from **Employees → Add employee**. Employee passwords are handled only by Supabase Auth and never stored in application tables.

## 3. Environment variables

Copy `.env.example` to `.env.local` for development:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are passed to the authenticated browser client. The anon/publishable key is safe to expose because authorization is enforced by RLS.
- `SUPABASE_SERVICE_ROLE_KEY` is used only by `/api/admin/employees` after the caller's JWT and admin profile are verified. It must remain a server secret.
- Never prefix the service-role key with `NEXT_PUBLIC_`, commit it, log it, or paste it into frontend code.

## 4. Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the printed loopback URL. Useful checks:

```bash
npm run build
npm run lint
```

## 5. Deploy

### ChatGPT Sites (the configured deployment)

This repository contains `.openai/hosting.json` for the registered private Site. In the Sites project environment, add the three variables above and mark `SUPABASE_SERVICE_ROLE_KEY` as a secret. Save a new version and deploy it. A redeploy is required after environment changes so the Worker receives the new environment revision.

The initial Site is owner-private. Change its audience only after Supabase Auth and RLS have been configured and tested for every intended user. Hosting access is an outer gate; Supabase authentication and RLS remain the application authorization layer.

### Vercel or another Next-compatible host

1. Import this repository.
2. Add all three environment variables to Production and Preview.
3. Use `npm run build` as the build command.
4. Deploy, then add the final HTTPS origin to the Supabase Auth redirect allowlist.

The application does not require a publicly exposed service key on any host.

## 6. Optional deadline notification schedule

Assignment notifications are immediate. To enqueue “due within 24 hours” reminders automatically, enable Supabase Cron (`pg_cron`) and schedule the secured database function from the SQL editor:

```sql
select cron.schedule(
  'fleetops-deadline-reminders',
  '0 * * * *',
  $$ select public.enqueue_deadline_notifications(); $$
);
```

Run this only in the intended production project. The function de-duplicates reminders for 20 hours.

## Security and operating notes

- RLS is enabled on every application table. Employees can read only their profile, attendance, assigned tasks, submissions, reviews, and notifications.
- Attendance rows cannot be inserted or edited directly by employees. `clock_in()` and `clock_out()` use `statement_timestamp()` on the database server.
- Manager-only operations are checked in PostgreSQL or in a server route that verifies the caller with `auth.getUser()` and confirms an active admin profile.
- Storage buckets are private. Downloads use five-minute signed URLs after Storage RLS authorization.
- Allowed uploads are PDF, DOC/DOCX, XLS/XLSX, JPG/PNG, MP4, and ZIP. Reference files are limited to 25 MB; submission files to 100 MB; avatars to 5 MB.
- Keep Supabase point-in-time recovery/backups enabled for production, rotate the service-role key if exposed, and review `audit_logs` after administrative changes.
- Test role isolation with two separate accounts before onboarding employees.

## Recommended production checklist

- [ ] Migration applied without errors
- [ ] First admin created and verified
- [ ] Public email sign-up disabled
- [ ] Production and local redirect URLs configured
- [ ] Service-role key stored only as a server secret
- [ ] Private storage uploads/downloads tested with admin and employee accounts
- [ ] Clock-in/clock-out tested around the assigned schedule
- [ ] Employee cannot read another employee's rows through the Supabase API
- [ ] Task submission, rejection, revision, and approval tested end to end
- [ ] CSV and Excel exports opened successfully
- [ ] Backup/retention policy and HR data policy approved

