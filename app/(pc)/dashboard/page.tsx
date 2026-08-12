"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { SAMPLE_STAFF } from "@/app/lib/sampleStaff";
import { SAMPLE_REPORTS } from "@/app/lib/sampleReports";
import { SAMPLE_SITES } from "@/app/lib/sampleSites";
import { generateSampleShifts } from "@/app/lib/sampleShifts";
import { reqAppliesToDay } from "@/app/lib/requirement";
import { isJapaneseHoliday } from "@/app/lib/holidays";
import {
  REPORT_STATUS_STYLE,
  SHIFT_PRESETS,
  type Report,
  type Shift,
  type Site,
  type Staff,
} from "@/app/lib/types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const now = new Date();
const YEAR = now.getFullYear();
const MONTH = now.getMonth() + 1;
const TODAY = `${YEAR}-${pad(MONTH)}-${pad(now.getDate())}`;

const TODAY_LABEL = now.toLocaleDateString("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

export default function DashboardPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    if (!isSupabaseConfigured) {
      setStaffList(SAMPLE_STAFF.filter((s) => s.leave_date === null));
      setShifts(generateSampleShifts(YEAR, MONTH).filter((s) => s.date === TODAY));
      setReports(SAMPLE_REPORTS);
      setSites(SAMPLE_SITES);
      setLoading(false);
      return;
    }

    const [staffRes, shiftRes, reportRes, siteRes] = await Promise.all([
      supabase.from("staff").select("*").is("leave_date", null).order("employee_number"),
      supabase.from("shifts").select("*").eq("date", TODAY),
      supabase.from("reports").select("*").order("date", { ascending: false }).limit(20),
      supabase.from("sites").select("*").order("name"),
    ]);

    if (staffRes.error) {
      setLoadError(staffRes.error.message);
      setLoading(false);
      return;
    }
    if (reportRes.error) setLoadError(reportRes.error.message);

    setStaffList((staffRes.data as Staff[]) ?? []);
    setShifts((shiftRes.data as Shift[]) ?? []);
    setReports((reportRes.data as Report[]) ?? []);
    setSites((siteRes.data as Site[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const staffById = useMemo(() => {
    const m = new Map<string, Staff>();
    for (const s of staffList) m.set(s.id, s);
    return m;
  }, [staffList]);

  // 本日の勤務（休・明休を除く）
  const workingToday = useMemo(
    () =>
      shifts.filter(
        (s) => s.shift_type && s.shift_type !== "休" && s.shift_type !== "明休"
      ),
    [shifts]
  );

  // 本日の日報未提出（現場のうち本日の日報が無い）
  const unsubmitted = useMemo(() => {
    const submitted = new Set(
      reports.filter((r) => r.date === TODAY && r.location).map((r) => r.location)
    );
    return sites.filter((s) => !submitted.has(s.name));
  }, [reports, sites]);

  // 本日の現場別 充足状況
  const coverage = useMemo(() => {
    const assignedMap = new Map<string, number>();
    for (const s of workingToday) {
      if (!s.location || !s.shift_type) continue;
      const k = `${s.location}|${s.shift_type}`;
      assignedMap.set(k, (assignedMap.get(k) ?? 0) + 1);
    }
    const rows: {
      site: string;
      shift_type: string;
      assigned: number;
      required: number;
    }[] = [];
    const todayWeekday = now.getDay();
    const todayHoliday = isJapaneseHoliday(TODAY);
    for (const site of sites) {
      for (const r of site.requirements ?? []) {
        // 本日の曜日（祝日は日曜扱い）に適用される必要人数のみ対象
        if (!reqAppliesToDay(r, todayWeekday, todayHoliday)) continue;
        rows.push({
          site: site.name,
          shift_type: r.shift_type,
          assigned: assignedMap.get(`${site.name}|${r.shift_type}`) ?? 0,
          required: r.count,
        });
      }
    }
    return rows;
  }, [workingToday, sites]);

  const shortfall = coverage.filter((c) => c.assigned < c.required).length;

  const recentReports = useMemo(
    () =>
      [...reports]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 6),
    [reports]
  );

  return (
    <div className="p-6 md:p-8">
      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">デモ表示中</span>（Supabase未接続）。サンプルデータを集計して表示しています。
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">{TODAY_LABEL} の状況</p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          読み込みエラー: {loadError}
        </div>
      )}

      {/* KPIカード */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="在籍隊員" value={loading ? "—" : staffList.length} unit="名" />
        <StatCard label="本日の出勤" value={loading ? "—" : workingToday.length} unit="名" />
        <StatCard
          label="日報 未提出"
          value={loading ? "—" : unsubmitted.length}
          unit="現場"
          tone={!loading && unsubmitted.length > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="人員不足の枠"
          value={loading ? "—" : shortfall}
          unit="件"
          tone={!loading && shortfall > 0 ? "danger" : "ok"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 本日の現場別 充足状況 */}
        <Section
          title="本日の現場別 充足状況"
          action={<Link href="/shift" className="text-xs text-slate-500 underline hover:text-slate-800">シフト管理へ</Link>}
        >
          {coverage.length === 0 ? (
            <Empty>必要人数が設定された現場がありません（設定→現場マスタ）。</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {coverage.map((c, i) => {
                const tone =
                  c.assigned < c.required
                    ? "bg-red-100 text-red-700"
                    : c.assigned === c.required
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700";
                return (
                  <li key={i} className="flex items-center justify-between px-1 py-2 text-sm">
                    <span className="text-slate-700">
                      <span className="font-medium">{c.site}</span>
                      <span className="ml-2 text-slate-500">{c.shift_type}</span>
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
                      配置 {c.assigned} / 必要 {c.required}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* 本日の日報 未提出（現場ベース） */}
        <Section
          title="本日の日報 未提出（現場）"
          action={<Link href="/reports" className="text-xs text-slate-500 underline hover:text-slate-800">日報管理へ</Link>}
        >
          {loading ? (
            <Empty>読み込み中...</Empty>
          ) : unsubmitted.length === 0 ? (
            <Empty>全現場が提出済みです。</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unsubmitted.map((s) => (
                <span
                  key={s.id}
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-700"
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* 本日の出勤一覧 */}
        <Section title="本日の出勤">
          {loading ? (
            <Empty>読み込み中...</Empty>
          ) : workingToday.length === 0 ? (
            <Empty>本日の勤務予定はありません。</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {workingToday.map((s) => {
                const preset = s.shift_type ? SHIFT_PRESETS[s.shift_type] : null;
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between px-1 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      {staffById.get(s.staff_id)?.name ?? "（不明）"}
                    </span>
                    <span className="flex items-center gap-2 text-slate-600">
                      {s.location && <span className="text-slate-500">{s.location}</span>}
                      {s.start_time && s.end_time && (
                        <span className="text-xs text-slate-400">
                          {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                        </span>
                      )}
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${preset?.cell ?? ""}`}
                      >
                        {s.shift_type}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* 最新の日報 */}
        <Section
          title="最新の日報"
          action={<Link href="/reports" className="text-xs text-slate-500 underline hover:text-slate-800">一覧へ</Link>}
        >
          {loading ? (
            <Empty>読み込み中...</Empty>
          ) : recentReports.length === 0 ? (
            <Empty>日報がありません。</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentReports.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-1 py-2 text-sm">
                  <span className="text-slate-700">
                    <span className="font-mono text-xs text-slate-400">{r.date}</span>
                    <span className="ml-2 font-medium text-slate-800">{r.location ?? "—"}</span>
                    {r.staff_id && (
                      <span className="ml-2 text-slate-500">
                        {staffById.get(r.staff_id)?.name ?? ""}
                      </span>
                    )}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${REPORT_STATUS_STYLE[r.status]}`}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* インシデント（フェーズ2） */}
      <div className="mt-6">
        <Section title="最新のインシデント">
          <Empty>インシデント管理はフェーズ2で対応予定です。</Empty>
        </Section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const valueColor =
    tone === "danger"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueColor}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
      </p>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-4 text-sm text-slate-400">{children}</p>;
}
