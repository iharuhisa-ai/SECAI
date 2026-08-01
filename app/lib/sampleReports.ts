import type { Report } from "./types";
import { SAMPLE_STAFF } from "./sampleStaff";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const active = SAMPLE_STAFF.filter((s) => s.leave_date === null);

// Supabase 未接続時のデモ表示用サンプル日報。
// 当日分はあえて一部の隊員のみ作成し、未提出アラートを確認できるようにする。
export const SAMPLE_REPORTS: Report[] = [
  {
    id: "sample-report-1",
    staff_id: active[0]?.id ?? "sample-1",
    date: dateOffset(0),
    location: "本社ビル",
    work_content:
      "09:00出勤。正面玄関にて入退館管理を実施。来訪者12名の受付対応。館内巡回を3回実施し異常なし。",
    special_notes: "2階トイレの照明が一部不点灯。設備担当へ連絡済み。",
    ai_summary: null,
    status: "未確認",
    submitted_at: `${dateOffset(0)}T18:10:00Z`,
    created_at: `${dateOffset(0)}T18:10:00Z`,
  },
  {
    id: "sample-report-2",
    staff_id: active[2]?.id ?? "sample-3",
    date: dateOffset(0),
    location: "□□商業施設",
    work_content:
      "10:00より交通誘導。駐車場入口にて車両誘導を実施。混雑時間帯（12〜14時）も大きなトラブルなし。",
    special_notes: "",
    ai_summary: null,
    status: "確認済",
    submitted_at: `${dateOffset(0)}T19:00:00Z`,
    created_at: `${dateOffset(0)}T19:00:00Z`,
  },
  {
    id: "sample-report-3",
    staff_id: active[1]?.id ?? "sample-2",
    date: dateOffset(1),
    location: "△△工場",
    work_content:
      "夜間警備。22:00〜翌6:00。構内巡回を2時間おきに実施。北門付近で不審者を1名発見、声かけにより退去を確認。",
    special_notes: "不審者は近隣住民の可能性。念のため写真記録を残した。",
    ai_summary:
      "夜間警備（22:00〜翌6:00）を実施。2時間おきの構内巡回を行い、北門付近で不審者1名を発見。声かけにより退去を確認した。近隣住民の可能性があるため、写真記録を保管している。",
    status: "要対応",
    submitted_at: `${dateOffset(1)}T06:30:00Z`,
    created_at: `${dateOffset(1)}T06:30:00Z`,
  },
  {
    id: "sample-report-4",
    staff_id: active[3]?.id ?? "sample-4",
    date: dateOffset(2),
    location: "○○マンション",
    work_content:
      "日勤。エントランス管理および宅配便の取次ぎ対応。居住者からの問い合わせ3件に対応。",
    special_notes: "",
    ai_summary: null,
    status: "確認済",
    submitted_at: `${dateOffset(2)}T18:00:00Z`,
    created_at: `${dateOffset(2)}T18:00:00Z`,
  },
];
