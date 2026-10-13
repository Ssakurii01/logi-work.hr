import { WorkforceApp } from "@/components/workforce/workforce-app";

export const dynamic = "force-dynamic";

export default function Home() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return (
    <WorkforceApp
      config={{
        supabaseUrl,
        supabaseAnonKey,
        configured: Boolean(supabaseUrl && supabaseAnonKey),
      }}
    />
  );
}
