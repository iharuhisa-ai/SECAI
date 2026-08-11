import type { SiteRequirement } from "./types";

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// この必要人数が指定曜日（0=日〜6=土）に適用されるか
export function reqAppliesToDay(req: SiteRequirement, weekday: number): boolean {
  const d = req.days;
  if (!d || d.length === 0 || d.length === 7) return true; // 毎日
  return d.includes(weekday);
}

// 適用曜日の表示ラベル（毎日 / 平日 / 土日 / 個別）
export function daysLabel(d?: number[]): string {
  if (!d || d.length === 0 || d.length === 7) return "毎日";
  const set = new Set(d);
  const isWeekday =
    [1, 2, 3, 4, 5].every((x) => set.has(x)) && !set.has(0) && !set.has(6);
  if (isWeekday) return "平日";
  const isWeekend = set.has(0) && set.has(6) && ![1, 2, 3, 4, 5].some((x) => set.has(x));
  if (isWeekend) return "土日";
  return [...d]
    .sort((a, b) => a - b)
    .map((x) => WEEKDAY_LABELS[x])
    .join("");
}

export function reqDaysLabel(req: SiteRequirement): string {
  return daysLabel(req.days);
}
