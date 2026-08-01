"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, ROLES, supabase, type Role } from "@/app/lib/supabase";
import type { Staff } from "@/app/lib/types";
import UserModal from "./UserModal";

interface AppUser {
  id: string;
  email: string;
  created_at: string;
  role: Role;
  staff_id: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const staffById = useMemo(() => {
    const m = new Map<string, Staff>();
    for (const s of staffList) m.set(s.id, s);
    return m;
  }, [staffList]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [usersRes, staffRes] = await Promise.all([
        fetch("/api/users"),
        supabase.from("staff").select("*").is("leave_date", null).order("employee_number"),
      ]);
      const data = await usersRes.json();
      if (!usersRes.ok) {
        setLoadError(data?.error ?? "ユーザー一覧の取得に失敗しました。");
        setUsers([]);
      } else {
        setUsers(data.users as AppUser[]);
      }
      setStaffList((staffRes.data as Staff[]) ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured) fetchAll();
    else setLoading(false);
  }, [fetchAll]);

  const patchUser = async (id: string, patch: { role?: Role; staff_id?: string | null }) => {
    // 楽観的更新
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`更新に失敗しました: ${data?.error ?? res.statusText}`);
      fetchAll();
    }
  };

  const deleteUser = async (u: AppUser) => {
    if (!window.confirm(`ユーザー「${u.email}」を削除します。よろしいですか？`)) return;
    const res = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`削除に失敗しました: ${data?.error ?? res.statusText}`);
      return;
    }
    await fetchAll();
  };

  const createUser = async (values: {
    email: string;
    password: string;
    role: Role;
    staff_id: string | null;
  }) => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "作成に失敗しました。");
    setModalOpen(false);
    await fetchAll();
  };

  // デモモード
  if (!isSupabaseConfigured) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-2xl font-bold text-slate-800">ユーザー管理</h1>
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ユーザー管理は <span className="font-medium">Supabase 接続時のみ</span> 利用できます（ログイン認証が前提）。
          <code className="mx-1 rounded bg-amber-100 px-1">.env.local</code> に Supabase の接続情報と
          <code className="mx-1 rounded bg-amber-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code> を設定してください。
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ユーザー管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "読み込み中..." : `${users.length} 名のログインユーザー`}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          ＋ ユーザー追加
        </button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">メールアドレス</th>
              <th className="px-4 py-3 font-medium">ロール</th>
              <th className="px-4 py-3 font-medium">紐付け隊員</th>
              <th className="px-4 py-3 font-medium">作成日</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && !loadError && users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  ユーザーがいません。
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {u.role === "隊員" ? (
                    <select
                      value={u.staff_id ?? ""}
                      onChange={(e) => patchUser(u.id, { staff_id: e.target.value || null })}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                    >
                      <option value="">未紐付け</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-400">
                      {u.staff_id ? staffById.get(u.staff_id)?.name ?? "—" : "—"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(u.created_at).toLocaleDateString("ja-JP")}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => deleteUser(u)}
                    className="rounded border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <UserModal staff={staffList} onClose={() => setModalOpen(false)} onCreate={createUser} />
      )}
    </div>
  );
}
