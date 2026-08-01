// サーバー専用。Supabase の管理API（ユーザー作成/削除）に使うサービスキーを扱う。
// ⚠️ このモジュールはクライアントに import しないこと（サービスキーが漏れる）。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// サービスロール（管理者）クライアント。RLS を無視して管理操作を行う。
export function getServiceClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// 呼び出し元（ログイン中ユーザー）と そのロールを取得
export async function getCaller(): Promise<{
  userId: string | null;
  role: string | null;
}> {
  if (!url || !anonKey) return { userId: null, role: null };
  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // ルートハンドラでは検証のみ。Cookie 更新は行わない。
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { userId: user.id, role: (profile?.role as string) ?? null };
}

export function isController(role: string | null): boolean {
  return role === "管制員" || role === "管理者";
}
