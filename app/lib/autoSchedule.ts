// 決定論的シフト自動作成（ハイブリッドの「土台」）。
// AIに頼らず、必要人数の充足・出勤日数の均等・日勤/夜勤の配分をアルゴリズムで組み立てる。
// - 毎日枠（土日含む）を優先的に埋め、週休をずらして配置する。
// - 出勤日数が隊員間で揃うよう「最も勤務の少ない隊員」を選ぶ。
// - 夜勤の翌日は明休、連続勤務は最大5日、希望（日勤/夜勤・休日曜日）を尊重。
import { japaneseHolidays } from "./holidays";
import type { Shift, ShiftType, Site, Staff } from "./types";

export interface AutoShift {
  staff_id: string;
  day: number;
  shift_type: ShiftType;
  location: string | null;
  start: string | null;
  end: string | null;
}

const MAX_CONSECUTIVE = 5;
const DAY_WORK: ShiftType[] = ["日勤", "受付", "半日"];

function norm(t?: string | null): string {
  return (t ?? "").slice(0, 5);
}
function isWork(t: ShiftType): boolean {
  return t !== "休" && t !== "明休";
}
function isNightWork(t: ShiftType): boolean {
  return t === "夜勤";
}
function isDayWork(t: ShiftType): boolean {
  return DAY_WORK.includes(t);
}
function slotApplies(days: number[] | undefined, weekday: number, isHoliday: boolean): boolean {
  if (!days || days.length === 0 || days.length === 7) return true;
  return days.includes(isHoliday ? 0 : weekday);
}

// 出勤希望（自由記述）から日勤/夜勤/受付の傾向を推定。
// 「のみ/専従」= 固定(hard)、「希望/中心」= 優先(soft)、「可/OK」= 柔軟（どちらも可）。
function parseWorkPref(wp?: string | null) {
  const s = wp ?? "";
  const dayOnly = /日勤(のみ|専従|専任|限定)/.test(s) || /夜勤(不可|なし|無し)/.test(s);
  const nightOnly = /夜勤(のみ|専従|専任|限定)/.test(s) || /日勤(不可|なし|無し)/.test(s);
  const dayPref = !dayOnly && /日勤(希望|中心)/.test(s);
  const nightPref = !nightOnly && /夜勤(希望|中心)/.test(s);
  return { dayOnly, nightOnly, dayPref, nightPref, reception: /受付/.test(s) };
}
const WD = ["日", "月", "火", "水", "木", "金", "土"];
// 休日希望（自由記述）から休みにしたい曜日を推定（例: 「毎週日曜」→ 日）
function parseOffWeekdays(pref?: string | null): Set<number> {
  const s = pref ?? "";
  const set = new Set<number>();
  WD.forEach((c, i) => {
    if (new RegExp(`${c}曜`).test(s)) set.add(i);
  });
  return set;
}

interface DayAssign {
  type: ShiftType;
  site: string | null;
  start: string | null;
  end: string | null;
}
interface StaffState {
  staff: Staff;
  byDay: Map<number, DayAssign>;
  forcedRest: Set<number>; // 明休を強制する日
  workDays: number;
  dayCnt: number;
  nightCnt: number;
  akeCnt: number; // 明休の数（稼働日数の均等化＝休日の均等化に使う）
  pref: ReturnType<typeof parseWorkPref>;
  offWd: Set<number>;
}
interface Position {
  site: string;
  shift_type: ShiftType;
  start: string;
  end: string;
  daily: boolean; // 毎日枠なら true（優先度高）
}

