"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase, type Role } from "@/app/lib/supabase";

interface AuthStatusProps {
  /** "sidebar"（PC）or "compact"（スマホ） */
  variant?: "sidebar" | "compact";
}

export default function AuthStatus({ variant = "sidebar" }: AuthStatusProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !user) return;
      setEmail(user.email ?? null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (active) setRole((profile?.role as Role) ?? null);
    })();
    return () => {
      active = false;
    };
  }, []);

  const logout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  // デモモード: 認証情報なし
  if (!isSupabaseConfigured) {
    if (variant === "compact") return null;
    return (
      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400">
        デモモード（未ログイン）
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <button
        onClick={logout}
        disabled={loggingOut}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 disabled:opacity-50"
      >
        {loggingOut ? "..." : "ログアウト"}
      </button>
    );
  }

  return (
    <div className="border-t border-slate-200 p-3">
      <div className="mb-2 px-1 text-xs text-slate-500">
        {role && <span className="font-medium text-slate-700">{role}</span>}
        {email && <span className="block truncate text-slate-400">{email}</span>}
      </div>
      <button
        onClick={logout}
        disabled={loggingOut}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        {loggingOut ? "ログアウト中..." : "ログアウト"}
      </button>
    </div>
  );
}
