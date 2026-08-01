"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMobile } from "../MobileContext";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { generateSampleShifts } from "@/app/lib/sampleShifts";
import { SAMPLE_REPORTS } from "@/app/lib/sampleReports";
import { SHIFT_PRESETS, type Report, type Shift } from "@/app/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const TODAY_LABEL = now.toLocaleDateString("ja-JP", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

export default function MobileHome() {
  const { currentStaff, loading: staffLoading } = useMobile();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [reports, setReports] = useState<Report[]>([]);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setShifts(
        generateSampleShifts(now.getFullYear(), now.getMonth() + 1).filter(
          (s) => s.date === TODAY
        )
      );
      setReports(SAMPLE_REPORTS.filter((r) => r.date === TODAY));
      return;
    }
    const [shiftRes, reportRes] = await Promise.all([
      supabase.from("shifts").select("*").eq("date", TODAY),
      supabase.from("reports").select("*").eq("date", TODAY),
    ]);
    setShifts((shiftRes.data as Shift[]) ?? []);
    setReports((reportRes.data as Report[]) ?? []);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const myShift = useMemo(
    () => shifts.find((s) => s.staff_id === currentStaff?.id) ?? null,
    [shifts, currentStaff]
  );

  const isWorking =
    myShift?.shift_type && myShift.shift_type !== "休" && myShift.shift_type !== "明休";

  // 自分の現場の本日の日報が提出済みか
  const reportSubmitted = useMemo(() => {
    if (!myShift?.location) return false;
    return reports.some((r) => r.location === myShift.location);
  }, [reports, myShift]);

  const preset = myShift?.shift_type ? SHIFT_PRESETS[myShift.shift_type] : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{TODAY_LABEL}</p>
        <h1 className="text-xl font-bold text-slate-800">
          {staffLoading ? "読み込み中..." : `${currentStaff?.name ?? ""} さん、お疲れさまです`}
        </h1>
      </div>

      {/* 本日のシフト */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-medium text-slate-500">本日のシフト</p>
        {!myShift ? (
          <p className="text-slate-400">本日の予定はありません。</p>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <span
                className={`rounded px-2 py-1 text-sm font-bold ${preset?.cell ?? "text-slate-500"}`}
              >
                {myShift.shift_type}
              </span>
              {myShift.location && (
                <span className="ml-2 text-sm text-slate-700">{myShift.location}</span>
              )}
            </div>
            {myShift.start_time && myShift.end_time && (
              <span className="text-sm font-medium text-slate-600">
                {myShift.start_time.slice(0, 5)}–{myShift.end_time.slice(0, 5)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 打刻（フェーズ2） */}
      <div className="grid grid-cols-2 gap-3">
        <button
          disabled
          className="rounded-xl bg-slate-800 py-4 text-sm font-bold text-white opacity-40"
        >
          出勤打刻
        </button>
        <button
          disabled
          className="rounded-xl border border-slate-300 py-4 text-sm font-bold text-slate-600 opacity-40"
        >
          退勤打刻
        </button>
      </div>
      <p className="-mt-2 text-center text-[11px] text-slate-400">打刻はフェーズ2で対応予定です</p>

      {/* 本日の日報 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-medium text-slate-500">本日の日報</p>
        {isWorking && myShift?.location ? (
          reportSubmitted ? (
            <p className="text-sm text-green-700">
              {myShift.location} の日報は提出済みです。
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-red-600">{myShift.location} の日報が未提出です。</p>
              <Link
                href="/m/report"
                className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white"
              >
                入力する
              </Link>
            </div>
          )
        ) : (
          <p className="text-sm text-slate-400">本日は勤務予定がないため日報は不要です。</p>
        )}
      </div>

      <Link
        href="/m/shift"
        className="block rounded-xl border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700"
      >
        今月のシフトを確認する →
      </Link>
    </div>
  );
}
