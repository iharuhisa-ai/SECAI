import { NextResponse } from "next/server";
import { SHIFT_TYPES } from "@/app/lib/types";
import { geminiGenerate, isGeminiConfigured } from "@/app/lib/gemini";
import { WEEKDAY_LABELS, daysLabel } from "@/app/lib/requirement";
import { japaneseHolidays } from "@/app/lib/holidays";

export const runtime = "nodejs";

interface StaffInput {
  id: string;
  name: string;
  rank?: string | null;
  days_off_preference?: string | null;
  work_preference?: string | null;
  incompatible_names?: string[];
}

interface ExistingShift {
  staff_id: string;
  day: number;
  shift_type: string;
  location?: string | null;
  start?: string | null; // HH:MM（時間帯別の充足判断用）
  end?: string | null;
}

interface SiteRequirementInput {
  shift_type: string;
  start: string;
  end: string;
  count: number;
  days?: number[]; // 適用曜日（0=日〜6=土）。未指定=毎日
}

interface SiteInput {
  name: string;
  requirements?: SiteRequirementInput[] | null;
}

interface GenerateBody {
  year: number;
  month: number; // 1-12
  daysInMonth: number;
  staff: StaffInput[];
  existing?: ExistingShift[]; // 既に入力済みのシフト（区分付き・上書きしない／続きを踏まえる）
  sites?: SiteInput[]; // 現場マスタ（必要人数）
  constraints?: string; // 管制員が入力する追加条件（自由記述）
}

// Gemini 構造化出力スキーマ（responseSchema 形式・型は大文字）
const outputSchema = {
  type: "OBJECT",
  properties: {
    shifts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          staff_id: { type: "STRING" },
          day: { type: "INTEGER" },
          shift_type: { type: "STRING", enum: [...SHIFT_TYPES] },
          // 配置現場名。休・明休は空文字。
          location: { type: "STRING" },
          // 配置する時間帯。現場マスタの枠に合わせる（HH:MM）。休・明休は空文字。
          start: { type: "STRING" },
          end: { type: "STRING" },
        },
        required: ["staff_id", "day", "shift_type", "location", "start", "end"],
      },
    },
  },
  required: ["shifts"],
};

export async function POST(req: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      {
        error:
          "AIシフト作成には GEMINI_API_KEY の設定が必要です。.env.local に設定してください。",
      },
      { status: 503 }
    );
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  const { year, month, daysInMonth, staff, existing = [], sites = [], constraints } = body;
  if (!year || !month || !daysInMonth || !Array.isArray(staff) || staff.length === 0) {
    return NextResponse.json(
      { error: "年・月・日数・隊員一覧は必須です。" },
      { status: 400 }
    );
  }

  // 既存シフトを staff_id ごとにまとめる（プロンプト表示・上書き防止用）
  const existingByStaff = new Map<string, ExistingShift[]>();
  for (const e of existing) {
    const arr = existingByStaff.get(e.staff_id) ?? [];
    arr.push(e);
    existingByStaff.set(e.staff_id, arr);
  }

  const staffLines = staff
    .map((s) => {
      const attrs: string[] = [];
      if (s.rank) attrs.push(`区分:${s.rank}`);
      if (s.days_off_preference) attrs.push(`休日希望:${s.days_off_preference}`);
      if (s.work_preference) attrs.push(`出勤希望:${s.work_preference}`);
      if (s.incompatible_names && s.incompatible_names.length > 0)
        attrs.push(`組めない隊員:${s.incompatible_names.join("・")}`);
      const attrText = attrs.length > 0 ? `（${attrs.join(" / ")}）` : "";

      const ex = (existingByStaff.get(s.id) ?? []).sort((a, b) => a.day - b.day);
      const exText =
        ex.length > 0
          ? `\n    確定済み(変更不可): ${ex
              .map((e) => {
                const band = e.start && e.end ? ` ${e.start}-${e.end}` : "";
                return `${e.day}日=${e.shift_type}${e.location ? `(${e.location}${band})` : ""}`;
              })
              .join(", ")}`
          : "";
      return `- ${s.name}（staff_id: ${s.id}）${attrText}${exText}`;
    })
    .join("\n");

  // 現場ごとの必要人数（適用曜日付き）
  const siteReqLines = sites
    .filter((s) => s.requirements && s.requirements.length > 0)
    .map(
      (s) =>
        `- ${s.name}: ${s
          .requirements!.map(
            (r) => `${r.shift_type}(${r.start}-${r.end}) ${r.count}名[${daysLabel(r.days)}]`
          )
          .join(" / ")}`
    )
    .join("\n");
  const siteNames = sites
    .filter((s) => s.requirements && s.requirements.length > 0)
    .map((s) => s.name);

  // 現場×勤務区分 → 登録された時間帯（枠）の一覧。時間帯別の配置・照合に使う。
  const normTime = (t?: string | null) => (t ?? "").slice(0, 5);
  const slotsByLocType = new Map<string, { start: string; end: string }[]>();
  for (const site of sites) {
    for (const r of site.requirements ?? []) {
      const k = `${site.name}|${r.shift_type}`;
      const arr = slotsByLocType.get(k) ?? [];
      arr.push({ start: normTime(r.start), end: normTime(r.end) });
      slotsByLocType.set(k, arr);
    }
  }

  // 当月の各日の曜日と祝日（AIが曜日別の必要人数を判断するため）
  const holidays = japaneseHolidays(year);
  const weekdayMap = Array.from({ length: daysInMonth }, (_, idx) => {
    const d = idx + 1;
    const wd = new Date(year, month - 1, d).getDay();
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const holiday = holidays.has(dateKey);
    return `${d}(${WEEKDAY_LABELS[wd]}${holiday ? "・祝" : ""})`;
  }).join(" ");

  // 「まだ不足している枠」を日付ごとにサーバー側で計算する。
  // AIに生の既存一覧から充足を集計させるのは不正確なため、残り必要人数を明示的に渡す。
  // existing には（管制員の手入力＋既に処理済みの他隊員の割当）が積み上がっているので、
  // 隊員を1名ずつ処理していくと、この不足枠が順に埋まっていく（貪欲法）。
  interface ReqSlot {
    site: string;
    shift_type: string;
    start: string;
    end: string;
    count: number;
    days?: number[];
  }
  const allSlots: ReqSlot[] = [];
  for (const site of sites) {
    for (const r of site.requirements ?? []) {
      allSlots.push({
        site: site.name,
        shift_type: r.shift_type,
        start: normTime(r.start),
        end: normTime(r.end),
        count: r.count,
        days: r.days,
      });
    }
  }
  // 同一(現場×区分)に時間帯枠が2つ以上あるか（充足の数え方を切り替える）
  const slotCountByLocType = new Map<string, number>();
  for (const sl of allSlots) {
    const k = `${sl.site}|${sl.shift_type}`;
    slotCountByLocType.set(k, (slotCountByLocType.get(k) ?? 0) + 1);
  }
  const isMultiSlot = (site: string, type: string) =>
    (slotCountByLocType.get(`${site}|${type}`) ?? 0) > 1;

  // 既存割当の配置人数を (日×現場×区分) と (日×現場×区分×時間帯) で索引
  const exByTypeDay = new Map<string, number>();
  const exByBandDay = new Map<string, number>();
  for (const e of existing) {
    if (!e.shift_type || !e.location) continue;
    const tk = `${e.day}|${e.location}|${e.shift_type}`;
    exByTypeDay.set(tk, (exByTypeDay.get(tk) ?? 0) + 1);
    const bk = `${tk}|${normTime(e.start)}|${normTime(e.end)}`;
    exByBandDay.set(bk, (exByBandDay.get(bk) ?? 0) + 1);
  }
  // 枠が指定曜日に適用されるか（祝日は日曜=0扱い）
  const slotApplies = (days: number[] | undefined, weekday: number, isHoliday: boolean) => {
    if (!days || days.length === 0 || days.length === 7) return true;
    return days.includes(isHoliday ? 0 : weekday);
  };

  const deficitLines: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = new Date(year, month - 1, d).getDay();
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isHol = holidays.has(dateKey);
    const parts: string[] = [];
    for (const sl of allSlots) {
      if (!slotApplies(sl.days, wd, isHol)) continue;
      const assigned = isMultiSlot(sl.site, sl.shift_type)
        ? exByBandDay.get(`${d}|${sl.site}|${sl.shift_type}|${sl.start}|${sl.end}`) ?? 0
        : exByTypeDay.get(`${d}|${sl.site}|${sl.shift_type}`) ?? 0;
      const remaining = sl.count - assigned;
      if (remaining > 0)
        parts.push(`${sl.site} ${sl.shift_type}(${sl.start}-${sl.end}) 残${remaining}名`);
    }
    if (parts.length > 0)
      deficitLines.push(`${d}(${WEEKDAY_LABELS[wd]}${isHol ? "・祝" : ""}): ${parts.join(" / ")}`);
  }
  const deficitText =
    deficitLines.length > 0
      ? deficitLines.join("\n")
      : "（現時点で不足している枠はありません。過剰配置を避け、休や既存の充足維持を優先してください。）";

  const system = `あなたは警備会社の管制員を補助するシフト作成アシスタントです。
与えられた隊員について、${year}年${month}月（1日〜${daysInMonth}日）の月次シフトを作成します。

勤務区分は次の5種類のみ使用します: ${SHIFT_TYPES.join(" / ")}
- 日勤: 昼間の勤務
- 夜勤: 夜間の勤務
- 半日: 短時間勤務
- 休: 休日
- 明休: 夜勤明けの休み（夜勤の翌日に割り当てる）

「確定済み(変更不可)」のシフトの扱い（最重要）:
- 既に入力済みのシフトは「確定済み」として各隊員に提示する。これらは絶対に変更せず、出力にも含めない。
- ただし**確定済みのシフトを必ず踏まえて**、空いている日のシフトを作成すること。具体的には:
  - 確定済みで「夜勤」の翌日が空いていれば「明休」にする。
  - 連続勤務日数（休・明休以外の連続）は、確定済みの勤務も通算して数え、最大5日を超えないようにする。
  - 週休（週1〜2日の休）も確定済みを含めて月全体でバランスさせる。
  - 確定済みと矛盾しない自然な並びにする（例: 確定済みが「明休」の前日は夜勤前提で扱う）。

必ず守るルール:
1. 各隊員について、「確定済み(変更不可)」の日を除く全ての日に、いずれか1つの勤務区分を割り当てる。
2. 「確定済み(変更不可)」の日は出力に含めない。
3. 夜勤の翌日は必ず「明休」にする（月末日が夜勤の場合は明休は不要）。
4. 連続勤務は確定済みも通算して最大5日まで。それを超える前に休を入れる。
5. 各隊員に週あたり1〜2日程度の休を確保し、負担が偏らないようにする。

現場の必要人数と配置（最重要・充足を最優先）:
- 勤務する隊員（休・明休以外）には、必ず配置現場(location)を「現場の必要人数」に挙がった現場名のいずれかで割り当てる。
- 休・明休の日は location・start・end をすべて空文字("")にする。
- ユーザープロンプトに **「まだ不足している枠（残り人数）」を日付ごとに提示する**。これは既に確定済み・処理済みの他隊員の割当を差し引いた「今この隊員で埋めるべき残り」である。
- **各勤務日には、その日に不足している枠のいずれか1つ（残り人数の多い枠を優先）を埋めることを最優先**に配置する（location と時間帯を一致させる）。1日に割り当てられる勤務は1つなので、その日の最も不足している枠から埋める。
- **その日の不足枠がすべて0（充足済み）なら、無理に勤務させず「休」にする**（過剰配置を避け、週休・連続勤務のバランスを取る）。
- 不足枠を埋めることと、下記の連続勤務・明休・週休のルールは両立させる（例: 連続5日を超えそうなら休を入れ、その分の枠は他隊員に委ねる）。

時間帯(start・end)の扱い（重要）:
- 勤務する隊員には、配置現場の「必要人数」に挙がった時間帯(◯◯-◯◯)のいずれかを start・end として必ず出力する（例: 日勤(08:00-20:00) の枠に入れるなら start="08:00" end="20:00"）。
- **同じ現場・同じ勤務区分でも時間帯が複数ある場合は、それぞれ別の枠として扱い、時間帯ごとに必要人数を満たす**（例: 受付(08:00-12:00)1名 と 受付(13:00-17:00)1名 があれば、両方の時間帯にそれぞれ1名ずつ配置する）。1つの時間帯に偏らせない。
- 充足数は「現場・勤務区分・時間帯」の組み合わせごとに数える。「確定済み」も同じ時間帯のものだけを充足数に数える。
- start・end は必ず必要人数に登録された時間帯のいずれかと完全に一致させる（独自の時刻を作らない）。
- **必要人数には適用曜日がある**（[毎日]/[平日]/[土日]/[個別曜日]）。その枠は該当曜日のみ必要人数を満たせばよく、対象外の曜日はその枠の必要人数を0として扱う。
- **祝日（「・祝」付きの日）は日曜と同じ扱い**にする。「土日」枠には祝日も含め、「平日」枠には祝日を含めない。
- 隊員数が全現場の必要人数の合計に満たない日は、無理に勤務を増やさず、主要な現場（必要人数の多い現場）を優先して充足させる。
- 必要人数を超える過剰配置は避け、余力は他現場の充足や休に回す。

隊員ごとの希望・区分の扱い:
- 「休日希望」の日はできる限り「休」にする。
- 「出勤希望」（日勤希望・夜勤可など）を尊重する。
- 「組めない隊員」同士は、同じ日・同じ現場・同じ勤務区分で重ならないよう配慮する。
- 区分は「新人」は単独配置を避け「ベテラン」「隊長」と同じ現場・同日になるよう配慮し、「隊長」は平日中心に配置するなど、バランスを考慮する。`;

  const userPrompt = `対象の隊員（この隊員のみシフトを作成。記載のない隊員は対象外）:
${staffLines}

${
  siteReqLines
    ? `現場の必要人数（[ ]内は適用曜日。該当曜日のみ満たす。location はこの現場名を使う）:\n${siteReqLines}\n\n当月の各日の曜日:\n${weekdayMap}\n\nまだ不足している枠（この隊員で優先的に埋める。既に処理済みの人数を差し引いた残り必要人数。各勤務日は残りの多い枠から埋める）:\n${deficitText}`
    : "（必要人数が設定された現場はありません。location は空文字にしてください。）"
}
${constraints && constraints.trim() ? `\n管制員からの追加条件:\n${constraints.trim()}` : ""}

「確定済み(変更不可)」と「まだ不足している枠」を踏まえ、空いている日のシフト（勤務区分＋配置現場＋時間帯）を作成してください。不足している枠を埋めることを最優先し、その日の枠が充足済みなら休にしてください。`;

  try {
    const text = await geminiGenerate({
      system,
      prompt: userPrompt,
      jsonSchema: outputSchema,
      maxOutputTokens: 8192,
    });

    const parsed = JSON.parse(text) as {
      shifts: {
        staff_id: string;
        day: number;
        shift_type: string;
        location?: string;
        start?: string;
        end?: string;
      }[];
    };

    // 念のためサーバ側で妥当性チェック
    // （不正な staff_id / day を除外し、入力済みの日も上書きしないよう除外）
    const validIds = new Set(staff.map((s) => s.id));
    const shiftTypeSet = new Set<string>(SHIFT_TYPES);
    const siteNameSet = new Set(siteNames);
    const filledSet = new Set<string>();
    for (const e of existing) filledSet.add(`${e.staff_id}-${e.day}`);
    const shifts = parsed.shifts
      .filter(
        (s) =>
          validIds.has(s.staff_id) &&
          Number.isInteger(s.day) &&
          s.day >= 1 &&
          s.day <= daysInMonth &&
          shiftTypeSet.has(s.shift_type) &&
          !filledSet.has(`${s.staff_id}-${s.day}`)
      )
      .map((s) => {
        // 休・明休は現場なし。勤務日はマスタに存在する現場名のみ採用。
        const isWork = s.shift_type !== "休" && s.shift_type !== "明休";
        const location =
          isWork && s.location && siteNameSet.has(s.location) ? s.location : null;

        // 時間帯: マスタの枠に照合して確定する。
        // AIの提示が枠に一致すればそれを、なければ最初の枠を採用（区分単位のフォールバック）。
        let start: string | null = null;
        let end: string | null = null;
        if (isWork && location) {
          const slots = slotsByLocType.get(`${location}|${s.shift_type}`) ?? [];
          if (slots.length > 0) {
            const matched = slots.find(
              (sl) => sl.start === normTime(s.start) && sl.end === normTime(s.end)
            );
            const chosen = matched ?? slots[0];
            start = chosen.start;
            end = chosen.end;
          }
        }
        return { staff_id: s.staff_id, day: s.day, shift_type: s.shift_type, location, start, end };
      });

    return NextResponse.json({ shifts });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `AIシフト作成に失敗しました: ${messageText}` },
      { status: 500 }
    );
  }
}
