"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMobile } from "../MobileContext";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { generateSampleShifts } from "@/app/lib/sampleShifts";
import { holidayName } from "@/app/lib/holidays";
import { SHIFT_PRESETS, type Shift } from "@/app/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
const now = new Date();
const YEAR = now.getFullYear();
const MONTH = now.getMonth() + 1;
const TODAY = `${YEAR}-${pad(MONTH)}-${pad(now.getDate())}`;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function MobileShift() {
  const { currentStaff, loading: staffLoading } = useMobile();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    if (!isSupabaseConfigured) {
      setShifts(generateSampleShifts(YEAR, MONTH));
      setLoading(false);
      return;
    }
    const start = `${YEAR}-${pad(MONTH)}-01`;
    const end = `${YEAR}-${pad(MONTH)}-${pad(new Date(YEAR, MONTH, 0).getDate())}`;
    const { data } = await supabase
      .from("shifts")
      .select("*")
      .gte("date", start)
      .lte("date", end);
    setShifts((data as Shift[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const myShifts = useMemo(
    () =>
      shifts
        .filter((s) => s.staff_id === currentStaff?.id && s.shift_type)
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [shifts, currentStaff]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">
          {YEAR}年{MONTH}月のシフト
        </h1>
        <p className="text-sm text-slate-500">{currentStaff?.name ?? ""} さん</p>
      </div>

      {loading || staffLoading ? (
        <p className="text-slate-400">読み込み中...</p>
      ) : myShifts.length === 0 ? (
        <p className="text-slate-400">今月のシフトはまだ登録されていません。</p>
      ) : (
        <ul className="space-y-2">
          {myShifts.map((s) => {
            const d = new Date(`${s.date}T00:00:00`);
            const wd = d.getDay();
            const holiday = holidayName(s.date);
            const preset = s.shift_type ? SHIFT_PRESETS[s.shift_type] : null;
            const isToday = s.date === TODAY;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${
                  isToday ? "border-slate-800" : "border-slate-200"
                }`}
              >
                <div className="w-12 shrink-0 text-center">
                  <div
                    className={`text-lg font-bold ${
                      holiday || wd === 0
                        ? "text-red-500"
                        : wd === 6
                          ? "text-sky-500"
                          : "text-slate-800"
                    }`}
                  >
                    {d.getDate()}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {WEEKDAYS[wd]}
                    {holiday && <span className="ml-0.5 text-red-400">祝</span>}
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-1 text-sm font-bold ${preset?.cell ?? "text-slate-500"}`}
                >
                  {s.shift_type}
                </span>
                <div className="ml-auto text-right">
                  {s.location && <div className="text-sm text-slate-700">{s.location}</div>}
                  {s.start_time && s.end_time && (
                    <div className="text-xs text-slate-400">
                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
