// 雇用形態
export const EMPLOYMENT_TYPES = ["正社員", "契約", "パート"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// 区分（経験・役割）。AIシフト作成時の配置判断にも利用する。
export const STAFF_RANKS = ["新人", "一般", "ベテラン", "隊長"] as const;
export type StaffRank = (typeof STAFF_RANKS)[number];

// 勤務帯の優先（日勤も夜勤もできる隊員の傾向）。シフト作成の判断に使う。
export const SHIFT_LEANS = ["day", "night", "both"] as const;
export type ShiftLean = (typeof SHIFT_LEANS)[number];
export const SHIFT_LEAN_LABELS: Record<ShiftLean, string> = {
  day: "日勤優先",
  night: "夜勤優先",
  both: "どちらでも",
};

// 曜日ラベル（固定休の曜日選択などに使用。0=日〜6=土）
export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

// 隊員（staff テーブル）
export interface Staff {
  id: string;
  name: string;
  employee_number: string;
  department: string | null;
  employment_type: EmploymentType | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  qualifications: string[] | null;
  rank: StaffRank | null; // 区分（新人/一般/ベテラン/隊長）
  days_off_preference: string | null; // 休日希望日（自由記述・補助）
  work_preference: string | null; // 出勤希望（自由記述・補助）
  incompatible_staff_ids: string[] | null; // 組めない隊員（staff.id の配列）
  // --- シフト作成用の構造化フィールド（未設定=null で後方互換） ---
  available_shift_types: ShiftType[] | null; // 対応可能な勤務区分（空/null=全区分可）
  fixed_off_weekdays: number[] | null; // 固定休の曜日（0=日〜6=土）
  shift_lean: ShiftLean | null; // 勤務帯の優先（日勤/夜勤/どちらでも）
  max_work_days: number | null; // 月の勤務日数の上限（null=上限なし）
  join_date: string | null; // YYYY-MM-DD
  leave_date: string | null; // NULL = 在籍中
  created_at: string;
  updated_at: string;
}

// 登録・編集フォームの入力値
export interface StaffFormValues {
  name: string;
  employee_number: string;
  department: string;
  employment_type: EmploymentType | "";
  phone: string;
  email: string;
  address: string;
  qualifications: string; // カンマ区切りで入力 → string[] に変換
  rank: StaffRank | "";
  days_off_preference: string;
  work_preference: string;
  incompatible_staff_ids: string[];
  available_shift_types: ShiftType[];
  fixed_off_weekdays: number[];
  shift_lean: ShiftLean | "";
  max_work_days: string; // 入力は文字列、保存時に数値へ変換
  join_date: string;
}

// 勤務区分（shifts.shift_type / schema.sql の CHECK 制約と一致）
// SV = スーパーバイザー（統括）
export const SHIFT_TYPES = ["日勤", "夜勤", "受付", "半日", "SV", "休", "明休"] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

// 勤務区分ごとの既定時刻と表示色（カレンダーのセル用）
export const SHIFT_PRESETS: Record<
  ShiftType,
  { start: string; end: string; cell: string; badge: string }
> = {
  日勤: { start: "08:00", end: "20:00", cell: "bg-sky-100 text-sky-800", badge: "bg-sky-500" },
  夜勤: { start: "20:00", end: "08:00", cell: "bg-indigo-100 text-indigo-800", badge: "bg-indigo-500" },
  受付: { start: "08:30", end: "17:30", cell: "bg-orange-100 text-orange-800", badge: "bg-orange-500" },
  半日: { start: "09:00", end: "13:00", cell: "bg-teal-100 text-teal-800", badge: "bg-teal-500" },
  SV: { start: "09:00", end: "18:00", cell: "bg-purple-100 text-purple-800", badge: "bg-purple-500" },
  休: { start: "", end: "", cell: "bg-slate-100 text-slate-400", badge: "bg-slate-300" },
  明休: { start: "", end: "", cell: "bg-slate-100 text-slate-500", badge: "bg-slate-400" },
};

// シフト（shifts テーブル）
export interface Shift {
  id: string;
  staff_id: string;
  date: string; // YYYY-MM-DD
  shift_type: ShiftType | null;
  start_time: string | null; // HH:MM(:SS)
  end_time: string | null;
  location: string | null;
  note: string | null;
  created_at: string;
}

// シフトセル編集フォームの入力値
export interface ShiftFormValues {
  shift_type: ShiftType | "";
  start_time: string;
  end_time: string;
  location: string;
  note: string;
}

// 日報のステータス（reports.status / setup_guide.md の CHECK 制約と一致）
export const REPORT_STATUSES = ["未確認", "確認済", "要対応"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// ステータスごとの表示色
export const REPORT_STATUS_STYLE: Record<ReportStatus, string> = {
  未確認: "bg-amber-100 text-amber-800",
  確認済: "bg-green-100 text-green-700",
  要対応: "bg-red-100 text-red-700",
};

// 日報（reports テーブル）。現場単位で提出する。
export interface Report {
  id: string;
  staff_id: string | null; // 報告者（任意）
  date: string; // YYYY-MM-DD
  location: string | null; // 現場（必須運用）
  work_content: string | null;
  special_notes: string | null;
  ai_summary: string | null; // AI整形後の文章
  status: ReportStatus;
  submitted_at: string;
  created_at: string;
}

// 必要人数（現場ごと・勤務区分/時間帯ごと）
export interface SiteRequirement {
  shift_type: ShiftType; // 日勤 / 夜勤 / 受付 / 半日 など
  start: string; // HH:MM
  end: string; // HH:MM
  count: number; // 必要人数
  // 適用する曜日（0=日〜6=土）。未指定・空・7日すべて = 毎日。
  days?: number[];
}

// 必要人数の対象にする勤務区分（休・明休は除く）
export const STAFFING_SHIFT_TYPES = SHIFT_TYPES.filter(
  (t) => t !== "休" && t !== "明休"
) as ShiftType[];

// 現場（sites テーブル / 現場マスタ）
export interface Site {
  id: string;
  name: string;
  address: string | null;
  note: string | null;
  requirements: SiteRequirement[] | null; // 必要人数
  created_at: string;
}

// 現場マスタ入力フォームの値
export interface SiteFormValues {
  name: string;
  address: string;
  note: string;
  requirements: SiteRequirement[];
}

// 勤怠（attendance テーブル）。1隊員・1日で出勤/退勤を記録。
export interface Attendance {
  id: string;
  staff_id: string;
  date: string; // YYYY-MM-DD
  clock_in: string | null; // ISO
  clock_out: string | null; // ISO
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  created_at: string;
}

// 日報入力フォームの値
export interface ReportFormValues {
  staff_id: string;
  date: string;
  location: string;
  work_content: string;
  special_notes: string;
  ai_summary: string;
  status: ReportStatus;
}
