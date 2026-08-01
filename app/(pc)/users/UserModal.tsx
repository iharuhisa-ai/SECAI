"use client";

import { useState } from "react";
import { ROLES, type Role } from "@/app/lib/supabase";
import type { Staff } from "@/app/lib/types";

interface UserModalProps {
  staff: Staff[];
  onClose: () => void;
  onCreate: (values: {
    email: string;
    password: string;
    role: Role;
    staff_id: string | null;
  }) => Promise<void>;
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

export default function UserModal({ staff, onClose, onCreate }: UserModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("隊員");
  const [staffId, setStaffId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("メールアドレスとパスワードは必須です。");
      return;
    }
    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください。");
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        email: email.trim(),
        password,
        role,
        staff_id: role === "隊員" ? staffId || null : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました。");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">ユーザーの追加</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              メールアドレス<span className="ml-1 text-red-500">*</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="user@example.com"
              autoComplete="off"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              初期パスワード<span className="ml-1 text-red-500">*</span>
            </span>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="6文字以上"
              autoComplete="off"
            />
            <span className="mt-1 block text-xs text-slate-400">
              作成後、本人に伝えてください（本人がログイン後に変更可能）。
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">ロール</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={inputClass}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          {role === "隊員" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                紐付ける隊員（スマホで自動特定）
              </span>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className={inputClass}
              >
                <option value="">未紐付け</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.employee_number}）
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "作成中..." : "作成する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
