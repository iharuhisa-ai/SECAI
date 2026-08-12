"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SHIFT_PRESETS,
  SHIFT_TYPES,
  STAFFING_SHIFT_TYPES,
  type Shift,
  type ShiftFormValues,
  type ShiftType,
  type Site,
} from "@/app/lib/types";

interface ShiftCellEditorProps {
  staffName: string;
  date: string; // YYYY-MM-DD
  /** 既存シフト。null の場合は未登録 */
  current: Shift | null;
  sites: Site[];
  onClose: () => void;
  onSubmit: (values: ShiftFormValues) => Promise<void>;
  /** シフトを削除（未登録に戻す） */
  onDelete: () => Promise<void>;
}

const emptyForm: ShiftFormValues = {
  shift_type: "",
  start_time: "",
  end_time: "",
  location: "",
  note: "",
};

function toFormValues(shift: Shift): ShiftFormValues {
  return {
    shift_type: shift.shift_type ?? "",
    start_time: (shift.start_time ?? "").slice(0, 5),
    end_time: (shift.end_time ?? "").slice(0, 5),
    location: shift.location ?? "",
    note: shift.note ?? "",
  };
}

export default function ShiftCellEditor({
  staffName,
  date,
  current,
  sites,
  onClose,
  onSubmit,
  onDelete,
}: ShiftCellEditorProps) {
  const [form, setForm] = useState<ShiftFormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(current ? toFormValues(current) : emptyForm);
    setError(null);
  }, [current]);

  const update = (key: keyof ShiftFormValues, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // 選択中の現場の必要人数（登録済みの勤務区分・時刻）
  const currentSiteReqs = useMemo(
    () => sites.find((s) => s.name === form.location)?.requirements ?? [],
    [sites, form.location]
  );

  // 選べる勤務区分＝現場マスタに登録された区分＋休/明休（現場未選択時は全勤務区分）。
  const availableTypes = useMemo(() => {
    const workTypes =
      currentSiteReqs.length > 0
        ? currentSiteReqs.map((r) => r.shift_type)
        : [...STAFFING_SHIFT_TYPES];
    const base = new Set<ShiftType>([...workTypes, "休", "明休"]);
    // 既存の値がリストに無くても表示できるよう保持
    if (form.shift_type) base.add(form.shift_type as ShiftType);
    return SHIFT_TYPES.filter((t) => base.has(t));
  }, [currentSiteReqs, form.shift_type]);

  // 勤務区分を選ぶと、その現場に登録された時刻（無ければ既定）を補完する
  const selectType = (type: ShiftType) => {
    const req = currentSiteReqs.find((r) => r.shift_type === type);
    const start = req ? req.start : SHIFT_PRESETS[type].start;
    const end = req ? req.end : SHIFT_PRESETS[type].end;
    setForm((prev) => ({ ...prev, shift_type: type, start_time: start, end_time: end }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.shift_type) {
      setError("勤務区分を選択してください。");
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

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました。");
      setSaving(false);
    }
  };

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">シフト編集</h2>
            <p className="text-sm text-slate-500">
              {staffName}・{dateLabel}
            </p>
          </div>
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
            <span className="mb-1 block text-sm font-medium text-slate-700">配置場所（現場）</span>
            <select
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
              className={inputClass}
            >
              <option value="">選択してください</option>
              {sites.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
              {/* マスタに無い既存の配置場所も選択肢として保持 */}
              {form.location && !sites.some((s) => s.name === form.location) && (
                <option value={form.location}>{form.location}（マスタ未登録）</option>
              )}
            </select>
            {sites.length === 0 && (
              <span className="mt-1 block text-xs text-amber-700">
                現場が未登録です。「設定（現場マスタ）」から追加してください。
              </span>
            )}
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              勤務区分<span className="ml-1 text-red-500">*</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {availableTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => selectType(t)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    form.shift_type === t
                      ? "bg-slate-800 text-white"
                      : "border border-slate-300 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-xs text-slate-400">
              {currentSiteReqs.length > 0
                ? "現場マスタに登録された区分から選べます（＋休・明休）。"
                : "現場を選ぶと、その現場に登録された勤務区分が表示されます。"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">開始</span>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => update("start_time", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">終了</span>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => update("end_time", e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">備考</span>
            <textarea
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              className={`${inputClass} h-20 resize-none`}
              placeholder="引き継ぎ事項など"
            />
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex items-center justify-between pt-2">
            <div>
              {current && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  削除
                </button>
              )}
            </div>
            <div className="flex gap-3">
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
                {saving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
