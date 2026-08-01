"use client";

import { useEffect, useState } from "react";
import {
  SHIFT_PRESETS,
  STAFFING_SHIFT_TYPES,
  type ShiftType,
  type Site,
  type SiteFormValues,
  type SiteRequirement,
} from "@/app/lib/types";

interface SiteModalProps {
  /** 編集対象。null の場合は新規登録 */
  target: Site | null;
  onClose: () => void;
  onSubmit: (values: SiteFormValues) => Promise<void>;
}

const emptyForm: SiteFormValues = { name: "", address: "", note: "", requirements: [] };

function toFormValues(site: Site): SiteFormValues {
  return {
    name: site.name ?? "",
    address: site.address ?? "",
    note: site.note ?? "",
    requirements: site.requirements ?? [],
  };
}

export default function SiteModal({ target, onClose, onSubmit }: SiteModalProps) {
  const isEdit = target !== null;
  const [form, setForm] = useState<SiteFormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(target ? toFormValues(target) : emptyForm);
    setError(null);
  }, [target]);

  const update = (key: "name" | "address" | "note", value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addRequirement = () => {
    const t: ShiftType = "日勤";
    const preset = SHIFT_PRESETS[t];
    setForm((prev) => ({
      ...prev,
      requirements: [
        ...prev.requirements,
        { shift_type: t, start: preset.start, end: preset.end, count: 1 },
      ],
    }));
  };

  const updateRequirement = (
    index: number,
    field: keyof SiteRequirement,
    value: string
  ) =>
    setForm((prev) => {
      const reqs = prev.requirements.map((r, i) => {
        if (i !== index) return r;
        if (field === "shift_type") {
          const t = value as ShiftType;
          const preset = SHIFT_PRESETS[t];
          // 区分変更時はその区分の標準時刻に合わせる（その後手動調整も可）
          return { ...r, shift_type: t, start: preset.start, end: preset.end };
        }
        if (field === "count") return { ...r, count: Math.max(0, Number(value) || 0) };
        return { ...r, [field]: value };
      });
      return { ...prev, requirements: reqs };
    });

  const removeRequirement = (index: number) =>
    setForm((prev) => ({
      ...prev,
      requirements: prev.requirements.filter((_, i) => i !== index),
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("現場名は必須です。");
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
        className="w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? "現場の編集" : "現場の新規登録"}
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
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              現場名<span className="ml-1 text-red-500">*</span>
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
              placeholder="本社ビル"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">住所</span>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className={inputClass}
              placeholder="東京都千代田区〇〇 1-2-3"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">備考</span>
            <textarea
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              className={`${inputClass} h-20 resize-none`}
              placeholder="勤務形態など"
            />
          </label>

          {/* 必要人数 */}
          <div className="border-t border-slate-200 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">必要人数</span>
              <button
                type="button"
                onClick={addRequirement}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                ＋ 行を追加
              </button>
            </div>

            {form.requirements.length === 0 ? (
              <p className="text-xs text-slate-400">
                「＋ 行を追加」で、区分・時間帯ごとの必要人数を登録できます（例: 日勤 08:00-20:00 2名）。
              </p>
            ) : (
              <div className="space-y-2">
                {form.requirements.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={r.shift_type}
                      onChange={(e) => updateRequirement(i, "shift_type", e.target.value)}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    >
                      {STAFFING_SHIFT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) => updateRequirement(i, "start", e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                    <span className="text-slate-400">-</span>
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => updateRequirement(i, "end", e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={r.count}
                        onChange={(e) => updateRequirement(i, "count", e.target.value)}
                        className="w-14 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                      />
                      <span className="text-sm text-slate-500">名</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRequirement(i)}
                      className="ml-auto text-slate-400 hover:text-red-500"
                      aria-label="削除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
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
