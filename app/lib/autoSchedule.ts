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

// 隊員のシフト作成用の能力・希望を、構造化フィールド優先＋自由記述フォールバックで確定する。
interface Caps {
  canDo: (t: ShiftType) => boolean; // 対応可能な勤務区分
  receptionCapable: boolean; // 受付を担当できるか
  lean: "day" | "night" | "both"; // 勤務帯の優先
  offHard: Set<number>; // 固定休の曜日（原則休み）
  offSoft: Set<number>; // 休日希望（自由記述・弱め）
  maxWork: number | null; // 月の勤務日数上限
}
function computeCaps(staff: Staff): Caps {
  const avail = staff.available_shift_types;
  const availSet = Array.isArray(avail) && avail.length > 0 ? new Set(avail) : null;
  const wp = parseWorkPref(staff.work_preference);

  // 対応可能区分。構造化があればそれを、無ければ自由記述の「のみ/不可」を反映。
  const canDo = (t: ShiftType): boolean => {
    if (availSet) return availSet.has(t);
    if (wp.dayOnly && t === "夜勤") return false;
    if (wp.nightOnly && t !== "夜勤") return false;
    return true;
  };
  const receptionCapable = availSet ? availSet.has("受付") : wp.reception;

  // 勤務帯の優先
  let lean: "day" | "night" | "both" = "both";
  if (staff.shift_lean) lean = staff.shift_lean;
  else if (availSet) {
    const canDay = DAY_WORK.some((t) => availSet.has(t));
    const canNight = availSet.has("夜勤");
    lean = canDay && !canNight ? "day" : canNight && !canDay ? "night" : "both";
  } else if (wp.dayPref || wp.dayOnly) lean = "day";
  else if (wp.nightPref || wp.nightOnly) lean = "night";

  const offHard = new Set(staff.fixed_off_weekdays ?? []);
  const offSoft = offHard.size > 0 ? new Set<number>() : parseOffWeekdays(staff.days_off_preference);
  const maxWork = typeof staff.max_work_days === "number" ? staff.max_work_days : null;

  return { canDo, receptionCapable, lean, offHard, offSoft, maxWork };
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
  workDays: number;
  dayCnt: number;
  nightCnt: number;
  akeCnt: number; // 明休の数（稼働日数の均等化＝休日の均等化に使う）
  caps: Caps;
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
    workDays: 0,
    dayCnt: 0,
    nightCnt: 0,
    akeCnt: 0,
    caps: computeCaps(s),
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
  // 直前日の割当
  const prevOf = (st: StaffState, day: number): DayAssign | undefined =>
    day > 1 ? st.byDay.get(day - 1) : undefined;
  // 直前日までの「同区分の連勤」情報（3連勤ブロックの判定用）
  const runInfo = (st: StaffState, day: number): { kind: "day" | "night" | null; len: number } => {
    let kind: "day" | "night" | null = null;
    let len = 0;
    for (let d = day - 1; d >= 1; d--) {
      const a = st.byDay.get(d);
      if (!a || !isWork(a.type)) break;
      const k: "day" | "night" = isNightWork(a.type) ? "night" : "day";
      if (kind === null) kind = k;
      else if (kind !== k) break;
      len++;
    }
    return { kind, len };
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

  // 受付担当（受付に対応可能な隊員）が1人でもいれば、受付はその人だけに割り当てる。
  // （担当がいない場合は誰でも可＝従来動作にフォールバック）
  const anyReceptionist = states.some((st) => st.caps.receptionCapable);

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
    // 充当順: 受付（担当が限られ最優先）→ 夜勤（明休を伴い制約が強い）
    //        → 毎日枠（土日含めカバーが難しい）→ 平日の日勤枠
    const rank = (p: Position) =>
      p.shift_type === "受付" ? 0 : isNightWork(p.shift_type) ? 1 : p.daily ? 2 : 3;
    positions.sort((a, b) => rank(a) - rank(b));

    for (const pos of positions) {
      let best: StaffState | null = null;
      let bestScore = Infinity;
      const posNight = isNightWork(pos.shift_type);
      const posKind: "day" | "night" = posNight ? "night" : "day";
      for (const st of states) {
        if (st.byDay.has(day)) continue; // 既存・割当済み
        if (!st.caps.canDo(pos.shift_type)) continue; // 対応不可の区分
        // 受付は受付担当だけに限定（担当が存在する場合）
        if (pos.shift_type === "受付" && anyReceptionist && !st.caps.receptionCapable) continue;
        // 月の勤務日数の上限に達していたら休ませる
        if (st.caps.maxWork != null && st.workDays >= st.caps.maxWork) continue;
        if (consecutiveBefore(st, day) >= MAX_CONSECUTIVE) continue; // 連続勤務上限
        // 夜勤の翌日は日勤系に入れない（＝夜勤の継続 or 明休のみ。明休は下の休補完で付与）
        const prev = prevOf(st, day);
        const prevNight = !!prev && isNightWork(prev.type);
        if (prevNight && !posNight) continue;

        // 3連勤ブロックの情報
        const run = runInfo(st, day);
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
        // 3連勤ブロックのバイアス:
        // 同区分の連勤が1〜2日 → 継続を強く優先（3連勤にそろえる）
        // 同区分の連勤が3日以上 → 休/明休へ（それ以上の継続は避ける）
        // 別区分の連勤中（休なしの切替）→ 避ける
        if (run.kind === posKind) {
          if (run.len >= 3) score += 600;
          else score -= 500;
        } else if (run.kind !== null) {
          score += 400;
        }
        const c = st.caps;
        // 勤務帯の優先（能力は canDo で担保済み。ここは同点時の傾向調整）
        if (isNightWork(pos.shift_type)) {
          if (c.lean === "day") score += 200; // 日勤優先→夜勤は避けめ
          else if (c.lean === "night") score -= 100;
        } else {
          if (c.lean === "night") score += 200;
          else if (c.lean === "day") score -= 100;
          // 受付担当は受付枠を最優先で確保
          if (pos.shift_type === "受付" && c.receptionCapable) score -= 1000;
        }
        // 固定休の曜日は原則避ける／休日希望は弱めに避ける（祝日は日曜扱い）
        const eff = isHol ? 0 : weekday;
        if (c.offHard.has(eff)) score += 100000;
        else if (c.offSoft.has(eff)) score += 500;
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
    }

    // 残りの隊員: 夜勤の翌日で勤務が付かなければ明休、それ以外は休
    for (const st of states) {
      if (st.byDay.has(day)) continue;
      const prev = prevOf(st, day);
      if (prev && isNightWork(prev.type)) {
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