export function autoSchedule(params: {
  year: number;
  month: number;
  daysInMonth: number;
  staff: Staff[];
  sites: Site[];
  existing: Shift[]; // 既存シフト（保持・充足に加算）
}): AutoShift[] {
  const { year, month, daysInMonth, staff, sites, existing } = params;
  const holidays = japaneseHolidays(year);
  const pad = (n: number) => String(n).padStart(2, "0");

  // 同一(現場×区分)に時間帯枠が複数あるか（充足の数え方を切り替える）
  const slotCount = new Map<string, number>();
  for (const site of sites) {
    for (const r of site.requirements ?? []) {
      const k = `${site.name}|${r.shift_type}`;
      slotCount.set(k, (slotCount.get(k) ?? 0) + 1);
    }
  }
  const isMulti = (site: string, type: string) => (slotCount.get(`${site}|${type}`) ?? 0) > 1;

  const states: StaffState[] = staff.map((s) => ({
    staff: s,
    byDay: new Map(),
    forcedRest: new Set(),
    workDays: 0,
    dayCnt: 0,
    nightCnt: 0,
    akeCnt: 0,
    pref: parseWorkPref(s.work_preference),
    offWd: parseOffWeekdays(s.days_off_preference),
  }));
  const stById = new Map(states.map((st) => [st.staff.id, st]));

  // 既存シフトを取り込む（保持・充足加算・明休の前提）
  for (const e of existing) {
    if (!e.shift_type) continue;
    const st = stById.get(e.staff_id);
    if (!st) continue;
    const day = Number(e.date.slice(8, 10));
    const t = e.shift_type as ShiftType;
    st.byDay.set(day, {
      type: t,
      site: e.location ?? null,
      start: norm(e.start_time),
      end: norm(e.end_time),
    });
    if (isWork(t)) {
      st.workDays++;
      if (isNightWork(t)) st.nightCnt++;
      else if (isDayWork(t)) st.dayCnt++;
    } else if (t === "明休") st.akeCnt++;
    if (isNightWork(t) && day + 1 <= daysInMonth) st.forcedRest.add(day + 1);
  }

  const consecutiveBefore = (st: StaffState, day: number): number => {
    let c = 0;
    for (let d = day - 1; d >= 1; d--) {
      const a = st.byDay.get(d);
      if (a && isWork(a.type)) c++;
      else break;
    }
    return c;
  };
  const assignedForSlot = (
    day: number,
    site: string,
    type: ShiftType,
    start: string,
    end: string
  ): number => {
    let c = 0;
    for (const st of states) {
      const a = st.byDay.get(day);
      if (!a || a.type !== type || a.site !== site) continue;
      if (isMulti(site, type)) {
        if (norm(a.start) === start && norm(a.end) === end) c++;
      } else c++;
    }
    return c;
  };

  const out: AutoShift[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = new Date(year, month - 1, day).getDay();
    const dateKey = `${year}-${pad(month)}-${pad(day)}`;
    const isHol = holidays.has(dateKey);

    // その日に不足している配置枠を列挙
    const positions: Position[] = [];
    for (const site of sites) {
      for (const r of site.requirements ?? []) {
        if (!slotApplies(r.days, weekday, isHol)) continue;
        const start = norm(r.start);
        const end = norm(r.end);
        const already = assignedForSlot(day, site.name, r.shift_type, start, end);
        const need = r.count - already;
        const daily = !r.days || r.days.length === 0 || r.days.length === 7;
        for (let k = 0; k < need; k++)
          positions.push({ site: site.name, shift_type: r.shift_type, start, end, daily });
      }
    }
    // 夜勤（明休を伴い制約が強い）を先に、次に毎日枠（土日含めカバーが難しい）を埋める
    positions.sort((a, b) => {
      const an = isNightWork(a.shift_type) ? 0 : 1;
      const bn = isNightWork(b.shift_type) ? 0 : 1;
      if (an !== bn) return an - bn;
      return a.daily === b.daily ? 0 : a.daily ? -1 : 1;
    });

    for (const pos of positions) {
      let best: StaffState | null = null;
      let bestScore = Infinity;
      for (const st of states) {
        if (st.byDay.has(day)) continue; // 既存・割当済み
        if (st.forcedRest.has(day)) continue; // 明休
        if (consecutiveBefore(st, day) >= MAX_CONSECUTIVE) continue; // 連続勤務上限
        // 夜勤は翌日に明休を置ける必要がある
        if (isNightWork(pos.shift_type) && day + 1 <= daysInMonth) {
          const nd = st.byDay.get(day + 1);
          if (nd && isWork(nd.type)) continue;
        }
        // 組めない隊員が同じ枠に入っていないか
        const incompat = st.staff.incompatible_staff_ids ?? [];
        if (incompat.length) {
          let clash = false;
          for (const other of states) {
            if (other === st) continue;
            const a = other.byDay.get(day);
            if (
              a &&
              a.type === pos.shift_type &&
              a.site === pos.site &&
              (!isMulti(pos.site, pos.shift_type) ||
                (norm(a.start) === pos.start && norm(a.end) === pos.end)) &&
              incompat.includes(other.staff.id)
            ) {
              clash = true;
              break;
            }
          }
          if (clash) continue;
        }

        // スコア（小さいほど優先）:
        // (1) 同じ区分（夜勤 or 日勤系）の回数を隊員間で均等化（夜勤専従・日勤専従を防ぐ）
        // (2) 総勤務日数の均等（同点時の調整）
        // (3) 希望・休日希望を加味
        // → 夜勤も日勤も皆で分け合うため、明休・休日も自然に均等になる。
        let score = (isNightWork(pos.shift_type) ? st.nightCnt : st.dayCnt) * 100;
        score += st.workDays * 5;
        const p = st.pref;
        if (isNightWork(pos.shift_type)) {
          if (p.dayOnly) score += 100000; // 日勤のみ→原則夜勤なし（他に居なければ許容）
          else if (p.dayPref) score += 200; // 日勤希望→夜勤は避けめ
          if (p.nightOnly || p.nightPref) score -= 100;
        } else {
          if (p.nightOnly) score += 100000;
          else if (p.nightPref) score += 200;
          if (p.dayOnly || p.dayPref) score -= 100;
          if (pos.shift_type === "受付" && p.reception) score -= 50;
        }
        if (st.offWd.has(isHol ? 0 : weekday)) score += 500; // 休日希望の曜日は避ける
        if (score < bestScore) {
          bestScore = score;
          best = st;
        }
      }
      if (!best) continue; // 割当不能（人手不足）＝正直に不足のまま
      best.byDay.set(day, {
        type: pos.shift_type,
        site: pos.site,
        start: pos.start,
        end: pos.end,
      });
      best.workDays++;
      if (isNightWork(pos.shift_type)) best.nightCnt++;
      else best.dayCnt++;
      out.push({
        staff_id: best.staff.id,
        day,
        shift_type: pos.shift_type,
        location: pos.site,
        start: pos.start,
        end: pos.end,
      });
      if (isNightWork(pos.shift_type) && day + 1 <= daysInMonth) best.forcedRest.add(day + 1);
    }

    // 残りの隊員: 明休（強制）または休
    for (const st of states) {
      if (st.byDay.has(day)) continue;
      if (st.forcedRest.has(day)) {
        st.byDay.set(day, { type: "明休", site: null, start: null, end: null });
        st.akeCnt++;
        out.push({ staff_id: st.staff.id, day, shift_type: "明休", location: null, start: null, end: null });
      } else {
        st.byDay.set(day, { type: "休", site: null, start: null, end: null });
        out.push({ staff_id: st.staff.id, day, shift_type: "休", location: null, start: null, end: null });
      }
    }
  }

  // 既存で埋まっていたセルは出力しない（保持）
  const existingKeys = new Set(
    existing
      .filter((e) => e.shift_type)
      .map((e) => `${e.staff_id}|${Number(e.date.slice(8, 10))}`)
  );
  return out.filter((o) => !existingKeys.has(`${o.staff_id}|${o.day}`));
}
