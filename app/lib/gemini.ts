// サーバー専用。Google Gemini API を REST で呼ぶ薄いヘルパー。
// GEMINI_API_KEY は環境変数から読む（ハードコード禁止）。
// ローリングエイリアス（常に利用可能な最新Flash）を既定に。
// 必要なら GEMINI_MODEL 環境変数で上書き（例: gemini-2.0-flash / gemini-pro-latest）。
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GenerateOptions {
  system: string;
  prompt: string;
  /** 指定すると JSON 構造化出力（Gemini responseSchema 形式）で返す */
  jsonSchema?: unknown;
  maxOutputTokens?: number;
}

// 生成結果の本文テキストを返す。失敗時は Error を投げる。
export async function geminiGenerate(opts: GenerateOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("NO_KEY");

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
    temperature: 0.7,
  };
  if (opts.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = opts.jsonSchema;
  }

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig,
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
    key
  )}`;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // 429/500/502/503/504 は一時的（過負荷・レート超過）なので、
  // 「全体のデッドライン内」でのみ指数バックオフ再試行する。
  // サーバーレス関数の実行時間上限（Netlifyは概ね10秒）を超えないよう、
  // 各呼び出しに AbortController でタイムアウトを付け、合計時間を必ず抑える。
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const DEADLINE_MS = Number(process.env.GEMINI_DEADLINE_MS) || 8500;
  const OVERLOAD_MSG =
    "AIが混雑しています（時間をおいて再度お試しください）。対象の隊員数を減らすと成功しやすくなります。";
  const started = Date.now();
  const remainingMs = () => DEADLINE_MS - (Date.now() - started);

  let attempt = 0;

  while (remainingMs() > 1500) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs());
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      // アボート（デッドライン到達）またはネットワーク一時エラー → 時間があれば再試行
      if (remainingMs() > 2500) {
        await sleep(500);
        continue;
      }
      break;
    }
    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const rawMsg =
        (data as { error?: { message?: string } })?.error?.message ??
        `Gemini API エラー (${res.status})`;
      if (RETRYABLE.has(res.status)) {
        if (remainingMs() > 2500) {
          await sleep(Math.min(600 * attempt, 1500) + Math.random() * 300);
          continue;
        }
        throw new Error(OVERLOAD_MSG); // 時間切れ＝混雑扱い
      }
      throw new Error(rawMsg); // 恒久エラー（400系など）は即時
    }

    const cand = (data as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    })?.candidates?.[0];

    const text = (cand?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const reason =
        (data as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason ??
        cand?.finishReason ??
        "unknown";
      throw new Error(`Gemini から応答を取得できませんでした（${reason}）。`);
    }
    return text;
  }

  // デッドライン到達（応答が得られず時間切れ）＝混雑扱い
  throw new Error(OVERLOAD_MSG);
}
