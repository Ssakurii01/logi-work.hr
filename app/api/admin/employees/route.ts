import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase-server";

const employeeSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(10).max(128),
  job_title: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(40).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  work_schedule_id: z.string().uuid().optional().nullable(),
  employment_start_date: z.string().date(),
});

const updateSchema = employeeSchema.omit({ email: true, password: true }).partial().extend({
  user_id: z.string().uuid(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const parsed = employeeSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid employee data" }, { status: 400 });

    const { password, ...profileData } = parsed.data;
    const { data: created, error: createError } = await auth.service.auth.admin.createUser({
      email: profileData.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: profileData.full_name, job_title: profileData.job_title },
    });
    if (createError || !created.user) return NextResponse.json({ error: createError?.message ?? "Could not create account" }, { status: 400 });

    const { data: profile, error: profileError } = await auth.service
      .from("profiles")
      .update({ ...profileData, role: "employee", status: "active" })
      .eq("user_id", created.user.id)
      .select("*")
      .single();

    if (profileError) {
      await auth.service.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    await auth.service.from("audit_logs").insert({
      actor_id: auth.user.id,
      action: "create_employee",
      entity_type: "profile",
      entity_id: created.user.id,
    });
    return NextResponse.json({ employee: profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid employee data" }, { status: 400 });
    const { user_id, ...changes } = parsed.data;
    if (user_id === auth.user.id && changes.status === "inactive") {
      return NextResponse.json({ error: "You cannot deactivate your own admin account" }, { status: 400 });
    }
    const { data, error } = await auth.service.from("profiles").update(changes).eq("user_id", user_id).eq("role", "employee").select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ employee: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected server error" }, { status: 500 });
  }
}

