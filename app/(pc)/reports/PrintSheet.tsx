"use client";

import type { Report } from "@/app/lib/types";

interface PrintSheetProps {
  report: Report;
  /** 報告者（任意） */
  reporterName?: string;
}

function formatDateJa(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

// A4 印刷用の業務日報レイアウト（印鑑欄付き）。
// 画面では非表示（globals.css の @media print で .print-sheet のみ表示）。
export default function PrintSheet({ report, reporterName }: PrintSheetProps) {
  return (
    <div className="print-sheet">
      <div className="mx-auto max-w-[760px] p-10 text-slate-900">
        <div className="mb-6 flex items-start justify-between">
          <h1 className="text-2xl font-bold tracking-wide">業 務 日 報</h1>
          {/* 印鑑欄 */}
          <table className="border border-slate-700 text-center text-xs">
            <tbody>
              <tr>
                {["管制", "隊長", "本人"].map((label) => (
                  <td key={label} className="border border-slate-700 px-1 pt-1 align-top">
                    <div className="pb-0.5">{label}</div>
                    <div className="h-14 w-14" />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <Th>現場</Th>
              <Td>{report.location ?? "—"}</Td>
              <Th>日付</Th>
              <Td>{formatDateJa(report.date)}</Td>
            </tr>
            <tr>
              <Th>報告者</Th>
              <Td>{reporterName || "—"}</Td>
              <Th>提出日時</Th>
              <Td>{new Date(report.submitted_at).toLocaleString("ja-JP")}</Td>
            </tr>
          </tbody>
        </table>

        <Section title="業務内容">{report.work_content || "（記載なし）"}</Section>
        <Section title="特記事項">{report.special_notes || "（特になし）"}</Section>
        {report.ai_summary && <Section title="報告（整形文）">{report.ai_summary}</Section>}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="w-[90px] border border-slate-700 bg-slate-100 px-3 py-2 text-left font-medium">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-slate-700 px-3 py-2">{children}</td>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border border-slate-700">
      <div className="border-b border-slate-700 bg-slate-100 px-3 py-1.5 text-sm font-medium">
        {title}
      </div>
      <div className="min-h-[100px] whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
}
