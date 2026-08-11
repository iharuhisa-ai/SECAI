"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/app/lib/apiClient";
import {
  REPORT_STATUSES,
  type Report,
  type ReportFormValues,
  type ReportStatus,
  type Site,
  type Staff,
} from "@/app/lib/types";

interface ReportModalProps {
  /** 編集対象。null の場合は新規作成 */
  target: Report | null;
  staff: Staff[];
  sites: Site[];
  onClose: () => void;
  onSubmit: (values: ReportFormValues) => Promise<void>;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const emptyForm = (): ReportFormValues => ({
  staff_id: "",
  date: today(),
  location: "",
  work_content: "",
  special_notes: "",
  ai_summary: "",
  status: "未確認",
});

function toFormValues(r: Report): ReportFormValues {
  return {
    staff_id: r.staff_id ?? "",
    date: r.date,
    location: r.location ?? "",
    work_content: r.work_content ?? "",
    special_notes: r.special_notes ?? "",
    ai_summary: r.ai_summary ?? "",
    status: r.status,
  };
}

export default function ReportModal({
  target,
  staff,
  sites,
  onClose,
  onSubmit,
}: ReportModalProps) {
  const isEdit = target !== null;
  const [form, setForm] = useState<ReportFormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);

  useEffect(() => {
    setForm(target ? toFormValues(target) : emptyForm());
    setError(null);
  }, [target]);

  const update = <K extends keyof ReportFormValues>(key: K, value: ReportFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handlePolish = async () => {
    setPolishing(true);
    setError(null);
    try {
      const data = await requestJson<{ summary: string }>("/api/reports/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_content: form.work_content,
          special_notes: form.special_notes,
          location: form.location,
        }),
      });
      update("ai_summary", data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setPolishing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.location) {
      setError("現場を選択してください。");
      return;
    }
    if (!form.date) {
      setError("日付は必須です。");
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
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? "日報の確認・編集" : "日報の新規作成"}
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

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                現場<span className="ml-1 text-red-500">*</span>
              </span>
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
                {/* マスタに無い既存の現場名も選択肢として保持 */}
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

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                日付<span className="ml-1 text-red-500">*</span>
              </span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              報告者（任意）
            </span>
            <select
              value={form.staff_id}
              onChange={(e) => update("staff_id", e.target.value)}
              className={inputClass}
            >
              <option value="">未選択</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.employee_number}）
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">業務内容</span>
            <textarea
              value={form.work_content}
              onChange={(e) => update("work_content", e.target.value)}
              className={`${inputClass} h-24 resize-none`}
              placeholder="勤務時間・実施した業務など"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">特記事項</span>
            <textarea
              value={form.special_notes}
              onChange={(e) => update("special_notes", e.target.value)}
              className={`${inputClass} h-20 resize-none`}
              placeholder="異常・引き継ぎ事項など"
            />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">AI整形文（任意）</span>
              <button
                type="button"
                onClick={handlePolish}
                disabled={polishing}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {polishing ? "整形中..." : "✨ AIで整形"}
              </button>
            </div>
            <textarea
              value={form.ai_summary}
              onChange={(e) => update("ai_summary", e.target.value)}
              className={`${inputClass} h-28 resize-none`}
              placeholder="「AIで整形」を押すと、業務内容・特記事項を読みやすい報告文に整えます。手動編集も可能です。"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">ステータス</span>
            <div className="flex gap-2">
              {REPORT_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("status", s as ReportStatus)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    form.status === s
                      ? "bg-slate-800 text-white"
                      : "border border-slate-300 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
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
              {saving ? "保存中..." : isEdit ? "更新する" : "作成する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
