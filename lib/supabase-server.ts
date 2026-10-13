import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(...names: string[]) {
  const value = names.map((name) => process.env[name]).find(Boolean);
  if (!value) throw new Error(`Missing server environment variable: ${names.join(" or ")}`);
  return value;
}

export function createServiceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { error: "Authentication required", status: 401 } as const;
  }

  const service = createServiceClient();
  const token = authorization.slice(7);
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return { error: "Invalid or expired session", status: 401 } as const;

  const { data: profile } = await service
    .from("profiles")
    .select("user_id, role, status")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.status !== "active") {
    return { error: "Admin access required", status: 403 } as const;
  }

  return { service, user: data.user, profile } as const;
}

