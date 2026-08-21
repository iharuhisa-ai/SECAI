"use client";

import { useMemo, useState } from "react";
import { requestJson } from "@/app/lib/apiClient";
import { autoSchedule } from "@/app/lib/autoSchedule";
import { placeFixedStaff } from "@/app/lib/fixedPlacement";
import type { Shift, ShiftType, Site, Staff } from "@/app/lib/types";

export interface AiShift {
  staff_id: string;
  day: number;
  shift_type: ShiftType;
  location?: string | null;
  start?: string | null;
  end?: string | null;
}

interface AiShiftModalProps {
  year: number;
  month: number;
  daysInMonth: number;
  staff: Staff[];
  /** 当月の既存シフト（上書きしない判定・充足の起点に使用） */
  shifts: Shift[];
  /** 現場マスタ（必要人数の反映に使用） */
  sites: Site[];
  onClose: () => void;
  /** 生成されたシフトを当月へ反映する（既存は上書きしない） */
  onApply: (shifts: AiShift[]) => Promise<void>;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiShift[] | null>(null);
  const [applying, setApplying] = useState(false);
  // AI微調整（任意）
  const [conditions, setConditions] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMsg, setAdjustMsg] = useState<string | null>(null);

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

  // 土台の作成（決定論）: 固定配置＋決定論スケジューラ。AI不要・瞬時。
  const generate = () => {
    if (selectedIds.length === 0) {
      setError("作成対象の隊員を1名以上選択してください。");
      return;
    }
    if (sitesWithReq === 0) {
      setError("必要人数が設定された現場がありません。「設定（現場マスタ）」で登録してください。");
      return;
    }
    setError(null);
    setAdjustMsg(null);
    const selectedSet = new Set(selectedIds);
    const selected = staff.filter((s) => selectedIds.includes(s.id));
    const realExisting = shifts.filter((sh) => sh.shift_type && selectedSet.has(sh.staff_id));
    try {
      // 固定配置（受付・SV等）を先に機械的に配置
      const fixedResults: AiShift[] = [];
      for (const s of selected) {
        if (!s.fixed_shift_type) continue;
        const existingDays = new Set(
          realExisting.filter((e) => e.staff_id === s.id).map((e) => Number(e.date.slice(8, 10)))
        );
        const placed = placeFixedStaff({ staff: s, sites, year, month, daysInMonth, existingDays });
        fixedResults.push(...placed);
      }
      // 決定論スケジューラの充足に固定配置を効かせるため Shift 形式で existing に混ぜる
      const fixedAsShift: Shift[] = fixedResults.map((p) => ({
        id: `fx-${p.staff_id}-${p.day}`,
        staff_id: p.staff_id,
        date: `${year}-${pad(month)}-${pad(p.day)}`,
        shift_type: p.shift_type,
        start_time: p.start ?? null,
        end_time: p.end ?? null,
        location: p.location ?? null,
        note: null,
        created_at: "",
      }));
      // 残りの隊員を決定論で作成（固定配置の隊員は全日 existing で埋まるため再作成されない）
      const auto = autoSchedule({
        year,
        month,
        daysInMonth,
        staff: selected,
        sites,
        existing: [...realExisting, ...fixedAsShift],
      });
      setResult([...fixedResults, ...auto]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "シフト作成に失敗しました。");
    }
  };

  // AI微調整（任意）: 作成した土台に自由記述条件を反映。充足が悪化する変更はサーバー側で破棄。
  const adjust = async () => {
    if (!result) return;
    if (!conditions.trim()) {
      setAdjustMsg("追加条件を入力してください。");
      return;
    }
    setAdjusting(true);
    setAdjustMsg(null);
    setError(null);
    try {
      const selectedSet = new Set(selectedIds);
      const existingCells = shifts
        .filter((sh) => sh.shift_type && selectedSet.has(sh.staff_id))
        .map((sh) => ({
          staff_id: sh.staff_id,
          day: Number(sh.date.slice(8, 10)),
          shift_type: sh.shift_type as string,
          location: sh.location ?? null,
          start: (sh.start_time ?? "").slice(0, 5) || null,
          end: (sh.end_time ?? "").slice(0, 5) || null,
        }));
      const siteReqs = sites
        .filter((s) => s.requirements && s.requirements.length > 0)
        .map((s) => ({ name: s.name, requirements: s.requirements }));
      const staffInfo = staff
        .filter((s) => selectedIds.includes(s.id))
        .map((s) => ({ id: s.id, name: s.name, rank: s.rank }));
      const data = await requestJson<{ shifts: AiShift[]; applied: number; message?: string }>(
        "/api/shifts/adjust",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year,
            month,
            daysInMonth,
            staff: staffInfo,
            sites: siteReqs,
            existing: existingCells,
            base: result,
            conditions,
          }),
        }
      );
      if (data.shifts) setResult(data.shifts);
      setAdjustMsg(data.message ?? `${data.applied} 件を調整しました。`);
    } catch (err) {
      setAdjustMsg(err instanceof Error ? err.message : "AI微調整に失敗しました。");
    } finally {
      setAdjusting(false);
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
            <h2 className="text-lg font-bold text-slate-800">シフト自動作成</h2>
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
            <span className="font-medium text-slate-700">固定配置の隊員（受付・SV等）は自動配置</span>
            し、残りは必要人数の充足・出勤/夜勤・休日の均等を満たすよう
            <span className="font-medium text-slate-700">瞬時に作成</span>
            します。作成後、追加条件があれば
            <span className="font-medium text-slate-700">AIで微調整</span>
            できます。
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
                    {s.fixed_shift_type && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                        固定:{s.fixed_shift_type}
                      </span>
                    )}
                    {s.rank && !s.fixed_shift_type && (
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

          {!result && (
            <button
              onClick={generate}
              className="mt-2 w-full rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              シフトを作成する
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

          {/* AI微調整（任意） */}
          {result && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                追加条件でAI微調整（任意）
              </span>
              <p className="mb-2 text-xs text-slate-500">
                作成した案に対し、自由記述の条件をAIで反映します。充足が悪化する変更は自動で破棄され、土台の案を維持します。
              </p>
              <textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                className="h-20 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder={"例:\n・20日は佐藤を休みに\n・隊長は平日中心に"}
              />
              <button
                type="button"
                onClick={adjust}
                disabled={adjusting || !conditions.trim()}
                className="mt-2 w-full rounded-md border border-slate-800 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                {adjusting ? "AIが微調整中..." : "✨ AIで微調整"}
              </button>
              {adjustMsg && (
                <p className="mt-2 rounded-md bg-white px-3 py-2 text-xs text-slate-600">{adjustMsg}</p>
              )}
            </div>
          )}
        </div>

        {result && (
          <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={generate}
              disabled={applying || adjusting}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              作り直す
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={applying || adjusting}
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
