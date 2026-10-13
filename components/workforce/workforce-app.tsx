"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  Activity, AlertTriangle, ArrowDownToLine, Bell, BriefcaseBusiness, Building2,
  BookTemplate, CalendarClock, Check, CheckCircle2, ChevronDown, CircleGauge, ClipboardCheck, Clock3,
  Coffee, Columns3, Copy, FileText, Filter, LayoutDashboard, List, Loader2, LogOut, Menu, MessageSquareText,
  PackageCheck, Paperclip, Plus, RefreshCw, Search, Settings,
  ShieldCheck, TimerReset, Truck, Upload, UserPlus, Users, X, XCircle,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import type { PublicConfig } from "@/lib/workforce";
import { formatDateTime, formatDuration, formatTime, localDateKey, safeFileName, TASHKENT_TIME_ZONE } from "@/lib/workforce";

type Row = Record<string, any>;
type View = "dashboard" | "attendance" | "tasks" | "employees" | "reports" | "notifications" | "settings";

const NAV: ReadonlyArray<{ id: View; label: string; icon: any; admin?: boolean }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "attendance", label: "Attendance", icon: CalendarClock },
  { id: "tasks", label: "Tasks", icon: ClipboardCheck },
  { id: "employees", label: "Employees", icon: Users, admin: true },
  { id: "reports", label: "Reports", icon: CircleGauge, admin: true },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings },
];

const FILE_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "mp4", "zip"];
const ACCEPT = FILE_EXTENSIONS.map((extension) => `.${extension}`).join(",");

export function WorkforceApp({ config }: { config: PublicConfig }) {
  const client = useMemo(() => config.configured ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }) : null, [config]);

  if (!client) return <SetupRequired />;
  return <AuthenticatedApp client={client} />;
}

function AuthenticatedApp({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Row | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
      if (active && !data.session) setInitializing(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setInitializing(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    if (!session?.user.id) return;
    setInitializing(true);
    client.from("profiles")
      .select("*, departments(name), work_schedules(*)")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data, error: profileError }) => {
        if (profileError) setError(profileError.message);
        else if (data?.status !== "active") setError("This account is inactive. Contact your manager.");
        else { setProfile(data); setError(""); }
        setInitializing(false);
      });
  }, [client, session?.user.id]);

  if (initializing) return <FullScreenLoader label="Securing your workspace…" />;
  if (!session) return <LoginScreen client={client} />;
  if (!profile || error) return <AccountIssue error={error || "Your employee profile has not been provisioned."} onSignOut={() => client.auth.signOut()} />;
  return <Portal client={client} session={session} profile={profile} setProfile={setProfile} />;
}

function LoginScreen({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    setBusy(false);
  }

  return (
    <main className="login-page">
      <div className="login-brand">
        <div className="brand-mark large"><Truck /></div>
        <span>FLEETOPS</span>
      </div>
      <section className="login-copy">
        <div className="eyebrow"><ShieldCheck size={16} /> SECURE WORKFORCE OPERATIONS</div>
        <h1>Keep every shift and shipment moving.</h1>
        <p>One accountable workspace for people, attendance, assignments, and delivery performance.</p>
        <div className="login-proof">
          <div><strong>Server verified</strong><span>Attendance timestamps</span></div>
          <div><strong>Private by design</strong><span>Role-based employee records</span></div>
          <div><strong>Built for logistics</strong><span>Clear deadlines and handoffs</span></div>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand"><div className="brand-mark"><Truck /></div><b>FLEETOPS</b></div>
          <p className="overline">WORKFORCE PORTAL</p>
          <h2>Welcome back</h2>
          <p className="subtle">Sign in with your company account.</p>
          <label className="field"><span>Work email</span><input required type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span>Password</span><input required type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {message && <div className="form-error"><AlertTriangle size={16} />{message}</div>}
          <button className="button primary wide" disabled={busy}>{busy ? <><Loader2 className="spin" size={17} /> Signing in…</> : "Sign in securely"}</button>
          <p className="login-help">Need access? Contact your HR manager. Accounts are created by administrators only.</p>
        </form>
      </section>
    </main>
  );
}

