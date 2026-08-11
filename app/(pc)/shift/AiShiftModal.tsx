"use client";

import { useMemo, useState } from "react";
import { requestJson } from "@/app/lib/apiClient";
import type { Shift, ShiftType, Site, Staff } from "@/app/lib/types";

export interface AiShift {
  staff_id: string;
  day: number;
  shift_type: ShiftType;
  location?: string | null;
}

interface AiShiftModalProps {
  year: number;
  month: number;
  daysInMonth: number;
  staff: Staff[];
  /** 当月の既存シフト（上書きしない判定・AIへの通知に使用） */
  shifts: Shift[];
  /** 現場マスタ（必要人数の反映に使用） */
  sites: Site[];
  onClose: () => void;
  /** 生成されたシフトを当月へ反映する（既存は上書きしない） */
  onApply: (shifts: AiShift[]) => Promise<void>;
}

export default function AiShiftModal({
  year,
  month,
  daysInMonth,
  staff,
  shifts,
  sites,
  onClose,
  onApply,
}: AiShiftModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(staff.map((s) => s.id));
  const [constraints, setConstraints] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiShift[] | null>(null);
  const [applying, setApplying] = useState(false);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) m.set(s.id, s.name);
    return m;
  }, [staff]);

  // 各隊員の「既に入力済みの日」
  const filledByStaff = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const sh of shifts) {
      if (!sh.shift_type) continue;
      const day = Number(sh.date.slice(8, 10));
      const arr = m.get(sh.staff_id) ?? [];
      arr.push(day);
      m.set(sh.staff_id, arr);
    }
    return m;
  }, [shifts]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const allSelected = selectedIds.length === staff.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : staff.map((s) => s.id));

  const sitesWithReq = sites.filter((s) => s.requirements && s.requirements.length > 0).length;

  const generate = async () => {
    if (selectedIds.length === 0) {
      setError("作成対象の隊員を1名以上選択してください。");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const selected = staff.filter((s) => selectedIds.includes(s.id));
      const selectedSet = new Set(selectedIds);

      // 既に入力済みのシフト（区分・配置現場付き）。AIが続き（明休・連続勤務・必要人数の充足）を踏まえるために渡す。
      const existing = shifts
        .filter((sh) => sh.shift_type && selectedSet.has(sh.staff_id))
        .map((sh) => ({
          staff_id: sh.staff_id,
          day: Number(sh.date.slice(8, 10)),
          shift_type: sh.shift_type,
          location: sh.location ?? null,
        }));

      // 必要人数が設定された現場のみ渡す
      const siteReqs = sites
        .filter((s) => s.requirements && s.requirements.length > 0)
        .map((s) => ({ name: s.name, requirements: s.requirements }));

      const data = await requestJson<{ shifts: AiShift[] }>("/api/shifts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          daysInMonth,
          staff: selected.map((s) => ({
            id: s.id,
            name: s.name,
            rank: s.rank,
            days_off_preference: s.days_off_preference,
            work_preference: s.work_preference,
            incompatible_names: (s.incompatible_staff_ids ?? [])
              .map((id) => nameById.get(id))
              .filter((n): n is string => Boolean(n)),
          })),
          existing,
          sites: siteReqs,
          constraints,
        }),
      });
      setResult(data.shifts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    setApplying(true);
    setError(null);
    try {
      await onApply(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "反映に失敗しました。");
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">AIでシフト作成</h2>
            <p className="text-sm text-slate-500">
              {year}年{month}月・対象 {selectedIds.length} / {staff.length} 名
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-3 text-sm text-slate-600">
            勤務区分（日勤・夜勤・半日・休・明休）を、各隊員の区分・希望と
            <span className="font-medium text-slate-700">現場の必要人数</span>
            を踏まえて作成し、勤務日には配置現場も割り当てます。
            <span className="font-medium text-slate-700">既に入力済みのシフトは上書きしません。</span>
            {sitesWithReq === 0 && (
              <span className="mt-1 block text-xs text-amber-700">
                必要人数が設定された現場がありません。「設定（現場マスタ）」で登録すると配置に反映されます。
              </span>
            )}
          </p>

          {/* 作成対象の隊員選択 */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">作成対象の隊員</span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
              >
                {allSelected ? "全解除" : "全選択"}
              </button>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {staff.map((s) => {
                const filledCount = filledByStaff.get(s.id)?.length ?? 0;
                return (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="font-medium">{s.name}</span>
                    {s.rank && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        {s.rank}
                      </span>
                    )}
                    {filledCount > 0 && (
                      <span className="ml-auto text-xs text-slate-400">
                        入力済 {filledCount}日（保持）
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">追加条件（任意）</span>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              className="h-24 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              placeholder={"例:\n・土日は最低2名を日勤に配置\n・隊長は平日中心に"}
            />
          </label>

          {!result && (
            <button
              onClick={generate}
              disabled={loading}
              className="mt-4 w-full rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? "AIが作成中...（30秒〜1分ほどかかります）" : "シフトを作成する"}
            </button>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {result && (
            <div className="mt-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
              <span className="font-medium">{result.length} 件</span>{" "}
              のシフト案を作成しました。「当月へ反映」を押すと、空いている日にのみ反映されます（既存は保持）。
            </div>
          )}
        </div>

        {result && (
          <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={generate}
              disabled={loading || applying}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              作り直す
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={applying}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {applying ? "反映中..." : "当月へ反映"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
