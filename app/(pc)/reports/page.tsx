"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { SAMPLE_STAFF } from "@/app/lib/sampleStaff";
import { SAMPLE_REPORTS } from "@/app/lib/sampleReports";
import { SAMPLE_SITES } from "@/app/lib/sampleSites";
import {
  REPORT_STATUSES,
  REPORT_STATUS_STYLE,
  type Report,
  type ReportFormValues,
  type ReportStatus,
  type Site,
  type Staff,
} from "@/app/lib/types";
import ReportModal from "./ReportModal";
import PrintSheet from "./PrintSheet";

type StatusFilter = "all" | ReportStatus;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function toRecord(v: ReportFormValues) {
  return {
    staff_id: v.staff_id || null, // 報告者（任意）
    date: v.date,
    location: v.location.trim() || null,
    work_content: v.work_content.trim() || null,
    special_notes: v.special_notes.trim() || null,
    ai_summary: v.ai_summary.trim() || null,
    status: v.status,
  };
}

export default function ReportsPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState(""); // 空 = 全期間
  const [staffFilter, setStaffFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Report | null>(null);
  const [printTarget, setPrintTarget] = useState<Report | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    if (!isSupabaseConfigured) {
      setStaffList(SAMPLE_STAFF.filter((s) => s.leave_date === null));
      setReports((prev) => (prev.length > 0 ? prev : SAMPLE_REPORTS));
      setSites(SAMPLE_SITES);
      setLoading(false);
      return;
    }

    const [staffRes, reportRes, siteRes] = await Promise.all([
      supabase.from("staff").select("*").is("leave_date", null).order("employee_number"),
      supabase.from("reports").select("*").order("date", { ascending: false }),
      supabase.from("sites").select("*").order("name"),
    ]);

    if (staffRes.error) {
      setLoadError(staffRes.error.message);
      setLoading(false);
      return;
    }
    if (reportRes.error) setLoadError(reportRes.error.message);

    setStaffList((staffRes.data as Staff[]) ?? []);
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

  // 未提出アラート（F-24）: 当日の日報が出ていない現場
  const unsubmittedToday = useMemo(() => {
    const today = todayStr();
    const submitted = new Set(
      reports.filter((r) => r.date === today && r.location).map((r) => r.location)
    );
    return sites.filter((s) => !submitted.has(s.name));
  }, [reports, sites]);

  // 絞り込み
  const filtered = useMemo(() => {
    const loc = locationFilter.trim().toLowerCase();
    return reports
      .filter((r) => {
        const matchDate = !dateFilter || r.date === dateFilter;
        const matchStaff = staffFilter === "all" || r.staff_id === staffFilter;
        const matchLoc = loc === "" || (r.location ?? "").toLowerCase().includes(loc);
        const matchStatus = statusFilter === "all" || r.status === statusFilter;
        return matchDate && matchStaff && matchLoc && matchStatus;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [reports, dateFilter, staffFilter, locationFilter, statusFilter]);

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };
  const openEdit = (r: Report) => {
    setEditTarget(r);
    setModalOpen(true);
  };

  const handleSubmit = async (values: ReportFormValues) => {
    const record = toRecord(values);

    if (!isSupabaseConfigured) {
      const now = new Date().toISOString();
      if (editTarget) {
        setReports((prev) =>
          prev.map((r) => (r.id === editTarget.id ? { ...r, ...record } : r))
        );
      } else {
        setReports((prev) => [
          {
            ...record,
            id: `demo-report-${Date.now()}`,
            submitted_at: now,
            created_at: now,
          },
          ...prev,
        ]);
      }
      setModalOpen(false);
      setEditTarget(null);
      return;
    }

    if (editTarget) {
      const { error } = await supabase.from("reports").update(record).eq("id", editTarget.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("reports").insert(record);
      if (error) throw new Error(error.message);
    }
    setModalOpen(false);
    setEditTarget(null);
    await fetchData();
  };

  // ステータスのみを一覧から直接変更
  const changeStatus = async (r: Report, status: ReportStatus) => {
    if (!isSupabaseConfigured) {
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
      return;
    }
    const { error } = await supabase.from("reports").update({ status }).eq("id", r.id);
    if (error) {
      alert(`ステータス更新に失敗しました: ${error.message}`);
      return;
    }
    await fetchData();
  };

  // PDF出力（印刷）。印刷シートを描画してからブラウザの印刷ダイアログを開く。
  useEffect(() => {
    if (!printTarget) return;
    const id = window.setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 100);
    return () => window.clearTimeout(id);
  }, [printTarget]);

  return (
    <div className="p-6 md:p-8">
      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">デモ表示中</span>（Supabase未接続）。サンプルの日報を表示しています。
          作成・編集は画面上だけで動作し、保存はされません。
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">日報管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "読み込み中..." : `${filtered.length} 件を表示中`}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          ＋ 新規作成
        </button>
      </div>

      {/* 未提出アラート（F-24）: 現場ベース */}
      {!loading && unsubmittedToday.length > 0 && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-medium">
            本日の日報 未提出 {unsubmittedToday.length} 現場:
          </span>{" "}
          {unsubmittedToday.map((s) => s.name).join("、")}
        </div>
      )}

      {/* 絞り込み */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">全現場</option>
          {sites.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="all">報告者: 全員</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            すべて
          </FilterButton>
          {REPORT_STATUSES.map((s) => (
            <FilterButton key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s}
            </FilterButton>
          ))}
        </div>
      </div>

      {/* 一覧 */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">日付</th>
              <th className="px-4 py-3 font-medium">現場</th>
              <th className="px-4 py-3 font-medium">報告者</th>
              <th className="px-4 py-3 font-medium">業務内容</th>
              <th className="px-4 py-3 font-medium">ステータス</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loadError && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-red-600">
                  読み込みエラー: {loadError}
                  <br />
                  <span className="text-slate-500">
                    .env.local の Supabase 接続情報と reports テーブルをご確認ください。
                  </span>
                </td>
              </tr>
            )}
            {!loadError && loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  読み込み中...
                </td>
              </tr>
            )}
            {!loadError && !loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  該当する日報がありません。
                </td>
              </tr>
            )}
            {!loadError &&
              !loading &&
              filtered.map((r) => {
                const staff = r.staff_id ? staffById.get(r.staff_id) : null;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-600">
                      {r.date}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                      {r.location ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{staff?.name ?? "—"}</td>
                    <td className="max-w-[18rem] truncate px-4 py-3 text-slate-600">
                      {r.work_content ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={r.status}
                        onChange={(e) => changeStatus(r, e.target.value as ReportStatus)}
                        className={`rounded-full border-0 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-400 ${REPORT_STATUS_STYLE[r.status]}`}
                      >
                        {REPORT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(r)}
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          確認・編集
                        </button>
                        <button
                          onClick={() => setPrintTarget(r)}
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          PDF出力
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <ReportModal
          target={editTarget}
          staff={staffList}
          sites={sites}
          onClose={() => {
            setModalOpen(false);
            setEditTarget(null);
          }}
          onSubmit={handleSubmit}
        />
      )}

      {printTarget && (
        <PrintSheet
          report={printTarget}
          reporterName={
            printTarget.staff_id ? staffById.get(printTarget.staff_id)?.name : undefined
          }
        />
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-slate-800 text-white"
          : "border border-slate-300 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}