function Portal({ client, session, profile, setProfile }: { client: SupabaseClient; session: Session; profile: Row; setProfile: (p: Row) => void }) {
  const isAdmin = profile.role === "admin";
  const initialView = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") as View : null;
  const [view, setView] = useState<View>(initialView && NAV.some((item) => item.id === initialView) ? initialView : "dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<{ employees: Row[]; attendance: Row[]; breaks: Row[]; tasks: Row[]; templates: Row[]; assignments: Row[]; assignmentChecklist: Row[]; submissions: Row[]; corrections: Row[]; departments: Row[]; schedules: Row[]; notifications: Row[] }>({ employees: [], attendance: [], breaks: [], tasks: [], templates: [], assignments: [], assignmentChecklist: [], submissions: [], corrections: [], departments: [], schedules: [], notifications: [] });

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setBusy(true);
    const common = [
      client.from("departments").select("*").order("name"),
      client.from("work_schedules").select("*").order("name"),
      client.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
    ];
    const scoped = isAdmin ? [
      client.from("profiles").select("*, departments(name), work_schedules(name,start_time,end_time,grace_minutes,timezone)").order("full_name"),
      client.from("attendance_records").select("*, profiles!attendance_records_employee_id_fkey(full_name,job_title)").order("work_date", { ascending: false }),
      client.from("attendance_breaks").select("*").order("started_at", { ascending: false }),
      client.from("tasks").select("*, task_attachments(*), task_checklist_items(*)").order("created_at", { ascending: false }),
      client.from("task_assignments").select("*, profiles!task_assignments_employee_id_fkey(full_name,job_title), tasks(*, task_attachments(*), task_checklist_items(*))").order("updated_at", { ascending: false }),
      client.from("assignment_checklist_items").select("*"),
      client.from("task_submissions").select("*, submission_attachments(*), task_reviews(*), task_assignments(*, tasks(*), profiles!task_assignments_employee_id_fkey(full_name,job_title))").order("submitted_at", { ascending: false }),
      client.from("attendance_corrections").select("*, profiles!attendance_corrections_employee_id_fkey(full_name,job_title)").order("created_at", { ascending: false }),
      client.from("task_templates").select("*").eq("active", true).order("title"),
    ] : [
      Promise.resolve({ data: [profile], error: null }),
      client.from("attendance_records").select("*").order("work_date", { ascending: false }),
      client.from("attendance_breaks").select("*").order("started_at", { ascending: false }),
      Promise.resolve({ data: [], error: null }),
      client.from("task_assignments").select("*, tasks(*, task_attachments(*), task_checklist_items(*))").order("updated_at", { ascending: false }),
      client.from("assignment_checklist_items").select("*"),
      client.from("task_submissions").select("*, submission_attachments(*), task_reviews(*), task_assignments!inner(employee_id)").order("submitted_at", { ascending: false }),
      client.from("attendance_corrections").select("*").order("created_at", { ascending: false }),
      Promise.resolve({ data: [], error: null }),
    ];
    const results = await Promise.all([...common, ...scoped] as any);
    const failure = results.find((result: any) => result.error)?.error;
    if (failure) toast.error(failure.message);
    setData({
      departments: results[0].data ?? [], schedules: results[1].data ?? [], notifications: results[2].data ?? [],
      employees: results[3].data ?? [], attendance: results[4].data ?? [], breaks: results[5].data ?? [], tasks: results[6].data ?? [], assignments: results[7].data ?? [], assignmentChecklist: results[8].data ?? [], submissions: results[9].data ?? [], corrections: results[10].data ?? [], templates: results[11].data ?? [],
    });
    setBusy(false); setRefreshing(false);
  }, [client, isAdmin, profile]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const channel = client.channel(`workforce-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignments" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_breaks" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_checklist_items" }, () => loadData(true))
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [client, loadData, session.user.id]);

  function navigate(next: View) {
    setView(next); setMobileOpen(false);
    const url = new URL(window.location.href); url.searchParams.set("view", next); window.history.replaceState({}, "", url);
  }

  const unread = data.notifications.filter((notification) => !notification.read_at).length;
  const context = { client, session, profile, isAdmin, data, reload: () => loadData(true), setProfile };

  return (
    <div className="portal">
      <Toaster richColors position="top-right" />
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <div className="wordmark"><div className="brand-mark"><Truck /></div><div><b>FLEETOPS</b><span>WORKFORCE</span></div></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></button>
        </div>
        <nav>
          <p className="nav-label">WORKSPACE</p>
          {NAV.filter((item) => !item.admin || isAdmin).map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id as View)}>
              <item.icon size={19} /><span>{item.label}</span>{item.id === "notifications" && unread > 0 && <em>{unread}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <Avatar name={profile.full_name} />
          <div><b>{profile.full_name}</b><span>{profile.job_title}</span></div>
          <button className="icon-button" onClick={() => client.auth.signOut()} aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu /></button>
          <div><p>{isAdmin ? "MANAGER OPERATIONS" : "MY WORKSPACE"}</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div>
          <div className="topbar-actions">
            <span className="timezone"><Clock3 size={15} /> <LiveTime /></span>
            <button className="icon-button notification-button" onClick={() => navigate("notifications")} aria-label="Notifications"><Bell size={19} />{unread > 0 && <i />}</button>
            <button className="icon-button" onClick={() => loadData(true)} disabled={refreshing} aria-label="Refresh"><RefreshCw size={18} className={refreshing ? "spin" : ""} /></button>
          </div>
        </header>
        <div className="content">
          {busy ? <PageSkeleton /> : <ViewRouter view={view} context={context} />}
        </div>
      </main>
    </div>
  );
}

type Context = {
  client: SupabaseClient; session: Session; profile: Row; isAdmin: boolean;
  data: { employees: Row[]; attendance: Row[]; breaks: Row[]; tasks: Row[]; templates: Row[]; assignments: Row[]; assignmentChecklist: Row[]; submissions: Row[]; corrections: Row[]; departments: Row[]; schedules: Row[]; notifications: Row[] };
  reload: () => void; setProfile: (profile: Row) => void;
};

function ViewRouter({ view, context }: { view: View; context: Context }) {
  if (view === "dashboard") return <Dashboard {...context} />;
  if (view === "attendance") return <Attendance {...context} />;
  if (view === "tasks") return <Tasks {...context} />;
  if (view === "employees") return context.isAdmin ? <Employees {...context} /> : <NotAllowed />;
  if (view === "reports") return context.isAdmin ? <Reports {...context} /> : <NotAllowed />;
  if (view === "notifications") return <Notifications {...context} />;
  return <SettingsView {...context} />;
}

function Dashboard(context: Context) {
  const { isAdmin, profile, data, client, reload } = context;
  const today = localDateKey();
  const todayAttendance = data.attendance.filter((record) => record.work_date === today);
  const ownToday = todayAttendance.find((record) => record.employee_id === profile.user_id);
  const activeEmployees = data.employees.filter((employee) => employee.role === "employee" && employee.status === "active");
  const assignments = data.assignments;
  const overdue = assignments.filter((assignment) => assignment.status !== "completed" && new Date(assignment.tasks?.deadline) < new Date());

  const adminStats = [
    { label: "Active employees", value: activeEmployees.length, icon: Users, tone: "blue" },
    { label: "Currently working", value: todayAttendance.filter((row) => row.state === "working").length, icon: Activity, tone: "green" },
    { label: "Not checked in", value: Math.max(0, activeEmployees.length - todayAttendance.length), icon: Clock3, tone: "slate" },
    { label: "Late today", value: todayAttendance.filter((row) => row.late_minutes > 0).length, icon: AlertTriangle, tone: "amber" },
    { label: "Assigned today", value: assignments.filter((row) => row.created_at && localDateKey(new Date(row.created_at)) === today).length, icon: FileText, tone: "blue" },
    { label: "In progress", value: assignments.filter((row) => row.status === "in_progress").length, icon: Activity, tone: "slate" },
    { label: "Awaiting review", value: assignments.filter((row) => row.status === "submitted").length, icon: ClipboardCheck, tone: "violet" },
    { label: "Completed", value: assignments.filter((row) => row.status === "completed").length, icon: CheckCircle2, tone: "green" },
    { label: "Overdue tasks", value: overdue.length, icon: TimerReset, tone: "red" },
  ];
  const employeeStats = [
    { label: "Active tasks", value: assignments.filter((row) => ["todo", "in_progress"].includes(row.status)).length, icon: BriefcaseBusiness, tone: "blue" },
    { label: "Awaiting approval", value: assignments.filter((row) => row.status === "submitted").length, icon: ClipboardCheck, tone: "violet" },
    { label: "Completed this month", value: assignments.filter((row) => row.status === "completed" && row.completed_at?.slice(0, 7) === today.slice(0, 7)).length, icon: CheckCircle2, tone: "green" },
    { label: "Overdue", value: overdue.length, icon: AlertTriangle, tone: "red" },
  ];

  return <>
    <section className="page-heading">
      <div><p className="eyebrow">{new Intl.DateTimeFormat("en-US", { timeZone: TASHKENT_TIME_ZONE, weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h2>{isAdmin ? "Good day, " : "Welcome back, "}{profile.full_name.split(" ")[0]}.</h2><p>{isAdmin ? "Here’s the latest across your workforce." : "Here’s what needs your attention today."}</p></div>
      {!isAdmin && <AttendanceButtons client={client} attendance={ownToday} breaks={data.breaks.filter((item) => item.attendance_id === ownToday?.id)} reload={reload} compact />}
    </section>
    <section className={`stat-grid ${isAdmin ? "six" : "four"}`}>{(isAdmin ? adminStats : employeeStats).map((stat) => <StatCard key={stat.label} {...stat} />)}</section>
    <section className="dashboard-grid">
      <div className="card span-2">
        <CardHeader title={isAdmin ? "Today’s attendance" : "Priority tasks"} eyebrow={isAdmin ? "LIVE OPERATIONS" : "YOUR QUEUE"} />
        {isAdmin ? <AttendanceTable rows={todayAttendance} employees={data.employees} breaks={data.breaks} compact /> : <TaskList rows={assignments.filter((a) => a.status !== "completed").slice(0, 5)} employee />}
      </div>
      <div className="card">
        <CardHeader title={isAdmin ? "Task flow" : "Today’s time"} eyebrow={isAdmin ? "DELIVERY STATUS" : "ATTENDANCE"} />
        {isAdmin ? <TaskFlow rows={assignments} /> : <TodayCard attendance={ownToday} />}
      </div>
      <div className="card span-3">
        <CardHeader title={isAdmin ? "Attention required" : "Recent manager feedback"} eyebrow="ACTION CENTER" />
        {isAdmin ? <AttentionList overdue={overdue} submissions={data.submissions.filter((s) => !s.reviewed_at)} corrections={data.corrections.filter((c) => c.status === "pending")} /> : <FeedbackList assignments={assignments} />}
      </div>
    </section>
  </>;
}

function Attendance(context: Context) {
  const { isAdmin, profile, data, client, reload } = context;
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const today = localDateKey();
  const ownToday = data.attendance.find((row) => row.employee_id === profile.user_id && row.work_date === today);
  const rows = data.attendance.filter((row) => !search || (row.profiles?.full_name ?? profile.full_name).toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "name" ? String(a.profiles?.full_name ?? profile.full_name).localeCompare(String(b.profiles?.full_name ?? profile.full_name)) : sort === "hours" ? (b.total_minutes ?? 0) - (a.total_minutes ?? 0) : String(b.work_date).localeCompare(String(a.work_date)));
  const pageSize = 20; const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const totalMinutes = rows.reduce((sum, row) => sum + (row.total_minutes ?? 0), 0);

  return <>
    <section className="page-heading aligned">
      <div><p className="eyebrow">TIME & ATTENDANCE</p><h2>{isAdmin ? "Attendance control center" : "Your attendance"}</h2><p>All timestamps are recorded by the server in Asia/Tashkent.</p></div>
      <div className="heading-actions">
        {!isAdmin && <button className="button secondary" onClick={() => setCorrectionOpen(true)}><TimerReset size={17} /> Request correction</button>}
        {isAdmin && <ExportButtons rows={attendanceExportRows(rows, data.employees)} filename="attendance-report" />}
      </div>
    </section>
    {!isAdmin && <div className="attendance-hero card"><div><span className={`status-dot ${ownToday?.state ?? "not-started"}`} /><p>CURRENT STATUS</p><h3>{data.breaks.some((item) => item.attendance_id === ownToday?.id && !item.ended_at) ? "On break" : ownToday?.state === "working" ? "Working" : ownToday?.state === "checked_out" ? "Checked out" : "Not checked in"}</h3><span>{ownToday ? `${formatTime(ownToday.clock_in)} — ${formatTime(ownToday.clock_out)} · ${ownToday.break_minutes ?? 0}m breaks` : "Start your workday when you arrive at the office."}</span></div><AttendanceButtons client={client} attendance={ownToday} breaks={data.breaks.filter((item) => item.attendance_id === ownToday?.id)} reload={reload} /></div>}
    <section className="stat-grid four compact-stats">
      <StatCard label={isAdmin ? "Records this month" : "Days worked"} value={rows.length} icon={CalendarClock} tone="blue" />
      <StatCard label="Total hours" value={formatDuration(totalMinutes)} icon={Clock3} tone="green" />
      <StatCard label="Late arrivals" value={rows.filter((row) => row.late_minutes > 0).length} icon={AlertTriangle} tone="amber" />
      <StatCard label="Missing clock-outs" value={rows.filter((row) => row.work_date < today && !row.clock_out).length} icon={TimerReset} tone="red" />
    </section>
    <section className="card table-card">
      <div className="table-toolbar"><div><h3>{isAdmin ? "Employee attendance" : "Attendance history"}</h3><p>{rows.length} records this month</p></div><div className="heading-actions">{isAdmin && <SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search employees…" />}<Select value={sort} onChange={setSort} options={[["newest","Newest first"],["name","Employee name"],["hours","Most hours"]]} /></div></div>
      <AttendanceTable rows={pageRows} employees={data.employees} breaks={data.breaks} /><TablePager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
    </section>
    {isAdmin && data.corrections.some((item) => item.status === "pending") && <section className="card"><CardHeader title="Correction requests" eyebrow="ADMIN REVIEW" /><CorrectionRequests rows={data.corrections} client={client} reload={reload} /></section>}
    {correctionOpen && <CorrectionModal client={client} profile={profile} attendance={ownToday} onClose={() => setCorrectionOpen(false)} onSaved={() => { setCorrectionOpen(false); reload(); }} />}
  </>;
}

function Tasks(context: Context) {
  const { isAdmin, data, client, session, reload } = context;
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [deadline, setDeadline] = useState("all");
  const [sort, setSort] = useState("deadline");
  const [page, setPage] = useState(1);
  const [display, setDisplay] = useState<"list" | "board">("list");
  const today = new Date();
  const filteredRows = data.assignments.filter((assignment) => {
    const task = assignment.tasks ?? data.tasks.find((item) => item.id === assignment.task_id);
    if (!task) return false;
    const deadlineDate = new Date(task.deadline);
    return (status === "all" || assignment.status === status) && (priority === "all" || task.priority === priority) && (!search || task.title.toLowerCase().includes(search.toLowerCase())) &&
      (deadline === "all" || (deadline === "overdue" && assignment.status !== "completed" && deadlineDate < today) || (deadline === "week" && deadlineDate >= today && deadlineDate <= new Date(today.getTime() + 7 * 86400000)));
  });
  const rows = [...filteredRows].sort((a, b) => sort === "priority" ? priorityRank(b.tasks?.priority) - priorityRank(a.tasks?.priority) : sort === "updated" ? new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime() : new Date(a.tasks?.deadline).getTime() - new Date(b.tasks?.deadline).getTime());
  const pageSize = 15; const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return <>
    <section className="page-heading aligned"><div><p className="eyebrow">TASK OPERATIONS</p><h2>{isAdmin ? "Assignments & review" : "Your task queue"}</h2><p>{isAdmin ? "Create clear work, track progress, and close the review loop." : "Everything assigned to you, with deadlines and feedback in one place."}</p></div>{isAdmin && <button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Create task</button>}</section>
    <section className="stat-grid four compact-stats">
      <StatCard label="To do" value={data.assignments.filter((a) => a.status === "todo").length} icon={FileText} tone="slate" />
      <StatCard label="In progress" value={data.assignments.filter((a) => a.status === "in_progress").length} icon={Activity} tone="blue" />
      <StatCard label="Awaiting review" value={data.assignments.filter((a) => a.status === "submitted").length} icon={ClipboardCheck} tone="violet" />
      <StatCard label="Completed" value={data.assignments.filter((a) => a.status === "completed").length} icon={PackageCheck} tone="green" />
    </section>
    {isAdmin && <WorkloadStrip assignments={data.assignments} employees={data.employees} />}
    <section className="card table-card">
      <div className="table-toolbar filters"><SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search tasks…" /><Select value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[["all","All statuses"],["todo","To do"],["in_progress","In progress"],["submitted","Submitted"],["completed","Completed"]]} /><Select value={priority} onChange={(value) => { setPriority(value); setPage(1); }} options={[["all","All priorities"],["low","Low"],["medium","Medium"],["high","High"],["urgent","Urgent"]]} /><Select value={deadline} onChange={(value) => { setDeadline(value); setPage(1); }} options={[["all","Any deadline"],["week","Due this week"],["overdue","Overdue"]]} /><Select value={sort} onChange={setSort} options={[["deadline","Deadline first"],["priority","Highest priority"],["updated","Recently updated"]]} /><div className="view-switch" aria-label="Task display"><button className={display === "list" ? "active" : ""} onClick={() => setDisplay("list")} aria-label="List view"><List size={16} /></button><button className={display === "board" ? "active" : ""} onClick={() => setDisplay("board")} aria-label="Board view"><Columns3 size={16} /></button></div></div>
      {display === "list" ? <><TaskTable rows={pageRows} isAdmin={isAdmin} onOpen={setSelected} /><TablePager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} /></> : <TaskBoard rows={rows} isAdmin={isAdmin} onOpen={setSelected} />}
    </section>
    {createOpen && <CreateTaskModal client={client} employees={data.employees} templates={data.templates} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload(); }} />}
    {selected && <TaskDetailModal client={client} session={session} assignment={selected} isAdmin={isAdmin} checklistState={data.assignmentChecklist.filter((item) => item.assignment_id === selected.id)} submissions={data.submissions.filter((submission) => submission.assignment_id === selected.id)} onClose={() => setSelected(null)} onRefresh={reload} onSaved={() => { setSelected(null); reload(); }} />}
  </>;
}

function Employees(context: Context) {
  const { data, session, reload } = context;
  const [modal, setModal] = useState<Row | true | null>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const filteredEmployees = data.employees.filter((employee) => employee.role === "employee" && (!search || `${employee.full_name} ${employee.email} ${employee.job_title}`.toLowerCase().includes(search.toLowerCase())) && (department === "all" || employee.department_id === department) && (status === "all" || employee.status === status)).sort((a, b) => sort === "start" ? String(b.employment_start_date).localeCompare(String(a.employment_start_date)) : sort === "department" ? String(a.departments?.name ?? "").localeCompare(String(b.departments?.name ?? "")) : String(a.full_name).localeCompare(String(b.full_name)));
  const pageSize = 15; const employees = filteredEmployees.slice((page - 1) * pageSize, page * pageSize);

  async function toggleEmployee(employee: Row) {
    if (!confirm(`${employee.status === "active" ? "Deactivate" : "Reactivate"} ${employee.full_name}?`)) return;
    const response = await fetch("/api/admin/employees", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ user_id: employee.user_id, status: employee.status === "active" ? "inactive" : "active" }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return toast.error(result.error ?? "Could not update employee");
    toast.success("Employee account updated"); reload();
  }

  return <>
    <section className="page-heading aligned"><div><p className="eyebrow">PEOPLE DIRECTORY</p><h2>Employee management</h2><p>Provision accounts, schedules, departments, and access status.</p></div><button className="button primary" onClick={() => setModal(true)}><UserPlus size={18} /> Add employee</button></section>
    <section className="stat-grid four compact-stats">
      <StatCard label="Active employees" value={data.employees.filter((e) => e.role === "employee" && e.status === "active").length} icon={Users} tone="green" />
      <StatCard label="Departments" value={data.departments.length} icon={Building2} tone="blue" />
      <StatCard label="Schedules" value={data.schedules.length} icon={CalendarClock} tone="violet" />
      <StatCard label="Inactive accounts" value={data.employees.filter((e) => e.status === "inactive").length} icon={XCircle} tone="slate" />
    </section>
    <section className="card table-card">
      <div className="table-toolbar filters"><SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search employees…" /><Select value={department} onChange={(value) => { setDepartment(value); setPage(1); }} options={[["all","All departments"], ...data.departments.map((d) => [d.id,d.name])]} /><Select value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[["all","Any status"],["active","Active"],["inactive","Inactive"]]} /><Select value={sort} onChange={setSort} options={[["name","Name A–Z"],["department","Department"],["start","Newest start date"]]} /></div>
      <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Department</th><th>Schedule</th><th>Start date</th><th>Status</th><th /></tr></thead><tbody>{employees.map((employee) => <tr key={employee.user_id}><td><div className="person-cell"><Avatar name={employee.full_name} small /><div><b>{employee.full_name}</b><span>{employee.job_title} · {employee.email}</span></div></div></td><td>{employee.departments?.name ?? "Unassigned"}</td><td>{employee.work_schedules?.name ?? "Unassigned"}</td><td>{employee.employment_start_date}</td><td><Badge value={employee.status} /></td><td><div className="row-actions"><button className="button text" onClick={() => setModal(employee)}>Edit</button><button className={`button text ${employee.status === "active" ? "danger-text" : ""}`} onClick={() => toggleEmployee(employee)}>{employee.status === "active" ? "Deactivate" : "Reactivate"}</button></div></td></tr>)}</tbody></table>{!employees.length && <EmptyState icon={Users} title="No employees found" text="Adjust the filters or add a new employee." />}</div><TablePager total={filteredEmployees.length} page={page} pageSize={pageSize} onPage={setPage} />
    </section>
    {modal && <EmployeeModal client={context.client} employee={modal === true ? null : modal} departments={data.departments} schedules={data.schedules} token={session.access_token} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
  </>;
}

function Reports(context: Context) {
  const { data } = context;
  const [period, setPeriod] = useState("monthly");
  const now = new Date();
  const cutoff = new Date(now);
  const periodDays = period === "daily" ? 1 : period === "weekly" ? 7 : 31;
  cutoff.setDate(now.getDate() - periodDays);
  const inPeriod = (value?: string) => Boolean(value && new Date(value) >= cutoff && new Date(value) <= now);
  const attendance = data.attendance.filter((row) => inPeriod(`${row.work_date}T23:59:59+05:00`));
  const completed = data.assignments.filter((row) => inPeriod(row.completed_at));
  const onTime = completed.filter((row) => new Date(row.completed_at) <= new Date(row.tasks?.deadline));
  const due = data.assignments.filter((row) => inPeriod(row.tasks?.deadline));
  const overdue = due.filter((row) => row.status !== "completed" && new Date(row.tasks?.deadline) < now);
  const rejected = data.submissions.filter((submission) => submission.task_reviews?.some((review: Row) => review.decision !== "approved") && inPeriod(submission.submitted_at));
  const employeePerformance = data.employees.filter((employee) => employee.role === "employee").map((employee) => {
    const employeeTasks = data.assignments.filter((item) => item.employee_id === employee.user_id);
    const assigned = employeeTasks.filter((item) => inPeriod(item.created_at));
    const employeeDue = employeeTasks.filter((item) => inPeriod(item.tasks?.deadline));
    const dueCompleted = employeeDue.filter((item) => item.status === "completed");
    const done = employeeTasks.filter((item) => inPeriod(item.completed_at));
    const doneOnTime = done.filter((item) => new Date(item.completed_at) <= new Date(item.tasks?.deadline));
    const employeeAttendance = attendance.filter((item) => item.employee_id === employee.user_id);
    const revisions = rejected.filter((submission) => submission.task_assignments?.employee_id === employee.user_id);
    return { Employee: employee.full_name, Department: employee.departments?.name ?? "Unassigned", Assigned: assigned.length, Due: employeeDue.length, Completed: done.length, "Completion rate": employeeDue.length ? `${Math.round(dueCompleted.length / employeeDue.length * 100)}%` : "—", "On-time rate": done.length ? `${Math.round(doneOnTime.length / done.length * 100)}%` : "—", Overdue: employeeDue.filter((item) => item.status !== "completed" && new Date(item.tasks?.deadline) < now).length, Revisions: revisions.length, "Working hours": Number((employeeAttendance.reduce((sum, item) => sum + (item.total_minutes ?? 0), 0) / 60).toFixed(1)), "Late arrivals": employeeAttendance.filter((item) => item.late_minutes > 0).length, "Missed clock-outs": employeeAttendance.filter((item) => item.work_date < localDateKey() && !item.clock_out).length };
  });

  return <>
    <section className="page-heading aligned"><div><p className="eyebrow">TRANSPARENT METRICS</p><h2>Reports & performance</h2><p>Operational indicators for coaching and planning—not automated disciplinary decisions.</p></div><div className="heading-actions"><Select value={period} onChange={setPeriod} options={[["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]]} /><ExportButtons rows={employeePerformance} filename={`${period}-performance-report`} /></div></section>
    <div className="ethics-note"><ShieldCheck /><div><b>Human review required</b><span>These metrics provide context only. Attendance and task statistics must never be used as the sole basis for employment decisions.</span></div></div>
    <section className="stat-grid four compact-stats">
      <StatCard label="Hours recorded" value={formatDuration(attendance.reduce((sum, row) => sum + (row.total_minutes ?? 0), 0))} icon={Clock3} tone="blue" />
      <StatCard label="Tasks completed" value={completed.length} icon={CheckCircle2} tone="green" />
      <StatCard label="Completed on time" value={onTime.length} icon={PackageCheck} tone="violet" />
      <StatCard label="Overdue / revisions" value={`${overdue.length} / ${rejected.length}`} icon={RefreshCw} tone="amber" />
    </section>
    <section className="method-card"><div><CircleGauge size={20} /><div><b>How this report is calculated</b><p>Rolling {periodDays}-day window ending now. Completion rate = tasks due in the window that are completed ÷ tasks due. On-time rate = completion events in the window finished by their deadline ÷ all completion events. A dash means there is no valid denominator.</p></div></div><span>{cutoff.toLocaleDateString()} — {now.toLocaleDateString()}</span></section>
    <section className="card table-card"><div className="table-toolbar"><div><h3>Employee performance context</h3><p>Workload, outcomes, and attendance shown side by side</p></div></div><div className="table-scroll"><table><thead><tr>{Object.keys(employeePerformance[0] ?? { Employee: "" }).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{employeePerformance.map((row) => <tr key={row.Employee}>{Object.values(row).map((value, index) => <td key={index}>{String(value)}</td>)}</tr>)}</tbody></table>{!employeePerformance.length && <EmptyState icon={CircleGauge} title="No report data yet" text="Reports populate as employees record attendance and complete tasks." />}</div></section>
  </>;
}

function Notifications(context: Context) {
  const { data, client, reload } = context;
  async function markRead(id?: string) {
    let query = client.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (id) query = query.eq("id", id);
    const { error } = await query;
    if (error) toast.error(error.message); else reload();
  }
  return <><section className="page-heading aligned"><div><p className="eyebrow">IN-APP UPDATES</p><h2>Notifications</h2><p>Assignment, deadline, review, and attendance updates.</p></div>{data.notifications.some((n) => !n.read_at) && <button className="button secondary" onClick={() => markRead()}>Mark all read</button>}</section><section className="card notification-list">{data.notifications.map((notification) => <button key={notification.id} className={notification.read_at ? "read" : ""} onClick={() => !notification.read_at && markRead(notification.id)}><span className="notification-icon"><Bell size={18} /></span><div><b>{notification.title}</b><p>{notification.body}</p><span>{formatDateTime(notification.created_at)}</span></div>{!notification.read_at && <i />}</button>)}{!data.notifications.length && <EmptyState icon={Bell} title="You’re all caught up" text="New assignments and review decisions will appear here." />}</section></>;
}

function SettingsView(context: Context) {
  const { profile, client } = context;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function updatePassword(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false); if (error) toast.error(error.message); else { toast.success("Password updated"); setPassword(""); }
  }
  return <><section className="page-heading"><div><p className="eyebrow">ACCOUNT & SYSTEM</p><h2>Settings</h2><p>Review your profile and security preferences.</p></div></section><div className="settings-grid"><section className="card"><CardHeader title="Profile" eyebrow="ACCOUNT" /><div className="profile-summary"><Avatar name={profile.full_name} /><div><h3>{profile.full_name}</h3><p>{profile.job_title}</p><span>{profile.email}</span></div></div><div className="detail-list"><div><span>Role</span><b>{profile.role === "admin" ? "Administrator / Manager" : "Employee"}</b></div><div><span>Department</span><b>{profile.departments?.name ?? "Not assigned"}</b></div><div><span>Work schedule</span><b>{profile.work_schedules?.name ?? "Not assigned"}</b></div><div><span>Timezone</span><b>Asia/Tashkent (UTC+5)</b></div></div></section><section className="card"><CardHeader title="Security" eyebrow="PASSWORD" /><form onSubmit={updatePassword} className="stack-form"><label className="field"><span>New password</span><input type="password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" /></label><button className="button primary" disabled={busy}>{busy ? <Loader2 className="spin" /> : <ShieldCheck size={17} />} Update password</button></form><div className="security-footnote"><ShieldCheck size={18} /><span>Authentication is handled by Supabase. Your password is never stored by FleetOps.</span></div></section></div></>;
}

function AttendanceButtons({ client, attendance, breaks = [], reload, compact = false }: { client: SupabaseClient; attendance?: Row; breaks?: Row[]; reload: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const activeBreak = breaks.find((item) => !item.ended_at);
  async function action(name: "clock_in" | "clock_out" | "start_break" | "end_break") {
    if (name === "clock_out" && !confirm("Clock out now? Your server timestamp will be recorded.")) return;
    setBusy(true); const { error } = await client.rpc(name); setBusy(false);
    if (error) toast.error(error.message); else { toast.success(({ clock_in: "You’re clocked in", clock_out: "You’re clocked out", start_break: "Break started", end_break: "Break ended" } as Record<string, string>)[name]); reload(); }
  }
  return <div className={`clock-actions ${compact ? "compact" : ""}`}>{!attendance && <button className="button success" disabled={busy} onClick={() => action("clock_in")}>{busy ? <Loader2 className="spin" /> : <Clock3 />} Clock in</button>}{attendance?.state === "working" && !activeBreak && <button className="button break" disabled={busy} onClick={() => action("start_break")}><Coffee size={17} /> Start break</button>}{attendance?.state === "working" && activeBreak && <button className="button break active" disabled={busy} onClick={() => action("end_break")}><Coffee size={17} /> End break</button>}{attendance?.state === "working" && <button className="button danger" disabled={busy || Boolean(activeBreak)} title={activeBreak ? "End your break before clocking out" : undefined} onClick={() => action("clock_out")}>{busy ? <Loader2 className="spin" /> : <LogOut />} Clock out</button>}{attendance?.state === "checked_out" && <span className="complete-pill"><CheckCircle2 /> Shift completed</span>}</div>;
}

function CreateTaskModal({ client, employees, templates, onClose, onSaved }: { client: SupabaseClient; employees: Row[]; templates: Row[]; onClose: () => void; onSaved: () => void }) {
  const activeEmployees = employees.filter((employee) => employee.role === "employee" && employee.status === "active");
  const [selected, setSelected] = useState<string[]>([]); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [draft, setDraft] = useState(() => ({ title: "", description: "", instructions: "", acceptance_criteria: "", priority: "medium", deadline: toDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()), checklist: "" }));

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setDraft({ title: template.title, description: template.description, instructions: template.instructions ?? "", acceptance_criteria: template.acceptance_criteria ?? "", priority: template.priority, deadline: toDateTimeInput(new Date(Date.now() + Number(template.default_due_hours ?? 24) * 60 * 60 * 1000).toISOString()), checklist: (template.checklist ?? []).join("\n") });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected.length) return toast.error("Select at least one employee");
    if (!validateFiles(files, 25)) return;
    const checklist = draft.checklist.split("\n").map((item) => item.trim()).filter(Boolean);
    if (checklist.some((item) => item.length > 240)) return toast.error("Checklist items must be 240 characters or less");
    setBusy(true);
    const deadline = new Date(`${draft.deadline}:00+05:00`).toISOString();
    const { data: task, error } = await client.from("tasks").insert({ title: draft.title.trim(), description: draft.description.trim(), instructions: draft.instructions.trim() || null, acceptance_criteria: draft.acceptance_criteria.trim() || null, priority: draft.priority, deadline }).select().single();
    if (error) { setBusy(false); return toast.error(error.message); }
    if (checklist.length) {
      const { error: checklistError } = await client.from("task_checklist_items").insert(checklist.map((label, position) => ({ task_id: task.id, label, position })));
      if (checklistError) { setBusy(false); return toast.error(checklistError.message); }
    }
    const { error: assignmentError } = await client.from("task_assignments").insert(selected.map((employee_id) => ({ task_id: task.id, employee_id })));
    if (assignmentError) { setBusy(false); return toast.error(assignmentError.message); }
    if (saveTemplate) {
      const defaultDueHours = Math.min(8760, Math.max(1, Math.round((new Date(deadline).getTime() - Date.now()) / 3600000)));
      const { error: templateError } = await client.from("task_templates").insert({ title: draft.title.trim(), description: draft.description.trim(), instructions: draft.instructions.trim() || null, acceptance_criteria: draft.acceptance_criteria.trim() || null, priority: draft.priority, default_due_hours: defaultDueHours, checklist });
      if (templateError) toast.error(`Task created, but playbook was not saved: ${templateError.message}`);
    }
    for (const file of files) {
      const path = `${task.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const upload = await client.storage.from("task-references").upload(path, file);
      if (upload.error) { toast.error(`Could not upload ${file.name}: ${upload.error.message}`); continue; }
      await client.from("task_attachments").insert({ task_id: task.id, storage_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || "application/octet-stream" });
    }
    setBusy(false); toast.success(`Task assigned to ${selected.length} employee${selected.length === 1 ? "" : "s"}`); onSaved();
  }
  return <Modal title="Create & assign task" eyebrow="NEW WORK ORDER" onClose={onClose} wide><form onSubmit={submit} className="form-grid">{templates.length > 0 && <label className="field span-2 playbook-field"><span><BookTemplate size={15} /> Start from a playbook</span><select value={templateId} onChange={(e) => applyTemplate(e.target.value)}><option value="">Blank task</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select><small>Prefills the task; you can edit every field before assigning.</small></label>}<label className="field span-2"><span>Task title</span><input required minLength={3} placeholder="e.g. Reconcile weekly carrier invoices" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label className="field span-2"><span>Description</span><textarea required rows={4} placeholder="Describe the expected outcome and relevant context." value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><label className="field span-2"><span>Instructions</span><textarea rows={3} placeholder="Add steps, systems, or reference details." value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} /></label><label className="field span-2"><span>Acceptance criteria</span><textarea rows={3} placeholder="Define what done looks like." value={draft.acceptance_criteria} onChange={(e) => setDraft({ ...draft, acceptance_criteria: e.target.value })} /></label><label className="field span-2"><span>Checklist</span><textarea rows={4} placeholder={"One verifiable step per line\nConfirm bill of lading\nAttach signed delivery receipt"} value={draft.checklist} onChange={(e) => setDraft({ ...draft, checklist: e.target.value })} /><small>Each assignee receives an independent checklist.</small></label><label className="field"><span>Priority</span><select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="field"><span>Deadline</span><input type="datetime-local" required value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label><div className="field span-2"><span>Assign employees</span><div className="employee-picker">{activeEmployees.map((employee) => <label key={employee.user_id}><input type="checkbox" checked={selected.includes(employee.user_id)} onChange={(e) => setSelected(e.target.checked ? [...selected, employee.user_id] : selected.filter((id) => id !== employee.user_id))} /><Avatar name={employee.full_name} small /><span><b>{employee.full_name}</b><small>{employee.job_title}</small></span></label>)}{!activeEmployees.length && <p>No active employees are available.</p>}</div></div><FilePicker files={files} setFiles={setFiles} label="Reference files" hint="PDF, Office files, images, MP4, or ZIP · 25 MB each" /><label className="check-field span-2"><input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} /><span><b>Save as a reusable playbook</b><small>Store this structure for future logistics work orders.</small></span></label><div className="modal-actions span-2"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <Loader2 className="spin" /> : <Plus />} Create task</button></div></form></Modal>;
}

