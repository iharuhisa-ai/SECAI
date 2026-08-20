// 固定配置の隊員（fixed_shift_type を設定した隊員）を、対応する現場枠へ機械的に配置する。
// 受付・SV のように「決まった人が常に同じ区分」の場合に、AIに頼らず確実に配置する。
// - 固定区分の必要枠が適用される日 → その現場・時間帯で勤務
// - 適用外の日・固定休の曜日・勤務日数上限超過 → 休
// - 既存（確定済み）の日 → 変更しない
import { japaneseHolidays } from "./holidays";
import type { ShiftType, Site, Staff } from "./types";

export interface PlacedShift {
  staff_id: string;
  day: number;
  shift_type: ShiftType;
  location: string | null;
  start: string | null;
  end: string | null;
}

const norm = (t?: string | null) => (t ?? "").slice(0, 5);
function slotApplies(days: number[] | undefined, weekday: number, isHoliday: boolean): boolean {
  if (!days || days.length === 0 || days.length === 7) return true;
  return days.includes(isHoliday ? 0 : weekday);
}

export function placeFixedStaff(params: {
  staff: Staff;
  sites: Site[];
  year: number;
  month: number;
  daysInMonth: number;
  existingDays: Set<number>; // この隊員の確定済みの日（保持する）
}): PlacedShift[] {
  const { staff, sites, year, month, daysInMonth, existingDays } = params;
  const type = staff.fixed_shift_type;
  if (!type) return [];

  const holidays = japaneseHolidays(year);
  const pad = (n: number) => String(n).padStart(2, "0");
  const offWd = new Set(staff.fixed_off_weekdays ?? []);
  const maxWork = typeof staff.max_work_days === "number" ? staff.max_work_days : null;

  // 固定区分に一致する現場枠（複数あれば先頭を優先）
  const slots: { site: string; start: string; end: string; days?: number[] }[] = [];
  for (const site of sites) {
    for (const r of site.requirements ?? []) {
      if (r.shift_type === type)
        slots.push({ site: site.name, start: norm(r.start), end: norm(r.end), days: r.days });
    }
  }

  const out: PlacedShift[] = [];
  let workCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (existingDays.has(d)) continue; // 確定済みは保持
    const weekday = new Date(year, month - 1, d).getDay();
    const isHol = holidays.has(`${year}-${pad(month)}-${pad(d)}`);
    const eff = isHol ? 0 : weekday;
    const slot = offWd.has(eff)
      ? undefined
      : slots.find((s) => slotApplies(s.days, weekday, isHol));
    const canWork = Boolean(slot) && (maxWork == null || workCount < maxWork);
    if (canWork && slot) {
      out.push({
        staff_id: staff.id,
        day: d,
        shift_type: type,
        location: slot.site,
        start: slot.start,
        end: slot.end,
      });
      workCount++;
    } else {
      out.push({ staff_id: staff.id, day: d, shift_type: "休", location: null, start: null, end: null });
    }
  }
  return out;
}
