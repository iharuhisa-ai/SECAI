import type { Shift, ShiftType } from "./types";
import { SHIFT_PRESETS } from "./types";
import { SAMPLE_STAFF } from "./sampleStaff";

// Supabase 未接続時のデモ表示用サンプルシフト。
// 在籍中の隊員について、当月のシフトを簡易ローテーションで自動生成する。
const ROTATION: ShiftType[] = ["日勤", "受付", "夜勤", "明休", "休"];
const LOCATIONS = ["本社ビル", "△△工場", "□□商業施設", "○○マンション"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function generateSampleShifts(year: number, month: number): Shift[] {
  const daysInMonth = new Date(year, month, 0).getDate(); // month: 1-12
  const active = SAMPLE_STAFF.filter((s) => s.leave_date === null);
  const shifts: Shift[] = [];

  active.forEach((staff, staffIndex) => {
    const location = LOCATIONS[staffIndex % LOCATIONS.length];
    for (let day = 1; day <= daysInMonth; day++) {
      const shiftType = ROTATION[(staffIndex + day) % ROTATION.length];
      const preset = SHIFT_PRESETS[shiftType];
      const date = `${year}-${pad(month)}-${pad(day)}`;
      shifts.push({
        id: `sample-shift-${staff.id}-${date}`,
        staff_id: staff.id,
        date,
        shift_type: shiftType,
        start_time: preset.start || null,
        end_time: preset.end || null,
        location: shiftType === "休" || shiftType === "明休" ? null : location,
        note: null,
        created_at: `${date}T00:00:00Z`,
      });
    }
  });

  return shifts;
}
