"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { SAMPLE_STAFF } from "@/app/lib/sampleStaff";
import type { Staff } from "@/app/lib/types";
import AuthStatus from "@/app/components/AuthStatus";
import { MobileContext } from "./MobileContext";

const STORAGE_KEY = "kansei-mobile-staff-id";

const navItems = [
  { href: "/m/home", label: "ホーム", icon: "🏠" },
  { href: "/m/shift", label: "シフト", icon: "📅" },
  { href: "/m/report", label: "日報", icon: "📝" },
];

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [currentStaffId, setCurrentStaffIdState] = useState("");
  const [loading, setLoading] = useState(true);
  // ログイン隊員に固定されているか（本番時）。true の間は手動切替を無効化。
  const [locked, setLocked] = useState(false);

  const init = useCallback(async () => {
    setLoading(true);
    let list: Staff[];
    if (!isSupabaseConfigured) {
      list = SAMPLE_STAFF.filter((s) => s.leave_date === null);
    } else {
      const { data } = await supabase
        .from("staff")
        .select("*")
        .is("leave_date", null)
        .order("employee_number");
      list = (data as Staff[]) ?? [];
    }
    setStaff(list);

    // 本番: ログインユーザーに紐づく隊員に自動固定
    if (isSupabaseConfigured) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let linkedId = "";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("staff_id")
          .eq("id", user.id)
          .single();
        linkedId = (profile?.staff_id as string) ?? "";
      }
      if (linkedId && list.some((s) => s.id === linkedId)) {
        setLocked(true);
        setCurrentStaffIdState(linkedId);
        setLoading(false);
        return;
      }
    }

    // デモ、または隊員未紐付け（管制員のプレビュー等）: 手動選択
    setLocked(false);
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const initial = list.find((s) => s.id === saved)?.id ?? list[0]?.id ?? "";
    setCurrentStaffIdState(initial);
    setLoading(false);
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  const setCurrentStaffId = useCallback((id: string) => {
    setCurrentStaffIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const currentStaff = useMemo(
    () => staff.find((s) => s.id === currentStaffId) ?? null,
    [staff, currentStaffId]
  );

  return (
    <MobileContext.Provider
      value={{ staff, currentStaffId, currentStaff, setCurrentStaffId, loading }}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50">
        {/* トップバー（デモ用の隊員切替＝ログインの代わり） */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-bold text-slate-800">管制システム</span>
            <div className="flex items-center gap-2">
              {locked ? (
                <span className="max-w-[9rem] truncate text-sm font-medium text-slate-700">
                  {currentStaff?.name ?? ""}
                </span>
              ) : (
                <select
                  value={currentStaffId}
                  onChange={(e) => setCurrentStaffId(e.target.value)}
                  className="max-w-[9rem] rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 focus:outline-none"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <AuthStatus variant="compact" />
            </div>
          </div>
          {!locked && (
            <p className="mt-0.5 text-[11px] text-slate-400">
              ※デモ: 右上で隊員を切替（本番はログインで自動判別）
            </p>
          )}
        </header>

        <main className="flex-1 px-4 py-4 pb-24">{children}</main>

        {/* ボトムナビ */}
        <nav className="fixed bottom-0 left-1/2 z-10 flex w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                  active ? "text-slate-900" : "text-slate-400"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </MobileContext.Provider>
  );
}
