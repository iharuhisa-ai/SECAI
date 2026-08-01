"use client";

import { useMemo, useRef, useState } from "react";
import { parseStaffCsv, STAFF_CSV_TEMPLATE, type CsvStaffRow } from "@/app/lib/csv";
import { EMPLOYMENT_TYPES, type EmploymentType } from "@/app/lib/types";

// 取り込み用に整形した1件分のレコード
export interface ImportRecord {
  name: string;
  employee_number: string;
  department: string | null;
  employment_type: EmploymentType | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  qualifications: string[] | null;
  join_date: string | null;
}

interface CsvImportModalProps {
  existingEmployeeNumbers: string[];
  onClose: () => void;
  onImport: (records: ImportRecord[]) => Promise<void>;
}

interface ValidatedRow {
  raw: CsvStaffRow;
  record: ImportRecord;
  errors: string[];
}

function toEmploymentType(v: string): EmploymentType | null {
  const t = v.trim();
  return (EMPLOYMENT_TYPES as readonly string[]).includes(t) ? (t as EmploymentType) : null;
}

function splitQualifications(v: string): string[] | null {
  const list = v
    .split(/[,、/／]/)
    .map((q) => q.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

export default function CsvImportModal({
  existingEmployeeNumbers,
  onClose,
  onImport,
}: CsvImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvStaffRow[]>([]);
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const existing = useMemo(
    () => new Set(existingEmployeeNumbers),
    [existingEmployeeNumbers]
  );

  // 各行の検証
  const validated: ValidatedRow[] = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((raw) => {
      const errors: string[] = [];
      if (!raw.name.trim()) errors.push("氏名が空です");
      if (!raw.employee_number.trim()) {
        errors.push("社員番号が空です");
      } else {
        const num = raw.employee_number.trim();
        if (existing.has(num)) errors.push("既存の社員番号と重複");
        if (seen.has(num)) errors.push("ファイル内で社員番号が重複");
        seen.add(num);
      }
      if (raw.employment_type.trim() && !toEmploymentType(raw.employment_type)) {
        errors.push("雇用形態が不正（正社員/契約/パート）");
      }

      const record: ImportRecord = {
        name: raw.name.trim(),
        employee_number: raw.employee_number.trim(),
        department: raw.department.trim() || null,
        employment_type: toEmploymentType(raw.employment_type),
        phone: raw.phone.trim() || null,
        email: raw.email.trim() || null,
        address: raw.address.trim() || null,
        qualifications: splitQualifications(raw.qualifications),
        join_date: raw.join_date.trim() || null,
      };
      return { raw, record, errors };
    });
  }, [rows, existing]);

  const validRows = validated.filter((v) => v.errors.length === 0);
  const invalidCount = validated.length - validRows.length;

  const handleFile = async (file: File) => {
    setParseError(null);
    setImportError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = parseStaffCsv(text);
      if (!result.hasName || !result.hasEmployeeNumber) {
        setParseError(
          "ヘッダーに「氏名」「社員番号」の列が見つかりません。テンプレートをご確認ください。"
        );
        setRows([]);
        setUnknownHeaders([]);
        return;
      }
      setRows(result.rows);
      setUnknownHeaders(result.unknownHeaders);
    } catch {
      setParseError("ファイルの読み込みに失敗しました。CSV(UTF-8) をご利用ください。");
      setRows([]);
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      await onImport(validRows.map((v) => v.record));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "取り込みに失敗しました。");
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    // Excel での文字化けを防ぐため BOM 付き UTF-8 で出力
    const blob = new Blob(["﻿" + STAFF_CSV_TEMPLATE], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">CSVインポート（隊員一括登録）</h2>
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
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              CSVファイルを選択
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = ""; // 同じファイルを選び直せるように
              }}
            />
            <button
              onClick={downloadTemplate}
              className="text-sm font-medium text-slate-600 underline hover:text-slate-900"
            >
              テンプレートをダウンロード
            </button>
            {fileName && <span className="text-sm text-slate-500">{fileName}</span>}
          </div>

          <p className="mb-4 text-xs text-slate-500">
            列：氏名 / 社員番号 / 所属部署 / 雇用形態 / 電話番号 / メールアドレス / 住所 / 保有資格 / 入社日。
            「氏名」「社員番号」は必須です。保有資格はカンマ・スラッシュ区切りで複数指定できます。
          </p>

          {parseError && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{parseError}</p>
          )}

          {unknownHeaders.length > 0 && (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              認識できない列はスキップしました: {unknownHeaders.join("、")}
            </p>
          )}

          {validated.length > 0 && (
            <>
              <div className="mb-3 flex gap-4 text-sm">
                <span className="text-slate-600">
                  合計 <span className="font-bold">{validated.length}</span> 件
                </span>
                <span className="text-green-700">
                  取込可能 <span className="font-bold">{validRows.length}</span> 件
                </span>
                {invalidCount > 0 && (
                  <span className="text-red-600">
                    エラー <span className="font-bold">{invalidCount}</span> 件（スキップ）
                  </span>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">社員番号</th>
                      <th className="px-3 py-2 font-medium">氏名</th>
                      <th className="px-3 py-2 font-medium">所属</th>
                      <th className="px-3 py-2 font-medium">雇用形態</th>
                      <th className="px-3 py-2 font-medium">状態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {validated.map((v, i) => (
                      <tr key={i} className={v.errors.length > 0 ? "bg-red-50/50" : ""}>
                        <td className="px-3 py-2 font-mono text-slate-600">
                          {v.raw.employee_number || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-800">{v.raw.name || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{v.record.department ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {v.record.employment_type ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {v.errors.length === 0 ? (
                            <span className="text-green-700">OK</span>
                          ) : (
                            <span className="text-red-600">{v.errors.join(" / ")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {importError && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{importError}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || validRows.length === 0}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {importing ? "取り込み中..." : `${validRows.length} 件を取り込む`}
          </button>
        </div>
      </div>
    </div>
  );
}
