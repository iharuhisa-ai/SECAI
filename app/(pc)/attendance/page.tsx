"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { SAMPLE_STAFF } from "@/app/lib/sampleStaff";
import { generateSampleAttendance } from "@/app/lib/sampleAttendance";
import type { Attendance, Staff } from "@/app/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

function hm(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "—";
}

// 勤務時間（clock_in → clock_out）
function duration(a: Attendance): string {
  if (!a.clock_in || !a.clock_out) return "—";
  const ms = new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime();
  if (ms <= 0) return "—";
  const min = Math.round(ms / 60000);
  return `${Math.floor(min / 60)}h${pad(min % 60)}m`;
}

function mapsLink(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function AttendancePage() {
  const [dateFilter, setDateFilter] = useState(TODAY);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    if (!isSupabaseConfigured) {
      setStaffList(SAMPLE_STAFF.filter((s) => s.leave_date === null));
      setRecords(generateSampleAttendance().filter((a) => a.date === dateFilter));
      setLoading(false);
      return;
    }
    const [staffRes, attRes] = await Promise.all([
      supabase.from("staff").select("*").is("leave_date", null).order("employee_number"),
      supabase.from("attendance").select("*").eq("date", dateFilter),
    ]);
    if (staffRes.error) {
      setLoadError(staffRes.error.message);
      setLoading(false);
      return;
    }
    if (attRes.error) setLoadError(attRes.error.message);
    setStaffList((staffRes.data as Staff[]) ?? []);
    setRecords((attRes.data as Attendance[]) ?? []);
    setLoading(false);
  }, [dateFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const byStaff = useMemo(() => {
    const m = new Map<string, Attendance>();
    for (const a of records) m.set(a.staff_id, a);
    return m;
  }, [records]);

  const punchedCount = records.filter((a) => a.clock_in).length;

  return (
    <div className="p-6 md:p-8">
      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">デモ表示中</span>（Supabase未接続）。サンプルの勤怠を表示しています。
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">勤怠（打刻）</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "読み込み中..." : `${dateFilter}：出勤 ${punchedCount} / ${staffList.length} 名`}
          </p>
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value || TODAY)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          読み込みエラー: {loadError}
          <br />
          <span className="text-slate-500">
            .env.local の Supabase 接続情報と attendance テーブルをご確認ください。
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">隊員</th>
              <th className="px-4 py-3 font-medium">出勤</th>
              <th className="px-4 py-3 font-medium">退勤</th>
              <th className="px-4 py-3 font-medium">勤務時間</th>
              <th className="px-4 py-3 font-medium">打刻地点</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && staffList.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  在籍中の隊員がいません。
                </td>
              </tr>
            )}
            {staffList.map((s) => {
              const a = byStaff.get(s.id) ?? null;
              const inLink = a ? mapsLink(a.clock_in_lat, a.clock_in_lng) : null;
              const outLink = a ? mapsLink(a.clock_out_lat, a.clock_out_lng) : null;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 text-slate-700">{a ? hm(a.clock_in) : "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{a ? hm(a.clock_out) : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a ? (
                      duration(a)
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        未打刻
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {inLink ? (
                      <a
                        href={inLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 underline hover:text-slate-900"
                      >
                        出勤地点
                      </a>
                    ) : (
                      <span className="text-slate-300">出勤地点</span>
                    )}
                    <span className="mx-1 text-slate-300">/</span>
                    {outLink ? (
                      <a
                        href={outLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 underline hover:text-slate-900"
                      >
                        退勤地点
                      </a>
                    ) : (
                      <span className="text-slate-300">退勤地点</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
