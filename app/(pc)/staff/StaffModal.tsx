"use client";

import { useEffect, useState } from "react";
import {
  EMPLOYMENT_TYPES,
  STAFF_RANKS,
  type Staff,
  type StaffFormValues,
} from "@/app/lib/types";

interface StaffModalProps {
  /** 編集対象。null の場合は新規登録 */
  target: Staff | null;
  /** 「組めない隊員」選択用の全隊員一覧 */
  allStaff: Staff[];
  onClose: () => void;
  onSubmit: (values: StaffFormValues) => Promise<void>;
}

const emptyForm: StaffFormValues = {
  name: "",
  employee_number: "",
  department: "",
  employment_type: "",
  phone: "",
  email: "",
  address: "",
  qualifications: "",
  rank: "",
  days_off_preference: "",
  work_preference: "",
  incompatible_staff_ids: [],
  join_date: "",
};

function toFormValues(staff: Staff): StaffFormValues {
  return {
    name: staff.name ?? "",
    employee_number: staff.employee_number ?? "",
    department: staff.department ?? "",
    employment_type: staff.employment_type ?? "",
    phone: staff.phone ?? "",
    email: staff.email ?? "",
    address: staff.address ?? "",
    qualifications: (staff.qualifications ?? []).join(", "),
    rank: staff.rank ?? "",
    days_off_preference: staff.days_off_preference ?? "",
    work_preference: staff.work_preference ?? "",
    incompatible_staff_ids: staff.incompatible_staff_ids ?? [],
    join_date: staff.join_date ?? "",
  };
}

export default function StaffModal({ target, allStaff, onClose, onSubmit }: StaffModalProps) {
  const isEdit = target !== null;
  const [form, setForm] = useState<StaffFormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(target ? toFormValues(target) : emptyForm);
    setError(null);
  }, [target]);

  const update = (key: keyof StaffFormValues, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // 「組めない隊員」のトグル
  const toggleIncompatible = (id: string) =>
    setForm((prev) => ({
      ...prev,
      incompatible_staff_ids: prev.incompatible_staff_ids.includes(id)
        ? prev.incompatible_staff_ids.filter((x) => x !== id)
        : [...prev.incompatible_staff_ids, id],
    }));

  // 自分以外の在籍隊員（組めない隊員の候補）
  const candidates = allStaff.filter((s) => s.leave_date === null && s.id !== target?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("氏名は必須です。");
      return;
    }
    if (!form.employee_number.trim()) {
      setError("社員番号は必須です。");
      return;
    }

    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? "隊員情報の編集" : "隊員の新規登録"}
          </h2>
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
          <Field label="氏名" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
              placeholder="山田 太郎"
            />
          </Field>

          <Field label="社員番号" required>
            <input
              type="text"
              value={form.employee_number}
              onChange={(e) => update("employee_number", e.target.value)}
              className={inputClass}
              placeholder="S001"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="所属部署">
              <input
                type="text"
                value={form.department}
                onChange={(e) => update("department", e.target.value)}
                className={inputClass}
                placeholder="第一警備部"
              />
            </Field>

            <Field label="雇用形態">
              <select
                value={form.employment_type}
                onChange={(e) => update("employment_type", e.target.value)}
                className={inputClass}
              >
                <option value="">未設定</option>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="電話番号">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className={inputClass}
                placeholder="090-1234-5678"
              />
            </Field>

            <Field label="入社日">
              <input
                type="date"
                value={form.join_date}
                onChange={(e) => update("join_date", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="メールアドレス">
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className={inputClass}
              placeholder="yamada@example.com"
            />
          </Field>

          <Field label="住所">
            <input
              type="text"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className={inputClass}
              placeholder="東京都千代田区〇〇 1-2-3"
            />
          </Field>

          <Field label="保有資格（カンマ区切り）">
            <input
              type="text"
              value={form.qualifications}
              onChange={(e) => update("qualifications", e.target.value)}
              className={inputClass}
              placeholder="施設警備2級, 上級救命"
            />
          </Field>

          <div className="border-t border-slate-200 pt-4">
            <p className="mb-3 text-xs font-medium text-slate-500">
              シフト作成用の情報（AIシフト作成で考慮されます）
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="区分">
                <select
                  value={form.rank}
                  onChange={(e) => update("rank", e.target.value)}
                  className={inputClass}
                >
                  <option value="">未設定</option>
                  {STAFF_RANKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="休日希望日">
                <input
                  type="text"
                  value={form.days_off_preference}
                  onChange={(e) => update("days_off_preference", e.target.value)}
                  className={inputClass}
                  placeholder="毎週日曜、第2土曜"
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="出勤希望">
                <input
                  type="text"
                  value={form.work_preference}
                  onChange={(e) => update("work_preference", e.target.value)}
                  className={inputClass}
                  placeholder="日勤希望、夜勤可 など"
                />
              </Field>
            </div>

            <div className="mt-4">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                組めない隊員
              </span>
              {candidates.length === 0 ? (
                <p className="text-xs text-slate-400">他の在籍隊員がいません。</p>
              ) : (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                  {candidates.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={form.incompatible_staff_ids.includes(s.id)}
                        onChange={() => toggleIncompatible(s.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {s.name}
                      <span className="font-mono text-xs text-slate-400">
                        {s.employee_number}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

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
              {saving ? "保存中..." : isEdit ? "更新する" : "登録する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