function TaskDetailModal({ client, session, assignment, isAdmin, checklistState, submissions, onClose, onRefresh, onSaved }: { client: SupabaseClient; session: Session; assignment: Row; isAdmin: boolean; checklistState: Row[]; submissions: Row[]; onClose: () => void; onRefresh: () => void; onSaved: () => void }) {
  const task = assignment.tasks;
  const checklistItems = [...(task.task_checklist_items ?? [])].sort((a: Row, b: Row) => a.position - b.position);
  const [progress, setProgress] = useState(assignment.progress_percent ?? 0);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState(false);
  const [localChecklist, setLocalChecklist] = useState(checklistState);
  const [draft, setDraft] = useState({ title: task.title, description: task.description, instructions: task.instructions ?? "", acceptance_criteria: task.acceptance_criteria ?? "", priority: task.priority, deadline: toDateTimeInput(task.deadline) });
  async function updateProgress() { setBusy(true); const { error } = await client.rpc("update_task_progress", { p_assignment_id: assignment.id, p_status: progress > 0 ? "in_progress" : "todo", p_progress: progress, p_comment: comment || null }); setBusy(false); if (error) toast.error(error.message); else { toast.success("Progress updated"); onSaved(); } }
  async function toggleChecklist(itemId: string, complete: boolean) { setBusy(true); const { error } = await client.rpc("set_checklist_item", { p_assignment_id: assignment.id, p_checklist_item_id: itemId, p_complete: complete }); setBusy(false); if (error) toast.error(error.message); else { setLocalChecklist((items) => items.map((item) => item.checklist_item_id === itemId ? { ...item, completed_at: complete ? new Date().toISOString() : null } : item)); toast.success(complete ? "Step completed" : "Step reopened"); onRefresh(); } }
  async function submitWork() { if (!comment.trim()) return toast.error("Add a submission note"); if (!files.length) return toast.error("Attach at least one completed-work file"); if (!validateFiles(files, 100)) return; setBusy(true); const { data: submission, error } = await client.rpc("submit_task", { p_assignment_id: assignment.id, p_comment: comment }); if (error) { setBusy(false); return toast.error(error.message); } for (const file of files) { const path = `${session.user.id}/${task.id}/${submission.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`; const upload = await client.storage.from("task-submissions").upload(path, file); if (upload.error) { toast.error(`Upload failed: ${file.name}`); continue; } await client.from("submission_attachments").insert({ submission_id: submission.id, storage_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || "application/octet-stream", uploaded_by: session.user.id }); } setBusy(false); toast.success("Task submitted for manager review"); onSaved(); }
  async function review(submissionId: string, decision: "approved" | "rejected" | "revision_requested") { if (!feedback.trim()) return toast.error("Add review feedback"); if (!confirm(decision === "approved" ? "Approve this task as completed?" : "Return this task to the employee for revision?")) return; setBusy(true); const { error } = await client.rpc("review_submission", { p_submission_id: submissionId, p_decision: decision, p_feedback: feedback }); setBusy(false); if (error) toast.error(error.message); else { toast.success(decision === "approved" ? "Task approved" : "Task returned for revision"); onSaved(); } }
  async function saveTask() { if (!draft.title.trim() || !draft.description.trim() || !draft.deadline) return toast.error("Title, description, and deadline are required"); setBusy(true); const { error } = await client.from("tasks").update({ title: draft.title.trim(), description: draft.description.trim(), instructions: draft.instructions.trim() || null, acceptance_criteria: draft.acceptance_criteria.trim() || null, priority: draft.priority, deadline: new Date(`${draft.deadline}:00+05:00`).toISOString() }).eq("id", task.id); setBusy(false); if (error) toast.error(error.message); else { toast.success("Task details updated"); onSaved(); } }
  return <Modal title={task.title} eyebrow={`${task.priority.toUpperCase()} PRIORITY`} onClose={onClose} wide><div className="task-detail"><div className="task-meta"><Badge value={assignment.status} /><span><CalendarClock size={16} /> Due {formatDateTime(task.deadline)}</span>{isAdmin && <span><Users size={16} /> {assignment.profiles?.full_name}</span>}{isAdmin && !editing && <button className="button secondary small" onClick={() => setEditing(true)}>Edit task</button>}</div>
      {editing ? <div className="task-action-panel"><div className="form-grid"><label className="field span-2"><span>Title</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label className="field span-2"><span>Description</span><textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><label className="field span-2"><span>Instructions</span><textarea rows={3} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} /></label><label className="field span-2"><span>Acceptance criteria</span><textarea rows={3} value={draft.acceptance_criteria} onChange={(e) => setDraft({ ...draft, acceptance_criteria: e.target.value })} /></label><label className="field"><span>Priority</span><select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="field"><span>Deadline</span><input type="datetime-local" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label></div><div className="modal-actions"><button className="button secondary" onClick={() => setEditing(false)}>Cancel</button><button className="button primary" disabled={busy} onClick={saveTask}>Save task</button></div></div> : <><p className="task-description">{task.description}</p>{task.instructions && <DetailBlock title="Instructions" text={task.instructions} />}{task.acceptance_criteria && <DetailBlock title="Acceptance criteria" text={task.acceptance_criteria} />}</>}
      {checklistItems.length > 0 && <div className="task-checklist"><div className="checklist-heading"><div><h4>Completion checklist</h4><span>{localChecklist.filter((item) => item.completed_at).length} of {checklistItems.length} complete</span></div><b>{Math.round(localChecklist.filter((item) => item.completed_at).length / checklistItems.length * 100)}%</b></div>{checklistItems.map((item: Row) => { const state = localChecklist.find((entry) => entry.checklist_item_id === item.id); const complete = Boolean(state?.completed_at); return <button key={item.id} className={complete ? "complete" : ""} disabled={isAdmin || busy || ["submitted","completed"].includes(assignment.status)} onClick={() => toggleChecklist(item.id, !complete)}><span>{complete && <Check size={15} />}</span><b>{item.label}</b>{isAdmin && <small>{complete ? "Done" : "Open"}</small>}</button>; })}</div>}
      {task.task_attachments?.length > 0 && <div><h4>Reference files</h4><div className="file-list">{task.task_attachments.map((file: Row) => <FileLink key={file.id} file={file} bucket="task-references" client={client} />)}</div></div>}
      {!isAdmin && !["submitted","completed"].includes(assignment.status) && <div className="task-action-panel"><h4>Update your work</h4><label className="field"><span>Progress: {progress}%</span><input type="range" min="0" max="99" value={progress} onChange={(e) => setProgress(Number(e.target.value))} /></label><label className="field"><span>Work note</span><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Explain what you completed or any blockers." /></label><FilePicker files={files} setFiles={setFiles} label="Completed work" hint="Multiple files allowed · up to 100 MB each" /><div className="modal-actions"><button className="button secondary" onClick={updateProgress} disabled={busy}>Save progress</button><button className="button primary" onClick={submitWork} disabled={busy}><Upload size={17} /> Submit for review</button></div></div>}
      {assignment.last_manager_feedback && <div className="feedback-box"><MessageSquareText /><div><b>Manager feedback</b><p>{assignment.last_manager_feedback}</p></div></div>}
      {submissions.length > 0 && <div className="submission-history"><h4>Submission history</h4>{submissions.map((submission) => <div className="submission-card" key={submission.id}><div><b>Version {submission.version}</b><span>{formatDateTime(submission.submitted_at)}</span></div><p>{submission.comment}</p><div className="file-list">{submission.submission_attachments?.map((file: Row) => <FileLink key={file.id} file={file} bucket="task-submissions" client={client} />)}</div>{submission.task_reviews?.map((review: Row) => <div className="review-note" key={review.id}><Badge value={review.decision} /><p>{review.feedback}</p></div>)}{isAdmin && assignment.status === "submitted" && !submission.reviewed_at && <div className="review-panel"><label className="field"><span>Review feedback</span><textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Explain your decision and any required changes." /></label><div className="modal-actions"><button className="button danger-outline" onClick={() => review(submission.id, "rejected")} disabled={busy}><XCircle size={16} /> Reject</button><button className="button secondary" onClick={() => review(submission.id, "revision_requested")} disabled={busy}><RefreshCw size={16} /> Request revision</button><button className="button success" onClick={() => review(submission.id, "approved")} disabled={busy}><CheckCircle2 size={16} /> Approve</button></div></div>}</div>)}</div>}
    </div></Modal>;
}

function EmployeeModal({ client, employee, departments, schedules, token, onClose, onSaved }: { client: SupabaseClient; employee: Row | null; departments: Row[]; schedules: Row[]; token: string; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (photo && (!["image/jpeg","image/png","image/webp"].includes(photo.type) || photo.size > 5 * 1024 * 1024)) return toast.error("Profile photo must be JPG, PNG, or WebP and no larger than 5 MB"); setBusy(true); const form = new FormData(event.currentTarget); const payload: Row = { full_name: form.get("full_name"), job_title: form.get("job_title"), phone: form.get("phone") || null, department_id: form.get("department_id") || null, work_schedule_id: form.get("work_schedule_id") || null, employment_start_date: form.get("employment_start_date") }; if (employee) payload.user_id = employee.user_id; else { payload.email = form.get("email"); payload.password = form.get("password"); } const response = await fetch("/api/admin/employees", { method: employee ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }); const result = await response.json() as { error?: string; employee?: Row }; if (!response.ok || !result.employee) { setBusy(false); return toast.error(result.error ?? "Could not save employee"); } if (photo) { const path = `${result.employee.user_id}/profile-${Date.now()}-${safeFileName(photo.name)}`; const upload = await client.storage.from("avatars").upload(path, photo, { upsert: true }); if (upload.error) toast.error(`Profile saved, but photo upload failed: ${upload.error.message}`); else await client.from("profiles").update({ avatar_path: path }).eq("user_id", result.employee.user_id); } setBusy(false); toast.success(employee ? "Employee updated" : "Employee account created"); onSaved(); }
  return <Modal title={employee ? "Edit employee" : "Add employee"} eyebrow="EMPLOYEE PROFILE" onClose={onClose}><form onSubmit={submit} className="form-grid"><label className="field span-2"><span>Full name</span><input name="full_name" required defaultValue={employee?.full_name} /></label><label className="field"><span>Job title</span><input name="job_title" required defaultValue={employee?.job_title} /></label><label className="field"><span>Phone</span><input name="phone" type="tel" defaultValue={employee?.phone} /></label>{!employee && <><label className="field"><span>Email address</span><input name="email" type="email" required /></label><label className="field"><span>Temporary password</span><input name="password" type="password" minLength={10} required /><small>At least 10 characters</small></label></>}<label className="field"><span>Department</span><select name="department_id" defaultValue={employee?.department_id ?? ""}><option value="">Unassigned</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Work schedule</span><select name="work_schedule_id" defaultValue={employee?.work_schedule_id ?? ""}><option value="">Unassigned</option>{schedules.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field span-2"><span>Employment start date</span><input name="employment_start_date" type="date" required defaultValue={employee?.employment_start_date ?? localDateKey()} /></label><label className="field span-2"><span>Profile photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /><small>Optional JPG, PNG, or WebP · 5 MB maximum</small></label><div className="modal-actions span-2"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <Loader2 className="spin" /> : employee ? "Save changes" : "Create account"}</button></div></form></Modal>;
}

function CorrectionModal({ client, profile, attendance, onClose, onSaved }: { client: SupabaseClient; profile: Row; attendance?: Row; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); const date = String(form.get("date")); const clockIn = String(form.get("clock_in") || ""); const clockOut = String(form.get("clock_out") || ""); const { error } = await client.from("attendance_corrections").insert({ attendance_id: attendance?.id ?? null, employee_id: profile.user_id, work_date: date, requested_clock_in: clockIn ? new Date(`${date}T${clockIn}:00+05:00`).toISOString() : null, requested_clock_out: clockOut ? new Date(`${date}T${clockOut}:00+05:00`).toISOString() : null, reason: form.get("reason") }); setBusy(false); if (error) toast.error(error.message); else { toast.success("Correction request submitted"); onSaved(); } }
  return <Modal title="Request attendance correction" eyebrow="MANAGER REVIEW REQUIRED" onClose={onClose}><form onSubmit={submit} className="form-grid"><label className="field span-2"><span>Work date</span><input name="date" type="date" required defaultValue={attendance?.work_date ?? localDateKey()} /></label><label className="field"><span>Requested clock-in</span><input name="clock_in" type="time" /></label><label className="field"><span>Requested clock-out</span><input name="clock_out" type="time" /></label><label className="field span-2"><span>Reason</span><textarea name="reason" minLength={10} required rows={4} placeholder="Explain what happened and why the record should be corrected." /></label><div className="modal-actions span-2"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <Loader2 className="spin" /> : <TimerReset />} Submit request</button></div></form></Modal>;
}

function CorrectionRequests({ rows, client, reload }: { rows: Row[]; client: SupabaseClient; reload: () => void }) {
  const pending = rows.filter((row) => row.status === "pending");
  async function decide(id: string, approve: boolean) { const note = prompt(approve ? "Optional approval note:" : "Explain why this request is rejected:") ?? ""; if (!approve && !note.trim()) return; const { error } = await client.rpc("decide_attendance_correction", { p_request_id: id, p_approve: approve, p_note: note }); if (error) toast.error(error.message); else { toast.success(approve ? "Correction approved" : "Correction rejected"); reload(); } }
  return <div className="request-list">{pending.map((request) => <div key={request.id}><div><b>{request.profiles?.full_name}</b><span>{request.work_date} · requested {formatTime(request.requested_clock_in)} – {formatTime(request.requested_clock_out)}</span><p>{request.reason}</p></div><div><button className="button danger-outline small" onClick={() => decide(request.id, false)}>Reject</button><button className="button success small" onClick={() => decide(request.id, true)}>Approve</button></div></div>)}</div>;
}

function WorkloadStrip({ assignments, employees }: { assignments: Row[]; employees: Row[] }) {
  const workload = employees.filter((employee) => employee.role === "employee" && employee.status === "active").map((employee) => {
    const active = assignments.filter((item) => item.employee_id === employee.user_id && item.status !== "completed");
    const urgent = active.filter((item) => item.tasks?.priority === "urgent" || (item.tasks?.deadline && new Date(item.tasks.deadline) < new Date())).length;
    return { employee, active: active.length, urgent };
  }).sort((a, b) => b.active - a.active).slice(0, 8);
  const max = Math.max(...workload.map((item) => item.active), 1);
  return <section className="card workload-card"><div className="workload-heading"><div><p>CAPACITY CONTEXT</p><h3>Active workload by employee</h3></div><span>Planning signal only · not a performance score</span></div><div className="workload-grid">{workload.map(({ employee, active, urgent }) => <div className="workload-person" key={employee.user_id}><div className="person-cell"><Avatar name={employee.full_name} small /><div><b>{employee.full_name}</b><span>{active} active · {urgent} urgent/overdue</span></div></div><div className="workload-track"><i style={{ width: `${active / max * 100}%` }} /></div></div>)}{!workload.length && <EmptyState icon={Users} title="No workload yet" text="Active assignments appear here after employees receive tasks." />}</div></section>;
}

function TaskBoard({ rows, isAdmin, onOpen }: { rows: Row[]; isAdmin: boolean; onOpen: (row: Row) => void }) {
  const columns: [string, string][] = [["todo", "To do"], ["in_progress", "In progress"], ["submitted", "Review"], ["completed", "Completed"]];
  return <div className="task-board">{columns.map(([key, label]) => { const items = rows.filter((item) => item.status === key); return <section className={`board-column ${key}`} key={key}><header><span>{label}</span><b>{items.length}</b></header><div>{items.map((assignment) => <button className="board-card" key={assignment.id} onClick={() => onOpen(assignment)}><span className={`priority-pin ${assignment.tasks?.priority}`} /><div className="board-card-title"><b>{assignment.tasks?.title}</b><Badge value={assignment.tasks?.priority} /></div>{isAdmin && <span className="board-assignee"><Avatar name={assignment.profiles?.full_name ?? "Employee"} small /> {assignment.profiles?.full_name}</span>}<span className={assignment.status !== "completed" && new Date(assignment.tasks?.deadline) < new Date() ? "overdue-text" : ""}><CalendarClock size={14} /> {formatDateTime(assignment.tasks?.deadline)}</span><div className="progress-cell"><div><i style={{ width: `${assignment.progress_percent}%` }} /></div><span>{assignment.progress_percent}%</span></div></button>)}{!items.length && <div className="board-empty">No items</div>}</div></section>; })}</div>;
}

function TaskTable({ rows, isAdmin, onOpen }: { rows: Row[]; isAdmin: boolean; onOpen: (row: Row) => void }) {
  return <div className="table-scroll"><table><thead><tr><th>Task</th>{isAdmin && <th>Assignee</th>}<th>Priority</th><th>Deadline</th><th>Progress</th><th>Status</th><th /></tr></thead><tbody>{rows.map((assignment) => <tr key={assignment.id}><td><b>{assignment.tasks?.title}</b><span className="cell-subtext">Assigned {formatDateTime(assignment.created_at)}</span></td>{isAdmin && <td>{assignment.profiles?.full_name}</td>}<td><Badge value={assignment.tasks?.priority} /></td><td className={assignment.status !== "completed" && new Date(assignment.tasks?.deadline) < new Date() ? "overdue-text" : ""}>{formatDateTime(assignment.tasks?.deadline)}</td><td><div className="progress-cell"><div><i style={{ width: `${assignment.progress_percent}%` }} /></div><span>{assignment.progress_percent}%</span></div></td><td><Badge value={assignment.status} /></td><td><button className="button text" onClick={() => onOpen(assignment)}>Open</button></td></tr>)}</tbody></table>{!rows.length && <EmptyState icon={ClipboardCheck} title="No tasks match" text="Adjust your filters or create a new assignment." />}</div>;
}

function AttendanceTable({ rows, employees, breaks = [], compact = false }: { rows: Row[]; employees: Row[]; breaks?: Row[]; compact?: boolean }) {
  const displayRows = compact ? rows.slice(0, 6) : rows;
  return <div className="table-scroll"><table><thead><tr>{employees.length > 1 && <th>Employee</th>}<th>Date</th><th>Clock in</th><th>Clock out</th><th>Breaks</th><th>Net time</th><th>Status</th></tr></thead><tbody>{displayRows.map((record) => { const employee = record.profiles ?? employees.find((item) => item.user_id === record.employee_id); const recordBreaks = breaks.filter((item) => item.attendance_id === record.id); const activeBreak = recordBreaks.some((item) => !item.ended_at); return <tr key={record.id}>{employees.length > 1 && <td><div className="person-cell"><Avatar name={employee?.full_name ?? "Employee"} small /><div><b>{employee?.full_name}</b><span>{employee?.job_title}</span></div></div></td>}<td>{record.work_date}</td><td>{formatTime(record.clock_in)}</td><td>{formatTime(record.clock_out)}</td><td>{activeBreak ? <Badge value="on break" /> : `${record.break_minutes ?? 0}m`}</td><td>{formatDuration(record.total_minutes)}</td><td>{record.state === "working" ? <Badge value="working" /> : record.late_minutes > 0 ? <Badge value={`late ${record.late_minutes}m`} /> : <Badge value="on time" />}</td></tr>; })}</tbody></table>{!displayRows.length && <EmptyState icon={CalendarClock} title="No attendance records" text="Records appear after the first server-verified clock-in." />}</div>;
}

function ExportButtons({ rows, filename }: { rows: Row[]; filename: string }) {
  function csv() { if (!rows.length) return toast.error("There is no data to export"); const headers = Object.keys(rows[0]); const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`; const blob = new Blob([[headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n")], { type: "text/csv;charset=utf-8" }); downloadBlob(blob, `${filename}.csv`); }
  async function excel() { if (!rows.length) return toast.error("There is no data to export"); const XLSX = await import("xlsx"); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Report"); XLSX.writeFile(book, `${filename}.xlsx`); }
  return <div className="export-buttons"><button className="button secondary" onClick={csv}><ArrowDownToLine size={16} /> CSV</button><button className="button secondary" onClick={excel}><ArrowDownToLine size={16} /> Excel</button></div>;
}

function FilePicker({ files, setFiles, label, hint }: { files: File[]; setFiles: (files: File[]) => void; label: string; hint: string }) {
  return <div className="field span-2"><span>{label}</span><label className="file-picker"><Upload /><b>Choose files</b><small>{hint}</small><input type="file" multiple accept={ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>{files.length > 0 && <div className="selected-files">{files.map((file) => <span key={`${file.name}-${file.size}`}><Paperclip size={14} />{file.name}<small>{formatBytes(file.size)}</small></span>)}</div>}</div>;
}

function FileLink({ file, bucket, client }: { file: Row; bucket: string; client: SupabaseClient }) {
  async function open() { const { data, error } = await client.storage.from(bucket).createSignedUrl(file.storage_path, 300); if (error) toast.error(error.message); else window.open(data.signedUrl, "_blank", "noopener,noreferrer"); }
  return <button onClick={open} className="file-link"><FileText size={17} /><span><b>{file.file_name}</b><small>{formatBytes(file.file_size)} · {formatDateTime(file.created_at)}</small></span><ArrowDownToLine size={16} /></button>;
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p>{eyebrow}</p><h3>{title}</h3></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><div className="modal-body">{children}</div></section></div>; }
function CardHeader({ title, eyebrow }: { title: string; eyebrow: string }) { return <div className="card-header"><div><p>{eyebrow}</p><h3>{title}</h3></div></div>; }
function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: any; tone: string }) { return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon size={20} /></span><div><strong>{value}</strong><p>{label}</p></div></article>; }
function Avatar({ name, small = false }: { name: string; small?: boolean }) { return <span className={`avatar ${small ? "small" : ""}`}>{name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>; }
function Badge({ value }: { value?: string }) { const label = (value ?? "unknown").replaceAll("_", " "); return <span className={`badge ${value?.replaceAll(" ", "-")}`}>{label}</span>; }
function LiveTime() { const [now, setNow] = useState(() => new Date()); useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer); }, []); return <>{new Intl.DateTimeFormat("en-US", { timeZone: TASHKENT_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(now)} · Tashkent</>; }
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="search-box"><Search size={17} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="select-wrap"><Filter size={15} /><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><ChevronDown size={14} /></label>; }
function TablePager({ total, page, pageSize, onPage }: { total: number; page: number; pageSize: number; onPage: (page: number) => void }) { const pages = Math.max(1, Math.ceil(total / pageSize)); if (total <= pageSize) return <div className="table-pager"><span>Showing {total} record{total === 1 ? "" : "s"}</span></div>; return <div className="table-pager"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}</span><div><button className="button secondary small" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button><b>{page} / {pages}</b><button className="button secondary small" disabled={page === pages} onClick={() => onPage(page + 1)}>Next</button></div></div>; }
function EmptyState({ icon: Icon, title, text }: { icon: any; title: string; text: string }) { return <div className="empty-state"><span><Icon /></span><h4>{title}</h4><p>{text}</p></div>; }
function DetailBlock({ title, text }: { title: string; text: string }) { return <div className="detail-block"><h4>{title}</h4><p>{text}</p></div>; }
function NotAllowed() { return <EmptyState icon={ShieldCheck} title="Manager access required" text="This area is not available for your role." />; }
function PageSkeleton() { return <div className="page-skeleton"><div /><div className="skeleton-grid"><i /><i /><i /><i /></div><section /><section /></div>; }
function FullScreenLoader({ label }: { label: string }) { return <main className="fullscreen-loader"><div className="brand-mark large"><Truck /></div><Loader2 className="spin" /><p>{label}</p></main>; }
function AccountIssue({ error, onSignOut }: { error: string; onSignOut: () => void }) { return <main className="account-issue"><div className="card"><AlertTriangle /><h1>Account access unavailable</h1><p>{error}</p><button className="button primary" onClick={onSignOut}>Return to sign in</button></div></main>; }
function SetupRequired() {
  const [copied, setCopied] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
  const steps = [
    { number: "01", title: "Create the data layer", text: "Create a Supabase project and apply both SQL migrations in order." },
    { number: "02", title: "Add secure environment keys", text: "Add the project URL and publishable key. Store the secret key only in the hosting secret store." },
    { number: "03", title: "Bootstrap the first manager", text: "Create one confirmed Auth user, then promote that profile with the README SQL snippet." },
    { number: "04", title: "Verify before inviting staff", text: "Test employee isolation, private downloads, attendance, and the full submit-review workflow." },
  ];
  const checklist = `FleetOps activation checklist
1. Run supabase/migrations/202610130001_fleetops.sql.
2. Run supabase/migrations/202610130002_benchmark_improvements.sql.
3. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the Site environment.
4. Add SUPABASE_SECRET_KEY only to the Site secret store.
5. Create the first confirmed Supabase Auth user and promote it using the SQL in README.md.
6. Redeploy and test employee isolation, attendance, uploads, and manager review.`;

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("copy-error");
    }
  }

  return <main className="setup-page"><section className="setup-shell"><div className="setup-intro"><div className="brand-mark large"><Truck /></div><p className="overline">FLEETOPS WORKFORCE</p><h1>Your operations hub is ready to connect.</h1><p>The application is deployed, but its secure database connection has not been configured yet.</p><div className="setup-blocked"><AlertTriangle size={19} /><span><b>Portal controls are locked</b> Login, attendance, tasks, and reports become available after Supabase is connected.</span></div><p className="setup-key-label">Required Site environment names · click to copy</p><div className="code-list">{keys.map((key) => <button type="button" className="setup-key" key={key} onClick={() => copyText(key, key)} aria-label={`Copy ${key}`}><code>{key}</code>{copied === key ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>)}</div><div className="setup-actions"><button type="button" className="button primary" aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}><ClipboardCheck size={17} />{guideOpen ? "Hide activation guide" : "Show activation guide"}</button><button type="button" className="button secondary" onClick={() => copyText(checklist, "checklist")}><Copy size={17} />{copied === "checklist" ? "Checklist copied" : "Copy checklist"}</button></div>{copied === "copy-error" && <p className="setup-copy-error" role="alert">Clipboard access was blocked. Select and copy the text manually.</p>}</div><div className="setup-steps">{steps.map((step) => <div key={step.number}><span>{step.number}</span><div><b>{step.title}</b><p>{step.text}</p></div></div>)}</div>{guideOpen && <section className="setup-guide" aria-label="Activation guide"><div><span>1</span><p><b>Apply the database migrations</b>Run <code>202610130001_fleetops.sql</code>, then <code>202610130002_benchmark_improvements.sql</code> in the Supabase SQL editor.</p></div><div><span>2</span><p><b>Configure the deployed Site</b>Add the URL and publishable key as environment variables. Add the secret key only as a server-side secret, never as a public variable.</p></div><div><span>3</span><p><b>Create the first manager</b>Create a confirmed Auth user, then use the first-admin SQL in <code>README.md</code> to promote that exact email.</p></div><div><span>4</span><p><b>Redeploy and verify</b>The next deployment will show the sign-in page. Complete the security checklist before inviting employees.</p></div></section>}<div className="setup-note"><ShieldCheck size={18} /><span>Legacy <code>SUPABASE_ANON_KEY</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> names remain supported. Never expose a secret or service-role key to browser code.</span></div></section></main>;
}

function TodayCard({ attendance }: { attendance?: Row }) { return <div className="today-card"><div className="time-row"><span><small>Clock in</small><b>{formatTime(attendance?.clock_in)}</b></span><span><small>Clock out</small><b>{formatTime(attendance?.clock_out)}</b></span></div><div className="duration-ring"><div><strong>{attendance?.total_minutes ? formatDuration(attendance.total_minutes) : attendance?.state === "working" ? "Active" : "0h 0m"}</strong><span>Total today</span></div></div>{Boolean(attendance?.late_minutes && attendance.late_minutes > 0) && <p className="warning-text"><AlertTriangle size={15} /> Arrived {attendance?.late_minutes} minutes after grace period</p>}</div>; }
function TaskFlow({ rows }: { rows: Row[] }) { const items: [string,string][] = [["todo","To do"],["in_progress","In progress"],["submitted","Review"],["completed","Completed"]]; const total = Math.max(rows.length, 1); return <div className="task-flow">{items.map(([key,label]) => { const count = rows.filter((row) => row.status === key).length; return <div key={key}><span><b>{label}</b><em>{count}</em></span><div><i className={key} style={{ width: `${count / total * 100}%` }} /></div></div>; })}</div>; }
function TaskList({ rows }: { rows: Row[]; employee?: boolean }) { return <div className="compact-task-list">{rows.map((assignment) => <div key={assignment.id}><span className={`priority-pin ${assignment.tasks?.priority}`} /><div><b>{assignment.tasks?.title}</b><span>Due {formatDateTime(assignment.tasks?.deadline)}</span></div><Badge value={assignment.status} /></div>)}{!rows.length && <EmptyState icon={CheckCircle2} title="Queue clear" text="You have no active tasks." />}</div>; }
function AttentionList({ overdue, submissions, corrections }: { overdue: Row[]; submissions: Row[]; corrections: Row[] }) { const items = [{ label: "Overdue assignments", count: overdue.length, icon: AlertTriangle, tone: "red" }, { label: "Submissions waiting", count: submissions.length, icon: ClipboardCheck, tone: "violet" }, { label: "Attendance corrections", count: corrections.length, icon: TimerReset, tone: "amber" }]; return <div className="attention-list">{items.map((item) => <div key={item.label}><span className={`stat-icon ${item.tone}`}><item.icon size={19} /></span><div><b>{item.label}</b><span>{item.count ? `${item.count} item${item.count === 1 ? "" : "s"} need review` : "Nothing pending"}</span></div><strong>{item.count}</strong></div>)}</div>; }
function FeedbackList({ assignments }: { assignments: Row[] }) { const rows = assignments.filter((row) => row.last_manager_feedback).slice(0, 4); return <div className="feedback-list">{rows.map((row) => <div key={row.id}><MessageSquareText /><div><b>{row.tasks?.title}</b><p>{row.last_manager_feedback}</p></div><Badge value={row.status} /></div>)}{!rows.length && <EmptyState icon={MessageSquareText} title="No recent feedback" text="Manager comments appear here after review." />}</div>; }

function attendanceExportRows(rows: Row[], employees: Row[]) { return rows.map((record) => { const employee = record.profiles ?? employees.find((item) => item.user_id === record.employee_id); return { Employee: employee?.full_name ?? "", "Job title": employee?.job_title ?? "", Date: record.work_date, "Clock in": formatDateTime(record.clock_in), "Clock out": formatDateTime(record.clock_out), "Break minutes": record.break_minutes ?? 0, "Net working minutes": record.total_minutes ?? "", "Late minutes": record.late_minutes, "Missing clock-out": !record.clock_out ? "Yes" : "No" }; }); }
function priorityRank(value?: string) { return ({ low: 1, medium: 2, high: 3, urgent: 4 } as Record<string, number>)[value ?? ""] ?? 0; }
function validateFiles(files: File[], maxMb: number) { for (const file of files) { const extension = file.name.split(".").pop()?.toLowerCase() ?? ""; if (!FILE_EXTENSIONS.includes(extension)) { toast.error(`${file.name}: unsupported file type`); return false; } if (file.size > maxMb * 1024 * 1024) { toast.error(`${file.name}: exceeds ${maxMb} MB`); return false; } } return true; }
function toDateTimeInput(value: string) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TASHKENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {}); return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`; }
function formatBytes(bytes: number) { if (!bytes) return "0 B"; const units = ["B","KB","MB","GB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }

