// ハイブリッドPhase 2: 決定論スケジューラの土台に対し、管制員の自由記述条件を
// AI(Gemini)で反映する「微調整」エンドポイント。
// 安全のためサーバー側で充足（必要人数）が悪化しないか検証し、悪化する変更は破棄する。
import { NextResponse } from "next/server";
import { SHIFT_TYPES, type ShiftType } from "@/app/lib/types";
import { geminiGenerate, isGeminiConfigured } from "@/app/lib/gemini";
import { WEEKDAY_LABELS } from "@/app/lib/requirement";
import { japaneseHolidays } from "@/app/lib/holidays";

export const runtime = "nodejs";

interface Cell {
  staff_id: string;
  day: number;
  shift_type: string;
  location?: string | null;
  start?: string | null;
  end?: string | null;
}
interface ReqInput {
  shift_type: string;
  start: string;
  end: string;
  count: number;
  days?: number[];
}
interface SiteInput {
  name: string;
  requirements?: ReqInput[] | null;
}
interface AdjustBody {
  year: number;
  month: number;
  daysInMonth: number;
  staff: { id: string; name: string; rank?: string | null }[];
  sites: SiteInput[];
  existing: Cell[]; // 変更不可（確定済み）
  base: Cell[]; // 決定論で作成した調整対象
  conditions: string;
}

const norm = (t?: string | null) => (t ?? "").slice(0, 5);
const pad = (n: number) => String(n).padStart(2, "0");
const isWork = (t: string) => t !== "休" && t !== "明休";
function slotApplies(days: number[] | undefined, weekday: number, isHoliday: boolean) {
  if (!days || days.length === 0 || days.length === 7) return true;
  return days.includes(isHoliday ? 0 : weekday);
}

// ロスター（配置一覧）の総不足数を計算（時間帯枠が複数ある区分は時間帯別に数える）
function totalDeficit(
  roster: Cell[],
  sites: SiteInput[],
  year: number,
  month: number,
  daysInMonth: number,
  holidays: Map<string, string>
): number {
  const slotCount = new Map<string, number>();
  for (const s of sites)
    for (const r of s.requirements ?? [])
      slotCount.set(`${s.name}|${r.shift_type}`, (slotCount.get(`${s.name}|${r.shift_type}`) ?? 0) + 1);
  const isMulti = (site: string, type: string) => (slotCount.get(`${site}|${type}`) ?? 0) > 1;

  const byType = new Map<string, number>();
  const byBand = new Map<string, number>();
  for (const c of roster) {
    if (!c.shift_type || !c.location || !isWork(c.shift_type)) continue;
    const tk = `${c.day}|${c.location}|${c.shift_type}`;
    byType.set(tk, (byType.get(tk) ?? 0) + 1);
    const bk = `${tk}|${norm(c.start)}|${norm(c.end)}`;
    byBand.set(bk, (byBand.get(bk) ?? 0) + 1);
  }

  let deficit = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const weekday = new Date(year, month - 1, d).getDay();
    const isHol = holidays.has(`${year}-${pad(month)}-${pad(d)}`);
    for (const s of sites) {
      for (const r of s.requirements ?? []) {
        if (!slotApplies(r.days, weekday, isHol)) continue;
        const assigned = isMulti(s.name, r.shift_type)
          ? byBand.get(`${d}|${s.name}|${r.shift_type}|${norm(r.start)}|${norm(r.end)}`) ?? 0
          : byType.get(`${d}|${s.name}|${r.shift_type}`) ?? 0;
        if (assigned < r.count) deficit += r.count - assigned;
      }
    }
  }
  return deficit;
}

const outputSchema = {
  type: "OBJECT",
  properties: {
    changes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          staff_id: { type: "STRING" },
          day: { type: "INTEGER" },
          shift_type: { type: "STRING", enum: [...SHIFT_TYPES] },
          location: { type: "STRING" },
          start: { type: "STRING" },
          end: { type: "STRING" },
        },
        required: ["staff_id", "day", "shift_type", "location", "start", "end"],
      },
    },
  },
  required: ["changes"],
};

export async function POST(req: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "AI微調整には GEMINI_API_KEY の設定が必要です。", noKey: true },
      { status: 503 }
    );
  }

  let body: AdjustBody;
  try {
    body = (await req.json()) as AdjustBody;
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }
  const { year, month, daysInMonth, staff, sites, existing = [], base = [], conditions } = body;
  if (!conditions || !conditions.trim()) {
    return NextResponse.json({ shifts: base, applied: 0, message: "追加条件がありません。" });
  }

  const nameById = new Map(staff.map((s) => [s.id, s.name]));
  const siteNames = new Set(sites.map((s) => s.name));
  // 現場×区分 → 時間帯枠
  const slotsByLocType = new Map<string, { start: string; end: string }[]>();
  for (const s of sites)
    for (const r of s.requirements ?? []) {
      const k = `${s.name}|${r.shift_type}`;
      const arr = slotsByLocType.get(k) ?? [];
      arr.push({ start: norm(r.start), end: norm(r.end) });
      slotsByLocType.set(k, arr);
    }

  // ロック（確定済み）セルのキー
  const lockedKeys = new Set(existing.filter((e) => e.shift_type).map((e) => `${e.staff_id}|${e.day}`));
  const baseByKey = new Map(base.map((c) => [`${c.staff_id}|${c.day}`, c]));

  // 隊員ごとの現在の配置（確定済み＋土台）をプロンプト表示用に整形
  const fullByStaff = new Map<string, Cell[]>();
  for (const c of [...existing, ...base]) {
    const arr = fullByStaff.get(c.staff_id) ?? [];
    arr.push(c);
    fullByStaff.set(c.staff_id, arr);
  }
  const rosterLines = staff
    .map((s) => {
      const cells = (fullByStaff.get(s.id) ?? []).slice().sort((a, b) => a.day - b.day);
      const txt = cells
        .map((c) => {
          const locked = lockedKeys.has(`${c.staff_id}|${c.day}`);
          const loc = c.location ? `(${c.location} ${norm(c.start)}-${norm(c.end)})` : "";
          return `${c.day}${locked ? "*" : ""}=${c.shift_type}${loc}`;
        })
        .join(" ");
      return `- ${s.name}（staff_id: ${s.id}）: ${txt}`;
    })
    .join("\n");

  const siteReqLines = sites
    .filter((s) => s.requirements && s.requirements.length > 0)
    .map(
      (s) =>
        `- ${s.name}: ${s
          .requirements!.map((r) => `${r.shift_type}(${norm(r.start)}-${norm(r.end)}) ${r.count}名`)
          .join(" / ")}`
    )
    .join("\n");

  const holidays = japaneseHolidays(year);
  const weekdayMap = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const wd = new Date(year, month - 1, d).getDay();
    const hol = holidays.has(`${year}-${pad(month)}-${pad(d)}`);
    return `${d}(${WEEKDAY_LABELS[wd]}${hol ? "・祝" : ""})`;
  }).join(" ");

  const system = `あなたは警備会社の管制員を補助するシフト調整アシスタントです。
既に作成済みの${year}年${month}月の月次シフト（土台）に対し、管制員の「追加条件」を満たすよう、**必要最小限の変更だけ**を提案します。

厳守事項:
- 変更した日だけを changes に出力する（変更しないセルは出力しない）。
- 日付末尾に「*」が付くセルは確定済みで**絶対に変更しない**。
- 勤務区分は次のみ: ${SHIFT_TYPES.join(" / ")}。休・明休は location・start・end を空文字("")にする。
- 勤務日は location を現場名、start・end をその現場に登録された時間帯のいずれかに一致させる。
- **現場の必要人数（充足）を悪化させない**。ある隊員を休みにするなら、必要ならその枠を別の隊員に振り替える（そのぶんも changes に含める）。
- 夜勤の翌日は明休にする。連続勤務は最大5日。
- 追加条件に関係のない部分はできるだけ変えない。`;

  const userPrompt = `現在のシフト（* は確定済み＝変更不可。区分の後ろの () は 配置現場と時間帯）:
${rosterLines}

現場の必要人数:
${siteReqLines || "（設定なし）"}

各日の曜日:
${weekdayMap}

管制員の追加条件:
${conditions.trim()}

上記の追加条件を満たすための最小限の変更を changes として出力してください。`;

  let changes: Cell[] = [];
  try {
    const text = await geminiGenerate({
      system,
      prompt: userPrompt,
      jsonSchema: outputSchema,
      maxOutputTokens: 4096,
    });
    const parsed = JSON.parse(text) as { changes: Cell[] };
    changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI微調整に失敗しました: ${msg}` }, { status: 500 });
  }

  // 変更の妥当性チェック（不正・ロックセルは除外）＋ base へ適用
  const shiftTypeSet = new Set<string>(SHIFT_TYPES);
  const validBase = new Map(baseByKey); // コピー
  let applied = 0;
  for (const ch of changes) {
    const key = `${ch.staff_id}|${ch.day}`;
    if (lockedKeys.has(key)) continue; // 確定済みは変更不可
    if (!nameById.has(ch.staff_id)) continue;
    if (!Number.isInteger(ch.day) || ch.day < 1 || ch.day > daysInMonth) continue;
    if (!shiftTypeSet.has(ch.shift_type)) continue;
    if (!baseByKey.has(key)) continue; // 土台に存在するセルのみ調整
    const work = isWork(ch.shift_type);
    let location: string | null = null;
    let start: string | null = null;
    let end: string | null = null;
    if (work) {
      if (!ch.location || !siteNames.has(ch.location)) continue; // 現場が不正
      location = ch.location;
      const slots = slotsByLocType.get(`${location}|${ch.shift_type}`) ?? [];
      if (slots.length === 0) continue; // その現場にその区分の枠が無い
      const matched = slots.find((sl) => sl.start === norm(ch.start) && sl.end === norm(ch.end));
      const chosen = matched ?? slots[0];
      start = chosen.start;
      end = chosen.end;
    }
    validBase.set(key, { staff_id: ch.staff_id, day: ch.day, shift_type: ch.shift_type, location, start, end });
    applied++;
  }

  if (applied === 0) {
    return NextResponse.json({ shifts: base, applied: 0, message: "反映できる変更がありませんでした。" });
  }

  // 充足検証: 悪化するなら破棄して土台を維持
  const adjustedBase = Array.from(validBase.values());
  const beforeDef = totalDeficit([...existing, ...base], sites, year, month, daysInMonth, holidays);
  const afterDef = totalDeficit([...existing, ...adjustedBase], sites, year, month, daysInMonth, holidays);
  if (afterDef > beforeDef) {
    return NextResponse.json({
      shifts: base,
      applied: 0,
      rejected: true,
      message: `充足が悪化する変更のため反映しませんでした（不足 ${beforeDef}→${afterDef}）。土台の案を維持します。`,
    });
  }

  return NextResponse.json({
    shifts: adjustedBase,
    applied,
    message: `追加条件に基づき ${applied} 件を調整しました（不足 ${beforeDef}→${afterDef}）。`,
  });
}
