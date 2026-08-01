"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { SAMPLE_STAFF } from "@/app/lib/sampleStaff";
import {
  EMPLOYMENT_TYPES,
  type EmploymentType,
  type Staff,
  type StaffFormValues,
} from "@/app/lib/types";
import StaffModal from "./StaffModal";
import CsvImportModal, { type ImportRecord } from "./CsvImportModal";

type EmploymentFilter = "all" | EmploymentType;

// フォーム入力を staff テーブルのカラムへ変換
function toRecord(values: StaffFormValues) {
  const qualifications = values.qualifications
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean);

  return {
    name: values.name.trim(),
    employee_number: values.employee_number.trim(),
    department: values.department.trim() || null,
    employment_type: values.employment_type || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
    qualifications: qualifications.length > 0 ? qualifications : null,
    rank: values.rank || null,
    days_off_preference: values.days_off_preference.trim() || null,
    work_preference: values.work_preference.trim() || null,
    incompatible_staff_ids:
      values.incompatible_staff_ids.length > 0 ? values.incompatible_staff_ids : null,
    join_date: values.join_date || null,
  };
}

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState<EmploymentFilter>("all");
  const [includeRetired, setIncludeRetired] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Staff | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // デモモード（Supabase未接続）: サンプルデータを取得（初回のみ）
    if (!isSupabaseConfigured) {
      setStaffList((prev) => (prev.length > 0 ? prev : SAMPLE_STAFF));
      setLoading(false);
      return;
    }

    let query = supabase.from("staff").select("*").order("employee_number", { ascending: true });
    if (!includeRetired) {
      query = query.is("leave_date", null);
    }

    const { data, error } = await query;
    if (error) {
      setLoadError(error.message);
      setStaffList([]);
    } else {
      setStaffList((data as Staff[]) ?? []);
    }
    setLoading(false);
  }, [includeRetired]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // 検索 & 雇用形態フィルタ（クライアント側）
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return staffList.filter((s) => {
      const matchKeyword =
        keyword === "" ||
        s.name.toLowerCase().includes(keyword) ||
        s.employee_number.toLowerCase().includes(keyword);
      const matchEmployment =
        employmentFilter === "all" || s.employment_type === employmentFilter;
      const matchRetired = includeRetired || s.leave_date === null;
      return matchKeyword && matchEmployment && matchRetired;
    });
  }, [staffList, search, employmentFilter, includeRetired]);

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEdit = (staff: Staff) => {
    setEditTarget(staff);
    setModalOpen(true);
  };

  const handleSubmit = async (values: StaffFormValues) => {
    const record = toRecord(values);

    // デモモード: ローカル状態を更新（社員番号の重複だけチェック）
    if (!isSupabaseConfigured) {
      const dup = staffList.some(
        (s) => s.employee_number === record.employee_number && s.id !== editTarget?.id
      );
      if (dup) throw new Error("その社員番号は既に登録されています。");

      const now = new Date().toISOString();
      if (editTarget) {
        setStaffList((prev) =>
          prev.map((s) => (s.id === editTarget.id ? { ...s, ...record, updated_at: now } : s))
        );
      } else {
        setStaffList((prev) => [
          ...prev,
          { ...record, id: `demo-${Date.now()}`, leave_date: null, created_at: now, updated_at: now },
        ]);
      }
      setModalOpen(false);
      setEditTarget(null);
      return;
    }

    if (editTarget) {
      const { error } = await supabase
        .from("staff")
        .update({ ...record, updated_at: new Date().toISOString() })
        .eq("id", editTarget.id);
      if (error) throw new Error(translateError(error.message));
    } else {
      const { error } = await supabase.from("staff").insert(record);
      if (error) throw new Error(translateError(error.message));
    }

    setModalOpen(false);
    setEditTarget(null);
    await fetchStaff();
  };

  // 論理削除（退職処理）: leave_date に本日を設定
  const handleRetire = async (staff: Staff) => {
    const today = new Date().toISOString().slice(0, 10);
    const ok = window.confirm(
      `${staff.name} さんを退職処理します。\n（データは保持され、一覧から非表示になります）\nよろしいですか？`
    );
    if (!ok) return;

    const now = new Date().toISOString();
    if (!isSupabaseConfigured) {
      setStaffList((prev) =>
        prev.map((s) => (s.id === staff.id ? { ...s, leave_date: today, updated_at: now } : s))
      );
      return;
    }

    const { error } = await supabase
      .from("staff")
      .update({ leave_date: today, updated_at: now })
      .eq("id", staff.id);
    if (error) {
      alert(`退職処理に失敗しました: ${error.message}`);
      return;
    }
    await fetchStaff();
  };

  // 退職取消（復職）
  const handleReactivate = async (staff: Staff) => {
    const now = new Date().toISOString();
    if (!isSupabaseConfigured) {
      setStaffList((prev) =>
        prev.map((s) => (s.id === staff.id ? { ...s, leave_date: null, updated_at: now } : s))
      );
      return;
    }

    const { error } = await supabase
      .from("staff")
      .update({ leave_date: null, updated_at: now })
      .eq("id", staff.id);
    if (error) {
      alert(`復職処理に失敗しました: ${error.message}`);
      return;
    }
    await fetchStaff();
  };

  // CSV一括取り込み（F-04）
  const handleImport = async (records: ImportRecord[]) => {
    if (records.length === 0) return;

    // デモモード: ローカル状態へ追加
    if (!isSupabaseConfigured) {
      const now = new Date().toISOString();
      setStaffList((prev) => [
        ...prev,
        ...records.map((r, i) => ({
          ...r,
          rank: null,
          days_off_preference: null,
          work_preference: null,
          incompatible_staff_ids: null,
          id: `demo-import-${Date.now()}-${i}`,
          leave_date: null,
          created_at: now,
          updated_at: now,
        })),
      ]);
      setCsvOpen(false);
      return;
    }

    const { error } = await supabase.from("staff").insert(records);
    if (error) throw new Error(translateError(error.message));

    setCsvOpen(false);
    await fetchStaff();
  };

  return (
    <div className="p-6 md:p-8">
      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">デモ表示中</span>（Supabase未接続）。サンプルの隊員5名を表示しています。
          登録・編集・退職処理は画面上だけで動作し、保存はされません。実データを使うには{" "}
          <code className="rounded bg-amber-100 px-1">.env.local</code> に Supabase の接続情報を設定してください。
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">隊員管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "読み込み中..." : `${filtered.length} 名を表示中`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCsvOpen(true)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            CSVインポート
          </button>
          <button
            onClick={openCreate}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            ＋ 新規登録
          </button>
        </div>
      </div>

      {/* 検索・フィルタ */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="氏名・社員番号で検索"
          className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />

        <div className="flex items-center gap-1">
          <FilterButton active={employmentFilter === "all"} onClick={() => setEmploymentFilter("all")}>
            全員
          </FilterButton>
          {EMPLOYMENT_TYPES.map((t) => (
            <FilterButton
              key={t}
              active={employmentFilter === t}
              onClick={() => setEmploymentFilter(t)}
            >
              {t}
            </FilterButton>
          ))}
        </div>

        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(e) => setIncludeRetired(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          退職者も表示
        </label>
      </div>

      {/* テーブル */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">社員番号</th>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">所属</th>
              <th className="px-4 py-3 font-medium">雇用形態</th>
              <th className="px-4 py-3 font-medium">電話番号</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loadError && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-red-600">
                  読み込みエラー: {loadError}
                  <br />
                  <span className="text-slate-500">
                    .env.local の Supabase 接続情報と staff テーブルをご確認ください。
                  </span>
                </td>
              </tr>
            )}

            {!loadError && loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  読み込み中...
                </td>
              </tr>
            )}

            {!loadError && !loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  該当する隊員がいません。
                </td>
              </tr>
            )}

            {!loadError &&
              !loading &&
              filtered.map((s) => {
                const retired = s.leave_date !== null;
                return (
                  <tr key={s.id} className={retired ? "bg-slate-50/60" : "hover:bg-slate-50"}>
                    <td className="px-4 py-3 font-mono text-slate-600">{s.employee_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.department ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{s.employment_type ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      {retired ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                          退職（{s.leave_date}）
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          在籍中
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          編集
                        </button>
                        {retired ? (
                          <button
                            onClick={() => handleReactivate(s)}
                            className="rounded border border-green-300 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                          >
                            復職
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRetire(s)}
                            className="rounded border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            退職処理
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <StaffModal
          target={editTarget}
          allStaff={staffList}
          onClose={() => {
            setModalOpen(false);
            setEditTarget(null);
          }}
          onSubmit={handleSubmit}
        />
      )}

      {csvOpen && (
        <CsvImportModal
          existingEmployeeNumbers={staffList.map((s) => s.employee_number)}
          onClose={() => setCsvOpen(false)}
          onImport={handleImport}
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

// よくある Postgres / Supabase エラーを日本語化
function translateError(message: string): string {
  if (message.includes("duplicate key") && message.includes("employee_number")) {
    return "その社員番号は既に登録されています。";
  }
  if (message.includes("duplicate key") && message.includes("email")) {
    return "そのメールアドレスは既に登録されています。";
  }
  return message;
}
