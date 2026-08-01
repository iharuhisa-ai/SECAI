import type { Site } from "./types";

// Supabase 未接続時のデモ表示用サンプル現場（現場マスタ）。
export const SAMPLE_SITES: Site[] = [
  {
    id: "sample-site-1",
    name: "本社ビル",
    address: "東京都千代田区丸の内 1-1-1",
    note: "常駐2名・24時間",
    requirements: [
      { shift_type: "日勤", start: "08:00", end: "20:00", count: 2 },
      { shift_type: "夜勤", start: "20:00", end: "08:00", count: 1 },
    ],
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "sample-site-2",
    name: "△△工場",
    address: "神奈川県川崎市川崎区〇〇 2-3",
    note: "夜間警備あり",
    requirements: [
      { shift_type: "日勤", start: "08:00", end: "20:00", count: 1 },
      { shift_type: "夜勤", start: "20:00", end: "08:00", count: 2 },
    ],
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "sample-site-3",
    name: "□□商業施設",
    address: "東京都豊島区東池袋 3-1",
    note: "交通誘導・土日は増員",
    requirements: [{ shift_type: "日勤", start: "09:00", end: "18:00", count: 3 }],
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "sample-site-4",
    name: "○○マンション",
    address: "東京都世田谷区〇〇 4-5-6",
    note: "日勤のみ",
    requirements: [{ shift_type: "受付", start: "08:30", end: "17:30", count: 1 }],
    created_at: "2024-01-01T00:00:00Z",
  },
];
