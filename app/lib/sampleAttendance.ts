import type { Attendance } from "./types";
import { SAMPLE_STAFF } from "./sampleStaff";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Supabase 未接続時のデモ表示用サンプル勤怠（当日分・一部の隊員のみ）。
export function generateSampleAttendance(): Attendance[] {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const active = SAMPLE_STAFF.filter((s) => s.leave_date === null);
  const rows: Attendance[] = [];

  // 1人目: 出勤済み・退勤前
  if (active[0]) {
    rows.push({
      id: `sample-att-${active[0].id}`,
      staff_id: active[0].id,
      date: today,
      clock_in: `${today}T08:02:00`,
      clock_out: null,
      clock_in_lat: 35.681236,
      clock_in_lng: 139.767125,
      clock_out_lat: null,
      clock_out_lng: null,
      created_at: `${today}T08:02:00`,
    });
  }
  // 2人目: 出勤・退勤とも打刻済み
  if (active[2]) {
    rows.push({
      id: `sample-att-${active[2].id}`,
      staff_id: active[2].id,
      date: today,
      clock_in: `${today}T09:58:00`,
      clock_out: `${today}T18:05:00`,
      clock_in_lat: 35.729503,
      clock_in_lng: 139.7109,
      clock_out_lat: 35.729503,
      clock_out_lng: 139.7109,
      created_at: `${today}T09:58:00`,
    });
  }
  return rows;
}
