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
        },
        required: ["staff_id", "day", "shift_type", "location"],
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
              .map((e) => `${e.day}日=${e.shift_type}${e.location ? `(${e.location})` : ""}`)
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

  // 当月の各日の曜日と祝日（AIが曜日別の必要人数を判断するため）
  const holidays = japaneseHolidays(year);
  const weekdayMap = Array.from({ length: daysInMonth }, (_, idx) => {
    const d = idx + 1;
    const wd = new Date(year, month - 1, d).getDay();
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const holiday = holidays.has(dateKey);
    return `${d}(${WEEKDAY_LABELS[wd]}${holiday ? "・祝" : ""})`;
  }).join(" ");

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

現場の必要人数と配置（重要）:
- 勤務する隊員（休・明休以外）には、必ず配置現場(location)を「現場の必要人数」に挙がった現場名のいずれかで割り当てる。
- 休・明休の日は location を空文字("")にする。
- 各日・各現場について、その現場の各勤務区分の必要人数をできるだけ満たすように配置する（例: 本社ビルが日勤2名なら、その日に日勤かつ本社ビル配置の隊員が2名になるよう割り当てる）。「確定済み」で既にその現場・区分に入っている人数も充足数に数える。
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
    ? `現場の必要人数（[ ]内は適用曜日。該当曜日のみ満たす。location はこの現場名を使う）:\n${siteReqLines}\n\n当月の各日の曜日:\n${weekdayMap}`
    : "（必要人数が設定された現場はありません。location は空文字にしてください。）"
}
${constraints && constraints.trim() ? `\n管制員からの追加条件:\n${constraints.trim()}` : ""}

各隊員の「確定済み(変更不可)」と現場の必要人数を踏まえ、それ以外の空いている日のシフト（勤務区分＋配置現場）を作成してください。`;

  try {
    const text = await geminiGenerate({
      system,
      prompt: userPrompt,
      jsonSchema: outputSchema,
      maxOutputTokens: 8192,
    });

    const parsed = JSON.parse(text) as {
      shifts: { staff_id: string; day: number; shift_type: string; location?: string }[];
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
        return { staff_id: s.staff_id, day: s.day, shift_type: s.shift_type, location };
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
