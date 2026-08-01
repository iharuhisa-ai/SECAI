"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { homePathForRole, isSupabaseConfigured, supabase, type Role } from "@/app/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("メールアドレスまたはパスワードが正しくありません。");
        setLoading(false);
        return;
      }
      // ロールを取得して遷移先を決定
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      const role = (profile?.role as Role) ?? "隊員";
      router.replace(redirect || homePathForRole(role));
      router.refresh();
    } catch {
      setError("ログインに失敗しました。時間をおいて再度お試しください。");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isSupabaseConfigured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">デモモード</span>（Supabase未接続）ではログインは不要です。
          <Link href="/dashboard" className="ml-1 underline">
            ダッシュボードへ
          </Link>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">メールアドレス</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="you@example.com"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">パスワード</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="••••••••"
        />
      </label>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {loading ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-slate-800">管制システム</h1>
          <p className="mt-1 text-sm text-slate-500">ログイン</p>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-400">読み込み中...</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
