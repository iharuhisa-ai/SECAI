"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { SAMPLE_STAFF } from "@/app/lib/sampleStaff";
import { generateSampleShifts } from "@/app/lib/sampleShifts";
import { SAMPLE_SITES } from "@/app/lib/sampleSites";
import {
  SHIFT_PRESETS,
  type Shift,
  type ShiftFormValues,
  type Site,
  type SiteRequirement,
  type Staff,
} from "@/app/lib/types";
import ShiftCellEditor from "./ShiftCellEditor";
import AiShiftModal, { type AiShift } from "./AiShiftModal";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// シフトを staff_id+date でひけるようキー化
function shiftKey(staffId: string, date: string): string {
  return `${staffId}__${date}`;
}

// フォーム入力を shifts テーブルのカラムへ変換
function toRecord(values: ShiftFormValues, staffId: string, date: string) {
  return {
    staff_id: staffId,
    date,
    shift_type: values.shift_type || null,
    start_time: values.start_time || null,
    end_time: values.end_time || null,
    location: values.location.trim() || null,
    note: values.note.trim() || null,
  };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

interface CellTarget {
  staff: Staff;
  date: string;
}

export default function ShiftPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [target, setTarget] = useState<CellTarget | null>(null);

  // ドラッグ＆ドロップによる勤務コピー
  const [dragSource, setDragSource] = useState<Shift | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // 前月コピー処理中フラグ
  const [copying, setCopying] = useState(false);

  // AIシフト作成モーダル
  const [aiOpen, setAiOpen] = useState(false);

  // 表示モード: 勤務区分 / 時間
  const [viewMode, setViewMode] = useState<"type" | "time">("type");

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  // 月初の範囲（YYYY-MM-DD）
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // デモモード（Supabase未接続）
    if (!isSupabaseConfigured) {
      setStaffList(SAMPLE_STAFF.filter((s) => s.leave_date === null));
      setShifts(generateSampleShifts(year, month));
      setSites(SAMPLE_SITES);
      setLoading(false);
      return;
    }

    const [staffRes, shiftRes, siteRes] = await Promise.all([
      supabase.from("staff").select("*").is("leave_date", null).order("employee_number"),
      supabase.from("shifts").select("*").gte("date", monthStart).lte("date", monthEnd),
      supabase.from("sites").select("*").order("name"),
    ]);

    if (staffRes.error) {
      setLoadError(staffRes.error.message);
      setStaffList([]);
      setShifts([]);
      setLoading(false);
      return;
    }
    if (shiftRes.error) {
      setLoadError(shiftRes.error.message);
    }

    setStaffList((staffRes.data as Staff[]) ?? []);
    setShifts((shiftRes.data as Shift[]) ?? []);
    setSites((siteRes.data as Site[]) ?? []);
    setLoading(false);
  }, [year, month, monthStart, monthEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // staff_id+date → Shift の索引
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const s of shifts) map.set(shiftKey(s.staff_id, s.date), s);
    return map;
  }, [shifts]);

  // 現場×勤務区分の必要人数（充足状況インジケータの行）
  const requirementRows = useMemo(() => {
    const rows: { site: string; req: SiteRequirement }[] = [];
    for (const site of sites) {
      for (const r of site.requirements ?? []) rows.push({ site: site.name, req: r });
    }
    return rows;
  }, [sites]);

  // 日付×現場×区分 ごとの配置人数（`${date}|${location}|${shift_type}` → 人数）
  const coverageMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      if (!s.shift_type || !s.location) continue;
      const k = `${s.date}|${s.location}|${s.shift_type}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [shifts]);

  const goPrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const goThisMonth = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  // 1セルのシフトを保存（編集モーダル・ドロップコピー共通）
  const persistShift = useCallback(
    async (staffId: string, date: string, values: ShiftFormValues) => {
      const record = toRecord(values, staffId, date);

      if (!isSupabaseConfigured) {
        const key = shiftKey(staffId, date);
        setShifts((prev) => {
          const existing = prev.find((s) => shiftKey(s.staff_id, s.date) === key);
          const next: Shift = {
            id: existing?.id ?? `demo-shift-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            created_at: existing?.created_at ?? new Date().toISOString(),
            ...record,
          };
          return [...prev.filter((s) => shiftKey(s.staff_id, s.date) !== key), next];
        });
        return;
      }

      // 本番: (staff_id, date) のユニーク制約で upsert
      const { error } = await supabase
        .from("shifts")
        .upsert(record, { onConflict: "staff_id,date" });
      if (error) throw new Error(error.message);
      await fetchData();
    },
    [fetchData]
  );

  const handleSubmit = async (values: ShiftFormValues) => {
    if (!target) return;
    await persistShift(target.staff.id, target.date, values);
    setTarget(null);
  };

  const handleDelete = async () => {
    if (!target) return;
    const { staff, date } = target;

    if (!isSupabaseConfigured) {
      setShifts((prev) => prev.filter((s) => shiftKey(s.staff_id, s.date) !== shiftKey(staff.id, date)));
      setTarget(null);
      return;
    }

    const { error } = await supabase
      .from("shifts")
      .delete()
      .eq("staff_id", staff.id)
      .eq("date", date);
    if (error) throw new Error(error.message);

    setTarget(null);
    await fetchData();
  };

  // ドロップ時に元セルの勤務内容をコピー
  const handleDrop = async (targetStaffId: string, date: string) => {
    const src = dragSource;
    setDragSource(null);
    setDragOverKey(null);
    if (!src) return;
    // 同一セルへのドロップは無視
    if (src.staff_id === targetStaffId && src.date === date) return;

    const values: ShiftFormValues = {
      shift_type: src.shift_type ?? "",
      start_time: (src.start_time ?? "").slice(0, 5),
      end_time: (src.end_time ?? "").slice(0, 5),
      location: src.location ?? "",
      note: src.note ?? "",
    };
    try {
      await persistShift(targetStaffId, date, values);
    } catch (err) {
      alert(`コピーに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 前月のシフトを当月へ一括コピー（F-11）。同じ「日」「隊員」へ複製する。
  const handleCopyPrevMonth = async () => {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevDays = new Date(prevYear, prevMonth, 0).getDate();

    const ok = window.confirm(
      `${prevYear}年${prevMonth}月のシフトを ${year}年${month}月へコピーします。\n` +
        `同じ日付の既存シフトは上書きされます。よろしいですか？`
    );
    if (!ok) return;

    setCopying(true);
    try {
      // 前月のシフトを取得
      let prevShifts: Shift[];
      if (!isSupabaseConfigured) {
        prevShifts = generateSampleShifts(prevYear, prevMonth);
      } else {
        const prevStart = `${prevYear}-${pad(prevMonth)}-01`;
        const prevEnd = `${prevYear}-${pad(prevMonth)}-${pad(prevDays)}`;
        const { data, error } = await supabase
          .from("shifts")
          .select("*")
          .gte("date", prevStart)
          .lte("date", prevEnd);
        if (error) throw new Error(error.message);
        prevShifts = (data as Shift[]) ?? [];
      }

      // 在籍中の隊員のみ対象。当月に存在しない日（例: 31日）はスキップ。
      const activeIds = new Set(staffList.map((s) => s.id));
      const records = prevShifts
        .filter((s) => s.shift_type && activeIds.has(s.staff_id))
        .map((s) => {
          const day = Number(s.date.slice(8, 10));
          if (day > daysInMonth) return null;
          return {
            staff_id: s.staff_id,
            date: `${year}-${pad(month)}-${pad(day)}`,
            shift_type: s.shift_type,
            start_time: s.start_time,
            end_time: s.end_time,
            location: s.location,
            note: s.note,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (records.length === 0) {
        alert("前月にコピー対象のシフトがありませんでした。");
        return;
      }

      if (!isSupabaseConfigured) {
        const now = new Date().toISOString();
        setShifts((prev) => {
          const map = new Map(prev.map((s) => [shiftKey(s.staff_id, s.date), s]));
          for (const r of records) {
            const key = shiftKey(r.staff_id, r.date);
            const existing = map.get(key);
            map.set(key, {
              id: existing?.id ?? `demo-shift-${key}`,
              created_at: existing?.created_at ?? now,
              ...r,
            });
          }
          return Array.from(map.values());
        });
      } else {
        const { error } = await supabase
          .from("shifts")
          .upsert(records, { onConflict: "staff_id,date" });
        if (error) throw new Error(error.message);
        await fetchData();
      }

      alert(`前月のシフト ${records.length} 件をコピーしました。`);
    } catch (err) {
      alert(`前月コピーに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCopying(false);
    }
  };

  // AIが作成したシフト案を当月へ一括反映（既存シフトは上書きしない）
  const handleApplyAi = async (aiShifts: AiShift[]) => {
    // 既存シフトのキー集合（上書き防止）
    const existingKeys = new Set(shifts.map((s) => shiftKey(s.staff_id, s.date)));

    // 勤務区分から既定の時刻を補完してレコード化。既存セルは除外。
    const records = aiShifts
      .map((s) => {
        const preset = SHIFT_PRESETS[s.shift_type];
        return {
          staff_id: s.staff_id,
          date: `${year}-${pad(month)}-${pad(s.day)}`,
          shift_type: s.shift_type,
          start_time: preset.start || null,
          end_time: preset.end || null,
          location: s.location || null,
          note: null as string | null,
        };
      })
      .filter((r) => !existingKeys.has(shiftKey(r.staff_id, r.date)));

    if (records.length === 0) {
      setAiOpen(false);
      return;
    }

    if (!isSupabaseConfigured) {
      const now = new Date().toISOString();
      setShifts((prev) => {
        const map = new Map(prev.map((s) => [shiftKey(s.staff_id, s.date), s]));
        for (const r of records) {
          const key = shiftKey(r.staff_id, r.date);
          const existing = map.get(key);
          map.set(key, {
            id: existing?.id ?? `demo-shift-${key}`,
            created_at: existing?.created_at ?? now,
            ...r,
          });
        }
        return Array.from(map.values());
      });
      setAiOpen(false);
      return;
    }

    const { error } = await supabase
      .from("shifts")
      .upsert(records, { onConflict: "staff_id,date" });
    if (error) throw new Error(error.message);

    setAiOpen(false);
    await fetchData();
  };

  return (
    <div className="p-6 md:p-8">
      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">デモ表示中</span>（Supabase未接続）。サンプルのシフトを自動生成して表示しています。
          編集内容は画面上だけで動作し、保存はされません。
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">シフト管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading
              ? "読み込み中..."
              : `在籍 ${staffList.length} 名・クリックで編集／ドラッグ＆ドロップで勤務をコピー`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiOpen(true)}
            disabled={loading || staffList.length === 0}
            className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            ✨ AIでシフト作成
          </button>
          <button
            onClick={handleCopyPrevMonth}
            disabled={copying || loading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {copying ? "コピー中..." : "前月をコピー"}
          </button>
          <button
            onClick={goThisMonth}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            今月
          </button>
          <div className="flex items-center rounded-md border border-slate-300">
            <button
              onClick={goPrevMonth}
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              aria-label="前の月"
            >
              ‹
            </button>
            <span className="min-w-[7rem] text-center text-sm font-bold text-slate-800">
              {year}年{month}月
            </span>
            <button
              onClick={goNextMonth}
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              aria-label="次の月"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* 凡例 ＋ 表示切替 */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {Object.entries(SHIFT_PRESETS).map(([type, preset]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-sm ${preset.badge}`} />
            {type}
          </span>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-slate-500">表示:</span>
          <button
            onClick={() => setViewMode("type")}
            className={`rounded px-2 py-1 font-medium transition ${
              viewMode === "type"
                ? "bg-slate-800 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            勤務区分
          </button>
          <button
            onClick={() => setViewMode("time")}
            className={`rounded px-2 py-1 font-medium transition ${
              viewMode === "time"
                ? "bg-slate-800 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            時間
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          読み込みエラー: {loadError}
          <br />
          <span className="text-slate-500">
            .env.local の Supabase 接続情報と shifts テーブルをご確認ください。
          </span>
        </div>
      )}

      {/* カレンダーグリッド */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500">
              <th className="sticky left-0 z-10 min-w-[8rem] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                隊員
              </th>
              {days.map((day) => {
                const weekday = new Date(year, month - 1, day).getDay();
                const isSun = weekday === 0;
                const isSat = weekday === 6;
                return (
                  <th
                    key={day}
                    className={`border-b border-slate-200 px-1 py-1 text-center font-medium ${
                      viewMode === "time" ? "min-w-[3.5rem]" : "min-w-[2.5rem]"
                    } ${isSun ? "text-red-500" : isSat ? "text-sky-500" : ""}`}
                  >
                    <div>{day}</div>
                    <div className="text-[10px]">{WEEKDAYS[weekday]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!loading && staffList.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} className="px-4 py-8 text-center text-slate-400">
                  在籍中の隊員がいません。先に隊員を登録してください。
                </td>
              </tr>
            )}

            {staffList.map((staff) => (
              <tr key={staff.id} className="hover:bg-slate-50/50">
                <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 font-medium text-slate-800">
                  {staff.name}
                  <span className="ml-1 font-mono text-xs text-slate-400">
                    {staff.employee_number}
                  </span>
                </td>
                {days.map((day) => {
                  const date = `${year}-${pad(month)}-${pad(day)}`;
                  const key = shiftKey(staff.id, date);
                  const shift = shiftMap.get(key);
                  const preset = shift?.shift_type ? SHIFT_PRESETS[shift.shift_type] : null;
                  const draggable = Boolean(shift?.shift_type);
                  const isDropTarget = dragOverKey === key;
                  const isDragSource =
                    dragSource !== null &&
                    shiftKey(dragSource.staff_id, dragSource.date) === key;
                  return (
                    <td
                      key={day}
                      className="border-b border-l border-slate-100 p-0.5 text-center"
                      onDragOver={(e) => {
                        if (!dragSource) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                        setDragOverKey(key);
                      }}
                      onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(staff.id, date);
                      }}
                    >
                      <button
                        draggable={draggable}
                        onDragStart={(e) => {
                          if (!shift) return;
                          setDragSource(shift);
                          e.dataTransfer.effectAllowed = "copy";
                          // Firefox はデータ設定がないとドラッグ開始しない
                          e.dataTransfer.setData("text/plain", shift.shift_type ?? "");
                        }}
                        onDragEnd={() => {
                          setDragSource(null);
                          setDragOverKey(null);
                        }}
                        onClick={() => setTarget({ staff, date })}
                        title={
                          shift?.location
                            ? `${shift.location}（ドラッグで他セルへコピー）`
                            : draggable
                              ? "ドラッグで他セルへコピー"
                              : undefined
                        }
                        className={`h-9 w-full rounded font-medium transition ${
                          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        } ${
                          isDropTarget
                            ? "ring-2 ring-slate-800"
                            : "hover:ring-2 hover:ring-slate-300"
                        } ${isDragSource ? "opacity-40" : ""} ${
                          preset ? preset.cell : "text-slate-300 hover:bg-slate-100"
                        } ${viewMode === "time" && shift?.start_time ? "text-[10px]" : "text-xs"}`}
                      >
                        {!shift?.shift_type ? (
                          "＋"
                        ) : viewMode === "time" && shift.start_time && shift.end_time ? (
                          <span className="flex flex-col leading-tight">
                            <span>{shift.start_time.slice(0, 5)}</span>
                            <span>{shift.end_time.slice(0, 5)}</span>
                          </span>
                        ) : (
                          shift.shift_type
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          {/* 現場別 充足状況インジケータ（過不足を色で表示） */}
          {requirementRows.length > 0 && (
            <tbody className="border-t-4 border-slate-200">
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-600">
                  充足状況（配置/必要）
                </th>
                <td
                  colSpan={days.length}
                  className="px-3 py-1 text-left text-[11px] text-slate-400"
                >
                  <span className="mr-2 rounded bg-red-100 px-1.5 text-red-700">不足</span>
                  <span className="mr-2 rounded bg-green-100 px-1.5 text-green-700">充足</span>
                  <span className="rounded bg-amber-100 px-1.5 text-amber-700">過剰</span>
                </td>
              </tr>
              {requirementRows.map(({ site, req }, ri) => (
                <tr key={`${site}-${req.shift_type}-${ri}`} className="hover:bg-slate-50/50">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">
                    <span className="font-medium">{site}</span>
                    <span className="ml-1 text-slate-500">
                      {req.shift_type} {req.count}名
                    </span>
                  </td>
                  {days.map((day) => {
                    const date = `${year}-${pad(month)}-${pad(day)}`;
                    const assigned =
                      coverageMap.get(`${date}|${site}|${req.shift_type}`) ?? 0;
                    const cellColor =
                      assigned < req.count
                        ? "bg-red-100 text-red-700"
                        : assigned === req.count
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700";
                    return (
                      <td
                        key={day}
                        className="border-b border-l border-slate-100 p-0.5 text-center"
                      >
                        <div
                          className={`rounded py-1 text-[11px] font-medium ${cellColor}`}
                          title={`${site} ${req.shift_type}: 配置${assigned} / 必要${req.count}`}
                        >
                          {assigned}/{req.count}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      {target && (
        <ShiftCellEditor
          staffName={target.staff.name}
          date={target.date}
          current={shiftMap.get(shiftKey(target.staff.id, target.date)) ?? null}
          sites={sites}
          onClose={() => setTarget(null)}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      )}

      {aiOpen && (
        <AiShiftModal
          year={year}
          month={month}
          daysInMonth={daysInMonth}
          staff={staffList}
          shifts={shifts}
          sites={sites}
          onClose={() => setAiOpen(false)}
          onApply={handleApplyAi}
        />
      )}
    </div>
  );
}
