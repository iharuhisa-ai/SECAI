import { createBrowserClient } from "@supabase/ssr";

// 環境変数が未設定でも import 時に例外で落ちないようフォールバックを用意する。
// （未設定のままクエリすると失敗するので、画面側で接続エラーとして表示される）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

// Supabase の接続情報が両方そろっているか。未設定なら画面側でデモ表示に切り替える。
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

if (!isSupabaseConfigured) {
  // 開発時に気づけるよう警告を出す
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。.env.local を確認してください。"
  );
}

// Cookie ベースでセッションを保持するブラウザ用クライアント（データ取得と認証を兼ねる）。
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// ロール定義
export const ROLES = ["管理者", "管制員", "隊員"] as const;
export type Role = (typeof ROLES)[number];

// ロールごとのホーム（ログイン後の遷移先）
export function homePathForRole(role: Role | null | undefined): string {
  return role === "隊員" ? "/m/home" : "/dashboard";
}
